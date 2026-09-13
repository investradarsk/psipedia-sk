import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { HELP_ADMIN_PAGE_SIZE, parseHelpAdminFilters, queryHelpAdmin } from "../lib/help-admin-query.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE help_cases (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, category TEXT, status TEXT, organization TEXT, dog_name TEXT, city TEXT, image_url TEXT, verified INTEGER, urgent INTEGER, resolved INTEGER, updated_at TEXT)`);
  const insert = sqlite.prepare("INSERT INTO help_cases VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, 0, ?)");
  for (let i = 1; i <= 151; i++) insert.run(i, `pes-${i}`, i === 151 ? "Labrador % Rex" : `Pes ${i}`, i <= 36 ? "adopcia" : "utulky", i <= 36 ? "draft" : "published", i === 151 ? "OZ Rex" : "Útulok", i === 151 ? "Rex" : "", i === 151 ? "Nitra" : "Trnava", i === 37 ? 1 : 0, String(i).padStart(3, "0"));
  // Legacy row stays visible in "Všetko", but the separate lost/found table is never queried.
  sqlite.exec("CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO lost_found_dog_reports VALUES (1, 'Nezávislý prípad')");
  const sql = [];
  const db = { prepare(query) { sql.push(query); return { bind(...args) { this.args = args; return this; }, async first() { return sqlite.prepare(query).get(...(this.args ?? [])); }, async all() { return { results: sqlite.prepare(query).all(...(this.args ?? [])) }; } }; } };
  return { sqlite, db, sql };
}
const filters = (overrides = {}) => ({ category: "all", status: "all", q: "", page: 1, ...overrides });

test("counts cover all 151 records while list is paged at 50", async () => {
  const { db, sqlite, sql } = fixture();
  const result = await queryHelpAdmin(db, filters());
  assert.deepEqual({ ...result.totals }, { total: 151, published: 115, draft: 36, urgent: 1 });
  assert.equal(result.items.length, HELP_ADMIN_PAGE_SIZE);
  assert.equal(result.pages, 4);
  assert.equal(result.categoryCounts.adopcia, 36);
  assert.equal(result.categoryCounts.utulky, 115);
  assert.ok(sql.every((query) => /^SELECT\b/.test(query)));
  assert.ok(sql.every((query) => !query.includes("lost_found_dog_reports")));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lost_found_dog_reports").get().count, 1);
});

test("category and status independently and together filter full database", async () => {
  const { db } = fixture();
  assert.equal((await queryHelpAdmin(db, filters({ category: "adopcia" }))).resultCount, 36);
  assert.equal((await queryHelpAdmin(db, filters({ status: "draft" }))).resultCount, 36);
  assert.equal((await queryHelpAdmin(db, filters({ category: "utulky", status: "draft" }))).resultCount, 0);
  assert.equal((await queryHelpAdmin(db, filters({ category: "adopcia", status: "draft" }))).resultCount, 36);
});

test("pagination clamps out-of-range pages and search checks title, dog, organization and city", async () => {
  const { db } = fixture();
  assert.equal((await queryHelpAdmin(db, filters({ page: 2 }))).items.length, 50);
  assert.equal((await queryHelpAdmin(db, filters({ page: 900 }))).page, 4);
  for (const q of ["Labrador", "Rex", "OZ Rex", "Nitra", "% Rex"]) {
    assert.equal((await queryHelpAdmin(db, filters({ q }))).resultCount, 1, q);
  }
  assert.equal((await queryHelpAdmin(db, filters({ category: "adopcia", status: "draft", q: "Nitra" }))).resultCount, 0);
});

test("invalid URL values fall back safely and filters retain valid values", () => {
  assert.deepEqual(parseHelpAdminFilters(new URLSearchParams("category=adopcia&status=draft&q=labrador&page=2")), filters({ category: "adopcia", status: "draft", q: "labrador", page: 2 }));
  assert.deepEqual(parseHelpAdminFilters(new URLSearchParams("category=stratene-a-najdene&status=bogus&page=-4")), filters());
});
