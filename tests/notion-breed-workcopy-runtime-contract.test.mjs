import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const config = JSON.parse(read("wrangler.jsonc"));
const sync = read("lib/notion-breed-workcopy-sync.ts");
const old = read("lib/notion-breed-sync.ts");
const worker = read("worker/index.ts");
const adminRoute = read("app/api/admin/notion-breeds-sync/route.ts");
const stage = read("app/api/admin/notion-breeds-workcopy-stage/route.ts");
const schema = read("drizzle/0159_breed_notion_workcopy_links.sql");
const delta = read("lib/notion-breed-workcopy-delta.ts");

test("production enables only the 60-field engine after 344 ACTIVE activation; staging OFF", () => {
  assert.equal(config.vars.NOTION_BREED_SYNC_ENABLED, "false");
  assert.equal(config.vars.NOTION_BREED_WORKCOPY_SYNC_ENABLED, "true");
  assert.equal(config.vars.NOTION_BREED_WORKCOPY_STAGE_ENABLED, "false");
  assert.equal(config.vars.NOTION_BREEDS_DATA_SOURCE_ID,
    "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2");
  assert.equal(config.vars.NOTION_BREEDS_WORK_DATA_SOURCE_ID,
    "f460b1e5-4454-4a10-9200-3b35106f9e32");
});

test("cron and Admin POST select only one of two protected breed sync engines", () => {
  assert.match(worker, /runNotionBreedWorkCopySyncSweep/);
  assert.match(worker, /pushTaskEnabled\(env\.NOTION_BREED_WORKCOPY_SYNC_ENABLED\)/);
  assert.match(adminRoute, /runNotionBreedWorkCopySyncSweep/);
  assert.match(old, /BREED_OLD_SWEEP_DISABLED_IN_WORKCOPY_MODE/);
  assert.match(old, /writeBackBreedToWorkCopy/);
  assert.match(sync, /BREED_DUAL_SYNCHRONIZERS_FORBIDDEN/);
});

test("new work-copy adapter uses only the matching ACTIVE Psipedia ID, not whole-cohort gates", () => {
  assert.match(sync, /WHERE breed_id=\? AND status='ACTIVE'/);
  assert.doesNotMatch(sync, /BREED_WORKCOPY_COHORT_NOT_ACTIVE/);
  assert.doesNotMatch(sync, /BREED_WORKCOPY_PER_FIELD_BASELINE_MISSING/);
  assert.match(sync, /BREED_WORKCOPY_ID_MISMATCH/);
  assert.match(sync, /readReceipt\(link.work_sync_receipt, input.before\)/);
  assert.match(sync, /breedWorkcopyEventValues\(page,edited,BREED_NOTION_SCHEMA\)/);
  assert.match(sync, /saveBreedNotionField\(/);
  assert.match(sync, /WHERE breed_id=\? AND work_notion_page_id=\?/);
  assert.match(sync, /BREED_WORKCOPY_RECEIPT_CAS_CHANGED/);
  assert.doesNotMatch(sync, /UPDATE breed_notion_sync/);
  assert.doesNotMatch(sync, /INSERT INTO managed_breeds/);
});

test("field-level writeback re-reads Notion and confirms the single cell", () => {
  assert.match(sync, /planBreedWorkCopyFieldWrite/);
  assert.match(sync, /BREED_WORKCOPY_WRITE_CONCURRENT_EDIT/);
  assert.match(sync, /BREED_WORKCOPY_WRITE_NOT_CONFIRMED/);
  assert.match(sync, /method: "PATCH", body: JSON\.stringify\(\{ properties:plan\.properties \}\)/);
  assert.match(delta, /planBreedNotionFieldDelta/);
  assert.match(delta, /!restricted\.includes\(field\) && !invalidFieldIds\.has\(field\)/);
  assert.match(delta, /const current = breedFieldSnapshot\(input.canonical\)/);
  assert.match(sync, /allowCurrentRemote: true/);
});

test("staging is separately owner-confirmed, does not activate and leaves old links untouched", () => {
  assert.match(stage, /getAdminApiUser\(\)/);
  assert.match(stage, /NOTION_BREED_WORKCOPY_STAGE_ENABLED !== "true"/);
  assert.match(stage, /"STAGE_344_BREEDS"/);
  assert.match(stage, /planBreedWorkcopyIdentity/);
  assert.match(stage, /inspectBreedWorkCopy/);
  assert.match(stage, /expandBreed60WorkPage/);
  assert.match(stage, /original_sync_receipt/);
  assert.match(stage, /'SHADOW'/);
  assert.match(stage, /ON CONFLICT\(breed_id\) DO UPDATE/);
  assert.doesNotMatch(stage, /UPDATE breed_notion_sync/);
  assert.doesNotMatch(stage, /status='ACTIVE'/);
});

test("new migration is additive and preserves rollback evidence", () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS breed_notion_workcopy_links/);
  assert.match(schema, /original_notion_page_id TEXT NOT NULL UNIQUE/);
  assert.match(schema, /work_notion_page_id TEXT NOT NULL UNIQUE/);
  assert.match(schema, /original_sync_receipt TEXT NOT NULL/);
  assert.match(schema, /work_sync_receipt TEXT/);
  assert.doesNotMatch(schema, /DROP TABLE|ALTER TABLE managed_breeds|DELETE FROM/i);
});
