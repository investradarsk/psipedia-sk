import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  BREED_WORKCOPY_BASELINE_CAS_SQL, breedBaselineCasBindings,
} from "../lib/production-breed-workcopy-baseline-cas.mjs";

const file = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const migration = file("drizzle/0159_breed_notion_workcopy_links.sql");
const route = file("app/api/admin/notion-breeds-workcopy-baseline/route.ts");
const ui = file("components/admin-breed-workcopy-baseline.tsx");
const page = file("app/admin/plemena/page.tsx");
const config = JSON.parse(file("wrangler.jsonc"));
const origSource = "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2";
const workSource = "f460b1e5-4454-4a10-9200-3b35106f9e32";
const first = "00000000-0000-0000-0000-000000000111";
const second = "00000000-0000-0000-0000-000000000222";
const oldHash = "original-unchanged-hash";
const revision = "2026-11-08T18:42:00.000Z";
const updatedAt = "2026-11-08T18:41:00.000Z";
const receipt = "breed-field-v1:" + JSON.stringify({
  hash: "0".repeat(64),
  notion: JSON.stringify({ name: "New Notion name", intro: "Notion intro" }),
  admin: JSON.stringify({ name: "Old Admin name", intro: "Admin intro" }),
});

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, slug TEXT, fci_number INTEGER, updated_at TEXT)");
  db.exec("CREATE TABLE breed_notion_sync (breed_id INTEGER PRIMARY KEY, notion_page_id TEXT, content_hash TEXT)");
  db.prepare("INSERT INTO managed_breeds VALUES (?,?,?,?)")
    .run(100, "plemeno-100", 1, updatedAt);
  db.prepare("INSERT INTO breed_notion_sync VALUES (?,?,?)")
    .run(100, first, oldHash);
  db.exec(migration);
  db.prepare(
    "INSERT INTO breed_notion_workcopy_links " +
    "(breed_id,original_notion_page_id,work_notion_page_id," +
    "original_data_source_id,work_data_source_id,canonical_slug," +
    "fci_number,original_sync_receipt) VALUES (?,?,?,?,?,?,?,?)",
  ).run(100, first, second, origSource, workSource, "plemeno-100", 1, oldHash);
  const row = db.prepare("SELECT * FROM breed_notion_workcopy_links").get();
  return { db, row };
}
function apply(db, row, value = receipt, rev = revision) {
  return db.prepare(BREED_WORKCOPY_BASELINE_CAS_SQL)
    .run(...breedBaselineCasBindings({
      value, revision: rev, row, canonicalUpdatedAt: updatedAt,
    })).changes;
}

test("initial NULL Notion revision accepts an independent workcopy baseline", () => {
  const { db, row } = fixture();
  try {
    const activeBefore = db.prepare("SELECT * FROM breed_notion_sync").all();
    const canonicalBefore = db.prepare("SELECT * FROM managed_breeds").all();
    assert.equal(row.work_notion_last_edited_time, null);
    assert.equal(apply(db, row), 1);
    const after = db.prepare("SELECT * FROM breed_notion_workcopy_links").get();
    assert.equal(after.work_sync_receipt, receipt);
    assert.equal(after.work_notion_last_edited_time, revision);
    assert.equal(after.status, "SHADOW");
    assert.equal(after.verified_at, null);
    assert.equal(after.activated_at, null);
    assert.equal(after.original_sync_receipt, oldHash);
    assert.deepEqual(db.prepare("SELECT * FROM managed_breeds").all(), canonicalBefore);
    assert.deepEqual(db.prepare("SELECT * FROM breed_notion_sync").all(), activeBefore);
    assert.equal(apply(db, row), 0, "cannot replace an already initialized receipt");
  } finally { db.close(); }
});

test("legacy receipt drift, canonical drift, stale revision and activation block writes", () => {
  const sqlChanges = [
    "UPDATE breed_notion_sync SET content_hash='new' WHERE breed_id=100",
    "UPDATE breed_notion_sync SET notion_page_id='changed' WHERE breed_id=100",
    "UPDATE managed_breeds SET updated_at='new' WHERE id=100",
    "UPDATE managed_breeds SET slug='changed' WHERE id=100",
    "UPDATE managed_breeds SET fci_number=2 WHERE id=100",
    "UPDATE breed_notion_workcopy_links SET work_notion_last_edited_time='new' WHERE breed_id=100",
    "UPDATE breed_notion_workcopy_links SET status='VERIFIED', verified_at='now' WHERE breed_id=100",
    "UPDATE breed_notion_workcopy_links SET work_sync_receipt='existing' WHERE breed_id=100",
  ];
  for (const change of sqlChanges) {
    const { db, row } = fixture();
    try {
      db.exec(change);
      assert.equal(apply(db, row), 0, change);
      const after = db.prepare("SELECT * FROM breed_notion_workcopy_links").get();
      if (!change.includes("work_sync_receipt='existing'"))
        assert.equal(after.work_sync_receipt, null);
    } finally { db.close(); }
  }
});

test("refuses non-field receipts and missing revision", () => {
  const { db, row } = fixture();
  try {
    assert.throws(() => breedBaselineCasBindings({
      value: oldHash, revision, row, canonicalUpdatedAt: updatedAt,
    }), /CAS_ARGUMENTS_INVALID/);
    assert.throws(() => breedBaselineCasBindings({
      value: receipt, revision: "", row, canonicalUpdatedAt: updatedAt,
    }), /CAS_ARGUMENTS_INVALID/);
  } finally { db.close(); }
});

test("baseline writer is disabled after 344/344 were initialized", () => {
  assert.equal(config.vars.NOTION_BREED_WORKCOPY_BASELINE_ENABLED, "false");
  assert.equal(config.vars.NOTION_BREED_SYNC_ENABLED, "false");
  assert.equal(config.vars.NOTION_BREED_WORKCOPY_SYNC_ENABLED, "true");
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /"BASELINE_344_BREEDS"/);
  assert.match(route, /NOTION_BREED_WORKCOPY_BASELINE_ENABLED !== "true"/);
  assert.match(route, /Number\(cohort\?\.total\) !== 344/);
  assert.match(route, /Number\(cohort\?\.shadow\) !== 344/);
  assert.match(route, /ORDER BY breed_id LIMIT 10/);
  assert.match(route, /BREED_WORKCOPY_BASELINE_CAS_SQL/);
  assert.match(route, /freshPage\.last_edited_time !== page\.last_edited_time/);
  assert.match(route, /baselinesMissing/);
  assert.match(ui, /BASELINE_344_BREEDS/);
  assert.match(ui, /batch < 40/);
  assert.match(page, /NOTION_BREED_WORKCOPY_BASELINE_ENABLED === "true"/);
  assert.doesNotMatch(route, /UPDATE breed_notion_sync|UPDATE managed_breeds|method:\s*"PATCH"|ACTIVATE_344/);
  assert.doesNotMatch(BREED_WORKCOPY_BASELINE_CAS_SQL,
    /\b(?:INSERT|DELETE|DROP|ALTER|CREATE|REPLACE\s+INTO)\b/i);
});
