import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { evaluateGoogleDirectoryAutoMatch } from "../lib/google-place-directory-discovery.ts";
import {
  googlePlaceBulkFilterFingerprint,
  normalizeGooglePlaceBulkFilters,
  validateGooglePlaceBulkTargetIds,
} from "../lib/google-place-bulk.ts";

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

test("GOOGLE-PLACE-BULK Admin Mapy requests server-side batches instead of slicing current page", () => {
  assert.match(dashboard, /Počet profilov na kontrolu/);
  assert.match(dashboard, /min=\{1\}/);
  assert.match(dashboard, /max=\{100\}/);
  assert.match(dashboard, /action: "select-targets"/);
  assert.match(dashboard, /filters: \{/);
  assert.match(dashboard, /cursor: bulkCursor/);
  assert.match(dashboard, /targetIds = selection\.targetIds/);
  assert.doesNotMatch(dashboard, /bulkRemaining\.slice|serviceItems\.findIndex|visible\.filter/);
  assert.match(dashboard, /celého filtrovaného datasetu/);
  assert.match(dashboard, /Google Maps kontrola:/);
  assert.doesNotMatch(dashboard, /<table/);
});

test("GOOGLE-PLACE-BULK filter normalization and fingerprint bind cursor to dataset", () => {
  const filters = normalizeGooglePlaceBulkFilters({
    category: " veterinari ",
    operator: "needs_review",
    google: "unresolved",
    query: " Nitra ",
  });
  assert.deepEqual(filters, {
    category: "veterinari",
    operator: "NEEDS_REVIEW",
    google: "UNRESOLVED",
    query: "Nitra",
  });
  assert.equal(
    googlePlaceBulkFilterFingerprint(filters),
    JSON.stringify(filters),
  );
  assert.match(bulkStore, /Google bulk cursor nepatrí k aktuálnemu filtru/);
  assert.match(bulkStore, /ORDER BY name COLLATE NOCASE ASC, id ASC/);
  assert.match(bulkStore, /LIMIT \?/);
});

test("GOOGLE-PLACE-BULK server selection excludes resolved and protected workflow rows", () => {
  assert.match(bulkStore, /google_state <> 'PLACE'/);
  assert.match(bulkStore, /google_state <> 'NOT_REQUIRED'/);
  assert.match(bulkStore, /COALESCE\(manual_override, 0\) = 0/);
  assert.match(bulkStore, /explicit_private/);
  assert.match(bulkStore, /map_review_action = 'GOOGLE_MAPS_NOT_REQUIRED'/);
  assert.match(bulkStore, /getGoogleMapsWorkflowDecision/);
  assert.match(bulkStore, /Admin označil Google Maps ako nepotrebné/);
  assert.match(dashboard, /Pokračovať ďalšou dávkou/);
  assert.match(dashboard, /Začať od začiatku/);
});

test("GOOGLE-PLACE-BULK endpoint is explicit, bounded and processor protects privacy/manual overrides", () => {
  assert.match(bulkRoute, /sameOriginJson/);
  assert.match(bulkRoute, /GOOGLE-PLACE-BULK/);
  assert.match(bulkRoute, /selectGooglePlaceBulkTargets/);
  assert.match(bulkRoute, /validateGooglePlaceBulkTargetIds/);
  assert.match(bulkStore, /GOOGLE_PLACE_BULK_MAX = 100/);
  assert.doesNotMatch(bulkStore, /geoSensitiveDirectoryCategory/);
  assert.doesNotMatch(bulkStore, /Online-only profil|flag\(row, "online"\)|d\.online/);
  assert.match(bulkStore, /hasExplicitPrivateGeoDecision/);
  assert.match(bulkStore, /manual_override/);
  assert.match(bulkStore, /public_visibility/);
  assert.match(bulkStore, /updateManagedDirectoryProfileFromGooglePlace/);
  assert.match(bulkStore, /applyGooglePlaceResolution/);
  assert.doesNotMatch(bulkStore, /setManualGeoCoordinates/);
});
