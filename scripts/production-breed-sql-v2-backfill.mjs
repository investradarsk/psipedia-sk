#!/usr/bin/env node
/**
 * Owner-only, fail-closed breeds v2 SQL backfill (step 5/6).
 *
 * AUDIT: SELECT-only production diagnostics. APPLY: after protected owner
 * dispatch and recovery bookmark, copy 347 old D1 JSON profiles and 344
 * synced Notion-controlled mirror profiles into the new 0174 SQL slots.
 *
 * NO generic migration replay, no schema changes, no DELETE, no legacy JSON
 * edits, no Notion PATCH, no publishing or public-read cutover.
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {
  BREED_V2_REQUIRED_TABLES,BREED_V2_REQUIRED_COLUMNS,
  BREED_V2_PREFLIGHT_SQL,BREED_V2_POSTFLIGHT_SQL,
  BREED_V2_BACKFILL_STATEMENTS,
  assertBreedSqlV2BackfillPreflight,
  assertBreedSqlV2BackfillPostflight,
} from "../lib/breed-sql-v2-backfill.mjs";

const MODE=process.argv[2];
const DB_NAME="psipedia-sk-db";
const TARGET=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
const DB_ID=TARGET.d1?.database_id;
const DIR=resolve(".production-breed-v2-backfill");
const CONFIG=resolve(DIR,"wrangler.json");
const REPORT=resolve(DIR,"report.json");
const must=(x,code)=>{if(!x)throw Error("BREED_V2_"+code)};
let stage="start",bookmark=null,applied=0,snapshot=null;

function authorize(){
  must(MODE==="audit"||MODE==="apply","INVALID_MODE");
  must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
    process.env.GITHUB_REF==="refs/heads/main"&&
    process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk",
    "OWNER_MAIN_DISPATCH_ONLY");
  must(process.env.CLOUDFLARE_ACCOUNT_ID===TARGET.account_id&&
    DB_NAME===TARGET.d1?.database_name&&
    DB_ID===TARGET.d1?.database_id&&TARGET.d1?.binding==="DB"&&
    Boolean(process.env.CLOUDFLARE_API_TOKEN),"D1_TARGET_OR_TOKEN_INVALID");
  must(process.env.BREED_V2_CONFIRMATION===
    (MODE==="audit"?"AUDIT-BREEDS-V2-344-347":"APPLY-BREEDS-V2-344-347"),
    "EXPLICIT_CONFIRMATION_REQUIRED");
  must(BREED_V2_BACKFILL_STATEMENTS.length===5,"BACKFILL_COUNT_CHANGED");
  must(BREED_V2_BACKFILL_STATEMENTS.every(s=>
    /^(?:INSERT OR IGNORE INTO|UPDATE managed_breeds SET)/i.test(s.trim())&&
    !/\b(?:DELETE|DROP|ALTER|REPLACE|CREATE TRIGGER|ATTACH|VACUUM|PRAGMA)\b/i.test(
      s.replace(/^\s*--.*$/gm,""))),"UNEXPECTED_WRITE_SQL");
  mkdirSync(DIR,{recursive:true});
  writeFileSync(CONFIG,JSON.stringify({
    name:"psipedia-breeds-v2-owner-only-backfill",
    compatibility_date:"2026-11-19",
    d1_databases:[{binding:"DB",database_name:DB_NAME,database_id:DB_ID}],
  },null,2));
}

function parse(raw){
  const text=raw.trim();
  try{return JSON.parse(text)}catch{}
  for(const i of [text.indexOf("["),text.indexOf("{")].filter(x=>x>=0)){
    for(const j of [text.lastIndexOf("]"),text.lastIndexOf("}")].filter(x=>x>i)){
      try{return JSON.parse(text.slice(i,j+1))}catch{}
    }
  }
  throw Error("BREED_V2_INVALID_WRANGLER_JSON");
}
function wrangler(args){
  const result=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["--no-install","wrangler",...args],{
      encoding:"utf8",maxBuffer:16*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
    });
  must(!result.error&&result.status===0,"REMOTE_WRANGLER_FAILED");
  return parse(result.stdout||"");
}
function sqlExec(query,readOnly=true){
  if(readOnly){
    must(/^\s*SELECT\b/i.test(query)&&!query.includes(";")&&
      !/\b(?:DELETE|DROP|ALTER|INSERT|UPDATE|REPLACE|ATTACH|PRAGMA|VACUUM)\b/i.test(query),
      "SELECT_ONLY_REQUIRED");
  }else{
    must(MODE==="apply"&&BREED_V2_BACKFILL_STATEMENTS.includes(query),
      "UNAUTHORIZED_WRITE");
  }
  const raw=wrangler(["d1","execute",DB_NAME,"--remote","--config",CONFIG,
    "--command",query,"--json"]);
  const pages=Array.isArray(raw)?raw:[raw];
  must(pages.length>0&&pages.every(x=>x?.success!==false&&
    Array.isArray(x?.results)),"REMOTE_EXECUTION_FAILED");
  return pages.flatMap(x=>x.results);
}
function row(key){
  const records=sqlExec(BREED_V2_PREFLIGHT_SQL[key]);
  must(records.length===1,"INVALID_AGGREGATE_"+key);
  return records[0];
}
function state(){
  stage="preflight";
  const tables=sqlExec("SELECT name,type FROM sqlite_master WHERE type='table' ORDER BY name");
  for(const name of BREED_V2_REQUIRED_TABLES)
    must(tables.some(x=>x.name===name&&x.type==="table"),"MISSING_TABLE_"+name);
  const schema={};
  for(const table of Object.keys(BREED_V2_REQUIRED_COLUMNS)){
    const columns=sqlExec("SELECT name FROM pragma_table_info('"+table+"') ORDER BY cid");
    schema[table]=columns.map(x=>x.name);
  }
  const input={schema};
  for(const key of Object.keys(BREED_V2_PREFLIGHT_SQL))
    input[key]=key==="extras"?sqlExec(BREED_V2_PREFLIGHT_SQL[key]):row(key);
  const decision=assertBreedSqlV2BackfillPreflight(input);
  return {...decision,controlledPending:Number(input.controlled.pending_sync)};
}
function recovery(){
  stage="recovery-bookmark";
  const data=wrangler(["d1","time-travel","info",DB_NAME,"--config",CONFIG,"--json"]);
  const find=o=>{
    if(!o||typeof o!=="object")return null;
    if(typeof o.bookmark==="string"&&o.bookmark.trim())return o.bookmark;
    for(const value of Object.values(o)){
      const result=find(value);
      if(result)return result;
    }
    return null;
  };
  const found=find(data);
  must(found,"RECOVERY_BOOKMARK_REQUIRED");
  bookmark=found;
}
function postflight(){
  stage="postflight";
  const state={
    base:row("base"),links:row("links"),controlled:row("controlled"),
    counts:row("destination"),
    post:Object.fromEntries(Object.entries(BREED_V2_POSTFLIGHT_SQL).map(([key,query])=>[
      key,sqlExec(query)[0]?.mismatches,
    ])),
  };
  return assertBreedSqlV2BackfillPostflight(state);
}
function report(phase,error=null){
  const output={
    phase,mode:MODE,sourceCommit:process.env.GITHUB_SHA,
    expectedDatabase:DB_NAME,expectedDbId:DB_ID,
    sourceSqlDigest:createHash("sha256")
      .update(BREED_V2_BACKFILL_STATEMENTS.join("\n")).digest("hex"),
    preflight:snapshot,appliedStatements:applied,
    recoveryBookmark:bookmark,
    postflight:phase==="postflight-success"?postResult:null,
    publicCutover:false,notionPatched:false,
    legacyJsonDeleted:false,migrationLedgerWritten:false,
    ...(error?{error}:{}),
  };
  writeFileSync(REPORT,JSON.stringify(output,null,2)+"\n");
  console.log(JSON.stringify({phase,mode:MODE,
    appliedStatements:applied,publicCutover:false,
    ...(error?{error}:{})}));
}
let postResult=null;
try{
  authorize();
  snapshot=state();
  if(MODE==="audit"){
    report("audit-ready");
  }else{
    // The protected production workflow must not run during ongoing
    // Admin/Notion writes. Recheck after recording a D1 time-travel point.
    recovery();
    state();
    stage="apply";
    for(const statement of BREED_V2_BACKFILL_STATEMENTS){
      sqlExec(statement,false);
      applied++;
    }
    postResult=postflight();
    report("postflight-success");
  }
}catch(error){
  const code=error instanceof Error?error.message:"BREED_V2_UNKNOWN";
  console.error(JSON.stringify({phase:"blocked",stage,code}));
  try{if(snapshot)report("blocked",code)}catch{}
  process.exitCode=1;
}
