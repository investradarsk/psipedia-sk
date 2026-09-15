import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const data = JSON.parse(read("../data/imports/help-organizations-ready-2026-09-10.json"));
const foundation = read("../drizzle/0036_help_organizations_foundation.sql");
const migration = read("../drizzle/0037_import_ready_help_organizations.sql");

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    slug TEXT NOT NULL,
    UNIQUE(category, slug)
  )`);
  db.exec("CREATE TABLE help_cases (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)");
  db.exec("CREATE TABLE adoption_dogs (id INTEGER PRIMARY KEY, organization_id INTEGER, organization_name TEXT, organization_slug TEXT)");
  db.exec(foundation);
  db.prepare("INSERT INTO help_cases (id, marker) VALUES (1, 'unchanged-help-case')").run();
  db.prepare("INSERT INTO directory_profiles (id, category, slug) VALUES (?, ?, ?)").run(901, "kynologicke-kluby", "kynologicky-klub-karantenna-stanica-stara-lubovna");
  db.prepare("INSERT INTO directory_profiles (id, category, slug) VALUES (?, ?, ?)").run(902, "psie-skoly", "vranovsky-utulok-pre-psov-vycvik");
  return db;
}

test("checked-in source contains exactly 106 READY rows and excludes the 10 reviewed HOLD rows", () => {
  assert.equal(data.readyCount, 106);
  assert.equal(data.holdCount, 10);
  assert.equal(data.organizations.length, 106);
  assert.equal(data.excludedHoldSlugs.length, 10);
  const imported = new Set(data.organizations.map((row) => row.slug));
  for (const slug of data.excludedHoldSlugs) assert.equal(imported.has(slug), false, `HOLD row imported: ${slug}`);
});

test("canonical import is draft-only, unpublished, unique and idempotent", () => {
  const db = database();
  const helpBefore = db.prepare("SELECT COUNT(*) AS count, group_concat(id || ':' || marker) AS content FROM help_cases").get();
  const adoptionsBefore = db.prepare("SELECT COUNT(*) AS count FROM adoption_dogs").get();
  db.exec(migration);
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM help_organizations").get().count, 106);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM help_organizations WHERE status = 'DRAFT'").get().count, 106);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM help_organizations WHERE published_at IS NULL").get().count, 106);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT import_key) AS count FROM help_organizations").get().count, 106);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT slug) AS count FROM help_organizations").get().count, 106);
  assert.deepEqual(db.prepare("SELECT COUNT(*) AS count, group_concat(id || ':' || marker) AS content FROM help_cases").get(), helpBefore);
  assert.deepEqual(db.prepare("SELECT COUNT(*) AS count FROM adoption_dogs").get(), adoptionsBefore);
});

test("only the reviewed Stara Lubovna profile receives a directory link", () => {
  const db = database();
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM help_organizations WHERE directory_profile_id IS NOT NULL").get().count, 1);
  const linked = db.prepare("SELECT slug, directory_profile_id FROM help_organizations WHERE directory_profile_id IS NOT NULL").get();
  assert.equal(linked.slug, "pomoc-kynologicky-klub-karantenna-stanica-stara-lubovna");
  assert.equal(linked.directory_profile_id, 901);
  assert.equal(migration.includes("vranovsky-utulok-pre-psov-vycvik"), false);
  assert.doesNotMatch(migration, /directory_profile_id[^\n]*\b78\b/);
});

test("missing exact directory lookup leaves the canonical link null", () => {
  const db = database();
  db.prepare("DELETE FROM directory_profiles WHERE id = 901").run();
  db.exec(migration);
  const row = db.prepare("SELECT directory_profile_id FROM help_organizations WHERE slug = ?").get("pomoc-kynologicky-klub-karantenna-stanica-stara-lubovna");
  assert.equal(row.directory_profile_id, null);
});

test("identity conflicts fail instead of being silently ignored", () => {
  const db = database();
  db.prepare(`INSERT INTO help_organizations (
    name, slug, type, status, import_key, created_at, updated_at, created_by, updated_by
  ) VALUES (?, ?, 'OTHER', 'DRAFT', ?, ?, ?, ?, ?)`).run(
    "Conflicting identity",
    "pomoc-oz-tulava-labka",
    "different-import-key",
    "2026-09-15T00:00:00.000Z",
    "2026-09-15T00:00:00.000Z",
    "test",
    "test",
  );
  assert.throws(() => db.exec(migration), /CHECK constraint failed/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM help_organizations").get().count, 1);
});
