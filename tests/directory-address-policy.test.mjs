import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  directoryAddressQualityWarning,
  directoryExactGeoCandidate,
} from "../lib/directory-service-address.ts";
import { getDirectoryDetailPresentation } from "../lib/directory-detail-presentation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const editor = read("components/admin-directory-editor.tsx");
const store = read("lib/directory-store.ts");
const createRoute = read("app/api/admin/directory/route.ts");
const updateRoute = read("app/api/admin/directory/[id]/route.ts");
const publicDetail = read("components/directory-profile-detail.tsx");
const publicPage = read("app/adresar/[category]/[slug]/page.tsx");
const mapLoader = read("lib/geo-admin-operator.ts");
const mapDashboard = read("components/admin-geo-operator-dashboard.tsx");
const googleDiscovery = read("lib/google-place-directory-discovery.ts");
const geoRoute = read("app/api/admin/geo/[targetType]/[id]/route.ts");
const googleConfirmation = read("lib/admin-google-place-confirmation.ts");

const baseAddress = {
  region: "Nitriansky kraj",
  district: "Nitra",
  city: "Nitra",
  postalCode: "949 01",
  street: "Hlavná",
  houseNumber: "123",
  addressFormat: "STREET",
  serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
};

function publicProfile(overrides = {}) {
  return {
    id: 99,
    slug: "manualna-adresa",
    name: "Manuálna adresa",
    category: "treneri",
    excerpt: "",
    description: "",
    services: [],
    qualifications: [],
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    address: "Hlavná 123, 949 01 Nitra",
    postalCode: "",
    street: "",
    houseNumber: "",
    addressFormat: "",
    serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
    formattedServiceAddress: null,
    priceNote: "",
    websiteUrl: null,
    imageUrl: null,
    verified: false,
    featured: false,
    updatedAt: "2026-10-01T20:00:00.000Z",
    importData: null,
    seo: {},
    ...overrides,
  };
}

test("DIRECTORY-ADDRESS-POLICY-1 editor exposes a free editorial public address and never labels warning as a blocker", () => {
  assert.match(editor, /htmlFor="directory-public-address">Verejná adresa/);
  assert.match(editor, /address: publicAddress/);
  assert.match(editor, /Adresu môžeš uložiť a publikovať\. Upozornenie sa verejne nezobrazuje\./);
  assert.match(editor, /Technické lokalizačné údaje — voliteľné/);
  assert.doesNotMatch(editor, /disabled=\{[^}]*addressEvaluation/);
});

test("LOCALITY_INVALID and POSTAL_CODE_INVALID are warning/review signals", () => {
  assert.equal(
    directoryAddressQualityWarning(
      { ...baseAddress, region: "Trnavský kraj", district: "Nitra" },
      "Hlavná 123, 949 01 Nitra",
    ),
    "Lokalita nie je v našom zozname.",
  );
  assert.equal(
    directoryAddressQualityWarning(
      { ...baseAddress, postalCode: "949" },
      "Hlavná 123, 949 01 Nitra",
    ),
    "PSČ sa nepodarilo potvrdiť.",
  );
});

test("create and edit preserve a safe editorial address when provider/locality verification fails", () => {
  for (const source of [createRoute, updateRoute]) {
    assert.match(source, /withUnconfirmedDirectoryAddress/);
    assert.match(source, /try \{/);
    assert.match(source, /catch \{/);
    assert.match(source, /verifyDirectoryAddressSelection/);
    assert.match(source, /verifyDirectoryNumberlessAddressSelection/);
  }
  assert.doesNotMatch(createRoute, /throw new Error\("Zadanú lokalitu možno použiť/);
  assert.doesNotMatch(updateRoute, /throw new Error\("Zadanú lokalitu možno použiť/);
});

test("store treats address quality as non-blocking while retaining hard identity/contact validation", () => {
  assert.doesNotMatch(store, /serviceAddress\.reason === "LOCALITY_INVALID"[\s\S]{0,180}throw new Error/);
  assert.match(store, /const authoritativeAddressText = publicAddress \|\| serviceAddress\.formattedAddress \|\| ""/);
  assert.match(store, /address: publicAddress/);
  assert.match(store, /if \(!name\) throw new Error\("Doplň názov profilu\."\)/);
  assert.match(store, /if \(!category\) throw new Error\("Vyber kategóriu adresára\."\)/);
  assert.match(store, /Webová adresa nie je platná/);
  assert.match(store, /E-mailová adresa nie je platná/);
  assert.match(store, /function safeDirectoryAddressText/);
  assert.match(store, /typeof value !== "string"/);
  assert.match(store, /\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F<>/);
});

test("manual public address participates in search indexing", () => {
  assert.match(store, /directorySearchText\(\{/);
  assert.match(store, /address: authoritativeAddressText/);
  assert.match(store, /input\.address/);
  assert.match(store, /coalesce\(address, ''\)/);
});

test("LEGACY_UNCONFIRMED public address remains visible and public UI contains no technical warning", () => {
  const presentation = getDirectoryDetailPresentation(publicProfile());
  assert.equal(presentation.address, "Hlavná 123, 949 01 Nitra");
  assert.equal(presentation.navigationUrl, null);
  assert.match(publicDetail, /presentation\.address \? \{ label: "Adresa"/);
  assert.doesNotMatch(publicDetail, /Adresa nie je potvrdená|Geoapify|Google nepotvrdil|LEGACY_UNCONFIRMED/);
  assert.doesNotMatch(publicPage, /Adresa nie je potvrdená|Geoapify nenašiel|Google nepotvrdil/);
});

test("manual text alone never fabricates an exact GEO point", () => {
  assert.equal(directoryExactGeoCandidate({
    ...baseAddress,
    serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
  }), null);
  assert.match(store, /reconcileGeoAfterSourceMutation/);
  assert.match(publicDetail, /hasEmbeddedMap = Boolean\(publicMap\?\.items\.length\)/);
});

test("Google-first flow uses editorial address as a discovery hint and confirmation can upgrade canonical address and GEO", () => {
  assert.match(googleDiscovery, /source\.label, source\.address, source\.street/);
  assert.match(geoRoute, /discoverGoogleTargetPlaces\(source\)/);
  assert.match(geoRoute, /confirmAdminGooglePlace/);
  assert.match(googleConfirmation, /updateManagedDirectoryProfileFromGooglePlace/);
  assert.match(googleConfirmation, /applyGooglePlaceResolution/);
  assert.match(store, /address: place\.formattedAddress/);
  assert.match(store, /confirmServiceAddress: true/);
});

test("Admin Mapy shows editorial address plus review warning and keeps Google picker", () => {
  assert.match(mapLoader, /publicAddress/);
  assert.match(mapLoader, /addressWarning/);
  assert.match(mapLoader, /publicAddress && evaluation\.state !== "COMPLETE" \? "NEEDS_REVIEW"/);
  assert.match(mapDashboard, /if \(item\.publicAddress\)/);
  assert.match(mapDashboard, /Verejná adresa zostáva uložená a publikovateľná/);
  assert.match(mapDashboard, /<AdminGooglePlacePicker/);
  assert.match(mapDashboard, /item\.publicAddress/);
});

test("public text address does not create text-only navigation or coordinate schema claims", () => {
  assert.match(read("lib/directory-detail-presentation.ts"), /const navigationUrl = null/);
  assert.doesNotMatch(publicPage, /latitude|longitude|GeoCoordinates/);
});

test("Google/provider failure cannot clear editorial address or force draft in create/edit route", () => {
  for (const source of [createRoute, updateRoute]) {
    const catchIndex = source.indexOf("catch {");
    assert.ok(catchIndex >= 0);
    const tail = source.slice(catchIndex, catchIndex + 900);
    assert.doesNotMatch(tail, /address:\s*""/);
    assert.doesNotMatch(tail, /status:\s*"draft"/);
  }
});
