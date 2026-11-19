#!/usr/bin/env node
/**
 * Owner-only production D1 0174: additive schema, NO backfill or cutover.
 * Never use generic "wrangler d1 migrations apply" on the mixed journal.
 *
 * This script runs on the checked-out, current main commit only.
 * Audit checks existing schema; apply uses exactly one pinned SQL file.
 */
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {BREED_V2_REQUIRED_COLUMNS} from "../lib/breed-sql-v2-backfill.mjs";

const MODE=process.argv[2];
const REPO="investradarsk/psipedia-sk";
const NAME="psipedia-sk-db";
const DB_ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const FILE="0174_breeds_sql_json_foundation.sql";
const PINNED_GIT_BLOB_SHA1="1c2dc546584562be6e0ebde3dc991337dc965980";
const SQL=resolve("drizzle",FILE);
const DIR=resolve(".production-d1-breed-0174");
const CONFIG=resolve(DIR,"wrangler.json");
const REPORT=resolve(DIR,"report.json");
const TABLES=[
  "breed_fci_standard","breed_editorial_text",
  "breed_public_facts","breed_related_breeds",
];
const INDEXES=["breed_related_breeds_target_idx"];
const SEO=[
  "seo_title","seo_description","seo_focus_keyword",
  "seo_canonical_url","seo_og_title","seo_og_description",
  "seo_og_image","seo_noindex",
];
const PRIOR_0173=[
  "directory_profile_qualifications","directory_profile_opening_hours",
  "directory_profile_media","directory_profile_seo",
  "directory_profile_review_state","directory_profile_quality_resolutions",
];
const BASE_JSON=["fci_standard_json","editorial_json","seo_json","related_breeds_json"];
const fail=(ok,code)=>{if(!ok)throw Error("BREED_0174_"+code)};
let phase="start",before=null,recoveryBookmark=null,after=null,writeAttempted=false;

function authorize(){
  fail(MODE==="audit"||MODE==="apply","MODE_INVALID");
  fail(process.env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
    process.env.GITHUB_REPOSITORY===REPO&&
    process.env.GITHUB_REF==="refs/heads/main"&&
    Boolean(process.env.GITHUB_SHA),"MAIN_OWNER_DISPATCH_REQUIRED");
  fail(process.env.BREED_0174_CONFIRMATION===
    (MODE==="audit"?"AUDIT-0174-psipedia-sk-db":"APPLY-0174-psipedia-sk-db"),
    "CONFIRMATION_INVALID");
  const config=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
  fail(config.account_id===ACCOUNT&&
    config.d1?.database_name===NAME&&config.d1?.database_id===DB_ID&&
    config.d1?.binding==="DB"&&
    process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT&&
    Boolean(process.env.CLOUDFLARE_API_TOKEN),"DATABASE_IDENTITY_INVALID");
  const data=readFileSync(SQL);
  const blob=createHash("sha1")
    .update(Buffer.concat([Buffer.from("blob "+data.length+"\0"),data]))
    .digest("hex");
  fail(blob===PINNED_GIT_BLOB_SHA1,"MIGRATION_CONTENT_CHANGED");
  const sql=data.toString("utf8");
  // A schema-only migration must not write or delete any breed values.
  fail(sql.split(/--> statement-breakpoint/g).filter(x=>/\b(?:ALTER TABLE|CREATE TABLE|CREATE INDEX)\b/i.test(x)).length===13,
    "SCHEMA_STATEMENT_COUNT_CHANGED");
  fail(!/^\s*(?:INSERT|DELETE|UPDATE|DROP|REPLACE|TRUNCATE|PRAGMA|VACUUM)\b/im.test(sql),
    "UNSAFE_SQL_OPERATION");
  mkdirSync(DIR,{recursive:true});
  writeFileSync(CONFIG,JSON.stringify({name:"psipedia-breeds-0174-isolated",
    compatibility_date:"2026-11-19",d1_databases:[
      {binding:"DB",database_name:NAME,database_id:DB_ID},
    ]},null,2));
}
function decoded(raw){
  const s=String(raw??"").trim();
  try{return JSON.parse(s)}catch{}
  for(const start of [s.indexOf("["),s.indexOf("{")].filter(i=>i>=0)){
    for(const end of [s.lastIndexOf("]"),s.lastIndexOf("}")].filter(i=>i>start)){
      try{return JSON.parse(s.slice(start,end+1))}catch{}
    }
  }
  throw Error("BREED_0174_WRANGLER_JSON_INVALID");
}
function wrangler(args){
  const p=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["--no-install","wrangler",...args],{encoding:"utf8",maxBuffer:16*1024*1024,
      env:{...process.env,NO_UPDATE_NOTIFIER:"1",WRANGLER_SEND_METRICS:"false"}});
  if(p.error||p.status!==0){
    const message=String(p.stderr??"")+" "+String(p.stdout??"");
    const cause=/already exists|duplicate column/i.test(message)?"SCHEMA_ALREADY_CHANGED":
      /statement too long|maximum statement length/i.test(message)?"D1_SQL_LENGTH":
      /SQLITE|D1_ERROR/i.test(message)?"D1_SQL_ERROR":
      /429|rate.limit/i.test(message)?"CLOUDFLARE_RATE_LIMIT":
      "WRANGLER_FAILED";
    console.error(JSON.stringify({phase:"wrangler-error",category:cause,
      operation:args.includes("--file")?"SCHEMA_WRITE":"READ_OR_BOOKMARK",
      code:p.error?.code??p.status}));
    throw Error("BREED_0174_"+cause);
  }
  return decoded(p.stdout??"");
}
function read(sql){
  fail(/^SELECT\s/i.test(sql)&&!sql.includes(";")&&
    !/\b(?:INSERT|DELETE|UPDATE|DROP|ALTER|REPLACE|ATTACH|VACUUM|PRAGMA)\b/i.test(sql),
    "AUDIT_SELECT_ONLY");
  const batches=wrangler(["d1","execute",NAME,"--remote","--config",CONFIG,
    "--command",sql,"--json"]);
  const all=Array.isArray(batches)?batches:[batches];
  fail(all.length>0&&all.every(r=>r?.success!==false&&Array.isArray(r?.results)),
    "SELECT_FAILED");
  return all.flatMap(x=>x.results);
}
function count(sql){
  const n=Number(read(sql)[0]?.n);
  fail(Number.isSafeInteger(n)&&n>=0,"INVALID_READ_COUNT");
  return n;
}
function inspect(){
  phase="schema-preflight";
  const objects=[...TABLES,...INDEXES,...PRIOR_0173,
    "managed_breeds","breed_notion_controlled_values",
    "breed_notion_workcopy_links"];
  const found=read("SELECT name,type FROM sqlite_master WHERE name IN ("+
    objects.map(x=>"'"+x+"'").join(",")+") ORDER BY name");
  const map=new Map(found.map(x=>[x.name,x.type]));
  fail(map.get("managed_breeds")==="table"&&
    map.get("breed_notion_controlled_values")==="table"&&
    map.get("breed_notion_workcopy_links")==="table","MISSING_BREED_SOURCE");
  fail(PRIOR_0173.every(x=>map.get(x)==="table"),"PRIOR_0173_NOT_INSTALLED");
  const cols=read("SELECT name FROM pragma_table_info('managed_breeds')").map(x=>x.name);
  fail(BASE_JSON.every(x=>cols.includes(x)),"LEGACY_SOURCE_MISSING");
  const seoFound=SEO.filter(x=>cols.includes(x));
  const tablesFound=TABLES.filter(x=>map.get(x)==="table");
  const indexesFound=INDEXES.filter(x=>map.get(x)==="index");
  const present=seoFound.length+tablesFound.length+indexesFound.length;
  const expected=SEO.length+TABLES.length+INDEXES.length;
  fail(present===0||present===expected,"PARTIAL_SCHEMA_STOP");
  const installed=present===expected;
  if(installed){
    for(const [table,fields] of Object.entries(BREED_V2_REQUIRED_COLUMNS)){
      const actual=table==="managed_breeds"?cols:
        read("SELECT name FROM pragma_table_info('"+table+"')").map(x=>x.name);
      fail(fields.every(x=>actual.includes(x)),"SCHEMA_COLUMNS_"+table);
      if(!TABLES.includes(table))continue;
      const fk=read("SELECT \"table\",on_delete FROM pragma_foreign_key_list('"+table+"')");
      fail(fk.some(x=>x.table==="managed_breeds"&&x.on_delete==="CASCADE"),
        "SCHEMA_FK_"+table);
    }
  }
  const breeds=count("SELECT COUNT(*) AS n FROM managed_breeds");
  const links=count("SELECT COUNT(*) AS n FROM breed_notion_workcopy_links WHERE status='ACTIVE'");
  const mirrors=count("SELECT COUNT(*) AS n FROM breed_notion_controlled_values");
  fail(breeds===347&&links===344&&mirrors===344,"BREED_COUNTS_NOT_347_344_344");
  const journal=read("SELECT name FROM d1_migrations ORDER BY id").map(x=>x.name);
  fail(!journal.some(x=>x.startsWith("0174_")),"0174_LEDGER_ALREADY_HAS_ENTRY");
  const oldLengths=read("SELECT "+
    BASE_JSON.map(c=>"COALESCE(SUM(length("+c+")),0) AS "+c).join(",")+
    " FROM managed_breeds")[0];
  fail(count("SELECT COUNT(*) AS n FROM pragma_foreign_key_check")===0,
    "FOREIGN_KEY_VIOLATION");
  const rows=installed?Object.fromEntries(TABLES.map(t=>[
    t,count("SELECT COUNT(*) AS n FROM "+t)])):{};
  return {installed,breeds,links,mirrors,oldLengths,rows,
    journalDigest:createHash("sha256").update(JSON.stringify(journal)).digest("hex")};
}
function timeTravel(){
  phase="recovery";
  const d=wrangler(["d1","time-travel","info",NAME,"--config",CONFIG,"--json"]);
  const find=x=>{
    if(!x||typeof x!=="object")return null;
    if(typeof x.bookmark==="string"&&x.bookmark)return x.bookmark;
    for(const v of Object.values(x)){const b=find(v);if(b)return b}
    return null;
  };
  recoveryBookmark=find(d);
  fail(Boolean(recoveryBookmark),"RECOVERY_BOOKMARK_REQUIRED");
}
function unchanged(a,b){
  fail(a.breeds===b.breeds&&a.links===b.links&&a.mirrors===b.mirrors,
    "COUNTS_CHANGED_DURING_OPERATION");
  fail(JSON.stringify(a.oldLengths)===JSON.stringify(b.oldLengths),
    "SOURCE_LENGTHS_CHANGED");
  fail(a.journalDigest===b.journalDigest,"MIGRATION_LEDGER_CHANGED");
}
function report(state,error=null){
  const payload={state,mode:MODE,commit:process.env.GITHUB_SHA,
    db:NAME,ddlFile:FILE,installedBefore:before?.installed??null,
    installedAfter:after?.installed??null,
    expectedCounts:{breeds:347,notionLinks:344,notionMirrors:344},
    currentCounts:after?{breeds:after.breeds,links:after.links,mirrors:after.mirrors}
      :before?{breeds:before.breeds,links:before.links,mirrors:before.mirrors}:null,
    writeAttempted,
    oldJsonChanged:before&&after
      ?JSON.stringify(before.oldLengths)!==JSON.stringify(after.oldLengths)
      :null,
    backfillExecuted:false,
    notionUpdated:false,publicCutover:false,ledgerWritten:false,
    recoveryAvailable:Boolean(recoveryBookmark),
    ...(error?{error}:{})};
  mkdirSync(DIR,{recursive:true});
  writeFileSync(REPORT,JSON.stringify(payload,null,2)+"\n");
  console.log(JSON.stringify({state,mode:MODE,installedBefore:payload.installedBefore,
    installedAfter:payload.installedAfter,writeAttempted,error}));
}
try{
  authorize();
  before=inspect();
  if(MODE==="audit")report("AUDIT",null);
  else{
    fail(!before.installed,"ALREADY_INSTALLED");
    timeTravel();
    const fresh=inspect();
    unchanged(before,fresh);
    fail(!fresh.installed,"CONCURRENT_SCHEMA_INSTALL");
    phase="schema-apply";
    writeAttempted=true;
    const result=wrangler(["d1","execute",NAME,"--remote","--config",CONFIG,
      "--file",SQL,"--yes","--json"]);
    const blocks=Array.isArray(result)?result:[result];
    fail(blocks.length>0&&blocks.every(x=>x?.success!==false),
      "APPLY_RESULT_NOT_CONFIRMED");
    phase="schema-postflight";
    after=inspect();
    unchanged(before,after);
    fail(after.installed&&TABLES.every(x=>after.rows[x]===0),
      "POSTFLIGHT_SCHEMA_NOT_EMPTY_OR_ABSENT");
    report("POSTFLIGHT",null);
  }
}catch(e){
  const error=e instanceof Error?e.message:"BREED_0174_UNKNOWN";
  console.error(JSON.stringify({phase:"BLOCKED",at:phase,error}));
  // An interrupted schema file can leave partial DDL. Report the actual
  // current state via read-only inspection, never claim no write from CLI status.
  if(writeAttempted&&!after){
    try{after=inspect()}catch{}
  }
  try{report("FAILED",error)}catch{}
  process.exitCode=1;
}
