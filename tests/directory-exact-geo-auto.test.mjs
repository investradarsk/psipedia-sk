import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIRECTORY_EXACT_GEO_BATCH_MAX,
  evaluateDirectoryGeoEligibility,
  validateDirectoryExactGeoTargetIds,
} from "../lib/directory-exact-geo-auto.ts";

const runnerSource = readFileSync(new URL("../lib/directory-exact-geo-auto.ts", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const operationsApi = readFileSync(new URL("../app/api/admin/geo/operations/route.ts", import.meta.url), "utf8");

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
    publicVisibility: "EXACT_PUBLIC",
    publicPrecision: "EXACT",
    latitude: null,
    longitude: null,
    resolutionMethod: null,
    provider: null,
    provenance: null,
    sourceLicense: null,
    normalizedQuery: "Hviezdoslavova 74",
    queryFingerprint: "query",
    sourceFingerprint: "fingerprint",
    resolvedSourceFingerprint: null,
    geocodeStatus: "PENDING",
    lastErrorCode: null,
    lastErrorAt: null,
    retryAfterAt: null,
    attemptCount: 0,
    manualOverride: false,
    manualUpdatedAt: null,
    manualUpdatedBy: null,
    lastGeocodedAt: null,
    createdAt: "2026-09-26T00:00:00Z",
    updatedAt: "2026-09-26T00:00:00Z",
    ...patch,
  };
}

test("A2 exact eligibility accepts only current canonical physical backlog states", () => {
  assert.deepEqual(
    evaluateDirectoryGeoEligibility({ source: source(), point: null, expectedFingerprint: "fingerprint" }),
    { action: "PROCESS", reason: "MISSING_GEO_POINT" },
  );
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source(), point: point({ geocodeStatus: "PENDING" }), expectedFingerprint: "fingerprint",
  }).action, "PROCESS");
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source(), point: point({ geocodeStatus: "STALE" }), expectedFingerprint: "fingerprint",
  }).action, "PROCESS");
});

test("A2 exact eligibility blocks incomplete, legacy, online and manual override profiles", () => {
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source({ houseNumber: "" }), point: null,
  }).action, "BLOCK");
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source({ serviceAddressConfirmation: "LEGACY_UNCONFIRMED" }), point: null,
  }).reason, "LEGACY_UNCONFIRMED");
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source({
      online: true,
      region: "",
      district: "",
      city: "",
      postalCode: "",
      street: "",
      houseNumber: "",
      addressFormat: "",
    }),
    point: null,
  }).reason, "ONLINE_ONLY");
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source(), point: point({ manualOverride: true }), expectedFingerprint: "fingerprint",
  }).reason, "MANUAL_OVERRIDE");
});

test("historical approximate directory cohort is A2-MIGRATE scope, never A2-AUTO", () => {
  const eligibility = evaluateDirectoryGeoEligibility({
    source: source(),
    point: point({
      publicVisibility: "APPROXIMATE_PUBLIC",
      publicPrecision: "MUNICIPALITY",
      geocodeStatus: "RESOLVED",
      latitude: 48.3,
      longitude: 18.4,
      resolvedSourceFingerprint: "fingerprint",
    }),
    expectedFingerprint: "fingerprint",
  });
  assert.deepEqual(eligibility, { action: "MIGRATION_SCOPE", reason: "LEGACY_APPROXIMATE_COHORT" });
});

test("current exact resolution is idempotent while changed fingerprint is reprocessed", () => {
  const current = point({
    geocodeStatus: "RESOLVED",
    latitude: 48.3,
    longitude: 18.4,
    sourceFingerprint: "same",
    resolvedSourceFingerprint: "same",
  });
  assert.deepEqual(
    evaluateDirectoryGeoEligibility({ source: source(), point: current, expectedFingerprint: "same" }),
    { action: "SKIP", reason: "CURRENT_EXACT_RESOLVED" },
  );
  assert.deepEqual(
    evaluateDirectoryGeoEligibility({ source: source(), point: current, expectedFingerprint: "changed" }),
    { action: "PROCESS", reason: "SOURCE_FINGERPRINT_CHANGED" },
  );
});

test("retry policy processes only retry-safe failures whose retry window has arrived", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source(),
    point: point({
      geocodeStatus: "FAILED",
      lastErrorCode: "PROVIDER_ERROR",
      retryAfterAt: "2026-09-26T11:59:00Z",
    }),
    expectedFingerprint: "fingerprint",
    nowMs: now,
  }).action, "PROCESS");
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source(),
    point: point({
      geocodeStatus: "FAILED",
      lastErrorCode: "PROVIDER_ERROR",
      retryAfterAt: "2026-09-26T12:01:00Z",
    }),
    expectedFingerprint: "fingerprint",
    nowMs: now,
  }).action, "REVIEW");
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source(),
    point: point({ geocodeStatus: "NEEDS_REVIEW", lastErrorCode: "AMBIGUOUS" }),
    expectedFingerprint: "fingerprint",
    nowMs: now,
  }).action, "REVIEW");
  assert.equal(evaluateDirectoryGeoEligibility({
    source: source(),
    point: point({
      geocodeStatus: "NEEDS_REVIEW",
      lastErrorCode: "RATE_LIMITED",
      retryAfterAt: "2026-09-26T11:59:00Z",
    }),
    expectedFingerprint: "fingerprint",
    nowMs: now,
  }).action, "PROCESS");
});

test("A2 exact explicit IDs are deterministic, unique and bounded to ten", () => {
  assert.equal(DIRECTORY_EXACT_GEO_BATCH_MAX, 10);
  assert.deepEqual(validateDirectoryExactGeoTargetIds([9, 2, 7]), [9, 2, 7]);
  assert.throws(() => validateDirectoryExactGeoTargetIds([]), /1 až 10/);
  assert.throws(() => validateDirectoryExactGeoTargetIds(Array.from({ length: 11 }, (_, i) => i + 1)), /najviac 10/);
  assert.throws(() => validateDirectoryExactGeoTargetIds([2, 2]), /unique/);
  assert.throws(() => validateDirectoryExactGeoTargetIds([0]), /kladné safe integer/);
});

test("A2 runner reuses shared ADDRESS-SIMPLE verifier and never embeds a second exact algorithm", () => {
  assert.match(runnerSource, /verifyDirectoryCanonicalAddress/);
  assert.match(runnerSource, /revalidateStreet: addressFormat\(source\) === "STREET"/);
  assert.doesNotMatch(runnerSource, /chooseGeocoderResult/);
  assert.doesNotMatch(runnerSource, /houseNumberMatchesUserInput|parseSlovakHouseNumber/);
  assert.doesNotMatch(runnerSource, /\.geocodeExact\(|\.geocodeApproximate\(/);
});

test("A2 selector excludes historical approximate cohort and is deterministic and bounded", () => {
  assert.match(runnerSource, /gp\.public_visibility='APPROXIMATE_PUBLIC'/);
  assert.match(runnerSource, /gp\.public_precision='MUNICIPALITY'/);
  assert.match(runnerSource, /ORDER BY dp\.id ASC/);
  assert.match(runnerSource, /DIRECTORY_EXACT_GEO_SCAN_MAX = 200/);
  assert.match(runnerSource, /DIRECTORY_EXACT_GEO_BATCH_MAX = 10/);
});

test("A2 runner is concurrency one, stops provider work after 429 and emits structured telemetry", () => {
  assert.match(runnerSource, /for \(const targetId of ids\)/);
  assert.match(runnerSource, /if \(errorCode === "RATE_LIMITED"\) break/);
  for (const field of [
    "runId", "selected", "processed", "resolved", "skipped", "review", "failed", "rateLimited", "durationMs",
    "targetId", "beforeStatus", "action", "afterStatus", "reason", "provider", "providerResultId",
  ]) {
    assert.match(runnerSource, new RegExp(field));
  }
});

test("A2 reuses existing hourly Worker sweep and does not introduce a new cron or queue", () => {
  assert.match(workerSource, /runDirectoryExactGeoBacklog\(\{ database: env\.DB \}\)/);
  assert.match(workerSource, /isFullHourlyScheduledSweep/);
  assert.doesNotMatch(runnerSource, /Queue|cron/i);
});

test("A2 admin operations expose no-write preview and explicit confirmed canary only", () => {
  assert.match(operationsApi, /action === "a2-preview"/);
  assert.match(operationsApi, /persisted: false, providerCalled: false/);
  assert.match(operationsApi, /action === "a2-canary"/);
  assert.match(operationsApi, /confirm !== "A2-CANARY"/);
  assert.match(operationsApi, /validateDirectoryExactGeoTargetIds/);
});
