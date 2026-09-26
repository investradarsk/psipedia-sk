import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyGeoSource } from "../lib/geo.ts";

const geoStore = readFileSync(new URL("../lib/geo-store.ts", import.meta.url), "utf8");

function body(name) {
  const start = geoStore.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = geoStore.indexOf("\nexport async function ", start + 1);
  return geoStore.slice(start, next === -1 ? geoStore.length : next);
}

const reconcile = body("reconcileGeoAfterSourceMutation");
const sync = body("syncGeoPointAfterSourceChange");

function directory(patch = {}) {
  return {
    targetType: "DIRECTORY_PROFILE",
    targetId: 1,
    label: "Directory",
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

test("missing point delegates to initialize exactly once", () => {
  assert.match(reconcile, /if \(!existing\)/);
  assert.equal((reconcile.match(/initializeGeoPointForTarget\(/g) ?? []).length, 1);
});

test("existing point delegates to source-change sync", () => {
  assert.match(reconcile, /syncGeoPointAfterSourceChange\(input\.targetType, input\.targetId, db\)/);
});

test("unchanged source has an explicit no-op path", () => {
  assert.match(sync, /desiredState\.sourceFingerprint === current\.sourceFingerprint/);
  assert.match(reconcile, /"NO_OP"/);
});

test("changed source preserves existing stale lifecycle semantics", () => {
  assert.match(sync, /geocode_status='STALE'/);
  assert.match(sync, /action: "GEO_SOURCE_STALE"/);
});

test("manual override is protected and becomes MANUAL_REVIEW", () => {
  assert.match(sync, /if \(current\.manualOverride\)/);
  assert.match(sync, /last_error_code='MANUAL_REVIEW'/);
  assert.doesNotMatch(sync, /manual_override=0/);
});

test("entity-specific classification is reused rather than duplicated", () => {
  assert.match(sync, /classifyGeoSource\(source\)/);
  assert.match(sync, /classification\.proposedVisibility/);
  assert.match(sync, /classification\.proposedPrecision/);
});

test("DIRECTORY physical to online classification is HIDDEN", () => {
  const physical = classifyGeoSource(directory());
  const online = classifyGeoSource(directory({
    online: true,
    region: "",
    district: "",
    city: "",
    postalCode: "",
    street: "",
    houseNumber: "",
    addressFormat: "",
  }));
  assert.equal(physical.proposedVisibility, "EXACT_PUBLIC");
  assert.equal(physical.proposedPrecision, "EXACT");
  assert.equal(online.proposedVisibility, "HIDDEN");
  assert.match(sync, /desiredVisibility === "HIDDEN"/);
});

test("DIRECTORY online to physical classification re-enters exact lifecycle", () => {
  const physical = classifyGeoSource(directory());
  assert.equal(physical.proposedVisibility, "EXACT_PUBLIC");
  assert.equal(physical.requiresReview, false);
  assert.match(sync, /visibility: desiredVisibility/);
  assert.match(sync, /reason: "SOURCE_RECLASSIFIED"/);
});

test("ORGANIZATION privacy role semantics remain classifier-owned", () => {
  const serviceArea = classifyGeoSource({
    targetType: "ORGANIZATION_LOCATION",
    targetId: 2,
    label: "Pôsobnosť",
    locationRole: "SERVICE_AREA",
    city: "Nitra",
    countryCode: "SK",
  });
  const legalSeat = classifyGeoSource({
    targetType: "ORGANIZATION_LOCATION",
    targetId: 3,
    label: "Sídlo",
    locationRole: "LEGAL_SEAT",
    address: "Hlavná 1",
    city: "Nitra",
    countryCode: "SK",
  });
  assert.equal(serviceArea.proposedVisibility, "APPROXIMATE_PUBLIC");
  assert.equal(serviceArea.proposedPrecision, "SERVICE_AREA");
  assert.equal(legalSeat.proposedVisibility, null);
  assert.equal(legalSeat.requiresReview, true);
});

test("EVENT semantics remain classifier-owned", () => {
  const online = classifyGeoSource({
    targetType: "MANAGED_EVENT",
    targetId: 4,
    label: "Online",
    city: "Online",
    region: "Online",
  });
  const cityOnly = classifyGeoSource({
    targetType: "MANAGED_EVENT",
    targetId: 5,
    label: "Event",
    city: "Nitra",
    region: "Nitriansky kraj",
  });
  assert.equal(online.proposedVisibility, "HIDDEN");
  assert.equal(cityOnly.proposedVisibility, "APPROXIMATE_PUBLIC");
  assert.equal(cityOnly.proposedPrecision, "MUNICIPALITY");
});

test("repeated reconcile remains idempotent", () => {
  assert.match(reconcile, /const existing = await getGeoPointForTarget/);
  assert.match(sync, /return current/);
  assert.match(reconcile, /action: changed \? "SYNCED" as const : "NO_OP" as const/);
});

test("central lifecycle helper does not call a provider or exact verifier", () => {
  assert.doesNotMatch(reconcile, /Geoapify|geocode|verifyDirectoryCanonicalAddress|applyGeocoderResolution/);
  assert.doesNotMatch(sync, /Geoapify|verifyDirectoryCanonicalAddress|applyGeocoderResolution/);
});

test("Attention side effects remain in lower-level initialization/sync only", () => {
  assert.doesNotMatch(reconcile, /enqueueGeoAttentionEvent/);
  assert.match(sync, /enqueueGeoAttentionEvent/);
  assert.equal((reconcile.match(/initializeGeoPointForTarget\(/g) ?? []).length, 1);
});

test("initialization failures are observable and not swallowed", () => {
  assert.doesNotMatch(reconcile, /catch\s*\(/);
  assert.match(reconcile, /await initializeGeoPointForTarget/);
});

test("sync failures are observable and not swallowed", () => {
  assert.doesNotMatch(reconcile, /catch\s*\(/);
  assert.match(reconcile, /await syncGeoPointAfterSourceChange/);
});
