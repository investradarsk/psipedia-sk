import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { evaluateGoogleDirectoryAutoMatch } from "../lib/google-place-directory-discovery.ts";
import { validateGooglePlaceBulkTargetIds } from "../lib/google-place-bulk.ts";

const dashboard = readFileSync(new URL("../components/admin-geo-operator-dashboard.tsx", import.meta.url), "utf8");
const bulkRoute = readFileSync(new URL("../app/api/admin/geo/bulk-google/route.ts", import.meta.url), "utf8");
const bulkStore = readFileSync(new URL("../lib/google-place-bulk.ts", import.meta.url), "utf8");

const source = {
  targetType: "DIRECTORY_PROFILE",
  targetId: 10,
  label: "Psí salón Alfa",
  category: "salony-a-sluzby",
  street: "Hlavná",
  houseNumber: "12",
  postalCode: "949 01",
  city: "Nitra",
  district: "Nitra",
  region: "Nitriansky kraj",
  countryCode: "SK",
  online: false,
  published: true,
};

function candidate(overrides = {}) {
  return {
    id: "places/alfa",
    displayName: "Psí salón Alfa",
    formattedAddress: "Hlavná 12, 949 01 Nitra, Slovensko",
    latitude: 48.306,
    longitude: 18.086,
    address: {
      street: "Hlavná",
      houseNumber: "12",
      postalCode: "949 01",
      locality: "Nitra",
      sublocality: "",
      district: "Nitra",
      region: "Nitriansky kraj",
      countryCode: "SK",
    },
    ...overrides,
  };
}

test("GOOGLE-PLACE-BULK safe auto-match requires strong name and independent location agreement", () => {
  const result = evaluateGoogleDirectoryAutoMatch(source, [candidate()]);
  assert.equal(result.decision, "MATCH");
  assert.ok(result.locationAgreements.includes("PSČ"));
  assert.ok(result.locationAgreements.includes("ulica"));
  assert.ok(result.locationAgreements.includes("mesto/lokalita"));
});

test("GOOGLE-PLACE-BULK conflicting Google locality is review-only", () => {
  const result = evaluateGoogleDirectoryAutoMatch(source, [candidate({
    formattedAddress: "Hlavná 12, 811 01 Bratislava, Slovensko",
    address: {
      street: "Hlavná",
      houseNumber: "12",
      postalCode: "811 01",
      locality: "Bratislava",
      sublocality: "",
      district: "Bratislava I",
      region: "Bratislavský kraj",
      countryCode: "SK",
    },
  })]);
  assert.equal(result.decision, "REVIEW");
  assert.ok(result.conflicts.includes("PSČ"));
  assert.ok(result.conflicts.includes("mesto/lokalita"));
});

test("GOOGLE-PLACE-BULK name-only profile never auto-confirms", () => {
  const result = evaluateGoogleDirectoryAutoMatch({
    ...source,
    street: "",
    houseNumber: "",
    postalCode: "",
    city: "",
    district: "",
    region: "",
  }, [candidate()]);
  assert.equal(result.decision, "REVIEW");
  assert.match(result.reason, /lokalizačný údaj/);
});

test("GOOGLE-PLACE-BULK ambiguous strong candidates stay for manual review", () => {
  const result = evaluateGoogleDirectoryAutoMatch(source, [
    candidate(),
    candidate({ id: "places/alfa-2", latitude: 48.307, longitude: 18.087 }),
  ]);
  assert.equal(result.decision, "REVIEW");
  assert.match(result.reason, /viac veľmi podobných kandidátov/);
});

test("GOOGLE-PLACE-BULK accepts any explicit batch size from 1 to 100 and rejects 101", () => {
  assert.deepEqual(validateGooglePlaceBulkTargetIds([1]), [1]);
  const hundred = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.equal(validateGooglePlaceBulkTargetIds(hundred).length, 100);
  assert.throws(() => validateGooglePlaceBulkTargetIds([]), /1 až 100/);
  assert.throws(() => validateGooglePlaceBulkTargetIds([...hundred, 101]), /1 až 100/);
});

test("GOOGLE-PLACE-BULK Admin Mapy exposes 1-100 count, current-filter batching and progress", () => {
  assert.match(dashboard, /Počet profilov na kontrolu/);
  assert.match(dashboard, /min=\{1\}/);
  assert.match(dashboard, /max=\{100\}/);
  assert.match(dashboard, /bulkEligible\.slice\(0, requested\)/);
  assert.match(dashboard, /aktuálneho filtra a vyhľadávania/);
  assert.match(dashboard, /Google Maps kontrola:/);
  assert.match(dashboard, /automaticky potvrdené/);
  assert.match(dashboard, /na kontrolu/);
  assert.doesNotMatch(dashboard, /<table/);
});

test("GOOGLE-PLACE-BULK endpoint is explicit, bounded and processor protects privacy/manual overrides", () => {
  assert.match(bulkRoute, /sameOriginJson/);
  assert.match(bulkRoute, /GOOGLE-PLACE-BULK/);
  assert.match(bulkRoute, /validateGooglePlaceBulkTargetIds/);
  assert.match(bulkStore, /GOOGLE_PLACE_BULK_MAX = 100/);
  assert.match(bulkStore, /geoSensitiveDirectoryCategory/);
  assert.match(bulkStore, /manual_override/);
  assert.match(bulkStore, /public_visibility/);
  assert.match(bulkStore, /updateManagedDirectoryProfileFromGooglePlace/);
  assert.match(bulkStore, /applyGooglePlaceResolution/);
  assert.doesNotMatch(bulkStore, /setManualGeoCoordinates/);
});
