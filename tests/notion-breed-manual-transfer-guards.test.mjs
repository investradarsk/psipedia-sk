import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  manualBreedCellHasValue,assertManualBreedSweepOutcome,
} from "../lib/notion-breed-manual-transfer-guards.ts";

test("a missing Notion number is not a manual content change or implicit score 3",()=>{
  for(const value of [null,undefined,"",NaN,Infinity])
    assert.equal(manualBreedCellHasValue("number",value),false);
  assert.equal(manualBreedCellHasValue("number",3),true);
  assert.equal(manualBreedCellHasValue("number",0),true);
  assert.equal(manualBreedCellHasValue("number",5),true);
});

test("blank text/JSON/url cannot silently clear Admin; false checkbox is explicit",()=>{
  for(const type of ["text","title","url","date","select"]){
    assert.equal(manualBreedCellHasValue(type,null),false);
    assert.equal(manualBreedCellHasValue(type,""),false);
    assert.equal(manualBreedCellHasValue(type,"   "),false);
    assert.equal(manualBreedCellHasValue(type,"Valid value"),true);
  }
  assert.equal(manualBreedCellHasValue("text","[]"),true);
  assert.equal(manualBreedCellHasValue("checkbox",false),true);
  assert.equal(manualBreedCellHasValue("checkbox",true),true);
  assert.equal(manualBreedCellHasValue("checkbox",null),false);
});

test("one-shot breed partial update must go to field readback, not hidden whole-profile retry",()=>{
  assert.equal(assertManualBreedSweepOutcome({
    enabled:true,scanned:1,failed:0,
  }),"OK");
  assert.equal(assertManualBreedSweepOutcome({
    enabled:true,scanned:1,failed:1,
    lastErrorCode:"TRANSFER_BREED_PARTIAL_FIELDS",
  }),"NEEDS_READBACK");
  assert.throws(()=>assertManualBreedSweepOutcome({
    enabled:true,scanned:0,failed:0,
  }),/TRANSFER_BREED_ADAPTER_FAILED/);
  assert.throws(()=>assertManualBreedSweepOutcome({
    enabled:true,scanned:1,failed:1,
    lastErrorCode:"BREED_PARTIAL_UPDATE_FAILED",
  }),/BREED_PARTIAL_UPDATE_FAILED/);
  assert.throws(()=>assertManualBreedSweepOutcome({
    enabled:false,scanned:0,failed:0,
  }),/TRANSFER_BREED_SYNC_DISABLED/);
});

test("manual queue uses verified field results and breed adapter respects filled source cells",()=>{
  const queue=readFileSync(new URL("../lib/notion-manual-transfer-queue.ts",import.meta.url),"utf8");
  assert.match(queue,/assertManualBreedSweepOutcome\(summary\)/);
  assert.match(queue,/verifyManualTransferFields\(before,after\)/);
  const sync=readFileSync(new URL("../lib/notion-breed-sync.ts",import.meta.url),"utf8");
  assert.match(sync,/manualBreedPresentFieldIds\(page\)/);
  assert.match(sync,/invalidSelected/);
  assert.match(sync,/lastErrorCode/);
});
