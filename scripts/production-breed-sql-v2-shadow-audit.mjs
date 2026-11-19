#!/usr/bin/env node
/**
 * Plemená 3/6 post-backfill production audit. SELECT-only, no Cloudflare or
 * Notion writes, no schema migrations. Performs verification AFTER 0174 APPLY.
 */
import {spawnSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {
  BREED_V2_PREFLIGHT_SQL,BREED_V2_POSTFLIGHT_SQL,
} from "../lib/breed-sql-v2-backfill.mjs";
import {BREED_SQL_V2_CUTOVER_AUDIT_SQL} from "../lib/breed-sql-v2-cutover-gate.mjs";
import {assessBreedSqlV2ShadowReadiness}
  from "../lib/breed-sql-v2-shadow-readiness.mjs";

const TARGET=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
const DIR=resolve(".production-breed-v2-shadow-audit");
const CONFIG=resolve(DIR,"wrangler.json");
const REPORT=resolve(DIR,"report.json");
const MODE="audit";
const DB_NAME="psipedia-sk-db";
const must=(yes,code)=>{if(!yes)throw Error("BREED_V2_SHADOW_"+code)};
let stage="authorization",result=null;
function authorize(){
  must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
    process.env.GITHUB_REF==="refs/heads/main"&&
    process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk",
    "OWNER_MAIN_DISPATCH_ONLY");
  must(process.env.BREED_V2_SHADOW_CONFIRMATION===
    "AUDIT-BREEDS-V2-SHADOW-347","CONFIRMATION_REQUIRED");
  must(process.env.CLOUDFLARE_ACCOUNT_ID===TARGET.account_id&&
    TARGET.d1?.database_name===DB_NAME&&TARGET.d1?.binding==="DB"&&
    typeof TARGET.d1?.database_id==="string"&&
    Boolean(process.env.CLOUDFLARE_API_TOKEN),"TARGET_OR_TOKEN_INVALID");
  const worker=readFileSync("wrangler.jsonc","utf8");
  // Valid after rollout as well: do not confuse a safe shadow write
  // deployment with permission to switch public readers or delete JSON.
  must(/"BREED_SQL_V2_WRITE_MODE"\s*:\s*"(?:off|shadow)"/.test(worker),
    "WORKER_SHADOW_MODE_INVALID");
  mkdirSync(DIR,{recursive:true});
  writeFileSync(CONFIG,JSON.stringify({
    name:"psipedia-breed-sql-v2-shadow-readonly-audit",
    compatibility_date:"2026-11-19",
    d1_databases:[{
      binding:"DB",database_name:DB_NAME,database_id:TARGET.d1.database_id,
    }],
  },null,2));
}
function parse(raw){
  const data=raw.trim();
  try{return JSON.parse(data)}catch{}
  for(const i of [data.indexOf("["),data.indexOf("{")].filter(i=>i>=0)){
    for(const j of [data.lastIndexOf("]"),data.lastIndexOf("}")].filter(j=>j>i)){
      try{return JSON.parse(data.slice(i,j+1))}catch{}
    }
  }
  throw Error("BREED_V2_SHADOW_INVALID_WRANGLER_OUTPUT");
}
function query(sql){
  must(/^\s*SELECT\b/i.test(sql)&&!sql.includes(";")&&
    !/\b(?:DELETE|DROP|ALTER|INSERT|UPDATE|REPLACE|ATTACH|PRAGMA|VACUUM|CREATE)\b/i.test(sql),
    "SELECT_ONLY");
  const exec=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["--no-install","wrangler","d1","execute",DB_NAME,"--remote",
      "--config",CONFIG,"--command",sql,"--json"],{
      encoding:"utf8",maxBuffer:16*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
    });
  must(!exec.error&&exec.status===0,"REMOTE_WRANGLER_FAILED");
  const raw=parse(exec.stdout||"");
  const pages=Array.isArray(raw)?raw:[raw];
  must(pages.length>0&&pages.every(item=>item?.success!==false&&
    Array.isArray(item?.results)),"REMOTE_EXECUTION_FAILED");
  return pages.flatMap(item=>item.results);
}
function one(sql,key){
  const rows=query(sql);
  must(rows.length===1,"ONE_ROW_REQUIRED_"+key);
  return rows[0];
}
function run(){
  stage="read-only";
  const result={
    base:one(BREED_V2_PREFLIGHT_SQL.base,"base"),
    links:one(BREED_V2_PREFLIGHT_SQL.links,"links"),
    controlled:one(BREED_V2_PREFLIGHT_SQL.controlled,"controlled"),
    orphanControlled:one(BREED_V2_PREFLIGHT_SQL.orphanControlled,"orphanControlled"),
    destination:one(BREED_V2_PREFLIGHT_SQL.destination,"destination"),
    extras:query(BREED_V2_PREFLIGHT_SQL.extras),
    foreignKeys:one(`SELECT COUNT(*) AS violations
      FROM pragma_foreign_key_check WHERE "table" IN
      ('breed_fci_standard','breed_editorial_text','breed_public_facts','breed_related_breeds')`,
      "foreignKeys"),
    scalarParity:one(BREED_SQL_V2_CUTOVER_AUDIT_SQL.scalarParity,"scalarParity"),
    post:{},
  };
  for(const [key,sql] of Object.entries(BREED_V2_POSTFLIGHT_SQL)){
    result.post[key]=one(sql,key).mismatches;
  }
  return assessBreedSqlV2ShadowReadiness(result);
}
try{
  authorize();
  result=run();
  stage="report";
  writeFileSync(REPORT,JSON.stringify({
    status:result.ready?"READY_FOR_GATED_ACTIVATION":"BLOCKED",
    commit:process.env.GITHUB_SHA,
    ...result,
  },null,2)+"\n");
  console.log(JSON.stringify({
    status:result.ready?"READY_FOR_GATED_ACTIVATION":"BLOCKED",
    inspected:result.inspected,blockers:result.blockers,
    writesAttempted:false,liveNotionPageChecked:false,
  }));
  must(result.ready,"PARITY_NOT_READY");
}catch(error){
  const code=error instanceof Error?error.message:"UNKNOWN";
  console.error(JSON.stringify({status:"BLOCKED",stage,code,
    blockers:result?.blockers??[]}));
  process.exitCode=1;
}
