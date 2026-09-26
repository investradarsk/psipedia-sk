import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  autocompleteDirectoryAddress,
  verifyDirectoryAddressSelection,
  verifyDirectoryExactCandidates,
} from "../lib/directory-address-provider.ts";

const locality = {
  region: "Nitriansky kraj",
  district: "Zlaté Moravce",
  city: "Zlaté Moravce",
};

function result(patch = {}) {
  return {
    latitude: 48.385,
    longitude: 18.401,
    country: "Slovakia",
    countryCode: "SK",
    region: "Nitriansky kraj",
    district: "Zlaté Moravce",
    city: "Zlaté Moravce",
    street: "Župná",
    housenumber: "12",
    postcode: "95301",
    formatted: "Župná 12, 953 01 Zlaté Moravce, Slovensko",
    addressLine1: "Župná 12",
    addressLine2: "953 01 Zlaté Moravce, Slovensko",
    resultType: "building",
    confidence: 0.99,
    cityConfidence: 0.99,
    streetConfidence: 0.99,
    buildingConfidence: 0.99,
    matchType: "full_match",
    provider: "geoapify",
    provenance: "Geoapify Geocoding API",
    sourceLicense: "OpenStreetMap contributors",
    providerResultId: "place-1",
    ...patch,
  };
}


test("autocomplete requires canonical locality and minimum query length before provider access", async () => {
  let calls = 0;
  const provider = { autocomplete: async () => { calls += 1; return []; } };
  await assert.rejects(
    autocompleteDirectoryAddress({ region: "Nitriansky kraj", district: "Nitra", city: "Neexistujúca obec", query: "Hlavná", provider }),
    /platný kraj, okres a obec/,
  );
  await assert.rejects(
    autocompleteDirectoryAddress({ ...locality, query: "Hl", provider }),
    /aspoň 3 znaky/,
  );
  assert.equal(calls, 0);
});

test("autocomplete filters to selected Slovak locality and returns at most five safe suggestions", async () => {
  const candidates = [
    result(),
    result({ providerResultId: "wrong-country", countryCode: "AT" }),
    result({ providerResultId: "wrong-city", city: "Nitra", district: "Nitra" }),
    ...Array.from({ length: 7 }, (_, index) => result({ providerResultId: `extra-${index}` })),
  ];
  const provider = { autocomplete: async () => candidates };
  const suggestions = await autocompleteDirectoryAddress({ ...locality, query: "Župná", provider });
  assert.equal(suggestions.length, 5);
  assert.equal(suggestions.every((item) => item.city === "Zlaté Moravce"), true);
  assert.equal(suggestions.some((item) => item.providerResultId === "wrong-country"), false);
  assert.equal(Object.hasOwn(suggestions[0], "latitude"), false);
  assert.equal(Object.hasOwn(suggestions[0], "longitude"), false);
});

test("save revalidation resolves provider identity again and requires the same ranked house result", async () => {
  const calls = [];
  const provider = {
    lookupPlace: async (providerResultId) => {
      calls.push(["details", providerResultId]);
      return [result({ providerResultId })];
    },
    geocodeExact: async (request) => {
      calls.push(["geocode", request.structuredAddress?.housenumber, request.structuredAddress?.postcode]);
      return [result()];
    },
  };
  const verified = await verifyDirectoryAddressSelection({
    ...locality,
    providerResultId: "place-1",
    provider,
  });
  assert.equal(verified.providerResult.providerResultId, "place-1");
  assert.deepEqual(calls, [
    ["details", "place-1"],
    ["geocode", "12", "95301"],
  ]);

  const changedProvider = {
    lookupPlace: provider.lookupPlace,
    geocodeExact: async () => [result({ providerResultId: "different-place" })],
  };
  await assert.rejects(
    verifyDirectoryAddressSelection({ ...locality, providerResultId: "place-1", provider: changedProvider }),
    /serverovom overení zmenil/,
  );
});

test("strict exact gate accepts a high-confidence STREET building and normalizes postcode", () => {
  const verified = verifyDirectoryExactCandidates({ ...locality, results: [result()] });
  assert.equal(verified.addressFormat, "STREET");
  assert.equal(verified.street, "Župná");
  assert.equal(verified.houseNumber, "12");
  assert.equal(verified.postalCode, "953 01");
  assert.equal(verified.providerResult.providerResultId, "place-1");
});

test("strict exact gate supports MUNICIPALITY_NUMBER without inventing a street", () => {
  const verified = verifyDirectoryExactCandidates({
    ...locality,
    results: [result({ street: "", streetConfidence: null })],
  });
  assert.equal(verified.addressFormat, "MUNICIPALITY_NUMBER");
  assert.equal(verified.street, "");
  assert.equal(verified.houseNumber, "12");
});

test("strict exact gate rejects street/city results, low confidence, invalid postcode and locality mismatch", () => {
  for (const candidate of [
    result({ resultType: "street" }),
    result({ resultType: "city" }),
    result({ confidence: 0.90 }),
    result({ buildingConfidence: 0.90 }),
    result({ postcode: "9530" }),
    result({ city: "Nitra" }),
    result({ district: "Nitra" }),
    result({ region: "Bratislavský kraj" }),
    result({ housenumber: "" }),
  ]) {
    assert.throws(
      () => verifyDirectoryExactCandidates({ ...locality, results: [candidate] }),
      /nepotvrdil presnú adresu domu/,
    );
  }
});

test("strict exact gate rejects ambiguous competing house results", () => {
  assert.throws(() => verifyDirectoryExactCandidates({
    ...locality,
    results: [
      result(),
      result({ providerResultId: "place-2", latitude: 48.39, longitude: 18.41 }),
    ],
  }), /nejednoznačná/);
});

test("ADDRESS-SIMPLE-1A endpoint, editor and save flow preserve server authority", async () => {
  const [endpoint, editor, autocomplete, createRoute, updateRoute, provider, geoStore, migration] = await Promise.all([
    readFile(new URL("../app/api/admin/directory/address-autocomplete/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/directory-address-autocomplete.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/directory/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/geoapify-geocoder.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/geo-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0077_directory_geo_provider_result_id.sql", import.meta.url), "utf8"),
  ]);

  assert.match(endpoint, /getAdminApiUser/);
  assert.match(endpoint, /autocompleteDirectoryAddress/);
  assert.doesNotMatch(endpoint, /GEOAPIFY_API_KEY/);

  assert.match(provider, /GEOAPIFY_API_KEY/);
  assert.match(provider, /\/v1\/geocode\/autocomplete/);
  assert.match(provider, /countrycode:sk/);
  assert.match(provider, /url\.searchParams\.set\("limit", "5"\)/);
  assert.match(provider, /providerResultId: result\.place_id/);

  assert.match(autocomplete, /query\.trim\(\)\.length >= 3/);
  assert.match(autocomplete, /window\.setTimeout[\s\S]*325/);
  assert.match(autocomplete, /AbortController/);
  assert.match(autocomplete, /slice\(0, 5\)/);
  assert.match(autocomplete, /Vyhľadávam adresy/);
  assert.match(autocomplete, /nenašla zodpovedajúca presná adresa/);
  assert.match(editor, /addressProviderResultId/);
  assert.match(editor, /confirmServiceAddress: false/);
  assert.match(editor, /readOnly/);
  assert.doesNotMatch(editor, /setStreet\(event\.target\.value\)/);
  assert.doesNotMatch(editor, /latitude|longitude/);

  assert.match(createRoute, /verifyDirectoryAddressSelection/);
  assert.match(createRoute, /requireDirectoryAddressProviderSchema/);
  assert.match(updateRoute, /directoryPhysicalAddressChanged/);
  assert.match(updateRoute, /Zmenu fyzickej adresy potvrď výberom/);
  assert.match(updateRoute, /applyVerifiedDirectoryAddressGeo/);
  assert.doesNotMatch(createRoute + updateRoute, /body\.(?:latitude|longitude)/);

  assert.match(geoStore, /provider_result_id=\?/);
  assert.match(geoStore, /resolved_source_fingerprint=source_fingerprint/);
  assert.match(geoStore, /manualOverride/);
  assert.match(geoStore, /classification\.requiresReview/);
  assert.match(migration, /ALTER TABLE geo_points ADD COLUMN provider_result_id TEXT/);
});

test("organization and event geo contracts remain provider-neutral and unchanged by directory exact gate", async () => {
  const geoService = await readFile(new URL("../lib/geo-service.ts", import.meta.url), "utf8");
  const geo = await readFile(new URL("../lib/geo.ts", import.meta.url), "utf8");
  assert.match(geo, /targetType === "ORGANIZATION_LOCATION"/);
  assert.match(geo, /targetType === "MANAGED_EVENT"/);
  assert.match(geoService, /chooseGeocoderResult/);
  assert.doesNotMatch(geoService, /verifyDirectoryExactCandidates/);
});
