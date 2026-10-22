import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const store = readFileSync(new URL("../lib/help-store.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/pomoc-psom/[category]/page.tsx", import.meta.url), "utf8");
const browser = readFileSync(new URL("../components/help-browser.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../components/help-card.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../app/pomoc-psom/[category]/[slug]/page.tsx", import.meta.url), "utf8");

const columns = store.match(/export const PUBLIC_HELP_CARD_COLUMNS = "([^"]+)";/)?.[1];
const start = store.indexOf("export async function getPublishedHelpCaseCards(");
const end = store.indexOf("export async function getPublishedHelpCases(", start);
const listing = store.slice(start, end);

test("help category route uses small public cards while canonical detail remains full", () => {
  assert.ok(columns, "public category column list exists");
  assert.ok(start >= 0 && end > start);
  assert.match(route, /getPublishedHelpCaseCards\(category\)/);
  assert.match(route, /items: items\.slice\(0, 50\)\.map/);
  assert.match(browser, /items: PublicHelpCard\[\]/);
  assert.match(card, /item: PublicHelpCard/);
  assert.match(store, /const getPublishedHelpCaseUncached = async/);
  assert.match(store, /SELECT \* FROM help_cases WHERE status = 'published' AND category = \? AND slug = \? LIMIT 1/);
  assert.match(detail, /getPublishedHelpCase\(/);
  assert.doesNotMatch(columns, /description|practical_info|location_note|contact_note|action_url|detail_display_json|seo_json|created_by|updated_by/);
  assert.doesNotMatch(listing, /SELECT \* FROM help_cases/);
  assert.match(listing, /listPublishedOrganizations\(/);
  assert.match(listing, /ORDER BY resolved ASC, urgent DESC, verified DESC, updated_at DESC, id DESC LIMIT \?/);
});

test("real SQLite category card selection preserves published eligibility, urgency and stable sort", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE help_cases (
      id INTEGER PRIMARY KEY, slug TEXT, title TEXT, category TEXT, status TEXT,
      excerpt TEXT, organization TEXT, dog_name TEXT, breed TEXT, age_note TEXT,
      city TEXT, region TEXT, reported_date TEXT, goal_amount REAL, raised_amount REAL,
      image_url TEXT, thumbnail_display_json TEXT, urgent INTEGER, verified INTEGER,
      resolved INTEGER, updated_at TEXT, description TEXT, contact_note TEXT, seo_json TEXT
    )`);
    const insert = db.prepare(`INSERT INTO help_cases
      (id,slug,title,category,status,excerpt,organization,dog_name,breed,age_note,
       city,region,reported_date,goal_amount,raised_amount,image_url,thumbnail_display_json,
       urgent,verified,resolved,updated_at,description,contact_note,seo_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const put = (id, status, urgent, verified, resolved, title, updated) => insert.run(
      id, "case-" + id, title, "docasna-opatera", status, "Short", "OZ", "Hugo",
      "Mix", "3 roky", "Nitra", "Nitriansky kraj", "2026-10-01",
      100, 30, null, null, urgent, verified, resolved, updated,
      "Long private detail ".repeat(1000), "Do not send", '{"secret":"data"}'
    );
    put(1, "published", 1, 1, 0, "Urgent verified", "2026-10-01");
    put(2, "published", 1, 0, 0, "Urgent", "2026-10-02");
    put(3, "draft", 1, 1, 0, "Draft must stay hidden", "2099-01-01");
    put(4, "published", 0, 1, 0, "Normal", "2026-10-03");
    put(5, "published", 1, 1, 1, "Resolved", "2026-10-04");
    put(6, "published", 1, 1, 0, "Other category", "2026-10-04");
    db.prepare("UPDATE help_cases SET category = 'zbierky' WHERE id = 6").run();

    const rawSql = listing.match(/const result = await database\.prepare\(`([\s\S]*?)`\)\s*\.bind\(category, safeLimit\)/)?.[1];
    assert.ok(rawSql, "public D1 query can be located");
    const query = rawSql.replace("${PUBLIC_HELP_CARD_COLUMNS}", columns);
    const rows = db.prepare(query).all("docasna-opatera", 250);
    assert.deepEqual(rows.map(row => row.id), [1, 2, 4, 5]);
    assert.deepEqual(Object.keys(rows[0]).sort(), columns.split(",").sort());
    assert.equal(rows[0].description, undefined);
    assert.equal(rows[0].contact_note, undefined);
    assert.equal(rows[0].seo_json, undefined);
    assert.equal(rows[0].goal_amount, 100);
    assert.equal(rows[0].thumbnail_display_json, null);
    assert.deepEqual(db.prepare(query).all("docasna-opatera", 2).map(row => row.id), [1, 2]);
  } finally {
    db.close();
  }
});
