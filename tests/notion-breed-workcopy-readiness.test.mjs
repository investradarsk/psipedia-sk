import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessBreedWorkcopyReadiness } from "../lib/breed-workcopy-readiness.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const healthy = {
  total: 344, active: 344, shadow: 0, verified: 0,
  receiptPrefixes: 344, activeErrors: 0,
  oldSyncEnabled: false, workCopySyncEnabled: true, activationEnabled: false,
};

test("only an exact 344-link healthy D1 snapshot permits ONE manual roundtrip", () => {
  const result = assessBreedWorkcopyReadiness(healthy);
  assert.equal(result.activeCohortReady, true);
  assert.equal(result.singleNewEngine, true);
  assert.equal(result.readyForManualRoundtrip, true);
  assert.deepEqual(result.blockers, []);
});

test("any missing active link or receipt blocks the manual roundtrip", () => {
  for (const patch of [
    {total: 343, active: 343},
    {active: 343, shadow: 1},
    {active: 343, verified: 1},
    {receiptPrefixes: 343},
  ]) {
    const result = assessBreedWorkcopyReadiness({...healthy, ...patch});
    assert.equal(result.readyForManualRoundtrip, false);
    assert(result.blockers.length > 0);
  }
});

test("a previous per-field error is NOT classified as healthy synchronization", () => {
  const result = assessBreedWorkcopyReadiness({...healthy, activeErrors: 1});
  assert.equal(result.activeCohortReady, true);
  assert.equal(result.readyForManualRoundtrip, false);
  assert(result.blockers.includes("BREED_ACTIVE_FIELD_ERRORS"));
});

test("both engines enabled or reopened activation always blocks the test", () => {
  for (const change of [
    {oldSyncEnabled: true},
    {workCopySyncEnabled: false},
    {activationEnabled: true},
  ]) {
    const result = assessBreedWorkcopyReadiness({...healthy, ...change});
    assert.equal(result.readyForManualRoundtrip, false);
    assert(result.blockers.includes("BREED_SYNC_FLAGS_MISMATCH"));
  }
});

test("Notion editorial edits may update an unpublished breed without republishing it", () => {
  const sync = read("lib/notion-breed-workcopy-sync.ts");
  assert.match(sync, /await notionPageIsTombstoned\(args.database,link.work_notion_page_id\)/);
  assert.match(sync, /status: canonical.status/);
  assert.match(sync, /updateManagedBreed\(canonical.id, candidate, actor/);
  assert.doesNotMatch(sync, /notionPageMustSkipInboundSync/);
  assert.doesNotMatch(sync, /status:\s*"published"/);
});

test("manual Admin to Notion field selection passes through the work-copy adapter", () => {
  const original = read("lib/notion-breed-sync.ts");
  const workcopy = read("lib/notion-breed-workcopy-sync.ts");
  assert.match(original, /forceFieldKeys:\s*args\.forceFieldKeys/);
  assert.match(workcopy, /input\.forceFieldKeys/);
  assert.match(workcopy, /planBreedWorkCopyFieldWrite/);
  assert.match(workcopy, /BREED_WORKCOPY_WRITE_CONCURRENT_EDIT/);
  assert.match(workcopy, /BREED_WORKCOPY_WRITE_NOT_CONFIRMED/);
});
