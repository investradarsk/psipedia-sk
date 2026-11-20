import assert from "node:assert/strict";
import test from "node:test";
import {HELP_LEGACY_APPROVED_REMOVALS,HELP_LEGACY_EXPECTED,assessHelpLegacyCleanup} from "../lib/help-legacy-cleanup-plan.mjs";
const valid={
  adoption:36,shelters:104,lost:0,adoptionDone:0,sheltersDone:0,
  unmapped:0,unmatchedAdoptions:0,unexpectedShelters:0,duplicateSlugs:0,
  partnerClaimReferences:0,unsupportedStatuses:0,conflictingTombstones:0,
  notionTargetMissing:0,approvedRemoved:10
};
test("initial strict 36/104/0 legacy SQL inventory is accepted",()=>{
 assert.deepEqual(HELP_LEGACY_EXPECTED,{adopcia:36,utulky:104,"stratene-a-najdene":0});
 assert.equal(HELP_LEGACY_APPROVED_REMOVALS.length,10);
 assert.deepEqual(assessHelpLegacyCleanup(valid),{ready:true,blockers:[],remaining:140,completed:0,total:140});
});
test("partial lifecycle deletion may resume without reviving Notion copies",()=>{
 const s=assessHelpLegacyCleanup({...valid,adoption:10,shelters:90,adoptionDone:26,sheltersDone:14});
 assert.equal(s.ready,true);assert.equal(s.completed,40);assert.equal(s.remaining,100);
});
test("full completion is inert and idempotent",()=>{
 const s=assessHelpLegacyCleanup({...valid,adoption:0,shelters:0,adoptionDone:36,sheltersDone:104});
 assert.equal(s.ready,true);assert.equal(s.remaining,0);
});
test("never delete when identity, partner history, Notion linkage or status is uncertain",()=>{
 for(const key of ["unmapped","unmatchedAdoptions","unexpectedShelters","duplicateSlugs","partnerClaimReferences",
   "unsupportedStatuses","conflictingTombstones","notionTargetMissing"]){
   const result=assessHelpLegacyCleanup({...valid,[key]:1});
   assert.equal(result.ready,false,key);
 }
 assert.equal(assessHelpLegacyCleanup({...valid,adoption:37}).ready,false);
 assert.equal(assessHelpLegacyCleanup({...valid,shelters:103}).ready,false);
 assert.equal(assessHelpLegacyCleanup({...valid,approvedRemoved:9}).ready,false);
 assert.equal(assessHelpLegacyCleanup({...valid,lost:1}).ready,false);
 assert.equal(assessHelpLegacyCleanup({...valid,adoption:undefined}).ready,false);
});
