import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { queryDirectoryAdmin } from "../lib/directory-admin-query.ts";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const filters = (page = 1) => ({
  category: "", status: "all", q: "", region: "", district: "", city: "",
  verification: "all", media: "all", page,
});
const categories = [{ slug: "veterinari", label: "Veterinári" }];

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, category TEXT, status TEXT, services_json TEXT, city TEXT, district TEXT, region TEXT, image_url TEXT, verified INTEGER, featured INTEGER, updated_at TEXT, source_data_json TEXT)");
  const insert = sqlite.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i = 1; i <= 103; i++)
    insert.run(i, "vet-" + i, "Veterinár " + i, "veterinari",
      "published", "[]", "Nitra", "Nitra", "Nitriansky kraj",
      null, 0, 0, String(i).padStart(3, "0"),
      i === 103 ? JSON.stringify({ _psipedia_profile_review_reviewed_at: "2026-10-23" }) : null);
  const statements = [];
  const prepare = sql => {
    statements.push(sql);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
  };
  return { sqlite, statements, db: { prepare } };
}

test("admin directory performs bounded page read without waiting for filtered count", async () => {
  const { sqlite, statements, db } = fixture();
  let releaseCount;
  const gate = new Promise(resolve => { releaseCount = resolve; });
  const slowCountDb = {
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!/SELECT COUNT\(\*\) AS count FROM directory_profiles/.test(sql)) return statement;
      return {
        bind(...values) { statement.bind(...values); return this; },
        async first() { await gate; return statement.first(); },
      };
    },
  };
  let pending;
  try {
    pending = queryDirectoryAdmin(slowCountDb, filters(2), categories);
    // A previously sequential page load would not issue SELECT...LIMIT until the COUNT resolves.
    await new Promise(resolve => setImmediate(resolve));
    const didStartPage = statements.some(sql => /ORDER BY updated_at DESC, id DESC LIMIT \? OFFSET \?/.test(sql));
    releaseCount();
    const result = await pending;
    assert.equal(didStartPage, true, "page SQL should start during the count round trip");
    assert.equal(result.page, 2);
    assert.equal(result.items[0].id, 53);
    assert.equal(statements.length, 4);
  } finally {
    releaseCount();
    if (pending) await pending.catch(() => {});
    sqlite.close();
  }
});

test("admin directory re-reads only an out-of-range page and preserves clamping", async () => {
  const { sqlite, statements, db } = fixture();
  try {
    const last = await queryDirectoryAdmin(db, filters(999), categories);
    assert.equal(last.resultCount, 103);
    assert.equal(last.pages, 3);
    assert.equal(last.page, 3);
    assert.deepEqual(last.items.map(row => row.id), [3,2,1]);
    assert.equal(statements.length, 5, "three summary statements, requested out-of-range page and clamped page");
    const first = await queryDirectoryAdmin(db, filters(1), categories);
    assert.equal(first.page, 1);
    assert.equal(first.items[0].id, 103);
  } finally { sqlite.close(); }
});

test("event and article admin lists start bounded page in parallel with totals, preserving clamping", () => {
  const events = read("../lib/event-store.ts");
  const eventBody = events.split("export async function listManagedEventPage(")[1]
    ?.split("export async function getManagedEventById(")[0];
  assert.ok(eventBody);
  assert.match(eventBody, /Promise\.all\(\[/);
  assert.match(eventBody, /loadPage\(requestedPage\),/);
  assert.match(eventBody, /page === requestedPage \? requestedResult : await loadPage\(page\)/);
  assert.match(eventBody, /ORDER BY " \+ sql\.order \+ " LIMIT \? OFFSET \?/);
  assert.match(eventBody, /adminEventGlobalCountsSql/);
  assert.match(eventBody, /adminEventYearsSql/);

  const articles = read("../lib/article-store.ts");
  const articleBody = articles.split("export async function listManagedArticleSummaries(")[1]
    ?.split("export async function getManagedArticleById(")[0];
  assert.ok(articleBody);
  assert.match(articleBody, /Promise\.all\(\[/);
  assert.match(articleBody, /database\.batch\(\[/);
  assert.match(articleBody, /loadPage\(filteredQuery\),/);
  assert.match(articleBody, /page === filteredQuery\.page[\s\S]*requestedResult[\s\S]*await loadPage/);
  assert.match(articleBody, /pageSize: filteredQuery\.pageSize/);
});
