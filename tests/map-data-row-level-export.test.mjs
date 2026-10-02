import assert from "node:assert/strict";
import test from "node:test";
import {
  addressCompleteness,
  assertReadOnlySql,
  isAdminOnlineEvent,
  locationPrivacyFlag,
  markPotentialDuplicates,
  onlineSemantics,
  toCsv,
  workflowState,
} from "../scripts/map-data-row-level-export.mjs";

test("read-only SQL guard accepts SELECT/PRAGMA and rejects mutations", () => {
  assert.doesNotThrow(() => assertReadOnlySql("SELECT id FROM directory_profiles"));
  assert.doesNotThrow(() => assertReadOnlySql("PRAGMA table_info(directory_profiles)"));
  assert.throws(() => assertReadOnlySql("UPDATE directory_profiles SET online=0"));
  assert.throws(() => assertReadOnlySql("SELECT 1; DELETE FROM directory_profiles"));
});

test("address completeness uses canonical free-form address plus city", () => {
  assert.equal(addressCompleteness({ address: "Hlavná 1", city: "Nitra", region: "Nitriansky kraj" }), "HAS_EXACT_ADDRESS");
  assert.equal(addressCompleteness({ address: "", city: "Nitra", region: "Nitriansky kraj" }), "CITY_ONLY");
  assert.equal(addressCompleteness({ address: "Hlavná 1", city: "", region: "" }), "PARTIAL_ADDRESS");
  assert.equal(addressCompleteness({ address: "", city: "", region: "" }), "NO_ADDRESS");
  assert.equal(addressCompleteness({ address: "Hlavná 1", city: "Online", region: "Nitriansky kraj", online: true }), "CONFLICTING_FIELDS");
});

test("online semantics is conservative", () => {
  assert.equal(onlineSemantics({ address: "Hlavná 1", city: "Nitra", district: "Nitra", region: "Nitriansky kraj" }).bucket, "PHYSICAL_AND_ONLINE_LIKELY");
  assert.equal(onlineSemantics({ address: "", city: "Online", district: "", region: "" }).bucket, "ONLINE_ONLY_LIKELY");
  assert.equal(onlineSemantics({ address: "", city: "Nitra", district: "", region: "Nitriansky kraj" }).bucket, "AMBIGUOUS");
  assert.equal(onlineSemantics({ address: "", city: "", district: "", region: "" }).bucket, "INSUFFICIENT_DATA");
});

test("organization location privacy flags remain available for legacy/internal rows", () => {
  assert.equal(locationPrivacyFlag({ role: "SITE", address: "", city: "Nitra" }), "LIKELY_PUBLIC_PREMISE");
  assert.equal(locationPrivacyFlag({ role: "LEGAL_SEAT", address: "Hlavná 1", city: "Nitra" }), "LEGAL_SEAT_ONLY");
  assert.equal(locationPrivacyFlag({ role: "SERVICE_AREA", address: "", city: "Nitra" }), "LIKELY_SERVICE_AREA");
  assert.equal(locationPrivacyFlag({ role: "UNSPECIFIED", address: "Hlavná 1", city: "Nitra" }), "EXACT_PUBLIC_REVIEW_REQUIRED");
});

test("duplicate flags are review-only and CSV escaping is stable", () => {
  const rows = markPotentialDuplicates([{ name: "A", city: "Nitra" }, { name: "A", city: "Nitra" }, { name: "B", city: "Trnava" }], (row) => `${row.name}|${row.city}`);
  assert.deepEqual(rows.map((row) => row.potential_duplicate_review), [1, 1, 0]);
  assert.equal(toCsv([{ a: 'x,"y"', b: "z" }], ["a", "b"]), 'a,b\n"x,""y""",z\n');
});

test("maps workflow reconciliation mirrors PLACE / NOT_REQUIRED / coordinates / unresolved semantics", () => {
  const base = {
    source_fingerprint: "fp",
    resolved_source_fingerprint: "fp",
    google_place_source_fingerprint: "",
    google_place_id: "",
    latitude: null,
    longitude: null,
    public_visibility: "EXACT_PUBLIC",
    map_action: "",
  };
  assert.equal(workflowState({ ...base, google_place_id: "place-1", google_place_source_fingerprint: "fp" }), "PLACE");
  assert.equal(workflowState({ ...base, map_action: "GOOGLE_MAPS_NOT_REQUIRED" }), "NOT_REQUIRED");
  assert.equal(workflowState({ ...base, latitude: 48.3, longitude: 18.1 }), "COORDINATES");
  assert.equal(workflowState(base), "UNRESOLVED");
  assert.equal(workflowState(base, { organizationNotRequired: true }), "NOT_REQUIRED");
  assert.equal(workflowState(base, { online: true }), "NOT_REQUIRED");
});

test("admin online event reconciliation uses the same explicit online marker contract", () => {
  assert.equal(isAdminOnlineEvent({ city: "Online", region: "", venue: "" }), true);
  assert.equal(isAdminOnlineEvent({ city: "Nitra", region: "Nitriansky kraj", venue: "Online" }), true);
  assert.equal(isAdminOnlineEvent({ city: "Nitra", region: "Nitriansky kraj", venue: "Expo" }), false);
});
