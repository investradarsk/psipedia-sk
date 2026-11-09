import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queue=readFileSync(new URL("../lib/notion-manual-transfer-queue.ts",import.meta.url),"utf8");
const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../components/admin-notion-manual-transfer.tsx",import.meta.url),"utf8");

test("preview and confirmed writes have separate bounded capacities without starvation",()=>{
  assert.match(queue,/MANUAL_PREVIEW_BATCH_SIZE=10/);
  assert.match(queue,/MANUAL_EXECUTION_BATCH_SIZE=4/);
  assert.match(queue,/Math\.min\(MANUAL_PREVIEW_BATCH_SIZE,Math\.max\(1,input\.limit\?\?1\)\)/);
  assert.match(queue,/for\(let n=0;n<limit\+MANUAL_EXECUTION_BATCH_SIZE;n\+\+\)/);
  assert.match(queue,/n%3===0 && executionAvailable/);
  assert.match(queue,/if\(isPreview\)previewClaims\+\+;/);
  assert.match(queue,/else executionClaims\+\+;/);
  assert.match(worker,/controller\.cron === "\* \* \* \* \*"/);
  assert.match(worker,/runManualTransferQueueBatch\(\{/);
  assert.match(worker,/database:env\.DB,bindings:env,limit:10/);
});

test("bulk preview remains strictly read-only until explicit owner confirmation",()=>{
  assert.match(queue,/status='PREVIEWED'/);
  assert.match(queue,/before\.changed\)await runOne/);
  assert.match(queue,/head\.status!=="PREVIEW_READY"/);
  assert.match(queue,/UPDATE notion_manual_transfer_runs SET .*?status='QUEUED'/s);
  assert.match(queue,/previewOne\(input\.database,input\.bindings,item,header\.direction\)/);
});

test("pending profiles avoid unnecessary D1 field queries, with clear user-facing state",()=>{
  assert.match(queue,/const eligible=\(rows\.results\?\?\[\]\)\.filter\(row=>row\.status!=="PENDING"\|\|row\.attempts>0\)/);
  assert.match(ui,/Prenos čaká vo fronte/);
  assert.match(ui,/Čaká na kontrolu/);
  assert.match(ui,/najviac 10 profilov za minútu/);
  assert.match(ui,/waitingForFirstProfile/);
});

test("manual transfer status polling uses one bounded field query rather than an N+1 loop",()=>{
  assert.match(queue,/const eligible=\(rows\.results\?\?\[\]\)\.filter/);
  assert.match(queue,/ROW_NUMBER\(\) OVER \(PARTITION BY item_id ORDER BY field_key\)/);
  assert.match(queue,/WHERE rank<=150 ORDER BY item_id,field_key/);
  assert.match(queue,/\.bind\(\.\.\.eligible\.map\(row=>row\.id\)\)\.all/);
  assert.doesNotMatch(queue,/for\(const row of rows\.results\?\?\[\]\)\{[\s\S]*?FROM notion_manual_transfer_field_results WHERE item_id=\?/);
});

test("unchanged profiles complete without a redundant Notion readback",()=>{
  assert.match(queue,/const after=before\.changed\?await inspectManualTransferRecord/);
  assert.match(queue,/\}\):before;/);
  assert.match(queue,/verifyManualTransferFields\(before,after\)/);
});

test("bulk link discovery uses stable keyset pagination rather than growing offsets",()=>{
  assert.match(queue,/let cursor=0/);
  assert.match(queue,/sql\+" AND "\+idColumn\+">\? ORDER BY profile_id LIMIT \?"/);
  assert.match(queue,/cursor=rows\[rows\.length-1\]\.profile_id/);
  assert.doesNotMatch(queue,/ORDER BY profile_id LIMIT \? OFFSET \?/);
});

test("owner confirmation is atomic and resets retry eligibility",()=>{
  assert.match(queue,/const \[claimed\]=await db\.batch\(\[/);
  assert.match(queue,/status='QUEUED',processed_profiles=0,changed_fields=0/);
  assert.match(queue,/attempts=0,started_at=NULL,next_attempt_at=\?,updated_at=\?/);
  assert.match(queue,/WHERE run_id=\? AND status='PREVIEWED' AND preview_hash IS NOT NULL AND EXISTS/);
  assert.match(queue,/if\(claimed\.meta\.changes!==1\)throw Error\("TRANSFER_PREVIEW_CHANGED"\)/);
});

test("completed items recover a stale parent run status without altering pending retries",()=>{
  assert.match(queue,/async function reconcileSettledManualTransferRuns/);
  assert.match(queue,/NOT EXISTS \(SELECT 1 FROM notion_manual_transfer_items i/);
  assert.match(queue,/WHERE i\.run_id=r\.id AND i\.status NOT IN/);
  assert.match(queue,/ORDER BY r\.updated_at LIMIT 5/);
  assert.match(queue,/await reconcileSettledManualTransferRuns\(input\.database\)/);
  assert.match(queue,/for\(const run of result\.results\?\?\[\]\)await updateRun\(db,run\.id\)/);
});

test("progress aggregation is amortized while the last partial group is flushed",()=>{
  assert.match(queue,/const touchedRuns=new Set<string>\(\)/);
  assert.match(queue,/touchedRuns\.add\(item\.run_id\)/);
  assert.match(queue,/if\(total\.claimed%3===0\)await flushRunProgress\(\)/);
  assert.match(queue,/await flushRunProgress\(\);\s*\/\/ Repair a previously settled run/);
  assert.match(queue,/for\(const id of touchedRuns\)await updateRun\(input\.database,id\)/);
});
