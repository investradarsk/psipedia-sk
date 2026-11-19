#!/usr/bin/env node
/**
 * Owner-dispatched D1 Directory 0170 SQL NULL-only contact backfill.
 * Audit = SELECT only. Apply = five fixed idempotent UPDATEs, no JSON cleanup.
 * No schema migration, Notion mutation, row creation or deletion.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DIRECTORY_CONTACT_BACKFILL_FIELDS,
  directoryContactBackfillCountSql,
  directoryContactBackfillUpdateSql,
  directoryContactBackfillSummary,
} from "../lib/directory-contact-null-backfill.mjs";

const MODE = process.argv[2] || "";
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DB = "psipedia-sk-db";
const ID = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT = "5ff902d3d80376478b9213b2b8ae8d6e";
const DIR = resolve(ROOT, ".directory-contact-null-backfill");
const REPORT = resolve(DIR,"report.json");
const CONFIG = resolve(DIR,"wrangler.json");
const safeError = code => new Error("DIRECTORY_CONTACT_BACKFILL_" + code);
const requireThat = (condition,code) => { if (!condition) throw safeError(code); };
let stage="START", bookmark=null, before=null, completedColumns=[];

function authorize() {
  requireThat(MODE==="audit" || MODE==="apply","MODE");
  requireThat(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
  requireThat(process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk","REPOSITORY");
  requireThat(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
  requireThat(Boolean(process.env.GITHUB_SHA),"COMMIT_MISSING");
  requireThat(Boolean(process.env.CLOUDFLARE_API_TOKEN),"TOKEN_MISSING");
  requireThat(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT,"ACCOUNT");
  const expected=MODE==="audit" ?
    "AUDIT-DIRECTORY-NULL-CONTACTS-psipedia-sk-db" :
    "APPLY-DIRECTORY-NULL-CONTACTS-psipedia-sk-db";
  requireThat(process.env.DIRECTORY_CONTACT_BACKFILL_CONFIRMATION===expected,"CONFIRMATION");
  const resources=JSON.parse(readFileSync(resolve(ROOT,"config/cloudflare-resources.json"),"utf8"));
  requireThat(resources.account_id===ACCOUNT && resources.d1?.database_name===DB &&
    resources.d1?.database_id===ID && resources.d1?.binding==="DB","DATABASE");
  mkdirSync(DIR,{recursive:true});
  writeFileSync(CONFIG,JSON.stringify({
    name:"directory-contact-null-backfill-owner-only",
    compatibility_date:"2026-11-19",
    d1_databases:[{binding:"DB",database_name:DB,database_id:ID}],
  }));
}
function wrangler(args) {
  const result=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["--no-install","wrangler",...args],{
      cwd:ROOT,encoding:"utf8",maxBuffer:12*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
    });
  // Never echo raw Wrangler stdout/stderr (may contain private data).
  requireThat(!result.error&&result.status===0,"REMOTE_REQUEST_FAILED");
  try { return JSON.parse(result.stdout); }
  catch { throw safeError("INVALID_REMOTE_JSON"); }
}
function query(sql,write=false) {
  requireThat(!sql.includes(";") && (write ?
      /^UPDATE directory_profiles SET (?:website_url|public_phone|public_email|facebook_url|instagram_url) = /i.test(sql) :
      /^SELECT /i.test(sql)),"UNEXPECTED_SQL");
  const result=wrangler(["d1","execute",DB,"--remote","--config",CONFIG,
    "--command",sql,"--json",...(write?["--yes"]:[])]);
  const batches=Array.isArray(result)?result:[result];
  requireThat(batches.length>0 && batches.every(x=>x?.success!==false && Array.isArray(x?.results)),
    "REMOTE_QUERY_FAILED");
  return batches;
}
function select(sql){ return query(sql).flatMap(x=>x.results); }
function bookmarkRecoveryPoint() {
  const response=wrangler(["d1","time-travel","info",DB,"--config",CONFIG,"--json"]);
  const find=value=>{
    if(!value||typeof value!=="object")return null;
    if(typeof value.bookmark==="string"&&value.bookmark)return value.bookmark;
    for(const v of Object.values(value)){const b=find(v);if(b)return b;}
    return null;
  };
  const result=find(response);
  requireThat(Boolean(result),"RECOVERY_BOOKMARK_MISSING");
  return result;
}
function ensureSchema() {
  const tables=select("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('directory_profiles','admin_record_tombstones')");
  requireThat(tables.length===2,"MISSING_TABLE");
  const columns=select("SELECT name FROM pragma_table_info('directory_profiles') WHERE name IN ('website_url','public_phone','public_email','facebook_url','instagram_url','source_data_json')");
  requireThat(columns.length===6,"MISSING_COLUMNS");
}
function counts() {
  const rows=select(directoryContactBackfillCountSql());
  return directoryContactBackfillSummary(rows);
}
function baseline() {
  const row=select("SELECT COUNT(*) AS profiles, COALESCE(SUM(id),0) AS id_sum, COALESCE(MAX(id),0) AS max_id, COALESCE(SUM(LENGTH(source_data_json)),0) AS source_chars FROM directory_profiles")[0];
  requireThat(row && ["profiles","id_sum","max_id","source_chars"].every(k=>Number.isSafeInteger(Number(row[k]))),"INVALID_BASELINE");
  return Object.fromEntries(["profiles","id_sum","max_id","source_chars"].map(k=>[k,Number(row[k])]));
}
function sameBaseline(a,b) {
  return ["profiles","id_sum","max_id","source_chars"].every(key=>a[key]===b[key]);
}
function writeReport(status,more={}) {
  stage=status;
  const report={
    phase:"DIRECTORY_CONTACT_NULL_BACKFILL", mode:MODE, status,
    database:DB,sourceCommit:process.env.GITHUB_SHA,
    doesNotModifyJson:true,doesNotWriteNotion:true,preservesSqlExplicitClears:true,
    recoveryBookmark:bookmark,completedColumns,
    ...more,
  };
  mkdirSync(DIR,{recursive:true});
  writeFileSync(REPORT,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({
    phase:report.phase,mode:MODE,status,
    beforeCandidates:report.before?.candidates?.totals??null,
    afterCandidates:report.after?.candidates?.totals??null,
    appliedColumns:completedColumns,
    recoveryPointCreated:Boolean(bookmark),
  }));
}
try {
  authorize();
  ensureSchema();
  const original=baseline();
  before={baseline:original,candidates:counts()};
  requireThat(original.profiles===before.candidates.profiles,"COUNTS_INCONSISTENT");
  stage="PREFLIGHT";
  if(MODE==="audit") {
    writeReport("AUDIT_ONLY",{before,readOnly:true,applied:false});
  } else {
    // Must have a D1 time-travel restore point BEFORE any contact write.
    bookmark=bookmarkRecoveryPoint();
    const fresh=baseline();
    requireThat(sameBaseline(original,fresh),"CONCURRENT_CHANGE_BEFORE_APPLY");
    requireThat(JSON.stringify(before.candidates)===JSON.stringify(counts()),"CANDIDATES_CHANGED_BEFORE_APPLY");
    stage="APPLYING";
    for(const column of DIRECTORY_CONTACT_BACKFILL_FIELDS) {
      query(directoryContactBackfillUpdateSql(column),true);
      completedColumns.push(column);
    }
    const finalBase=baseline();
    const after={baseline:finalBase,candidates:counts()};
    writeReport("POSTFLIGHT",{before,after,readOnly:false,applied:true,
      baselineStable:sameBaseline(original,finalBase)});
    requireThat(sameBaseline(original,finalBase),"CONCURRENT_CHANGE_DURING_APPLY");
    requireThat(DIRECTORY_CONTACT_BACKFILL_FIELDS.every(column=>
      after.candidates.totals[column]===0),"REMAINING_ELIGIBLE_CONTACTS");
  }
} catch(error) {
  const code=error instanceof Error && /^DIRECTORY_CONTACT_BACKFILL_[A-Z_]+$/.test(error.message) ?
    error.message : "DIRECTORY_CONTACT_BACKFILL_FAILED";
  try{writeReport("FAILED",{before,applied:completedColumns.length>0,error:code});}catch{}
  console.error(JSON.stringify({phase:"FAILED",stage,error:code,completedColumns}));
  process.exitCode=1;
}
