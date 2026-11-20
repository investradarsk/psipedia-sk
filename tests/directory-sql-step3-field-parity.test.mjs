import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { step2Plan, step2Sql } from "../lib/directory-sql-step2-plan.mjs";
import {
  DIRECTORY_STEP3_FIELD_PARITY_SQL, summarizeDirectoryStep3SqlFieldParity,
} from "../lib/directory-sql-step3-field-parity.mjs";

const sourceId="84e0664c-ca47-405f-9d54-31b20287bc8c";
const pageId="a1111111-2222-3333-4444-555555555555";
const rich=v=>({type:"rich_text",rich_text:[{plain_text:v}]});
const page=(time="2026-11-20T11:00:00Z")=>({
  id:pageId,parent:{data_source_id:sourceId},last_edited_time:time,
  properties:{"Psipedia ID":rich("101"),"Kategória":rich("veterinari"),
    "Odkontrolované":{type:"checkbox",checkbox:false},
    "Zdroj dát":rich("Notion aktuálne"),"Služby":rich("Vyšetrenia") },
});
const profile=(extra={})=>({
  id:101,category:"veterinari",status:"published",slug:"prvy",
  notion_page_id:pageId,updated_at:"2026-11-20T10:00:00Z",
  source_data_json:'{"_psipedia_trainer_breed_ids":[]}',
  services_json:'["Vyšetrenia"]',
  thumbnail_display_json:'{"mode":"crop","x":50,"y":30,"zoom":1.2}',
  detail_display_json:null,
  tombstone:0,partner_active:0,sql_review_locked:0,legacy_review_locked:0,...extra,
});
function fixture(row=profile(),notion=page()) {
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY,updated_at TEXT,status TEXT)");
  const script=readFileSync(new URL(
    "../db/isolated/directory_admin_sql_completion.sql",import.meta.url),"utf8");
  for(const chunk of script.split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean))
    db.exec(chunk);
  db.prepare("INSERT INTO directory_profiles VALUES (?,?,?)")
    .run(row.id,row.updated_at,row.status);
  const plan=step2Plan(row,notion,sourceId);
  assert.equal(plan.ok,true);
  for(const item of step2Sql(plan,"2026-11-20T12:00:00Z","test"))
    db.prepare(item.sql).run(...item.params);
  const query=()=>db.prepare(DIRECTORY_STEP3_FIELD_PARITY_SQL).all(0);
  const result=()=>summarizeDirectoryStep3SqlFieldParity(query(),
    new Map([[row.id,row]]),new Map([[row.id,notion]]),sourceId);
  return {db,row,notion,query,result};
}
test("real SQL sidecar rows and signed Notion fields are compared without value disclosure",()=>{
 const {db,result}=fixture();
 try {
  const report=result();
  assert.equal(report.activeProfilesChecked,1);
  assert.equal(report.comparableCurrentD1,1);
  assert.equal(report.exactFieldMatches,1);
  assert.equal(report.needsReview,0);
  assert.equal(report.safeToMarkVerified,false);
  assert.equal(report.safeToSwitchRuntime,false);
  assert(!JSON.stringify(report).includes("Notion aktuálne"));
 } finally {db.close();}
});
test("fresh D1 revision mismatch flags stale STAGED snapshot without inferring a current mismatch",()=>{
 const {db,row,query}=fixture();
 try{
  row.updated_at="2026-11-20T20:00:00Z";
  const r=summarizeDirectoryStep3SqlFieldParity(query(),new Map([[101,row]]),
    new Map([[101,page()]]),sourceId);
  assert.deepEqual(r.issues.counts,{d1_revision_changed:1});
  assert.equal(r.comparableCurrentD1,0);
 } finally{db.close();}
});
test("SQL service mismatch is reported with IDs only and signed Notion change blocks extras comparison",()=>{
 const {db,row,query}=fixture();
 try{
  db.prepare("UPDATE directory_profile_service_texts SET service_text='Chyba' WHERE profile_id=101").run();
  const r=summarizeDirectoryStep3SqlFieldParity(query(),new Map([[101,row]]),
    new Map([[101,page("2026-11-20T21:00:00Z")]]),sourceId);
  assert.equal(r.issues.counts.service_sql_value_mismatch,1);
  assert.equal(r.issues.counts.notion_fields_not_comparable,1);
  assert.equal(r.issues.counts.notion_revision_changed,1);
  assert(!JSON.stringify(r).includes("Chyba"));
 }finally{db.close();}
});
test("invalid historical thumbnail is a review issue, not a reason to destroy SQL data",()=>{
 const row=profile({thumbnail_display_json:"{not valid"});
 const {db,result}=fixture(row);
 try{
   const r=result();
   assert.equal(r.issues.counts.invalid_legacy_thumbnail_display,1);
   assert.equal(r.exactFieldMatches,0);
 }finally{db.close();}
});
test("missing and protected receipts are never counted as verified",()=>{
 const {db,row,query}=fixture();
 try{
   db.exec("DELETE FROM directory_profile_sql_cutover_state WHERE profile_id=101");
   const r=summarizeDirectoryStep3SqlFieldParity(query(),new Map([[101,row]]),
     new Map([[101,page()]]),sourceId);
   assert.equal(r.issues.counts.missing_sql_receipt,1);
   assert.equal(r.comparableCurrentD1,0);
 }finally{db.close();}
});
test("auditor is connected to the owner-gated read-only step3 audit",()=>{
 const source=readFileSync(new URL(
   "../scripts/production-directory-onetime-notion-import.mjs",import.meta.url),"utf8");
 assert.match(source,/scanStep3SqlFields\(/);
 assert.match(source,/summarizeDirectoryStep3SqlFieldParity\(/);
 assert.match(source,/report\("STEP3_AUDIT_ONLY",\{readiness,currentSourceIssues,sqlFieldParity,/);
});

test("encoded JSON null display is a default and SQL parity matches empty sidecars",()=>{
 const row=profile({thumbnail_display_json:"null",detail_display_json:" null "});
 const {db,result}=fixture(row);
 try {
  const r=result();
  assert.equal(r.exactFieldMatches,1);
  assert.equal(r.needsReview,0);
  assert.equal(r.legacyDisplayStorage.thumbnail.json_null,1);
  assert.equal(r.legacyDisplayStorage.detail.json_null,1);
  assert.equal(r.issues.counts.invalid_legacy_thumbnail_display,undefined);
  assert.equal(r.issues.counts.invalid_legacy_detail_display,undefined);
 }finally{db.close();}
});
test("display storage diagnostics separate real corruption without disclosing raw values",()=>{
 const row=profile({thumbnail_display_json:"{broken",detail_display_json:"null"});
 const {db,result}=fixture(row);
 try {
  const r=result();
  assert.equal(r.legacyDisplayStorage.thumbnail.invalid,1);
  assert.equal(r.legacyDisplayStorage.detail.json_null,1);
  assert.equal(r.issues.counts.invalid_legacy_thumbnail_display,1);
  assert(!JSON.stringify(r).includes("{broken"));
 }finally{db.close();}
});
