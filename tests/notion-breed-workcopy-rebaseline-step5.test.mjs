import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  BREED_WORKCOPY_REBASELINE_CAS_SQL,
  breedWorkCopyRebaselineBindings,
} from "../lib/notion-breed-workcopy-rebaseline-cas.mjs";

const file = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const sql = file("drizzle/0159_breed_notion_workcopy_links.sql");
const route = file("app/api/admin/notion-breeds-workcopy-rebaseline/route.ts");
const ui = file("components/admin-breed-workcopy-baseline.tsx");
const preflight = file("app/api/admin/notion-breeds-workcopy-preflight/route.ts");
const config = JSON.parse(file("wrangler.jsonc")).vars;
const oldId = "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2";
const newId = "f460b1e5-4454-4a10-9200-3b35106f9e32";
const oldPage = "00000000-0000-0000-0000-000000000111";
const newPage = "00000000-0000-0000-0000-000000000222";
const previousReceipt = "breed-field-v1:old-independent-receipt";
const nextReceipt = "breed-field-v1:new-independent-receipt";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, slug TEXT, fci_number INTEGER, updated_at TEXT)");
  db.exec("CREATE TABLE breed_notion_sync (breed_id INTEGER PRIMARY KEY, notion_page_id TEXT, content_hash TEXT, last_synced_at TEXT, notion_last_edited_time TEXT)");
  db.prepare("INSERT INTO managed_breeds VALUES (?,?,?,?)").run(100, "plemeno-100", 22, "admin-v1");
  db.prepare("INSERT INTO breed_notion_sync VALUES (?,?,?,?,?)")
    .run(100,oldPage,"original-v1","sync-v1","notion-old-v1");
  db.exec(sql);
  db.prepare("INSERT INTO breed_notion_workcopy_links "+
    "(breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,"+
    "work_data_source_id,canonical_slug,fci_number,original_sync_receipt,work_sync_receipt,"+
    "work_notion_last_edited_time,status) VALUES (?,?,?,?,?,?,?,?,?,?,'SHADOW')")
    .run(100,oldPage,newPage,oldId,newId,"plemeno-100",22,
      "original-v1",previousReceipt,"work-revision-v1");
  db.exec("UPDATE breed_notion_sync SET content_hash='original-v2', last_synced_at='sync-v2', notion_last_edited_time='notion-old-v2' WHERE breed_id=100");
  return db;
}
function observed(db) {
  return {
    row: db.prepare("SELECT * FROM breed_notion_workcopy_links").get(),
    source: db.prepare("SELECT * FROM breed_notion_sync").get(),
  };
}
function apply(db, row, source, canonicalUpdatedAt="admin-v1") {
  return db.prepare(BREED_WORKCOPY_REBASELINE_CAS_SQL).run(
    ...breedWorkCopyRebaselineBindings({
      row,source,value:nextReceipt,pageRevision:"work-revision-v2",canonicalUpdatedAt,
    }),
  ).changes;
}

test("SHADOW refresh records current Notion revision and old sync hash without modifying canonical or old sync", () => {
  const db = fixture();
  try {
    const {row,source} = observed(db);
    const beforeAdmin = db.prepare("SELECT * FROM managed_breeds").all();
    const beforeOriginal = db.prepare("SELECT * FROM breed_notion_sync").all();
    assert.equal(apply(db,row,source),1);
    const after = db.prepare("SELECT * FROM breed_notion_workcopy_links").get();
    assert.equal(after.status,"SHADOW");
    assert.equal(after.work_sync_receipt,nextReceipt);
    assert.equal(after.work_notion_last_edited_time,"work-revision-v2");
    assert.equal(after.original_sync_receipt,"original-v2");
    assert.equal(after.original_sync_last_synced_at,"sync-v2");
    assert.equal(after.original_notion_last_edited_time,"notion-old-v2");
    assert.equal(after.activated_at,null);
    assert.deepEqual(db.prepare("SELECT * FROM managed_breeds").all(),beforeAdmin);
    assert.deepEqual(db.prepare("SELECT * FROM breed_notion_sync").all(),beforeOriginal);
    assert.equal(apply(db,row,source),0,"stale SHADOW receipt cannot be replaced twice");
  } finally { db.close(); }
});

test("any concurrent canonical, original-link, work-receipt or status change blocks refresh", () => {
  const sqlChanges = [
    "UPDATE managed_breeds SET updated_at='new-edit' WHERE id=100",
    "UPDATE managed_breeds SET slug='new-slug' WHERE id=100",
    "UPDATE managed_breeds SET fci_number=23 WHERE id=100",
    "UPDATE breed_notion_sync SET content_hash='other-new-hash' WHERE breed_id=100",
    "UPDATE breed_notion_sync SET notion_page_id='other-page' WHERE breed_id=100",
    "UPDATE breed_notion_workcopy_links SET work_sync_receipt='concurrent' WHERE breed_id=100",
    "UPDATE breed_notion_workcopy_links SET work_notion_page_id='other-page' WHERE breed_id=100",
    "UPDATE breed_notion_workcopy_links SET status='VERIFIED', verified_at='now' WHERE breed_id=100",
  ];
  for (const query of sqlChanges) {
    const db = fixture();
    try {
      const {row,source} = observed(db);
      db.exec(query);
      assert.equal(apply(db,row,source),0,query);
      assert.equal(db.prepare("SELECT work_sync_receipt FROM breed_notion_workcopy_links").get().work_sync_receipt,
        query.includes("work_sync_receipt='concurrent'")?"concurrent":previousReceipt);
    } finally { db.close(); }
  }
});

test("refresh requires a properly formatted independent receipt and current revision", () => {
  const db = fixture();
  try {
    const {row,source}=observed(db);
    assert.throws(() => breedWorkCopyRebaselineBindings({
      row,source,value:"legacy-hash",pageRevision:"work-revision-v2",canonicalUpdatedAt:"admin-v1",
    }),/BREED_WORKCOPY_REBASELINE_ARGUMENTS_INVALID/);
    assert.throws(() => breedWorkCopyRebaselineBindings({
      row,source,value:nextReceipt,pageRevision:"",canonicalUpdatedAt:"admin-v1",
    }),/BREED_WORKCOPY_REBASELINE_ARGUMENTS_INVALID/);
  } finally { db.close(); }
});

test("owner-only route and UI do not accidentally activate, edit profiles or enable sync", () => {
  assert.equal(config.NOTION_BREED_WORKCOPY_SYNC_ENABLED,"true");
  assert.equal(config.NOTION_BREED_SYNC_ENABLED,"false");
  assert.equal(config.NOTION_BREED_WORKCOPY_BASELINE_ENABLED,"false");
  assert.match(route,/requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.equal(config.NOTION_BREED_WORKCOPY_REBASELINE_ENABLED,"false");
  assert.match(route,/NOTION_BREED_WORKCOPY_REBASELINE_ENABLED !== "true"/);
  assert.match(route,/Date\.now\(\) > REBASELINE_EXPIRES_AT/);
  assert.match(route,/2026-11-16T23:59:59Z/);
  assert.match(ui,/showInitial &&/);
  assert.match(ui,/showRefresh &&/);
  assert.match(file("app/admin/plemena/page.tsx"),/enableRebaseline/);
  assert.match(route,/"REBASELINE_344_BREEDS"/);
  assert.match(route,/Number\(cohort\?\.total\) !== 344/);
  assert.match(route,/Number\(cohort\?\.shadow\) !== 344/);
  assert.match(route,/ORDER BY breed_id LIMIT 10/);
  assert.match(route,/fresh\.last_edited_time !== page\.last_edited_time/);
  assert.match(route,/buildBreedWorkCopyBaseline\(page, canonical\)/);
  assert.match(ui,/window\.confirm/);
  assert.match(ui,/REBASELINE_344_BREEDS/);
  assert.match(preflight,/isCompatibleBreedWorkcopyReceipt\(row\.work_sync_receipt\)/);
  assert.match(preflight,/legacyOriginalReceiptsAreAdvisory: true/);
  assert.match(preflight,/workReceiptMissingCount/);
  assert.doesNotMatch(route,/UPDATE managed_breeds|UPDATE breed_notion_sync|method:\s*"PATCH"|ACTIVATE_344_BREEDS/);
  assert.doesNotMatch(BREED_WORKCOPY_REBASELINE_CAS_SQL,
    /\b(?:INSERT|DELETE|DROP|ALTER|CREATE|REPLACE\s+INTO)\b/i);
});
