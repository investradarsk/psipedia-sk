import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIRECTORY_GEO_MIGRATION_CANARY_MAX,
  evaluateDirectoryGeoMigrationEligibility,
  isHistoricalDirectoryGeoMigrationPoint,
  validateDirectoryGeoMigrationTargetIds,
} from "../lib/directory-exact-geo-migration.ts";

const migrationSource = readFileSync(new URL("../lib/directory-exact-geo-migration.ts", import.meta.url), "utf8");
const operationsApi = readFileSync(new URL("../app/api/admin/geo/operations/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/admin-geo-operations.tsx", import.meta.url), "utf8");

function source(patch = {}) {
  return {
    targetType: "DIRECTORY_PROFILE",
    targetId: 7,
    label: "Fixture",
    category: "veterinari",
    region: "Nitriansky kraj",
    district: "Zlaté Moravce",
    city: "Zlaté Moravce",
    postalCode: "953 01",
    street: "Hviezdoslavova",
    houseNumber: "74",
    addressFormat: "STREET",
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    countryCode: "SK",
    online: false,
    published: true,
    ...patch,
  };
}

function point(patch = {}) {
  return {
    id: 77,
    targetType: "DIRECTORY_PROFILE",
    targetId: 7,
    directoryProfileId: 7,
    organizationLocationId: null,
    managedEventId: null,
    publicVisibility: "APPROXIMATE_PUBLIC",
    publicPrecision: "MUNICIPALITY",
    latitude: 48.3,
    longitude: 18.4,
    resolutionMethod: "LOCALITY",
    provider: "geoapify",
    provenance: "legacy",
    sourceLicense: null,
    normalizedQuery: "Zlaté Moravce",
    queryFingerprint: "query",
    sourceFingerprint: "legacy-fingerprint",
    resolvedSourceFingerprint: "legacy-fingerprint",
    geocodeStatus: "RESOLVED",
    lastErrorCode: null,
    lastErrorAt: null,
    retryAfterAt: null,
    attemptCount: 1,
    manualOverride: false,
    manualUpdatedAt: null,
    manualUpdatedBy: null,
    lastGeocodedAt: "2026-08-01T00:00:00Z",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...patch,
  };
}

test("A2 migration cohort is explicit historical approximate DIRECTORY GEO only", () => {
  assert.equal(isHistoricalDirectoryGeoMigrationPoint(point()), true);
  assert.equal(isHistoricalDirectoryGeoMigrationPoint(point({ publicVisibility: "EXACT_PUBLIC", publicPrecision: "EXACT" })), false);
  assert.equal(isHistoricalDirectoryGeoMigrationPoint(point({ targetType: "MANAGED_EVENT" })), false);
});

test("A2 migration eligibility includes legacy approximate review but excludes current exact review", () => {
  assert.deepEqual(
    evaluateDirectoryGeoMigrationEligibility({ source: source(), point: point() }),
    { action: "PROCESS", reason: "HISTORICAL_APPROXIMATE_GEO" },
  );
  assert.deepEqual(
    evaluateDirectoryGeoMigrationEligibility({
      source: source(),
      point: point({ geocodeStatus: "NEEDS_REVIEW", lastErrorCode: "LOW_CONFIDENCE" }),
    }),
    { action: "PROCESS", reason: "LEGACY_APPROXIMATE_REVIEW" },
  );
  assert.deepEqual(
    evaluateDirectoryGeoMigrationEligibility({
      source: source(),
      point: point({
        publicVisibility: "EXACT_PUBLIC",
        publicPrecision: "EXACT",
        geocodeStatus: "NEEDS_REVIEW",
      }),
    }),
    { action: "OUT_OF_COHORT", reason: "NOT_HISTORICAL_APPROXIMATE_GEO" },
  );
});

test("A2 migration fail-closes canonical address and protects manual override", () => {
  assert.equal(evaluateDirectoryGeoMigrationEligibility({
    source: source({ serviceAddressConfirmation: "LEGACY_UNCONFIRMED" }),
    point: point(),
  }).reason, "LEGACY_UNCONFIRMED");
  assert.equal(evaluateDirectoryGeoMigrationEligibility({
    source: source({ houseNumber: "" }),
    point: point(),
  }).action, "REVIEW");
  assert.equal(evaluateDirectoryGeoMigrationEligibility({
    source: source(),
    point: point({ manualOverride: true }),
  }).reason, "MANUAL_OVERRIDE");
});

test("A2 migration canary IDs are explicit unique positive and bounded to five", () => {
  assert.equal(DIRECTORY_GEO_MIGRATION_CANARY_MAX, 5);
  assert.deepEqual(validateDirectoryGeoMigrationTargetIds([9, 2, 7]), [9, 2, 7]);
  assert.throws(() => validateDirectoryGeoMigrationTargetIds([]), /1 až 5/);
  assert.throws(() => validateDirectoryGeoMigrationTargetIds([1, 2, 3, 4, 5, 6]), /najviac 5/);
  assert.throws(() => validateDirectoryGeoMigrationTargetIds([2, 2]), /unique/);
  assert.throws(() => validateDirectoryGeoMigrationTargetIds([0]), /kladné safe integer/);
});

test("migration preview is read-only and reports the required historical contract", () => {
  assert.match(migrationSource, /totalMigrationCohortCount/);
  assert.match(migrationSource, /eligibleCount/);
  assert.match(migrationSource, /blockedReviewCount/);
  assert.match(migrationSource, /historicalStatus/);
  assert.match(migrationSource, /historicalVisibility/);
  assert.match(migrationSource, /historicalPrecision/);
  assert.match(migrationSource, /canonicalAddressEligibility/);
  assert.match(migrationSource, /intendedAction/);
  const previewStart = migrationSource.indexOf("export async function previewDirectoryGeoMigration");
  const runStart = migrationSource.indexOf("export async function runDirectoryGeoMigrationCanary");
  const previewBlock = migrationSource.slice(previewStart, runStart);
  assert.doesNotMatch(previewBlock, /verifyDirectoryCanonicalAddress\(/);
  assert.doesNotMatch(previewBlock, /setGeoVisibility\(|applyGeocoderResolution\(|recordGeocoderFailure\(/);
});

test("migration reuses shared exact verifier and verifies before replacing historical GEO", () => {
  assert.match(migrationSource, /verifyDirectoryCanonicalAddress/);
  assert.match(migrationSource, /directoryExactAddressFormat/);
  assert.doesNotMatch(migrationSource, /houseNumberMatchesUserInput|parseSlovakHouseNumber|chooseGeocoderResult/);
  const verify = migrationSource.indexOf("const verified = await verifyDirectoryCanonicalAddress");
  const classify = migrationSource.indexOf("point = await setGeoVisibility");
  const apply = migrationSource.indexOf("const resolved = await applyGeocoderResolution");
  assert.ok(verify >= 0 && classify > verify && apply > classify);
});

test("migration preserves bounded sequential execution and stops after 429", () => {
  assert.match(migrationSource, /for \(const targetId of ids\)/);
  assert.match(migrationSource, /if \(errorCode === "RATE_LIMITED"\) break/);
  assert.match(migrationSource, /GEO_A2_MIGRATION_RESOLVED/);
  assert.match(migrationSource, /GEO_A2_MIGRATION_FAILED/);
  assert.doesNotMatch(migrationSource, /Promise\.all\(ids/);
});

test("migration API exposes only read-only preview and explicit confirmed canary", () => {
  assert.match(operationsApi, /action === "a2-migration-preview"/);
  assert.match(operationsApi, /persisted: false, providerCalled: false/);
  assert.match(operationsApi, /action === "a2-migration-canary"/);
  assert.match(operationsApi, /confirm !== "A2-MIGRATION-CANARY"/);
  assert.match(operationsApi, /validateDirectoryGeoMigrationTargetIds/);
  assert.match(operationsApi, /item\.action !== "PROCESS"/);
  assert.doesNotMatch(operationsApi, /a2-migration-process-all/);
});

test("migration admin UI is isolated from A2-AUTO and legacy approximate tools", () => {
  assert.match(component, /data-admin-a2-migration/);
  assert.match(component, /A2 Migration — Historical directory GEO/);
  assert.match(component, /Historical approximate cohort only/);
  assert.match(component, /Obnoviť migration preview/);
  assert.match(component, /Spustiť migration canary/);
  assert.match(component, /max\. 5 ID z migration preview/);
  assert.doesNotMatch(component, /A2 migration process-all/i);
});
