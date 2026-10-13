import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIRECTORY_FILTER_CONTRACT_VERSION, auditDirectoryFilterRows, directoryFilterRegistry,
  existingDirectoryFacetSources, getDirectoryFilterDefinition, mergeDirectoryFilterValues,
  normalizeDirectoryFilterValue, readDirectoryFilterValue, reconcileDirectoryFilterValue,
  serviceFilterCategories, serviceFiltersForCategory,
} from "../lib/directory-filter-contract.ts";

test("all ten canonical categories have a unique, versioned typed registry", () => {
  const source = readFileSync("lib/directory.ts", "utf8");
  for (const category of serviceFilterCategories) {
    assert.match(source, new RegExp(`slug: "${category}"`));
    assert.ok(serviceFiltersForCategory(category).length >= 2);
  }
  assert.equal(serviceFilterCategories.length, 10);
  assert.equal(new Set(directoryFilterRegistry.map((item) => item.id)).size, directoryFilterRegistry.length);
  assert.equal(new Set(directoryFilterRegistry.map((item) => item.d1.key)).size, directoryFilterRegistry.length);
  assert.equal(new Set(directoryFilterRegistry.map((item) => item.notion.property)).size, directoryFilterRegistry.length);
  for (const item of directoryFilterRegistry) {
    assert.equal(item.version, DIRECTORY_FILTER_CONTRACT_VERSION);
    assert.equal(item.d1.status, "proposed");
    assert.equal(item.notion.status, "not_provisioned");
    assert.equal(item.unknownPolicy.publicBehavior, "exclude");
    assert.ok(item.allowedValues.includes("unknown"));
    assert.ok(Array.isArray(item.legacyAliases));
  }
});

test("explicit yes/no/unknown remain distinct; absent and unchecked checkbox are not no", () => {
  const definition = getDirectoryFilterDefinition("veterinari.emergency");
  assert.ok(definition);
  assert.deepEqual(normalizeDirectoryFilterValue(definition, "ÁNO"), { status: "known", value: "yes" });
  assert.deepEqual(normalizeDirectoryFilterValue(definition, "NIE"), { status: "known", value: "no" });
  assert.deepEqual(normalizeDirectoryFilterValue(definition, "unknown"), { status: "known", value: "unknown" });
  assert.deepEqual(normalizeDirectoryFilterValue(definition, null), { status: "missing", value: "unknown" });
  assert.deepEqual(normalizeDirectoryFilterValue(definition, false), { status: "invalid", value: "unknown" });
  assert.deepEqual(normalizeDirectoryFilterValue(definition, "neposkytujeme pohotovosť"), { status: "invalid", value: "unknown" });
});

test("enumerated values reject legacy descriptive strings", () => {
  const definition = getDirectoryFilterDefinition("veterinari.facility_type");
  assert.ok(definition);
  assert.deepEqual(normalizeDirectoryFilterValue(definition, "clinic"), { status: "known", value: "clinic" });
  assert.equal(normalizeDirectoryFilterValue(definition, "klinika v meste").status, "invalid");
});

test("pure patch retains unrecognized legacy and review keys, without overwriting NO", () => {
  const original = JSON.stringify({ "Typ služby": "Veterinár", "Plemeno": "Labrador", "_psipedia_profile_review_status": "OK", arbitrary: 42 });
  const next = mergeDirectoryFilterValues(original, "veterinari", { "veterinari.emergency": "nie" });
  const parsed = JSON.parse(next);
  assert.equal(parsed["Typ služby"], "Veterinár");
  assert.equal(parsed["Plemeno"], "Labrador");
  assert.equal(parsed.arbitrary, 42);
  assert.equal(parsed._psipedia_profile_review_status, "OK");
  assert.deepEqual(readDirectoryFilterValue(next, "veterinari.emergency"), { status: "known", value: "no" });
  const roundTrip = mergeDirectoryFilterValues(next, "veterinari", { "veterinari.home_visits": "unknown" });
  assert.equal(readDirectoryFilterValue(roundTrip, "veterinari.emergency").value, "no");
  assert.equal(readDirectoryFilterValue(roundTrip, "veterinari.home_visits").value, "unknown");
  assert.equal(JSON.parse(roundTrip)["Typ služby"], "Veterinár");
});

test("invalid facet, missing unknown and cross category fail closed before serialization", () => {
  assert.throws(() => mergeDirectoryFilterValues("{}", "veterinari", { "vencenie.group_walks": "yes" }), /Out-of-category/);
  assert.throws(() => mergeDirectoryFilterValues("{}", "veterinari", { "veterinari.emergency": false }), /explicit allowed/);
  assert.throws(() => mergeDirectoryFilterValues("no-json", "veterinari", {}), /Invalid source_data_json/);
  assert.throws(() => readDirectoryFilterValue("[]", "veterinari.emergency"), /expected object/);
  assert.equal(readDirectoryFilterValue("{}", "veterinari.emergency").value, "unknown");
});

test("D1/Notion reconciliation keeps conflicts for review, not last writer wins", () => {
  const definition = getDirectoryFilterDefinition("veterinari.emergency");
  assert.ok(definition);
  assert.deepEqual(reconcileDirectoryFilterValue(definition, "no", "yes"), { status: "conflict", value: "unknown" });
  assert.deepEqual(reconcileDirectoryFilterValue(definition, "no", null), { status: "one_sided", value: "no" });
  assert.deepEqual(reconcileDirectoryFilterValue(definition, null, null), { status: "missing", value: "unknown" });
  assert.deepEqual(reconcileDirectoryFilterValue(definition, "yes", "Áno"), { status: "equal", value: "yes" });
  assert.equal(reconcileDirectoryFilterValue(definition, "yes", false).status, "invalid");
});

test("offline audit keeps legacy text separate from structured facets and reports malformed rows", () => {
  const key = getDirectoryFilterDefinition("veterinari.emergency").d1.key;
  const report = auditDirectoryFilterRows([
    { category: "veterinari", source_data_json: JSON.stringify({ [key]: "yes", "Typ služby": "Ambulancia" }), services_json: '["Ošetrenie"]' },
    { category: "veterinari", source_data_json: JSON.stringify({ [key]: "voľný text" }) },
    { category: "veterinari", source_data_json: "broken" },
    { category: "psie-skoly", source_data_json: "{}" },
  ]);
  assert.equal(report.source, "offline-export-only");
  assert.equal(report.scannedRows, 4);
  assert.equal(report.excludedLegacyCategories, 1);
  assert.equal(report.categories.veterinari.records, 3);
  assert.equal(report.categories.veterinari.populated, 1);
  assert.equal(report.categories.veterinari.invalid, 1);
  assert.equal(report.categories.veterinari.legacyText, 1);
  assert.equal(report.categories.veterinari.malformed, 1);
  assert.equal(existingDirectoryFacetSources.type.structured, false);
});

test("new fields stay disconnected from public filter GET and live Notion/import writers in phase 4", () => {
  const query = readFileSync("lib/directory-query.ts", "utf8");
  const store = readFileSync("lib/directory-store.ts", "utf8");
  const notion = readFileSync("lib/notion-directory-sync.ts", "utf8");
  const importer = readFileSync("app/api/admin/import/route.ts", "utf8");
  assert.doesNotMatch(query, /_psipedia_filter_v1_/);
  assert.doesNotMatch(store, /_psipedia_filter_v1_/);
  assert.doesNotMatch(notion, /_psipedia_filter_v1_/);
  assert.doesNotMatch(importer, /_psipedia_filter_v1_/);
});
