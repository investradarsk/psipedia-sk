#!/usr/bin/env node
/** Exactly one owner-dispatched, schema-only Directory 0173 operation. No generic migration replay. */
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const MODE=process.argv[2]||"";
const REPO="investradarsk/psipedia-sk";
const DATABASE="psipedia-sk-db";
const DATABASE_ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const MIGRATION="0173_directory_structured_sql_foundation.sql";
const SQL_BLOB="b1369a0de7d4e841d226e9452b22d3edeff514d0";
const OUT=resolve(".production-d1-directory-0173");
const CONFIG=resolve(OUT,"wrangler.json");
const SQL=resolve("drizzle",MIGRATION);
const REPORT=resolve(OUT,"report.json");
const TABLES=[
 "directory_profile_qualifications","directory_profile_opening_hours",
 "directory_profile_media","directory_profile_seo",
 "directory_profile_review_state","directory_profile_quality_resolutions",
];
const INDEXES=[
 "directory_profile_qualifications_profile_idx","directory_profile_opening_hours_profile_idx",
 "directory_profile_media_profile_idx","directory_profile_review_state_locked_idx",
 "directory_profile_quality_resolutions_checked_idx",
];
const OLD_TABLES=[
 "directory_profiles","directory_profile_additional_categories",
 "directory_profile_public_facts","directory_profile_filter_values",
 "partner_memberships","partner_help_claims",
];
const PRIOR_OBJECTS=[
 "partner_memberships_one_active_resource",
 "partner_memberships_only_owner_insert","partner_memberships_only_owner_update",
 "partner_help_claims_account_history","partner_help_claims_status_created",
 "partner_help_claims_adoption_manager","partner_help_claims_report_manager",
 "partner_help_claims_case_manager","partner_help_claims_adoption_pending",
 "partner_help_claims_report_pending","partner_help_claims_case_pending",
];
const fail=(ok,code)=>{if(!ok)throw Error("DIRECTORY_0173_"+code)};
const digest=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
let phase="START",before=null,hasRecovery=false;

function authorize(){
 fail(MODE==="audit"||MODE==="apply","MODE");
 fail(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
 fail(process.env.GITHUB_REPOSITORY===REPO,"WRONG_REPOSITORY");
 fail(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
 fail(Boolean(process.env.GITHUB_SHA)&&Boolean(process.env.CLOUDFLARE_API_TOKEN),"AUTH");
 fail(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT,"ACCOUNT");
 fail(process.env.DIRECTORY_0173_CONFIRMATION===
  (MODE==="audit"?"AUDIT-0173-psipedia-sk-db":"APPLY-0173-psipedia-sk-db"),"CONFIRMATION");
 const resources=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
 fail(resources.account_id===ACCOUNT&&resources.d1?.database_name===DATABASE&&
  resources.d1?.database_id===DATABASE_ID&&resources.d1?.binding==="DB","WRONG_D1");
 const bytes=readFileSync(SQL);
 const blob=createHash("sha1").update(Buffer.concat([Buffer.from("blob "+bytes.length+"\0"),bytes])).digest("hex");
 fail(blob===SQL_BLOB,"PINNED_SQL_CHANGED");
 mkdirSync(OUT,{recursive:true});
 // Deliberately no migrations_dir, so the generic migration runner cannot replay older migrations.
 writeFileSync(CONFIG,JSON.stringify({name:"psipedia-directory-0173-isolated",
  compatibility_date:"2026-11-19",d1_databases:[
   {binding:"DB",database_name:DATABASE,database_id:DATABASE_ID}]},null,2));
}

function decode(raw){
 const s=raw.trim();
 try{return JSON.parse(s)}catch{}
 for(const a of [s.indexOf("["),s.indexOf("{")].filter(n=>n>=0)){
  for(const b of [s.lastIndexOf("]"),s.lastIndexOf("}")].filter(n=>n>a)){
   try{return JSON.parse(s.slice(a,b+1))}catch{}
  }
 }
 throw Error("DIRECTORY_0173_BAD_WRANGLER_JSON");
}
function wrangler(args){
 const proc=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
  ["--no-install","wrangler",...args],{encoding:"utf8",maxBuffer:10*1024*1024,
   env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"}});
 fail(!proc.error&&proc.status===0,"WRANGLER_FAILED");
 return proc.stdout||"";
}
function read(sql){
 fail(/^SELECT\s/i.test(sql)&&!sql.includes(";")&&!/\b(?:UPDATE|DELETE|INSERT|ALTER|CREATE|DROP|REPLACE|ATTACH)\b/i.test(sql),"SELECT_ONLY");
 const data=decode(wrangler(["d1","execute",DATABASE,"--remote","--config",CONFIG,"--command",sql,"--json"]));
 const pages=Array.isArray(data)?data:[data];
 fail(pages.length>0&&pages.every(page=>page.success!==false&&Array.isArray(page.results)),"REMOTE_READ");
 return pages.flatMap(page=>page.results);
}
function count(sql){
 const n=Number(read(sql)[0]?.n);
 fail(Number.isSafeInteger(n)&&n>=0,"INVALID_COUNT");
 return n;
}
function state(){
 const names=[...OLD_TABLES,...PRIOR_OBJECTS,...TABLES,...INDEXES];
 const rows=read("SELECT name,type,sql FROM sqlite_master WHERE name IN ("+
  names.map(n=>"'"+n+"'").join(",")+") ORDER BY name");
 const seen=new Map(rows.map(row=>[row.name,row]));
 fail(OLD_TABLES.every(name=>seen.get(name)?.type==="table"),"MISSING_BASE_TABLE");
 const oldExpected={partner_memberships_one_active_resource:"index",
  partner_memberships_only_owner_insert:"trigger",partner_memberships_only_owner_update:"trigger"};
 fail(Object.entries(oldExpected).every(([name,type])=>seen.get(name)?.type===type),"MISSING_0171");
 fail(PRIOR_OBJECTS.slice(3).every(name=>seen.get(name)?.type==="index"),"MISSING_0172");
 const cols=read("SELECT name FROM pragma_table_info('directory_profiles')").map(x=>x.name);
 fail(["public_phone","public_email","facebook_url","instagram_url"].every(c=>cols.includes(c)),"MISSING_0170");
 const existing=[...TABLES,...INDEXES].filter(name=>seen.has(name));
 fail(existing.length===0||existing.length===TABLES.length+INDEXES.length,"PARTIAL_SCHEMA_STOP");
 const installed=existing.length===TABLES.length+INDEXES.length;
 if(installed){
  fail(TABLES.every(name=>seen.get(name)?.type==="table")&&
   INDEXES.every(name=>seen.get(name)?.type==="index"),"OBJECT_TYPE");
  for(const name of TABLES){
   const fks=read("SELECT \"table\",on_delete FROM pragma_foreign_key_list('"+name+"')");
   fail(fks.some(x=>x.table==="directory_profiles"&&x.on_delete==="CASCADE"),"INVALID_FK_"+name);
  }
 }
 fail(count("SELECT COUNT(*) AS n FROM pragma_foreign_key_check")===0,"FK_VIOLATION");
 const history=read("SELECT name FROM d1_migrations ORDER BY id").map(x=>x.name);
 fail(!history.some(name=>name.startsWith("0173_")),"LEDGER_ALREADY_APPLIED");
 const counts=Object.fromEntries(OLD_TABLES.map(t=>[t,count("SELECT COUNT(*) AS n FROM "+t)]));
 const json=read("SELECT "+
  "COALESCE(SUM(length(source_data_json)),0) AS source_data_json,"+
  "COALESCE(SUM(length(services_json)),0) AS services_json,"+
  "COALESCE(SUM(length(qualifications_json)),0) AS qualifications_json,"+
  "COALESCE(SUM(length(seo_json)),0) AS seo_json FROM directory_profiles")[0];
 fail(Boolean(json),"LEGACY_AGGREGATES");
 const newCounts=installed?Object.fromEntries(TABLES.map(t=>[t,count("SELECT COUNT(*) AS n FROM "+t)])):{};
 return{installed,counts,json,ledgerHash:digest(history),
  oldSchemaHash:digest(rows.filter(r=>OLD_TABLES.includes(r.name)||PRIOR_OBJECTS.includes(r.name))),
  newCounts};
}
function stable(a,b){
 fail(a.ledgerHash===b.ledgerHash,"LEDGER_CHANGED");
 fail(a.oldSchemaHash===b.oldSchemaHash,"BASE_SCHEMA_CHANGED");
 fail(digest(a.counts)===digest(b.counts),"BASE_COUNTS_CHANGED");
 fail(digest(a.json)===digest(b.json),"LEGACY_DATA_CHANGED");
}
function timeTravel(){
 const data=decode(wrangler(["d1","time-travel","info",DATABASE,"--config",CONFIG,"--json"]));
 function bookmark(x){
  if(!x||typeof x!=="object")return null;
  if(typeof x.bookmark==="string"&&x.bookmark)return x.bookmark;
  for(const val of Object.values(x)){const y=bookmark(val);if(y)return y}
  return null;
 }
 fail(Boolean(bookmark(data)),"NO_RECOVERY_POINT");
 // Intentionally do not publish the recovery bookmark in a public repository artifact.
 hasRecovery=true;
}
function report(status,s,applied=false,error=null){
 phase=status;
 const summary={status,mode:MODE,commit:process.env.GITHUB_SHA,migration:MIGRATION,
  database:DATABASE,installed:s?.installed??null,oldCounts:s?.counts??null,
  newCounts:s?.newCounts??null,recoveryAvailable:hasRecovery,applied,
  migrationLedgerWritten:false,legacyDataBackfilled:false,...(error?{error}:{})};
 mkdirSync(OUT,{recursive:true});
 writeFileSync(REPORT,JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify({status,mode:MODE,installed:summary.installed,applied,error}));
}
try{
 authorize();
 before=state();
 if(MODE==="audit")report("AUDIT",before);
 else{
  fail(!before.installed,"ALREADY_INSTALLED");
  timeTravel();
  const fresh=state();stable(before,fresh);
  fail(!fresh.installed,"CONCURRENT_APPLY");
  report("RECOVERY_CHECKED",fresh);
  wrangler(["d1","execute",DATABASE,"--remote","--config",CONFIG,"--file",SQL,"--yes","--json"]);
  const after=state();stable(before,after);
  fail(after.installed&&TABLES.every(t=>after.newCounts[t]===0),"POSTFLIGHT");
  report("POSTFLIGHT",after,true);
 }
}catch(error){
 const code=error instanceof Error?error.message:"DIRECTORY_0173_UNKNOWN";
 console.error(JSON.stringify({phase,error:code}));
 try{report("FAILED",before,false,code)}catch{}
 process.exitCode=1;
}
