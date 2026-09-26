import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  autocompleteDirectoryAddress,
  verifyDirectoryAddressSelection,
  verifyDirectoryExactCandidates,
} from "../lib/directory-address-provider.ts";
import { GeoapifyGeocoder } from "../lib/geoapify-geocoder.ts";

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
    ...Array.from({ length: 7 }, (_, index) => result({ providerResultId: `extra-${index}`, street: `Testovacia ${index}` })),
  ];
  const provider = { autocomplete: async () => candidates };
  const suggestions = await autocompleteDirectoryAddress({ ...locality, query: "Župná", provider });
  assert.equal(suggestions.length, 5);
  assert.equal(suggestions.every((item) => item.city === "Zlaté Moravce"), true);
  assert.equal(suggestions.some((item) => item.providerResultId === "wrong-country"), false);
  assert.equal(Object.hasOwn(suggestions[0], "latitude"), false);
  assert.equal(Object.hasOwn(suggestions[0], "longitude"), false);
});

test("save revalidation re-runs street autocomplete, requires the same provider identity, then verifies the exact house", async () => {
  const calls = [];
  const provider = {
    autocomplete: async (request) => {
      calls.push(["autocomplete", request.query]);
      return [result({
        providerResultId: "street-place-1",
        resultType: "street",
        housenumber: "",
        postcode: "",
        buildingConfidence: null,
      })];
    },
    geocodeExact: async (request) => {
      calls.push(["geocode", request.structuredAddress?.street, request.structuredAddress?.housenumber]);
      return [result({ providerResultId: "house-place-74", housenumber: "1892/74" })];
    },
  };
  const verified = await verifyDirectoryAddressSelection({
    ...locality,
    providerResultId: "street-place-1",
    street: "Župná",
    houseNumber: "1892/74",
    provider,
  });
  assert.equal(verified.providerResult.providerResultId, "house-place-74");
  assert.equal(verified.houseNumber, "1892/74");
  assert.deepEqual(calls, [
    ["autocomplete", "Župná"],
    ["geocode", "Župná", "1892/74"],
  ]);

  const changedProvider = {
    autocomplete: async () => [result({
      providerResultId: "different-street",
      resultType: "street",
      housenumber: "",
      postcode: "",
    })],
    geocodeExact: provider.geocodeExact,
  };
  await assert.rejects(
    verifyDirectoryAddressSelection({
      ...locality,
      providerResultId: "street-place-1",
      street: "Župná",
      houseNumber: "12",
      provider: changedProvider,
    }),
    /nepodarilo znovu overiť/,
  );
});

test("Geoapify place-details parser accepts GeoJSON features and preserves the requested place id", async () => {
  const provider = new GeoapifyGeocoder({
    apiKey: "test-key",
    fetchImpl: async () => Response.json({
      features: [{
        properties: {
          lat: 48.385,
          lon: 18.401,
          country: "Slovakia",
          country_code: "sk",
          state: "Nitriansky kraj",
          county: "Zlaté Moravce",
          city: "Zlaté Moravce",
          street: "Hviezdoslavova",
          result_type: "street",
        },
      }],
    }),
  });
  const results = await provider.lookupPlace("street-place-1");
  assert.equal(results.length, 1);
  assert.equal(results[0].street, "Hviezdoslavova");
  assert.equal(results[0].providerResultId, "street-place-1");
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
  assert.match(provider, /url\.searchParams\.set\("type", "street"\)/);
  assert.match(provider, /body\.features\?\.map/);
  assert.match(provider, /url\.searchParams\.set\("limit", "5"\)/);
  assert.match(provider, /providerResultId: result\.place_id/);

  assert.match(autocomplete, /query\.trim\(\)\.length >= 3/);
  assert.match(autocomplete, /window\.setTimeout[\s\S]*325/);
  assert.match(autocomplete, /AbortController/);
  assert.match(autocomplete, /slice\(0, 5\)/);
  assert.match(autocomplete, /Vyhľadávam ulice/);
  assert.match(autocomplete, /nenašla zodpovedajúca ulica/);
  assert.match(autocomplete, /selectedStreet/);
  assert.match(editor, /addressProviderResultId/);
  assert.match(editor, /confirmServiceAddress: false/);
  assert.match(editor, /readOnly/);
  assert.doesNotMatch(editor, /setStreet\(event\.target\.value\)/);
  assert.match(editor, /setHouseNumber\(event\.target\.value\)/);
  assert.match(editor, /selectedStreet=\{street\}/);
  assert.doesNotMatch(editor, /latitude|longitude/);

  assert.match(createRoute, /verifyDirectoryAddressSelection/);
  assert.match(createRoute, /street: body\.street/);
  assert.match(createRoute, /houseNumber: body\.houseNumber/);
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
