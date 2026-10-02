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

test("GOOGLE-BULK-ALL keeps the batch bounded to 1-100 in the server contract", () => {
  assert.match(bulkStore, /GOOGLE_PLACE_BULK_MAX = 100/);
  assert.match(bulkStore, /parsed < 1 \|\| parsed > GOOGLE_PLACE_BULK_MAX/);
});

test("GOOGLE-PLACE-BULK Admin Mapy requests server-side batches instead of slicing current page", () => {
  assert.match(dashboard, /Počet položiek/);
  assert.match(dashboard, /min=\{1\}/);
  assert.match(dashboard, /max=\{100\}/);
  assert.match(dashboard, /action: "select-targets"/);
  assert.match(dashboard, /filters: \{/);
  assert.match(dashboard, /cursor: bulkCursor/);
  assert.match(dashboard, /targets = selection.targets/);
  assert.doesNotMatch(dashboard, /bulkRemaining\.slice|serviceItems\.findIndex|visible\.filter/);
  assert.match(dashboard, /celého aktuálne filtrovaného datasetu/);
  assert.match(dashboard, /Google Maps kontrola/);
  assert.doesNotMatch(dashboard, /<table/);
});

test("GOOGLE-PLACE-BULK filter normalization and fingerprint bind cursor to dataset", () => {
  const filters = normalizeGooglePlaceBulkFilters({
    group: "help",
    category: " veterinari ",
    operator: "needs_review",
    google: "unresolved",
    query: " Nitra ",
  });
  assert.deepEqual(filters, {
    group: "HELP",
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
  const operatorStore = readFileSync(new URL("../lib/geo-admin-operator.ts", import.meta.url), "utf8");
  assert.match(operatorStore, /ORDER BY name COLLATE NOCASE ASC, target_type ASC, target_id ASC/);
  assert.match(operatorStore, /LIMIT \?/);
});

test("GOOGLE-PLACE-BULK server selection excludes resolved and protected workflow rows", () => {
  const operatorStore = readFileSync(new URL("../lib/geo-admin-operator.ts", import.meta.url), "utf8");
  assert.match(operatorStore, /google_state <> 'PLACE'/);
  assert.match(operatorStore, /google_state <> 'NOT_REQUIRED'/);
  assert.match(operatorStore, /COALESCE\(manual_override, 0\) = 0/);
  assert.match(operatorStore, /explicit_private/);
  assert.match(bulkStore, /getGoogleMapsWorkflowDecision/);
  assert.match(bulkStore, /Admin označil Google Maps ako nepotrebné/);
  assert.match(dashboard, /Pokračovať ďalšou dávkou/);
  assert.match(dashboard, /Začať od začiatku/);
});

test("GOOGLE-PLACE-BULK endpoint is explicit, bounded and processor protects privacy/manual overrides", () => {
  assert.match(bulkRoute, /sameOriginJson/);
  assert.match(bulkRoute, /GOOGLE-PLACE-BULK/);
  assert.match(bulkRoute, /selectGooglePlaceBulkTargets/);
  assert.match(bulkStore, /GOOGLE_PLACE_BULK_MAX = 100/);
  assert.doesNotMatch(bulkStore, /geoSensitiveDirectoryCategory/);
  assert.doesNotMatch(bulkStore, /Online-only profil|flag\(row, "online"\)|d\.online/);
  assert.match(bulkStore, /hasExplicitPrivateGeoDecision/);
  assert.match(bulkStore, /manualOverride/);
  assert.match(bulkStore, /publicVisibility/);
  assert.match(bulkStore, /updateManagedDirectoryProfileFromGooglePlace/);
  assert.match(bulkStore, /applyGooglePlaceResolution/);
  assert.doesNotMatch(bulkStore, /setManualGeoCoordinates/);
});

test("GOOGLE-BULK-ALL carries group and canonical target identity through selection and processing", () => {
  assert.match(dashboard, /group: data\.filters\.group/);
  assert.match(dashboard, /targetType: target\.targetType/);
  assert.match(dashboard, /targetId: target\.targetId/);
  assert.match(bulkRoute, /isGeoTargetType\(targetType\)/);
  assert.match(bulkStore, /lastTargetType/);
  assert.match(bulkStore, /lastTargetId/);
  assert.match(bulkStore, /filterFingerprint/);
});

test("GOOGLE-BULK-ALL live UX exposes progress, summary, results, stop and resume", () => {
  assert.match(dashboard, /bulkProgress\.processed/);
  assert.match(dashboard, /<progress/);
  assert.match(dashboard, /Aktuálne:/);
  assert.match(dashboard, /setBulkResults\(\(previous\) => \[\.\.\.previous, result\]\)/);
  assert.match(dashboard, /Zastaviť po aktuálnej položke/);
  assert.match(dashboard, /sessionStorage/);
  assert.match(dashboard, /persistBulkCursor\(lastCursor\)/);
  assert.match(dashboard, /Otvoriť profil v admine/);
  assert.match(dashboard, /Otvoriť verejný profil/);
});

test("GOOGLE-BULK-ALL keeps HELP and EVENTS conservative without inventing auto-confirm heuristics", () => {
  assert.match(bulkStore, /targetType !== "DIRECTORY_PROFILE"/);
  assert.match(bulkStore, /neexistuje bezpečný generický auto-confirm kontrakt/);
  assert.match(bulkStore, /locationRole !== "SITE"/);
  assert.match(bulkStore, /LEGAL_SEAT, SERVICE_AREA ani UNSPECIFIED/);
  assert.match(bulkStore, /Online podujatie fyzický Google Maps bod nepotrebuje/);
});
