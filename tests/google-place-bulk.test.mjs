import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { evaluateGoogleDirectoryAutoMatch } from "../lib/google-place-directory-discovery.ts";
import {
  googlePlaceBulkFilterFingerprint,
  normalizeGooglePlaceBulkFilters,
} from "../lib/google-place-bulk.ts";

const dashboard = readFileSync(new URL("../components/admin-geo-operator-dashboard.tsx", import.meta.url), "utf8");
const bulkRoute = readFileSync(new URL("../app/api/admin/geo/bulk-google/route.ts", import.meta.url), "utf8");
const bulkStore = readFileSync(new URL("../lib/google-place-bulk.ts", import.meta.url), "utf8");
const operatorStore = readFileSync(new URL("../lib/geo-admin-operator.ts", import.meta.url), "utf8");

const source = {
  targetType: "DIRECTORY_PROFILE", targetId: 10, label: "Psí salón Alfa", category: "salony-a-sluzby",
  street: "Hlavná", houseNumber: "12", postalCode: "949 01", city: "Nitra",
  district: "Nitra", region: "Nitriansky kraj", countryCode: "SK", published: true,
};

function candidate(overrides = {}) {
  return {
    id: "places/alfa", displayName: "Psí salón Alfa",
    formattedAddress: "Hlavná 12, 949 01 Nitra, Slovensko", latitude: 48.306, longitude: 18.086,
    address: { street: "Hlavná", houseNumber: "12", postalCode: "949 01", locality: "Nitra",
      sublocality: "", district: "Nitra", region: "Nitriansky kraj", countryCode: "SK" },
    ...overrides,
  };
}

test("safe directory auto-match still requires independent location agreement", () => {
  const result = evaluateGoogleDirectoryAutoMatch(source, [candidate()]);
  assert.equal(result.decision, "MATCH");
  assert.ok(result.locationAgreements.includes("PSČ"));
  assert.ok(result.locationAgreements.includes("ulica"));
});

test("conflicting or ambiguous candidates stay manual-review", () => {
  assert.equal(evaluateGoogleDirectoryAutoMatch(source, [candidate({
    address: { ...candidate().address, postalCode: "811 01", locality: "Bratislava", district: "Bratislava I" },
  })]).decision, "REVIEW");
  assert.equal(evaluateGoogleDirectoryAutoMatch(source, [
    candidate(), candidate({ id: "places/alfa-2", latitude: 48.307, longitude: 18.087 }),
  ]).decision, "REVIEW");
});

test("Google bulk stays bounded to 1-100", () => {
  assert.match(bulkStore, /GOOGLE_PLACE_BULK_MAX = 100/);
  assert.match(bulkStore, /parsed < 1 \|\| parsed > GOOGLE_PLACE_BULK_MAX/);
  assert.match(dashboard, /min=\{1\}/);
  assert.match(dashboard, /max=\{100\}/);
});

test("Admin Mapy bulk selects from whole server-side unresolved dataset", () => {
  assert.match(dashboard, /action: "select-targets"/);
  assert.match(dashboard, /cursor: bulkCursor/);
  assert.match(dashboard, /targets = selection\.targets/);
  assert.doesNotMatch(dashboard, /bulkRemaining\.slice|visible\.filter/);
  assert.match(dashboard, /serverového unresolved inboxu/);
  assert.match(operatorStore, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
});

test("bulk filter fingerprint and cursor remain dataset-bound", () => {
  const filters = normalizeGooglePlaceBulkFilters({
    group: "help", category: " utulok ", operator: "needs_review", google: "place", query: " Nitra ",
  });
  assert.deepEqual(filters, { group: "HELP", category: "utulok", operator: "ALL", google: "ALL", query: "Nitra" });
  assert.equal(googlePlaceBulkFilterFingerprint(filters), JSON.stringify(filters));
  assert.match(bulkStore, /Google bulk cursor nepatrí k aktuálnemu filtru/);
  assert.match(operatorStore, /ORDER BY name COLLATE NOCASE ASC, target_type ASC, target_id ASC/);
});

test("bulk processor preserves privacy/manual protections and uses location-only directory write", () => {
  assert.match(bulkRoute, /sameOriginJson/);
  assert.match(bulkRoute, /GOOGLE-PLACE-BULK/);
  assert.match(bulkStore, /hasExplicitPrivateGeoDecision/);
  assert.match(bulkStore, /manualOverride/);
  assert.match(bulkStore, /updateManagedDirectoryProfileLocationFromGooglePlace/);
  assert.match(bulkStore, /applyGooglePlaceResolution/);
  assert.doesNotMatch(bulkStore, /setManualGeoCoordinates/);
});

test("HELP bulk carries organization identity so location-row count cannot inflate logical targets", () => {
  assert.match(dashboard, /organizationId: target\.organizationId/);
  assert.match(bulkRoute, /organizationId/);
  assert.match(bulkStore, /loadOrganizationGoogleMapsProfile\(organizationId\)/);
  assert.match(operatorStore, /key: `HELP_ORGANIZATION:\$\{organizationId\}`/);
});

test("live bulk UX keeps progress, stop/resume and concise summary", () => {
  assert.match(dashboard, /bulkProgress\.processed/);
  assert.match(dashboard, /Zastaviť po aktuálnej/);
  assert.match(dashboard, /sessionStorage/);
  assert.match(dashboard, /✓ Hotovo:/);
  assert.match(dashboard, /⚠ Na kontrolu:/);
  assert.match(dashboard, /○ Nenájdené:/);
  assert.match(dashboard, /✕ Chyby:/);
});

test("non-directory targets remain conservative: candidate discovery without generic auto-confirm", () => {
  assert.match(bulkStore, /targetType !== "DIRECTORY_PROFILE"/);
  assert.match(bulkStore, /Organizácia zostáva na ručné potvrdenie správneho miesta/);
  assert.match(bulkStore, /Online podujatie fyzický Google Maps bod nepotrebuje/);
});
