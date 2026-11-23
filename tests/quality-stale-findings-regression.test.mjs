import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { qualityMayResearch } from "../lib/data-quality-tavily-query.ts";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const engine = read("lib/data-quality-missing-hourly.ts");
const page = read("app/admin/kvalita/page.tsx");
const dashboard = read("components/admin-missing-quality-dashboard.tsx");

test("resolved, closed, cancelled and archived records never re-enter research/review", () => {
  for (const kind of ["DIRECTORY", "EVENT", "ORGANIZATION", "ADOPTION", "FOSTER", "HELP_ITEM", "LOST_FOUND"]) {
    assert.equal(qualityMayResearch(kind, { status: "ARCHIVED" }, "2026-11-23"), false, kind);
  }
  assert.equal(qualityMayResearch("EVENT",
    { status: "cancelled", start_date: "2027-01-01", cancelled: 0 }, "2026-11-23"), false);
  assert.equal(qualityMayResearch("HELP_ITEM", { status: "closed", resolved: 0 }, "2026-11-23"), false);
  assert.equal(qualityMayResearch("LOST_FOUND", { status: "ACTIVE", expires_at: "2026-11-22" }, "2026-11-23"), false);
  assert.equal(qualityMayResearch("EVENT",
    { status: "published", start_date: "2026-11-24", cancelled: 0 }, "2026-11-23"), true);
});

test("canonical rows are reloaded, auto-resolved with history, never returned among active findings", () => {
  assert.match(engine, /attachCurrentQualityValues\(db, rows\.results, today\)/);
  assert.match(engine, /const filled = !missing\(value\)/);
  assert.match(engine, /filled \|\| !qualityMayResearch\(kind, row, today\)/);
  assert.match(engine, /QUALITY_STALE_ACTOR = "SYSTEM:QUALITY_STALE"/);
  assert.match(engine, /status='REJECTED',decided_by=\?,decided_at=\?/);
  assert.match(engine, /AND COALESCE\(updated_at,''\)=\?/);
  assert.match(engine, /NOT EXISTS \(SELECT 1 FROM /);
  assert.match(engine, /return proposals\.filter\(p => !staleIds\.has\(p\.id\)\)/);
  assert.doesNotMatch(engine, /DELETE FROM quality_missing_proposals/);
});

test("a canonical value filled since discovery blocks a late editor even when its version is reused", () => {
  assert.match(engine, /AND NULLIF\(TRIM\(CAST\(\$\{column\} AS TEXT\)\), ''\) IS NULL/);
  assert.match(engine, /!missing\(fieldValue\(p\.entity_type,row,f\)\)/);
  assert.match(engine, /!qualityMayResearch\(p\.entity_type,row,qualityTodayInSlovakia\(\)\)/);
  assert.match(engine, /WHERE id=\? AND updated_at=\?/);
  const sql = new DatabaseSync(":memory:");
  try {
    sql.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,website_url TEXT,updated_at TEXT);");
    sql.exec("CREATE TABLE quality_missing_proposals(id INTEGER PRIMARY KEY,status TEXT);");
    sql.exec("INSERT INTO directory_profiles VALUES(1,NULL,'v1')");
    sql.exec("INSERT INTO quality_missing_proposals VALUES(50,'OPEN')");
    const update = sql.prepare("UPDATE directory_profiles SET website_url=?,updated_at=? WHERE id=? AND updated_at=? AND NULLIF(TRIM(CAST(website_url AS TEXT)), '') IS NULL AND EXISTS (SELECT 1 FROM quality_missing_proposals WHERE id=? AND status='OPEN')");
    sql.prepare("UPDATE directory_profiles SET website_url='novy text' WHERE id=1").run();
    assert.equal(update.run("stary navrh","v2",1,"v1",50).changes, 0);
    assert.equal(sql.prepare("SELECT website_url FROM directory_profiles WHERE id=1").get().website_url, "novy text");
    sql.prepare("UPDATE directory_profiles SET website_url=NULL, updated_at='v3' WHERE id=1").run();
    assert.equal(update.run("stary navrh","v2",1,"v1",50).changes, 0);
    assert.equal(update.run("novy navrh","v4",1,"v3",50).changes, 1);
  } finally { sql.close(); }
});

test("automatic retirement preserves the historical proposal and protects against concurrent changes", () => {
  const sql = new DatabaseSync(":memory:");
  try {
    sql.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, website_url TEXT, updated_at TEXT);");
    sql.exec("CREATE TABLE quality_missing_proposals(id INTEGER PRIMARY KEY, status TEXT, value TEXT, source_url TEXT, decided_by TEXT, decided_at TEXT);");
    sql.exec("INSERT INTO directory_profiles VALUES(1,'novy web','v2')");
    sql.exec("INSERT INTO quality_missing_proposals VALUES(42,'OPEN','povodny web','zdroj',NULL,NULL)");
    const retire = sql.prepare("UPDATE quality_missing_proposals SET status='REJECTED',decided_by=?,decided_at=? WHERE id=? AND status='OPEN' AND EXISTS (SELECT 1 FROM directory_profiles WHERE id=? AND COALESCE(updated_at,'')=? AND NULLIF(TRIM(CAST(website_url AS TEXT)), '') IS NOT NULL)");
    assert.equal(retire.run("SYSTEM:QUALITY_STALE","2026-11-23",42,1,"v1").changes, 0);
    assert.equal(retire.run("SYSTEM:QUALITY_STALE","2026-11-23",42,1,"v2").changes, 1);
    const saved = sql.prepare("SELECT * FROM quality_missing_proposals WHERE id=42").get();
    assert.equal(saved.status,"REJECTED");
    assert.equal(saved.value,"povodny web");
    assert.equal(saved.source_url,"zdroj");
    assert.equal(saved.decided_by,"SYSTEM:QUALITY_STALE");
    assert.equal(sql.prepare("SELECT count(*) n FROM quality_missing_proposals WHERE status='OPEN'").get().n, 0);
  } finally { sql.close(); }
});

test("keyset pagination reaches beyond the original hard 1000-item ceiling without duplicate IDs", () => {
  assert.match(engine, /QUALITY_PAGE_SIZE = 100/);
  assert.match(engine, /QUALITY_READ_BUDGET = 1000/);
  assert.match(engine, /WHERE status='OPEN' AND id<\? ORDER BY id DESC LIMIT \?/);
  assert.match(engine, /nextBefore: number \| null/);
  assert.match(page, /Number\.isSafeInteger\(parsed\)/);
  assert.match(dashboard, /Staršie nálezy/);
  assert.doesNotMatch(engine, /ORDER BY id DESC LIMIT 1000/);
  const sql = new DatabaseSync(":memory:");
  try {
    sql.exec("CREATE TABLE quality_missing_proposals(id INTEGER PRIMARY KEY,status TEXT NOT NULL)");
    const insert = sql.prepare("INSERT INTO quality_missing_proposals VALUES(?,'OPEN')");
    for (let id = 1; id <= 1205; id++) insert.run(id);
    const ids = [];
    let before = Number.MAX_SAFE_INTEGER;
    for (;;) {
      const batch = sql.prepare("SELECT id FROM quality_missing_proposals WHERE status='OPEN' AND id<? ORDER BY id DESC LIMIT ?").all(before,100);
      if (!batch.length) break;
      ids.push(...batch.map(x => x.id));
      before = batch.at(-1).id;
    }
    assert.equal(ids.length,1205);
    assert.equal(new Set(ids).size,1205);
    assert.equal(ids[0],1205);
    assert.equal(ids.at(-1),1);
  } finally { sql.close(); }
});

test("all public contact corrections use plain text and safe links are rendered only for true http(s) URLs", () => {
  assert.match(dashboard, /id=\{"quality-correction-"\+p\.id\} type="text"/);
  assert.match(dashboard, /safeQualityHref\(p\.value\)/);
  assert.match(dashboard, /url\.protocol/);
  assert.match(engine, /The canonical Admin treats all five public contacts as unrestricted text/);
  const reviewer = engine.slice(engine.indexOf("export async function reviewMissingQualityProposal"));
  assert.doesNotMatch(reviewer, /Zadaj platný e-mail|Zadaj platný verejný telefón|Facebook odkaz musí/);
  assert.match(reviewer, /\["image","registration"\]\.includes\(f\.group\)/);
});
