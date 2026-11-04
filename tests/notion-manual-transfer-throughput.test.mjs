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
  assert.match(ui,/Čaká vo fronte/);
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
