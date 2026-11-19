#!/usr/bin/env node
/**
 * Directory contacts: owner-dispatched SQL-owned legacy-alias cleanup.
 *
 * audit: SELECT-only aggregate counts, never returns values.
 * apply: five fixed idempotent UPDATEs, touching source_data_json only.
 * No schema changes, Notion API calls, migrations, profile deletes or
 * changes to SQL contact values. Protected/SQL-NULL rows remain untouched.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIRECTORY_CONTACT_CLEANUP_FIELDS,
  directoryContactCleanupCountSql,
  directoryContactCleanupUpdateSql,
  directoryContactCleanupSummary,
} from "../lib/directory-contact-legacy-cleanup.mjs";

const MODE=process.argv[2]??"";
const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const DB="psipedia-sk-db";
const DB_ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const DIR=resolve(ROOT,".directory-contact-legacy-cleanup");
const CONFIG=resolve(DIR,"wrangler.json");
const REPORT=resolve(DIR,"report.json");
const fail=code=>{throw new Error("DIRECTORY_CONTACT_CLEANUP_"+code);};
const must=(ok,code)=>{if(!ok)fail(code);};
let stage="START", bookmark=null, before=null;
const appliedColumns=[];

function authorize() {
  must(MODE==="audit"||MODE==="apply","INVALID_MODE");
  must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
  must(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
  must(process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk","WRONG_REPOSITORY");
  must(Boolean(process.env.GITHUB_SHA),"COMMIT_MISSING");
  must(Boolean(process.env.CLOUDFLARE_API_TOKEN),"TOKEN_MISSING");
  must(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT,"WRONG_ACCOUNT");
  const expected=MODE==="audit" ?
    "AUDIT-DIRECTORY-CONTACT-ALIASES-psipedia-sk-db" :
    "APPLY-DIRECTORY-CONTACT-ALIASES-psipedia-sk-db";
  must(process.env.DIRECTORY_CONTACT_CLEANUP_CONFIRMATION===expected,"BAD_CONFIRMATION");
  const config=JSON.parse(readFileSync(resolve(ROOT,"config/cloudflare-resources.json"),"utf8"));
  must(config.account_id===ACCOUNT && config.d1?.database_name===DB &&
       config.d1?.database_id===DB_ID && config.d1?.binding==="DB","WRONG_DATABASE");
  mkdirSync(DIR,{recursive:true});
  writeFileSync(CONFIG,JSON.stringify({
    name:"directory-contact-legacy-cleanup-owner-only",
    compatibility_date:"2026-11-19",
    d1_databases:[{binding:"DB",database_name:DB,database_id:DB_ID}],
  }));
}
function wrangler(args) {
  const run=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["--no-install","wrangler",...args],{
      cwd:ROOT,encoding:"utf8",maxBuffer:12*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
    });
  // Never log raw stdout/stderr, which may contain private D1 content.
  must(!run.error&&run.status===0,"REMOTE_COMMAND_FAILED");
  try{return JSON.parse(run.stdout);}
  catch{return fail("INVALID_REMOTE_JSON");}
}
function execute(sql,write=false) {
  must(typeof sql==="string"&&!sql.includes(";"),"UNEXPECTED_SQL");
  if(write) {
    must(DIRECTORY_CONTACT_CLEANUP_FIELDS.some(field=>
      sql===directoryContactCleanupUpdateSql(field)),"UNEXPECTED_WRITE");
  } else {
    must(/^SELECT\s/i.test(sql),"READ_ONLY_SELECT_REQUIRED");
  }
  const result=wrangler(["d1","execute",DB,"--remote","--config",CONFIG,
    "--command",sql,"--json",...(write?["--yes"]:[])]);
  const pages=Array.isArray(result)?result:[result];
  must(pages.length>0&&pages.every(row=>row?.success!==false &&
      Array.isArray(row?.results)),"REMOTE_QUERY_FAILED");
  return pages;
}
function select(sql) {return execute(sql).flatMap(x=>x.results);}
function recoveryBookmark() {
  const output=wrangler(["d1","time-travel","info",DB,"--config",CONFIG,"--json"]);
  function find(node) {
    if(!node||typeof node!=="object")return null;
    if(typeof node.bookmark==="string"&&node.bookmark)return node.bookmark;
    for(const value of Object.values(node)){
      const result=find(value);
      if(result)return result;
    }
    return null;
  }
  const result=find(output);
  must(Boolean(result),"RECOVERY_BOOKMARK_MISSING");
  return result;
}
function ensureSchema() {
  const tables=select("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('directory_profiles','admin_record_tombstones')");
  must(tables.length===2,"MISSING_TABLE");
  const columns=select("SELECT name FROM pragma_table_info('directory_profiles') WHERE name IN ('source_data_json','website_url','public_phone','public_email','facebook_url','instagram_url','status','updated_at')");
  must(columns.length===8,"MISSING_COLUMNS");
}
function baseline() {
  const sql="SELECT COUNT(*) AS profiles, COALESCE(SUM(id),0) AS id_sum, "+
    "COALESCE(MAX(id),0) AS max_id, COALESCE(MAX(updated_at),'') AS latest_update, "+
    "COALESCE(SUM(LENGTH(source_data_json)),0) AS json_chars, "+
    DIRECTORY_CONTACT_CLEANUP_FIELDS.flatMap(field=>[
      "COALESCE(SUM(LENGTH(COALESCE("+field+",''))),0) AS "+field+"_chars",
      "COUNT("+field+") AS "+field+"_non_null",
    ]).join(", ")+" FROM directory_profiles";
  const row=select(sql)[0];
  must(row&&Number.isSafeInteger(Number(row.profiles))&&
    Number.isSafeInteger(Number(row.id_sum))&&
    Number.isSafeInteger(Number(row.max_id))&&
    Number.isSafeInteger(Number(row.json_chars))&&
    typeof row.latest_update==="string","INVALID_BASELINE");
  const result={};
  for(const [key,val] of Object.entries(row)){
    if(key==="latest_update")result[key]=val;
    else {
      must(Number.isSafeInteger(Number(val))&&Number(val)>=0,"INVALID_BASELINE");
      result[key]=Number(val);
    }
  }
  return result;
}
function immutableBaselineMatches(a,b) {
  return Object.keys(a).filter(key=>key!=="json_chars").every(key=>a[key]===b[key]);
}
function counts() {
  return directoryContactCleanupSummary(select(directoryContactCleanupCountSql()));
}
function writeReport(status,extra={}) {
  stage=status;
  const report={
    phase:"DIRECTORY_SQL_CONTACT_ALIAS_CLEANUP",status,mode:MODE,
    sourceCommit:process.env.GITHUB_SHA,database:DB,
    sqlValuesChanged:false,deletedProfiles:false,notionUpdated:false,
    sourceJsonColumnDropped:false,technicalMetadataRetained:true,
    recoveryBookmark:bookmark,appliedColumns,...extra,
  };
  mkdirSync(DIR,{recursive:true});
  writeFileSync(REPORT,JSON.stringify(report,null,2)+"\n");
  // Only aggregate counts ever leave the private artifact.
  console.log(JSON.stringify({
    phase:report.phase,status,mode:MODE,
    removableBefore:report.before?.candidates?.removable??null,
    removableAfter:report.after?.candidates?.removable??null,
    unmigratedBefore:report.before?.candidates?.unmigrated??null,
    appliedColumns,recoveryPointCreated:Boolean(bookmark),
  }));
}
try {
  authorize();
  ensureSchema();
  const original=baseline();
  before={baseline:original,candidates:counts()};
  must(before.candidates.profiles===original.profiles,"BASELINE_MISMATCH");
  stage="PREFLIGHT";
  if(MODE==="audit") {
    writeReport("AUDIT_ONLY",{before,readOnly:true,applied:false});
  } else {
    bookmark=recoveryBookmark();
    const fresh=baseline(), freshCounts=counts();
    must(JSON.stringify(original)===JSON.stringify(fresh),"CONCURRENT_CHANGE_BEFORE_APPLY");
    must(JSON.stringify(before.candidates)===JSON.stringify(freshCounts),
      "CANDIDATES_CHANGED_BEFORE_APPLY");
    stage="APPLYING";
    for(const field of DIRECTORY_CONTACT_CLEANUP_FIELDS){
      execute(directoryContactCleanupUpdateSql(field),true);
      appliedColumns.push(field);
    }
    const after={baseline:baseline(),candidates:counts()};
    const invariant=
      immutableBaselineMatches(original,after.baseline) &&
      after.baseline.json_chars<=original.json_chars &&
      DIRECTORY_CONTACT_CLEANUP_FIELDS.every(field=>
        after.candidates.removable[field]===0 &&
        after.candidates.unmigrated[field]===before.candidates.unmigrated[field] &&
        after.candidates.protected[field]===before.candidates.protected[field]);
    writeReport("POSTFLIGHT",{before,after,readOnly:false,applied:true,
      invariantsPassed:invariant});
    must(invariant,"POSTFLIGHT_INVARIANTS_FAILED");
  }
} catch(e) {
  const error=e instanceof Error&&/^DIRECTORY_CONTACT_CLEANUP_[A-Z_]+$/.test(e.message)
    ? e.message : "DIRECTORY_CONTACT_CLEANUP_FAILED";
  try {writeReport("FAILED",{before,applied:appliedColumns.length>0,error});}catch{}
  console.error(JSON.stringify({phase:"FAILED",stage,error,appliedColumns}));
  process.exitCode=1;
}
