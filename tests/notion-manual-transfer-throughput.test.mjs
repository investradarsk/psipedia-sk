import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queue=readFileSync(new URL("../lib/notion-manual-transfer-queue.ts",import.meta.url),"utf8");
const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../components/admin-notion-manual-transfer.tsx",import.meta.url),"utf8");

test("read-only preview can process ten profiles per minute while live writes retain their two-item cap",()=>{
  assert.match(queue,/MANUAL_PREVIEW_BATCH_SIZE=10/);
  assert.match(queue,/MANUAL_EXECUTION_BATCH_SIZE=2/);
  assert.match(queue,/Math\.min\(MANUAL_PREVIEW_BATCH_SIZE,Math\.max\(1,input\.limit\?\?1\)\)/);
  assert.match(queue,/if\(executionClaims>=MANUAL_EXECUTION_BATCH_SIZE\)break/);
  assert.match(queue,/if\(!isPreview\)executionClaims\+\+/);
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
  assert.match(queue,/if\(row\.status==="PENDING"&&row\.attempts===0\)/);
  assert.match(ui,/Čaká vo fronte/);
  assert.match(ui,/najviac 10 profilov za minútu/);
  assert.match(ui,/waitingForFirstProfile/);
});
