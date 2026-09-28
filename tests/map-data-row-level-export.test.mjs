import assert from "node:assert/strict";
import test from "node:test";
import {
  addressCompleteness,
  assertReadOnlySql,
  locationPrivacyFlag,
  markPotentialDuplicates,
  onlineSemantics,
  toCsv,
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

test("organization location privacy flags honor explicit roles", () => {
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
