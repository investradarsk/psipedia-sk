import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getDirectoryFilterDefinition } from "../lib/directory-filter-contract.ts";
import { prepareGeneralDirectorySourceImport } from "../lib/directory-import-preservation.ts";

const emergency = getDirectoryFilterDefinition("veterinari.emergency");
const visits = getDirectoryFilterDefinition("veterinari.home_visits");
const walking = getDirectoryFilterDefinition("vencenie.group_walks");
assert.ok(emergency && visits && walking);

const merge = (incoming, current = null, category = "veterinari") =>
  JSON.parse(prepareGeneralDirectorySourceImport(incoming, category, current === null ? null : JSON.stringify(current)));

test("fresh service profile imports only explicit registered values, not free-text guesses", () => {
  const record = merge({ name: "Vet", [emergency.d1.key]: "Áno", [visits.d1.key]: "unknown", note: "Pohotovosť nie je známa" });
  assert.equal(record[emergency.d1.key], "yes");
  assert.equal(record[visits.d1.key], "unknown");
  assert.equal(record.note, "Pohotovosť nie je známa");
  assert.equal(merge({ name: "Vet", note: "Pohotovosť áno" })[emergency.d1.key], undefined);
});

test("existing draft and repeated import preserve explicit no, unknown, and unrelated metadata", () => {
  const existing = {
    [emergency.d1.key]: "no",
    [visits.d1.key]: "unknown",
    "_psipedia_profile_review_reviewed_at": "2026-10-10T00:00:00Z",
    "_psipedia_quality_phone_status": "NOT_FOUND",
    "Plemeno": "Labrador",
    externalCustom: { nested: 4 },
    nullLegacy: null,
  };
  const withoutFilters = merge({ name: "Vet updated", "Nové pole": 3, "Plemeno": null }, existing);
  assert.equal(withoutFilters[emergency.d1.key], "no");
  assert.equal(withoutFilters[visits.d1.key], "unknown");
  assert.equal(withoutFilters["Plemeno"], "Labrador");
  assert.equal(withoutFilters.nullLegacy, null);
  assert.equal(withoutFilters._psipedia_profile_review_reviewed_at, existing._psipedia_profile_review_reviewed_at);
  assert.equal(withoutFilters._psipedia_quality_phone_status, "NOT_FOUND");
  assert.deepEqual(withoutFilters.externalCustom, { nested: 4 });
  const repeated = merge({ [emergency.d1.key]: "nie", [visits.d1.key]: "unknown" }, withoutFilters);
  assert.equal(repeated[emergency.d1.key], "no");
  assert.deepEqual(merge({ [emergency.d1.key]: null, [visits.d1.key]: "" }, repeated), repeated);
});

test("explicit yes, no and unknown differ from absent/null/empty", () => {
  assert.equal(merge({ [emergency.d1.key]: "yes" })[emergency.d1.key], "yes");
  assert.equal(merge({ [emergency.d1.key]: "no" })[emergency.d1.key], "no");
  assert.equal(merge({ [emergency.d1.key]: "unknown" })[emergency.d1.key], "unknown");
  assert.equal(merge({ [emergency.d1.key]: null })[emergency.d1.key], undefined);
  assert.equal(merge({ [emergency.d1.key]: "" })[emergency.d1.key], undefined);
  assert.equal(merge({})[emergency.d1.key], undefined);
});

test("invalid filter, category spoofing, reserved metadata and conflicts reject whole import", () => {
  for (const bad of [false, 0, "niekedy", "Pohotovosť", [], {}]) {
    assert.throws(() => merge({ [emergency.d1.key]: bad }), /Neplatná hodnota/);
  }
  assert.throws(() => merge({ [walking.d1.key]: "yes" }), /mimo kategórie/);
  assert.throws(() => merge({ _psipedia_filter_v1_veterinari_not_registered: "yes" }), /Nepovolený/);
  assert.throws(() => merge({ _psipedia_quality_phone_status: "NOT_FOUND" }), /Nepovolený/);
  assert.throws(() => merge({ [emergency.d1.key]: "yes" }, { [emergency.d1.key]: "no" }), /Konflikt filtra/);
  assert.throws(() => merge({ [emergency.d1.key]: "no" }, { [emergency.d1.key]: "unknown" }), /Konflikt filtra/);
  assert.throws(() => merge({ [emergency.d1.key]: "yes" }, { [emergency.d1.key]: "garbage" }), /neplatnú hodnotu/);
  assert.throws(() => prepareGeneralDirectorySourceImport({}, "veterinari", "[]"), /JSON objekt/);
  assert.throws(() => prepareGeneralDirectorySourceImport({}, "veterinari", "{"), /nie je platný JSON/);
});

function importerSql() {
  const route = readFileSync("app/api/admin/import/route.ts", "utf8");
  const start = route.indexOf("INSERT INTO directory_profiles (");
  assert.ok(start >= 0);
  const end = route.indexOf("`).bind(", start);
  assert.ok(end > start);
  return route.slice(start, end).replace("${conflictTarget}", "import_key");
}
const sql = importerSql();
const insert = sql.match(/INSERT INTO directory_profiles\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
assert.ok(insert);
const columns = insert[1].split(",").map((value) => value.trim());

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE directory_profiles (
    ${columns.map((column) => `"${column}" TEXT`).join(", ")},
    UNIQUE(import_key), UNIQUE(category, slug)
  )`);
  return db;
}
function params(source, expectedSource = null, expectedTimestamp = null, extras = {}) {
  return [
    extras.slug ?? "vet-1", "Vet", "veterinari", "draft", extras.excerpt ?? "",
    extras.description ?? "", extras.services ?? "[]", "[]", "Nitra", "",
    "Nitriansky kraj", "", 0, "", null, null, null, extras.importKey ?? "vet-key",
    source, "vet nitra", 0, 0, "2026-10-01", "2026-10-13", null, "importer", "importer",
    expectedSource, expectedTimestamp,
  ];
}

test("SQL inserts new Draft and updates Draft atomically with preserved JSON/curated fields", () => {
  const db = createDatabase();
  const original = JSON.stringify({
    [emergency.d1.key]: "no", "_psipedia_quality_phone_status": "NOT_FOUND", "Legacy": "preserve",
  });
  const statement = db.prepare(sql);
  assert.equal(statement.run(...params(original, null, null, { excerpt: "Dôležitý opis", services: '["Chirurgia"]' })).changes, 1);
  db.prepare(`UPDATE directory_profiles SET featured=1, verified=1, status='draft' WHERE import_key='vet-key'`).run();
  const merged = prepareGeneralDirectorySourceImport({ "Nové pole": "hodnota" }, "veterinari", original);
  assert.equal(statement.run(...params(merged, original, "2026-10-13")).changes, 1);
  const updated = db.prepare("SELECT * FROM directory_profiles WHERE import_key='vet-key'").get();
  assert.equal(updated.source_data_json, merged);
  assert.equal(JSON.parse(updated.source_data_json)[emergency.d1.key], "no");
  assert.equal(updated.status, "draft");
  assert.equal(updated.featured, "1");
  assert.equal(updated.verified, "1");
  assert.equal(updated.excerpt, "Dôležitý opis");
  assert.equal(updated.services_json, '["Chirurgia"]');
});

test("SQL rejects stale preview, concurrently published profiles and unexpected identity reuse", () => {
  const db = createDatabase();
  const original = JSON.stringify({ [emergency.d1.key]: "yes" });
  const statement = db.prepare(sql);
  assert.equal(statement.run(...params(original)).changes, 1);
  const merged = prepareGeneralDirectorySourceImport({ "Nové pole": "x" }, "veterinari", original);
  db.prepare("UPDATE directory_profiles SET source_data_json=? WHERE import_key='vet-key'")
    .run(JSON.stringify({ [emergency.d1.key]: "no" }));
  assert.equal(statement.run(...params(merged, original, "2026-10-13")).changes, 0);
  db.prepare("UPDATE directory_profiles SET status='published', source_data_json=? WHERE import_key='vet-key'").run(original);
  assert.equal(statement.run(...params(merged, original, "2026-10-13")).changes, 0);
  db.prepare("UPDATE directory_profiles SET status='draft' WHERE import_key='vet-key'").run();
  assert.equal(statement.run(...params(merged, original, "2026-10-13", { slug: "different" })).changes, 0);
  assert.equal(db.prepare("SELECT source_data_json FROM directory_profiles WHERE import_key='vet-key'").get().source_data_json, original);
});

test("read-only plan rejects bad filters before writes and confirmed route checks zero-change guards", () => {
  const plan = readFileSync("lib/admin-import-plan.ts", "utf8");
  const route = readFileSync("app/api/admin/import/route.ts", "utf8");
  assert.match(plan, /prepareGeneralDirectorySourceImport\(row, identity.category/);
  assert.match(plan, /source_data_json,updated_at FROM directory_profiles/);
  assert.match(plan, /profileSources\.push\(null\)/);
  assert.match(plan, /importKey patrí inému category\+slug/);
  assert.match(route, /plan\.preview\.totals\.rejected > 0/);
  assert.match(route, /payload\.confirmed !== true/);
  assert.match(route, /directory_profiles\.source_data_json = \?/);
  assert.match(route, /directory_profiles\.updated_at = \?/);
  assert.match(route, /results\[statementIndex\]\?\.meta\?\.changes !== 1/);
});
