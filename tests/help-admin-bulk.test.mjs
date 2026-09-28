import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { bulkHelpStatusSql, resolveHelpBulkSelection, validateHelpBulkApply } from "../lib/admin-help-bulk.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE help_cases (
    id INTEGER PRIMARY KEY, title TEXT, dog_name TEXT, organization TEXT, city TEXT, category TEXT, status TEXT,
    verified INTEGER DEFAULT 0, action_url TEXT, goal_amount INTEGER, updated_at TEXT, updated_by TEXT, published_at TEXT
  )`);
  const insert = sqlite.prepare("INSERT INTO help_cases (id,title,dog_name,organization,city,category,status,verified,action_url,goal_amount,updated_at,updated_by,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i = 1; i <= 75; i++) insert.run(i, `Koncept ${i}`, "", "OZ Test", i % 2 ? "Nitra" : "Trnava", "dobrovolnictvo", "draft", 0, null, null, `2026-09-14T10:${String(i).padStart(2, "0")}:00Z`, "seed", null);
  insert.run(101, "Publikovaný", "", "OZ Test", "Nitra", "dobrovolnictvo", "published", 0, null, null, "2026-09-14T12:00:00Z", "seed", "2026-09-14T12:00:00Z");
  insert.run(102, "Neplatná zbierka", "", "OZ Test", "Nitra", "zbierky", "draft", 0, null, null, "2026-09-14T12:01:00Z", "seed", null);
  insert.run(103, "Zbierka s cieľom", "", "OZ Test", "Nitra", "zbierky", "draft", 1, "https://example.test/zbierka-s-cielom", 2500, "2026-09-14T12:02:00Z", "seed", null);
  insert.run(104, "Zbierka bez cieľa", "", "OZ Test", "Nitra", "zbierky", "draft", 1, "https://example.test/zbierka-bez-ciela", null, "2026-09-14T12:03:00Z", "seed", null);
  insert.run(105, "Neoverená zbierka", "", "OZ Test", "Nitra", "zbierky", "draft", 0, "https://example.test/neoverena", 1000, "2026-09-14T12:04:00Z", "seed", null);
  insert.run(106, "Zbierka bez odkazu", "", "OZ Test", "Nitra", "zbierky", "draft", 1, null, 1000, "2026-09-14T12:05:00Z", "seed", null);
  insert.run(107, "Zbierka s nulovým cieľom", "", "OZ Test", "Nitra", "zbierky", "draft", 1, "https://example.test/nulovy-ciel", 0, "2026-09-14T12:06:00Z", "seed", null);
  insert.run(201, "Legacy adopcia", "", "OZ Dedicated", "Nitra", "adopcia", "draft", 0, null, null, "2026-09-14T13:00:00Z", "seed", null);
  insert.run(202, "Legacy lost-found", "", "OZ Dedicated", "Nitra", "stratene-a-najdene", "draft", 0, null, null, "2026-09-14T13:01:00Z", "seed", null);
  insert.run(203, "Legacy organizácia", "", "OZ Dedicated", "Nitra", "utulky", "draft", 0, null, null, "2026-09-14T13:02:00Z", "seed", null);
  const db = { prepare(query) { return { bind(...args) { this.args = args; return this; }, async all() { return { results: sqlite.prepare(query).all(...(this.args ?? [])) }; } }; } };
  return { sqlite, db };
}

function apply(sqlite, items, status) {
  const now = "2026-09-14T20:00:00Z";
  return sqlite.prepare(bulkHelpStatusSql).all(JSON.stringify(items), status, now, "admin@example.invalid", status, now, status, items.length);
}

test("one and multiple explicit selections resolve exact snapshots for unchanged categories", async () => {
  const { db } = fixture();
  const one = await resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [1] } });
  assert.equal(one.selectedCount, 1); assert.equal(one.changeCount, 1); assert.deepEqual(one.items.map((item) => item.id), [1]);
  const many = await resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [1, 2, 3] } });
  assert.equal(many.selectedCount, 3); assert.equal(many.changeCount, 3); assert.deepEqual(many.items.map((item) => item.id), [1, 2, 3]);
});

test("filter-wide selection ignores display pagination and resolves all 75 drafts", async () => {
  const { db } = fixture();
  const preview = await resolveHelpBulkSelection(db, {
    targetStatus: "published",
    selection: { mode: "filter", filters: { category: "all", status: "draft", urgent: "all", state: "all", organization: "", location: "", q: "Koncept" }, expectedCount: 75 },
  });
  assert.equal(preview.selectedCount, 75);
  assert.equal(preview.changeCount, 75);
  assert.equal(preview.items.length, 75);
});

test("filter preflight fails if the reviewed result count changed", async () => {
  const { db } = fixture();
  await assert.rejects(() => resolveHelpBulkSelection(db, {
    targetStatus: "published",
    selection: { mode: "filter", filters: { category: "all", status: "draft", urgent: "all", state: "all", organization: "", location: "", q: "Koncept" }, expectedCount: 74 },
  }), /medzičasom zmenili/);
});

test("bulk update changes only selected rows and can safely return them to draft", async () => {
  const { db, sqlite } = fixture();
  const preview = await resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [1, 2] } });
  const changed = apply(sqlite, preview.items, "published");
  assert.equal(changed.length, 2);
  assert.equal(sqlite.prepare("SELECT status FROM help_cases WHERE id = 1").get().status, "published");
  assert.equal(sqlite.prepare("SELECT status FROM help_cases WHERE id = 2").get().status, "published");
  assert.equal(sqlite.prepare("SELECT status FROM help_cases WHERE id = 3").get().status, "draft");
  const back = await resolveHelpBulkSelection(db, { targetStatus: "draft", selection: { mode: "ids", ids: [1, 2] } });
  assert.equal(apply(sqlite, back.items, "draft").length, 2);
  assert.equal(sqlite.prepare("SELECT status FROM help_cases WHERE id = 1").get().status, "draft");
  assert.ok(sqlite.prepare("SELECT published_at FROM help_cases WHERE id = 1").get().published_at);
});

test("stale snapshot makes the atomic statement change nothing", async () => {
  const { db, sqlite } = fixture();
  const preview = await resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [1, 2] } });
  sqlite.prepare("UPDATE help_cases SET updated_at = ? WHERE id = 2").run("2026-09-14T21:00:00Z");
  assert.equal(apply(sqlite, preview.items, "published").length, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM help_cases WHERE id IN (1,2) AND status='published'").get().count, 0);
});

test("verified collections publish with a positive or missing goal amount", async () => {
  const { db } = fixture();
  const withGoal = await resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [103] } });
  const withoutGoal = await resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [104] } });
  assert.deepEqual(withGoal.items.map((item) => item.id), [103]);
  assert.deepEqual(withoutGoal.items.map((item) => item.id), [104]);
});

test("collections still require verification and an action URL, and an entered goal remains valid", async () => {
  const { db } = fixture();
  await assert.rejects(() => resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [105] } }), /zbierka nespĺňa podmienky/);
  await assert.rejects(() => resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [106] } }), /zbierka nespĺňa podmienky/);
  await assert.rejects(() => resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [107] } }), /zbierka nespĺňa podmienky/);
});

test("bulk publish accepts a mixed valid collection batch when some goal amounts are null", async () => {
  const { db, sqlite } = fixture();
  const preview = await resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [103, 104] } });
  assert.equal(preview.changeCount, 2);
  assert.equal(apply(sqlite, preview.items, "published").length, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM help_cases WHERE id IN (103,104) AND status='published'").get().count, 2);
});

test("atomic apply re-check cannot bypass collection publishability", () => {
  const { sqlite } = fixture();
  const invalid = [{ id: 105, status: "draft", updatedAt: "2026-09-14T12:04:00Z" }];
  assert.equal(apply(sqlite, invalid, "published").length, 0);
  assert.equal(sqlite.prepare("SELECT status FROM help_cases WHERE id = 105").get().status, "draft");
});

test("apply payload requires exact confirmation, unique IDs and a real state change", () => {
  const item = { id: 1, status: "draft", updatedAt: "2026-09-14T10:00:00Z" };
  assert.deepEqual(validateHelpBulkApply({ targetStatus: "published", confirmedCount: 1, items: [item] }).items, [item]);
  assert.throws(() => validateHelpBulkApply({ targetStatus: "published", confirmedCount: 2, items: [item] }), /Potvrď platný výber/);
  assert.throws(() => validateHelpBulkApply({ targetStatus: "draft", confirmedCount: 1, items: [item] }), /neplatný/);
  assert.throws(() => validateHelpBulkApply({ targetStatus: "published", confirmedCount: 2, items: [item, item] }), /neplatný/);
});


test("dedicated canonical rows cannot enter explicit or atomic Help bulk mutations", async () => {
  const { db, sqlite } = fixture();
  for (const id of [201, 202, 203]) {
    await assert.rejects(() => resolveHelpBulkSelection(db, { targetStatus: "published", selection: { mode: "ids", ids: [id] } }), /už neexistuje/);
    const stale = [{ id, status: "draft", updatedAt: sqlite.prepare("SELECT updated_at FROM help_cases WHERE id=?").get(id).updated_at }];
    assert.equal(apply(sqlite, stale, "published").length, 0);
    assert.equal(sqlite.prepare("SELECT status FROM help_cases WHERE id=?").get(id).status, "draft");
  }
});
