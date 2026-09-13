import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  DIRECTORY_ADMIN_PAGE_SIZE,
  directoryAdminHref,
  directoryAdminMembershipFilters,
  parseDirectoryAdminFilters,
  queryDirectoryAdmin,
} from "../lib/directory-admin-query.ts";

const categories = [
  { slug: "veterinari", label: "Veterinári" },
  { slug: "treneri", label: "Psí tréneri a psie školy" },
  { slug: "salony-a-sluzby", label: "Salóny" },
];
const categorySlugs = new Set(categories.map((item) => item.slug));
const isCategory = (value) => categorySlugs.has(value);
const filters = (overrides = {}) => ({ category: "", status: "all", q: "", page: 1, ...overrides });

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY, slug TEXT, name TEXT, category TEXT, status TEXT, services_json TEXT,
    city TEXT, district TEXT, region TEXT, image_url TEXT, verified INTEGER, featured INTEGER,
    updated_at TEXT
  )`);
  const insert = sqlite.prepare("INSERT INTO directory_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, ?)");
  for (let i = 1; i <= 127; i++) {
    insert.run(i, `vet-${i}`, `Veterina ${String(i).padStart(3, "0")}`, "veterinari", i <= 61 ? "draft" : "published", JSON.stringify(i === 61 ? ["Fyzioterapia", "Kúpanie"] : ["Preventívna starostlivosť"]), i === 61 ? "Žilina" : "Nitra", "", "Nitriansky kraj", String(i).padStart(3, "0"));
  }
  insert.run(128, "trener-bratislava", "EduDog", "treneri", "draft", JSON.stringify(["Poslušnosť"]), "Bratislava", "", "Bratislavský kraj", "128");
  insert.run(129, "salon-trnava", "Psí salón", "salony-a-sluzby", "published", JSON.stringify(["Kúpanie"]), "Trnava", "", "Trnavský kraj", "129");
  const db = { prepare(query) { return { bind(...args) { this.args = args; return this; }, async first() { return sqlite.prepare(query).get(...(this.args ?? [])); }, async all() { return { results: sqlite.prepare(query).all(...(this.args ?? [])) }; } }; } };
  return { db };
}

test("all profiles are counted independently of the 50-row page", async () => {
  const { db } = fixture();
  const result = await queryDirectoryAdmin(db, filters(), categories);
  assert.equal(result.resultCount, 129);
  assert.equal(result.items.length, DIRECTORY_ADMIN_PAGE_SIZE);
  assert.equal(result.pages, 3);
  assert.deepEqual({ ...result.counts }, { total: 129, published: 67, draft: 62 });
});

test("category filters work for veterinari and another category", async () => {
  const { db } = fixture();
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari" }), categories)).resultCount, 127);
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "treneri" }), categories)).resultCount, 1);
});

test("draft and published status filters work across the full dataset", async () => {
  const { db } = fixture();
  assert.equal((await queryDirectoryAdmin(db, filters({ status: "draft" }), categories)).resultCount, 62);
  assert.equal((await queryDirectoryAdmin(db, filters({ status: "published" }), categories)).resultCount, 67);
});

test("category + status and zero-result combinations share the same WHERE contract", async () => {
  const { db } = fixture();
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari", status: "draft" }), categories)).resultCount, 61);
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "treneri", status: "published" }), categories)).resultCount, 0);
});

test("search covers name, city, region, category label and services", async () => {
  const { db } = fixture();
  for (const q of ["Veterina 061", "Žilina", "zilina", "Nitriansky", "Veterinári", "Fyzioterapia", "Kupanie"]) {
    assert.ok((await queryDirectoryAdmin(db, filters({ q }), categories)).resultCount >= 1, q);
  }
});

test("search combines with category and status and empty search is neutral", async () => {
  const { db } = fixture();
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari", status: "draft", q: "Žilina" }), categories)).resultCount, 1);
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari", status: "published", q: "Žilina" }), categories)).resultCount, 0);
  assert.equal((await queryDirectoryAdmin(db, filters({ category: "veterinari", q: "   " }), categories)).resultCount, 127);
});

test("pagination works beyond 50 rows and clamps an out-of-range page", async () => {
  const { db } = fixture();
  const second = await queryDirectoryAdmin(db, filters({ category: "veterinari", page: 2 }), categories);
  assert.equal(second.items.length, 50);
  assert.equal(second.resultCount, 127);
  assert.equal(second.page, 2);
  const last = await queryDirectoryAdmin(db, filters({ category: "veterinari", page: 999 }), categories);
  assert.equal(last.page, 3);
  assert.equal(last.items.length, 27);
});

test("URL parsing normalizes category, status, q and page safely", () => {
  assert.deepEqual(parseDirectoryAdminFilters(new URLSearchParams("category=veterinari&status=draft&q=%20klinika%20&page=2"), isCategory), filters({ category: "veterinari", status: "draft", q: "klinika", page: 2 }));
  assert.deepEqual(parseDirectoryAdminFilters(new URLSearchParams("category=bogus&status=archived&page=-3"), isCategory), filters());
  assert.deepEqual(parseDirectoryAdminFilters(new URLSearchParams("page=2oops"), isCategory), filters());
});

test("pagination URLs preserve membership filters while filter changes can reset page", () => {
  const current = filters({ category: "veterinari", status: "draft", q: "klinika", page: 2 });
  assert.equal(directoryAdminHref(current), "/admin/adresar?category=veterinari&status=draft&q=klinika&page=2");
  assert.equal(directoryAdminHref({ ...current, page: 1 }), "/admin/adresar?category=veterinari&status=draft&q=klinika");
  assert.deepEqual(directoryAdminMembershipFilters(current), { category: "veterinari", status: "draft", q: "klinika" });
});
