import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 recoverableDirectoryBaselineError,directoryServiceErrorCanReplace,
 directoryServiceSuccessCanClear,directoryEditorialEventMayClearError,
} from "../lib/directory-sync-recovery-policy.ts";
import {classifyDirectorySyncError} from "../lib/notion-data-quality-recovery.ts";
import {summarizeNotionAuditBatch} from "../lib/notion-data-quality-audit.ts";

const legacy="CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (*:BASELINE_UNAVAILABLE)";
test("only isolated old missing-baseline markers qualify for equality-only receipt repair",()=>{
 assert.equal(recoverableDirectoryBaselineError("Chyba",legacy),true);
 assert.equal(recoverableDirectoryBaselineError("Synchronizované",legacy),false);
 assert.equal(recoverableDirectoryBaselineError("Chyba",""),false);
 assert.equal(recoverableDirectoryBaselineError("Chyba",
  "CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (name:BASELINE_UNAVAILABLE, description:AMBIGUOUS_SAME_FIELD)"),false);
 assert.equal(recoverableDirectoryBaselineError("Chyba",
  "CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (name:BASELINE_UNAVAILABLE, website:UNVERIFIED_DELETE)"),false);
 assert.equal(recoverableDirectoryBaselineError("Chyba",
  "CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (name:BASELINE_UNAVAILABLE, slug:PROTECTED_FIELD)"),false);
 assert.equal(recoverableDirectoryBaselineError("Chyba",
  "SERVICES_RELATION_UNVERIFIED_DELETE"),false);
 assert.equal(recoverableDirectoryBaselineError("Chyba",
  "CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (name:BASELINE_UNAVAILABLE)"),true);
});
test("relation error cannot replace an independent editorial error",()=>{
 const relation="SERVICES_RELATION_UNVERIFIED_DELETE";
 assert.equal(directoryServiceErrorCanReplace(legacy,relation),false);
 assert.equal(directoryServiceErrorCanReplace("",relation),true);
 assert.equal(directoryServiceErrorCanReplace(relation,"SERVICES_RELATION_INCOMPLETE"),true);
 assert.equal(directoryServiceErrorCanReplace("DIRECTORY_SERVICES_RELATION_SCHEMA_MISSING",relation),true);
 assert.equal(directoryServiceErrorCanReplace(relation,"CONFLICT: DIFFERENT_FIELD"),true);
 assert.equal(directoryServiceSuccessCanClear(legacy),false);
 assert.equal(directoryServiceSuccessCanClear(""),true);
 assert.equal(directoryServiceSuccessCanClear(relation),true);
});
test("audit can distinguish actionable historical errors without leaking contents",()=>{
 assert.equal(classifyDirectorySyncError(legacy),"MISSING_VERIFIED_BASELINE");
 assert.equal(classifyDirectorySyncError("services:UNVERIFIED_DELETE"),"SERVICE_RELATION_UNVERIFIED_DELETE");
 assert.equal(classifyDirectorySyncError("SERVICES_RELATION_UNVERIFIED_DELETE"),"SERVICE_RELATION_UNVERIFIED_DELETE");
 assert.equal(classifyDirectorySyncError("SERVICES_RELATION_CATALOG_NOT_YET_MIRRORED"),"SERVICE_RELATION_SYNC_ERROR");
 assert.equal(classifyDirectorySyncError("CONFLICT: AMBIGUOUS_SAME_FIELD"),"BIDIRECTIONAL_CONFLICT");
 const rich=t=>({rich_text:[{plain_text:t}]});
 const pages=[
  {id:"test-page-baseline",properties:{"Psipedia ID":rich("43"),
   "Sync stav":{select:{name:"Chyba"}},"Sync chyba":rich(legacy)}},
  {id:"test-page-rel",properties:{"Psipedia ID":rich("44"),
   "Sync stav":{select:{name:"Chyba"}},"Sync chyba":rich("services:UNVERIFIED_DELETE")}},
  {id:"test-page-catalog",properties:{"Psipedia ID":rich("45"),
   "Sync stav":{select:{name:"Chyba"}},"Sync chyba":rich("SERVICES_RELATION_CATALOG_NOT_YET_MIRRORED")}},
 ];
 const summary=summarizeNotionAuditBatch("directory",pages);
 assert.equal(summary.syncErrors,3);
 assert.equal(summary.conflictErrors,2);
 assert.equal(summary.errorTypes.MISSING_VERIFIED_BASELINE,1);
 assert.equal(summary.errorTypes.SERVICE_RELATION_UNVERIFIED_DELETE,1);
 assert.equal(summary.errorTypes.SERVICE_RELATION_SYNC_ERROR,1);
 assert.deepEqual(summary.reviewItems.map(x=>x.nextStep),[
   "REVIEW_FIELDS","REVIEW_FIELDS","VALIDATE_SOURCE",
 ]);
 assert.ok(!JSON.stringify(summary).includes(legacy));
});
test("Directory recovery is current-snapshot and identity gated, never record-wide blind write",()=>{
 const src=readFileSync(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
 const at=src.indexOf("async function recoverEqualLegacyDirectoryBaseline(");
 const end=src.indexOf("async function syncMappedPage(",at);
 assert.ok(at>0&&end>at);
 const section=src.slice(at,end);
 assert.match(section,/recoverableDirectoryBaselineError/);
 assert.match(section,/propertyText\(page,"Psipedia ID"\)!==String\(profile\.id\)/);
 assert.match(section,/notionDirectoryPageBelongsToSource/);
 assert.match(section,/canonical!==await snapshotHash\(notionSnapshot\(page\)\)/);
 assert.match(section,/canonical!==await snapshotHash\(notionSnapshot\(latest\)\)/);
 assert.match(section,/current\.updatedAt!==profile\.updatedAt/);
 assert.match(section,/writeProfileToNotion/);
 assert.doesNotMatch(section,/applyNotionToProfile|INSERT INTO directory_profiles|DELETE FROM/);
 const sweep=src.slice(src.indexOf("export async function runNotionDirectorySyncSweep"));
 assert.match(sweep,/await recoverEqualLegacyDirectoryBaseline\(\{/);
 assert.match(sweep,/directoryServiceSuccessCanClear\(propertyText\(page,"Sync chyba"\)\)/);
 assert.match(src,/directoryServiceErrorCanReplace\(propertyText\(page,"Sync chyba"\),message\)/);
});

test("a verified Popis edit cannot erase Tarabora's separate legacy services conflict",()=>{
 const err="CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (services:UNVERIFIED_DELETE)";
 assert.equal(directoryEditorialEventMayClearError(err,["description"]),false);
 assert.equal(directoryEditorialEventMayClearError(err,["services"]),true);
 assert.equal(directoryEditorialEventMayClearError(err,["description","services"]),true);
 assert.equal(directoryEditorialEventMayClearError(err,[]),false);
 assert.equal(directoryEditorialEventMayClearError("",["description"]),true);
 assert.equal(directoryEditorialEventMayClearError(
  "CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (description:AMBIGUOUS_SAME_FIELD)",["description"]),true);
 assert.equal(directoryEditorialEventMayClearError(
  "CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (description:AMBIGUOUS_SAME_FIELD, services:UNVERIFIED_DELETE)",["description"]),false);
 assert.equal(directoryEditorialEventMayClearError(
  "CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (*:BASELINE_UNAVAILABLE)",["description"]),false);
 assert.equal(directoryEditorialEventMayClearError(
  "SERVICES_RELATION_UNVERIFIED_DELETE",["services"]),false);
 assert.equal(directoryEditorialEventMayClearError(
  "IDENTITY_CONFLICT: WRONG_SOURCE",["name"]),false);
});
