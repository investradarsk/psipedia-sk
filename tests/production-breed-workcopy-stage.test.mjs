import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  buildAtomicBreedShadowInsert, assertBreedStageStored,
} from "../lib/production-breed-workcopy-stage-plan.mjs";

const migration = readFileSync(new URL("../drizzle/0159_breed_notion_workcopy_links.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-breed-workcopy-stage.yml", import.meta.url), "utf8");
const script = readFileSync(new URL("../scripts/production-breed-workcopy-stage.mjs", import.meta.url), "utf8");
const source = "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2";
const work = "f460b1e5-4454-4a10-9200-3b35106f9e32";
const uid = value => "00000000-0000-0000-0000-" + value.toString(16).padStart(12, "0");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY,slug TEXT,status TEXT,fci_number INTEGER)");
  db.exec("CREATE TABLE breed_notion_sync (breed_id INTEGER PRIMARY KEY,notion_page_id TEXT,content_hash TEXT,last_synced_at TEXT,notion_last_edited_time TEXT)");
  const insBreed = db.prepare("INSERT INTO managed_breeds VALUES (?,?,?,?)");
  const insLink = db.prepare("INSERT INTO breed_notion_sync VALUES (?,?,?,?,?)");
  const rows = [];
  for (let i = 0; i < 344; i++) {
    const id = i + 1000, fciNumber = i + 1;
    const originalPageId = uid(i + 1), workPageId = uid(i + 501);
    const slug = "plemeno-" + id;
    insBreed.run(id, slug, "published", fciNumber);
    insLink.run(id, originalPageId, "legacy-receipt-" + id,
      "2026-11-07T10:00:00Z", "2026-11-07T09:55:00Z");
    rows.push({ breedId: id, originalPageId, workPageId,
      originalDataSourceId: source, workDataSourceId: work,
      slug, fciNumber, originalSyncReceipt: "legacy-receipt-" + id });
  }
  // Three additional unrelated canonical records are not part of cohort.
  for (const [id, slug] of [
    [5, "madarska-vyzla"], [13, "beagle"], [14, "anglicky-koker-spaniel"],
  ]) insBreed.run(id, slug, "published", 1);
  db.exec(migration);
  return { db, rows };
}
function read(db) {
  return {
    storedRows: db.prepare("SELECT * FROM breed_notion_workcopy_links ORDER BY breed_id").all(),
    productionLinks: db.prepare("SELECT * FROM breed_notion_sync ORDER BY breed_id").all(),
  };
}
test("a single insert stages precisely 344 links and preserves all old D1 rows and receipts", () => {
  const { db, rows } = fixture();
  try {
    const sql = buildAtomicBreedShadowInsert(rows);
    assert.equal((sql.match(/INSERT INTO/g) || []).length, 1);
    assert.doesNotMatch(sql, /\b(?:DROP|UPDATE|DELETE|CREATE|ALTER|REPLACE\s+INTO)\b/i);
    const original = db.prepare("SELECT * FROM breed_notion_sync ORDER BY breed_id").all();
    const canonical = db.prepare("SELECT * FROM managed_breeds ORDER BY id").all();
    db.exec(sql);
    const after = read(db);
    assert.equal(after.storedRows.length, 344);
    assert.deepEqual(after.productionLinks, original);
    assert.deepEqual(db.prepare("SELECT * FROM managed_breeds ORDER BY id").all(), canonical);
    assert.deepEqual(assertBreedStageStored({
      plannedRows: rows, ...after,
    }), { stagedCount: 344, workBaselineCount: 0, cutoverReady: false });
    assert(after.storedRows.every(r => r.status === "SHADOW" &&
      r.work_sync_receipt === null && r.activated_at === null));
    db.exec(sql);
    assert.equal(read(db).storedRows.length, 344, "re-run must add nothing");
  } finally { db.close(); }
});

test("changed live source page, FCI, slug, receipt or mapping count inserts zero rows", () => {
  for (const sqlChange of [
    "UPDATE breed_notion_sync SET notion_page_id='wrong' WHERE breed_id=1001",
    "UPDATE managed_breeds SET fci_number=99 WHERE id=1001",
    "UPDATE managed_breeds SET slug='wrong' WHERE id=1001",
    "UPDATE breed_notion_sync SET content_hash=NULL WHERE breed_id=1001",
    "DELETE FROM breed_notion_sync WHERE breed_id=1001",
  ]) {
    const { db, rows } = fixture();
    try {
      db.exec(sqlChange);
      db.exec(buildAtomicBreedShadowInsert(rows));
      assert.equal(read(db).storedRows.length, 0, sqlChange);
    } finally { db.close(); }
  }
});

test("unexpected partial shadow state cannot be silently accepted or doubled", () => {
  const { db, rows } = fixture();
  try {
    db.prepare("INSERT INTO breed_notion_workcopy_links (breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt) VALUES (?,?,?,?,?,?,?,?)")
      .run(1000, uid(1), uid(501), source, work, "plemeno-1000", 1, "legacy-receipt-1000");
    db.exec(buildAtomicBreedShadowInsert(rows));
    assert.equal(read(db).storedRows.length, 1);
    assert.throws(() => assertBreedStageStored({
      plannedRows: rows, ...read(db),
    }), /BREED_STAGE_STORED_COUNT_INVALID/);
  } finally { db.close(); }
});

test("duplicate, malformed, or unapproved identities cannot produce SQL", () => {
  const { db, rows } = fixture();
  try {
    assert.throws(() => buildAtomicBreedShadowInsert(rows.slice(1)),
      /REQUIRES_344/);
    const duplicate = structuredClone(rows);
    duplicate[1].workPageId = duplicate[0].workPageId;
    assert.throws(() => buildAtomicBreedShadowInsert(duplicate),
      /CANDIDATE_IDENTITY_INVALID/);
    const badSource = structuredClone(rows);
    badSource[3].workDataSourceId = source;
    assert.throws(() => buildAtomicBreedShadowInsert(badSource),
      /CANDIDATE_IDENTITY_INVALID/);
    const missingReceipt = structuredClone(rows);
    missingReceipt[4].originalSyncReceipt = "";
    assert.throws(() => buildAtomicBreedShadowInsert(missingReceipt),
      /CANDIDATE_IDENTITY_INVALID/);
  } finally { db.close(); }
});

test("stored work receipt, status, page, or active receipt drift fails closed", () => {
  for (const update of [
    "UPDATE breed_notion_workcopy_links SET status='VERIFIED',verified_at='2026-11-07' WHERE breed_id=1001",
    "UPDATE breed_notion_workcopy_links SET work_sync_receipt='unexpected' WHERE breed_id=1001",
    "UPDATE breed_notion_workcopy_links SET canonical_slug='wrong' WHERE breed_id=1001",
    "UPDATE breed_notion_sync SET content_hash='new-active-receipt' WHERE breed_id=1001",
  ]) {
    const { db, rows } = fixture();
    try {
      db.exec(buildAtomicBreedShadowInsert(rows));
      db.exec(update);
      assert.throws(() => assertBreedStageStored({
        plannedRows: rows, ...read(db),
      }), /STORED_IDENTITY_OR_RECEIPT_DRIFT/);
    } finally { db.close(); }
  }
});

test("workflow is manual-only and cannot apply or switch when merged", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /APPLY-BREED-STAGE-344/);
  assert.match(workflow, /AUDIT-BREED-STAGE-344/);
  assert.match(workflow, /secrets.NOTION_API_TOKEN/);
  assert.match(script, /BREED_STAGE_RECOVERY_BOOKMARK_MISSING/);
  assert.match(script, /inspectBreedWorkCopy/);
  assert.match(script, /planBreedWorkcopyIdentity/);
  assert.match(script, /planBreedWorkcopyShadowRows/);
  assert.match(script, /NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED/);
  assert.doesNotMatch(script, /\/pages\/[^"]+\/(PATCH|DELETE)/);
});
