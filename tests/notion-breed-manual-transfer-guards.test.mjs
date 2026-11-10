import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inspectBreedMeasurement } from "../lib/breed-fci.ts";
import {
  manualBreedCellHasValue,assertManualBreedSweepOutcome,
} from "../lib/notion-breed-manual-transfer-guards.ts";

test("a missing Notion number is not a manual content change or implicit score 3",()=>{
  for(const value of [null,undefined,"",NaN,Infinity])
    assert.equal(manualBreedCellHasValue("number",value),false);
  assert.equal(manualBreedCellHasValue("number",3),true);
  assert.equal(manualBreedCellHasValue("number",0),false);
  assert.equal(manualBreedCellHasValue("number",6),false);
  assert.equal(manualBreedCellHasValue("number",2.5),false);
  assert.equal(manualBreedCellHasValue("number",5),true);
  assert.equal(manualBreedCellHasValue("number",9,"fciGroup"),true);
  assert.equal(manualBreedCellHasValue("number",11,"fciGroup"),false);
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

test("manual queue verifies active workcopy outcomes; legacy adapter guards remain tested separately",()=>{
  const queue=readFileSync(new URL("../lib/notion-manual-transfer-queue.ts",import.meta.url),"utf8");
  assert.match(queue,/runNotionBreedWorkCopySyncSweep/);
  assert.match(queue,/writeBackBreedToWorkCopy/);
  assert.doesNotMatch(queue,/runNotionBreedSyncSweep/);
  assert.match(queue,/verifyManualTransferFields\(before,after\)/);
  const sync=readFileSync(new URL("../lib/notion-breed-sync.ts",import.meta.url),"utf8");
  assert.match(sync,/manualBreedPresentFieldIds\(page\)/);
  assert.match(sync,/invalidSelected/);
  assert.match(sync,/lastErrorCode/);
});

test("FCI dog and bitch heights allow +/-1 cm tolerance without treating it as 1 cm height",()=>{
  for(const value of [
    "56–62 (tolerancia ±1 cm)",
    "52–56 (tolerancia ±1 cm)",
  ]){
    const issues=inspectBreedMeasurement(value,"height",{requireUnit:false});
    assert.deepEqual(issues.filter(issue=>issue.severity==="error"),[]);
  }
  assert.ok(inspectBreedMeasurement("62–56 (tolerancia ±1 cm)","height",
    {requireUnit:false}).some(issue=>issue.code==="reversed-range"));
  assert.ok(inspectBreedMeasurement("56–620 (tolerancia ±1 cm)","height",
    {requireUnit:false}).some(issue=>issue.code==="out-of-range"));
  assert.ok(inspectBreedMeasurement("(tolerancia ±1 cm)","height",
    {requireUnit:false}).some(issue=>issue.code==="missing-number"));
  assert.ok(inspectBreedMeasurement("200 cm","height",
    {requireUnit:false}).some(issue=>issue.code==="out-of-range"));
});
