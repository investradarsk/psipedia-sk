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
  assert.equal(merge({ "Plemeno": "   " }, existing)["Plemeno"], "Labrador");
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
function params(_retiredSourceJson, extras = {}) {
  return [
    extras.slug ?? "vet-1", "Vet", "veterinari", "draft",
    extras.excerpt ?? "", extras.description ?? "",
    extras.services ?? "[]", "[]", "Nitra", "",
    "Nitriansky kraj", "", 0, "", extras.websiteUrl ?? null,
    null, null, extras.importKey ?? "vet-key",
    "vet nitra", 0, 0, "2026-10-01", "2026-10-13",
    null, "importer", "importer",
  ];
}

test("SQL inserts a draft without restoring retired JSON or overwriting an edited draft", () => {
  const db = createDatabase();
  try {
    const imported = JSON.stringify({
      [emergency.d1.key]: "no", "Legacy": "importný stav", Web: "https://old.sk",
    });
    const statement = db.prepare(sql);
    assert.equal(statement.run(...params(imported, {
      excerpt: "Pôvodný perex", websiteUrl: "https://old.sk",
    })).changes, 1);

    // Mimic an editor save that happened AFTER the original historical import.
    db.prepare(`UPDATE directory_profiles SET
      description=?, excerpt=?, website_url=?, updated_at=?, updated_by=?
      WHERE import_key=?`).run(
      "Najnovší popis v Admine", "Nový perex", "https://admin.sk",
      "2026-11-15T08:00:00Z", "admin@example.sk", "vet-key",
    );
    const before = db.prepare("SELECT * FROM directory_profiles WHERE import_key=?").get("vet-key");

    // Re-uploading that same historic JSON must NOT restore older values,
    // even when a draft is still unpublished and the preview was refreshed.
    const reimport = prepareGeneralDirectorySourceImport({
      "Nové pole": "starý import", Web: "https://old.sk",
    }, "veterinari", null);
    assert.equal(statement.run(...params(reimport, {
      excerpt: "Zastaraný perex", description: "Starý popis",
      websiteUrl: "https://old.sk", services: '["Stará služba"]',
    })).changes, 0);
    const after = db.prepare("SELECT * FROM directory_profiles WHERE import_key=?").get("vet-key");
    assert.deepEqual(after, before);
    assert.equal(Object.hasOwn(after, "source_data_json"), false);
    assert.equal(after.website_url, "https://admin.sk");
    assert.equal(after.updated_by, "admin@example.sk");
  } finally {
    db.close();
  }
});

test("SQL refuses every existing identity, whether draft or published", () => {
  const db = createDatabase();
  try {
    const statement = db.prepare(sql);
    const initial = JSON.stringify({ "Organizácia": "Potvrdená" });
    assert.equal(statement.run(...params(initial)).changes, 1);
    // A changed importKey must not bypass the other unique identity.
    assert.equal(statement.run(...params('{"Organizácia":"Stará"}', {
      importKey: "another-key",
    })).changes, 0);
    // Changing slug but keeping the original key also must not rewrite identity.
    assert.equal(statement.run(...params("{}", {
      slug: "other-slug",
    })).changes, 0);
    db.prepare("UPDATE directory_profiles SET status='published' WHERE import_key='vet-key'").run();
    assert.equal(statement.run(...params("{}")).changes, 0);
    const final = db.prepare("SELECT * FROM directory_profiles WHERE import_key='vet-key'").get();
    assert.equal(Object.hasOwn(final, "source_data_json"), false);
    assert.equal(final.slug, "vet-1");
    assert.equal(final.status, "published");
    assert.equal(db.prepare("SELECT count(*) AS total FROM directory_profiles").get().total, 1);
  } finally {
    db.close();
  }
});

test("import plan and SQL are both insert-only; Preview may not claim an update", () => {
  const plan = readFileSync("lib/admin-import-plan.ts", "utf8");
  const route = readFileSync("app/api/admin/import/route.ts", "utf8");
  assert.match(plan, /if \(insertOnly\) return \{ action: "skipped" \}/);
  assert.match(plan, /key, profileKeys, existing\?\.status,[\s\S]*?true,/);
  assert.match(plan, /result\.action !== "inserted"/);
  assert.match(plan, /prepareGeneralDirectorySourceImport\(row, identity\.category, null\)/);
  assert.match(plan, /importKey patrí inému category\+slug/);
  assert.match(route, /plan\.preview\.totals\.rejected > 0/);
  assert.match(route, /payload\.confirmed !== true/);
  assert.match(route, /plan\.actions\.profiles\[index\] === "skipped"/);
  assert.match(route, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(sql, /DO UPDATE SET/);
  assert.match(route, /results\[statementIndex\]\?\.meta\?\.changes !== 1/);
  assert.match(route, /profiles: plan\.preview\.domains\.profiles\.inserted/);
});
