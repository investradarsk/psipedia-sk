#!/usr/bin/env node
/**
 * Owner-only, independently dispatched D1 migration-ledger reconciliation.
 * audit: remote SELECT only. apply: INSERT ONLY 0158–0162 migration receipts.
 * The physical DDL was installed by earlier protected production runs.
 *
 * applied_at is the receipt reconciliation timestamp (CURRENT_TIMESTAMP).
 * No existing ledger entries or application/business tables are modified.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { classify0158, classify0162, assert0159to0161,
  DIRECTORY_0158_INDEX_NAMES, COMPLETION_0158_BLOB, COMPLETION_0162_BLOB,
} from "../lib/production-d1-0158-0162-guard.mjs";
import { BREED_0159_BLOB_SHA } from "../lib/production-d1-0159-guard.mjs";
import { EVENT_0160_SQL_BLOB } from "../lib/production-d1-0160-guard.mjs";
import { EVENT_0161_GIT_BLOB_SHA } from "../lib/production-d1-0161-event-metadata-guard.mjs";
import { RECEIPTS_0158_0162, expectedLedgerPrefix, classifyLedger,
  receiptInsertSql, assertBreedShadow0159,
} from "../lib/production-d1-0158-0162-history-guard.mjs";

const mode = process.argv[2];
const database = "psipedia-sk-db";
const accountId = "5ff902d3d80376478b9213b2b8ae8d6e";
const databaseId = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const out = resolve(".production-d1-ledger-0158-0162");
const config = resolve(out, "wrangler.json");
const expectedBlobs = [
  COMPLETION_0158_BLOB, BREED_0159_BLOB_SHA, EVENT_0160_SQL_BLOB,
  EVENT_0161_GIT_BLOB_SHA, COMPLETION_0162_BLOB,
];

function ensure(ok, code) { if (!ok) throw new Error(code); }
function verifyOperator() {
  ensure(mode === "audit" || mode === "apply", "LEDGER_INVALID_MODE");
  ensure(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "LEDGER_MANUAL_ONLY");
  ensure(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk", "LEDGER_REPOSITORY_MISMATCH");
  ensure(process.env.GITHUB_REF === "refs/heads/main", "LEDGER_MAIN_ONLY");
  ensure(process.env.CLOUDFLARE_ACCOUNT_ID === accountId, "LEDGER_ACCOUNT_MISMATCH");
  ensure(Boolean(process.env.CLOUDFLARE_API_TOKEN), "LEDGER_PROTECTED_TOKEN_MISSING");
  ensure(process.env.D1_LEDGER_CONFIRMATION ===
    (mode === "apply" ? "RECONCILE" : "AUDIT") + "-0158-0162-psipedia-sk-db",
    "LEDGER_EXPLICIT_CONFIRMATION_REQUIRED");
}
function pinnedSource() {
  for (let i = 0; i < RECEIPTS_0158_0162.length; i++) {
    const bytes = readFileSync(resolve("drizzle", RECEIPTS_0158_0162[i]));
    const blob = createHash("sha1").update(Buffer.concat([
      Buffer.from("blob " + bytes.length + "\0"), bytes,
    ])).digest("hex");
    ensure(blob === expectedBlobs[i], "LEDGER_SOURCE_SQL_CHANGED_" + RECEIPTS_0158_0162[i]);
  }
  return expectedLedgerPrefix(readdirSync("drizzle"));
}
function setup() {
  const resources = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  ensure(resources.account_id === accountId && resources.d1?.database_id === databaseId &&
    resources.d1?.database_name === database && resources.d1?.binding === "DB",
    "LEDGER_D1_TARGET_MISMATCH");
  mkdirSync(out, {recursive:true});
  writeFileSync(config, JSON.stringify({
    name:"psipedia-sk-ledger-only",
    compatibility_date:"2026-11-10",
    d1_databases:[{binding:"DB",database_name:database,database_id:databaseId}],
  },null,2));
}
function run(args) {
  const p=spawnSync(process.platform==="win32"?"npx.cmd":"npx",["wrangler",...args],{
    encoding:"utf8", env:{...process.env,NO_UPDATE_NOTIFIER:"1",WRANGLER_SEND_METRICS:"false"},
  });
  if(p.error) throw p.error;
  ensure(p.status===0,"LEDGER_WRANGLER_FAILED");
  return p.stdout||"";
}
function parse(output) {
  const raw=output.trim();
  try{return JSON.parse(raw);}catch{/* Wrangler may prepend a banner */}
  for(const start of [raw.indexOf("["),raw.indexOf("{")]){
    if(start<0)continue;
    for(const ending of ["]","}"]){
      const end=raw.lastIndexOf(ending);
      if(end>start){try{return JSON.parse(raw.slice(start,end+1));}catch{/* next */}}
    }
  }
  throw new Error("LEDGER_UNREADABLE_WRANGLER_JSON");
}
function execute(sql) {
  const raw=parse(run(["d1","execute",database,"--remote","--config",config,"--command",sql,"--json"]));
  const pages=Array.isArray(raw)?raw:[raw];
  ensure(pages.length>0 && pages.every(p=>p?.success===true && Array.isArray(p.results)),
    "LEDGER_REMOTE_SQL_FAILED");
  return pages.flatMap(p=>p.results);
}
function queryTableColumns(table){
  return execute("SELECT name,type,pk,\"notnull\" AS nn,dflt_value FROM pragma_table_info('"+table+"')")
    .map(row=>({...row,notnull:row.nn}));
}
function scalar(sql) {
  const rows=execute(sql);
  ensure(rows.length===1 && Number.isSafeInteger(Number(rows[0].n)) && Number(rows[0].n)>=0,
    "LEDGER_INVALID_AGGREGATE");
  return Number(rows[0].n);
}
function inspect(expectedPrior) {
  const ledgerSchema=execute(
    "SELECT name,type,sql FROM sqlite_master WHERE name='d1_migrations' AND type='table'");
  ensure(ledgerSchema.length===1,"LEDGER_TABLE_MISSING");
  const ledgerColumns=queryTableColumns("d1_migrations");
  const indexes=execute("SELECT name,\"unique\" AS is_unique FROM pragma_index_list('d1_migrations')");
  let uniqueNameIndex=false;
  for(const row of indexes.filter(x=>Number(x.is_unique)===1)){
    const indexCols=execute("SELECT name FROM pragma_index_info('"+
      String(row.name).replaceAll("'","''")+"')").map(x=>x.name);
    if(indexCols.length===1 && indexCols[0]==="name") uniqueNameIndex=true;
  }
  const ledgerRows=execute("SELECT id,name,applied_at FROM d1_migrations ORDER BY id");
  const ledger=classifyLedger({rows:ledgerRows,columns:ledgerColumns,uniqueNameIndex,expectedPrior});
  const names=["directory_profiles","lost_found_dog_reports","breed_notion_workcopy_links",
    "idx_breed_notion_workcopy_status",...DIRECTORY_0158_INDEX_NAMES];
  const objects=new Map(execute("SELECT name,type,tbl_name,sql FROM sqlite_master WHERE name IN ("+
    names.map(name=>"'"+name+"'").join(",")+")").map(x=>[x.name,x]));
  const indexes0158=classify0158({
    tablePresent:objects.get("directory_profiles")?.type==="table",
    columns:queryTableColumns("directory_profiles"),
    indexes:DIRECTORY_0158_INDEX_NAMES.map(x=>objects.get(x)).filter(Boolean),
    count:scalar("SELECT COUNT(*) AS n FROM directory_profiles"),
  });
  const short=classify0162({
    tablePresent:objects.get("lost_found_dog_reports")?.type==="table",
    columns:queryTableColumns("lost_found_dog_reports"),
    count:scalar("SELECT COUNT(*) AS n FROM lost_found_dog_reports"),
  });
  const eventColumns=queryTableColumns("managed_events");
  const existing=assert0159to0161({
    shadowTable:objects.get("breed_notion_workcopy_links"),
    shadowIndex:objects.get("idx_breed_notion_workcopy_status"),eventColumns,
  });
  const shadowCols=queryTableColumns("breed_notion_workcopy_links");
  const shadowIndexColumns=execute("SELECT name FROM pragma_index_info('idx_breed_notion_workcopy_status')")
    .map(x=>x.name);
  assertBreedShadow0159({
    columns:shadowCols,
    tableSql:objects.get("breed_notion_workcopy_links")?.sql,
    statusIndexColumns:shadowIndexColumns,
  });
  ensure(indexes0158.installed && short.installed, "LEDGER_REQUIRED_0158_0162_SCHEMA_MISSING");
  return {ledger,ledgerRows,physical:{
    installed0158:indexes0158.installed,legacyCompatibleIndexes:indexes0158.legacyCompatibleIndexes,
    installed0159:existing.applied0159,installed0160:existing.applied0160,
    installed0161:existing.applied0161,installed0162:short.installed,
    profileCount:indexes0158.count,reportCount:short.count,
  }};
}
function bookmark() {
  const obj=parse(run(["d1","time-travel","info",database,"--config",config,"--json"]));
  function find(x) {
    if(!x||typeof x!=="object")return null;
    if(typeof x.bookmark==="string"&&x.bookmark)return x.bookmark;
    for(const val of Object.values(x)){const match=find(val);if(match)return match;}
    return null;
  }
  const value=find(obj);
  ensure(Boolean(value),"LEDGER_RECOVERY_BOOKMARK_UNAVAILABLE");
  return value;
}
function report(phase,state,recovery=null) {
  const record={
    phase,mode,readAt:new Date().toISOString(),target:database,
    ledger:state.ledger,physical:state.physical,
    recoveryBookmark:recovery,
    receiptAppliedAtMeans:"reconciliation timestamp, not original physical DDL execution",
    originalDDLReexecuted:false,
  };
  writeFileSync(resolve(out,"report.json"),JSON.stringify(record,null,2)+"\n");
  process.stdout.write(JSON.stringify({
    phase,recorded:state.ledger.recorded,missing:state.ledger.missing,
    allFivePhysicallyInstalled:Object.entries(state.physical)
      .filter(([key])=>/^installed/.test(key)).every(([,value])=>value===true),
    ledgerComplete:state.ledger.complete,originalDDLReexecuted:false,
  })+"\n");
}
function main() {
  verifyOperator();
  const expectedPrior=pinnedSource();
  setup();
  const first=inspect(expectedPrior);
  if(mode==="audit"){
    report("AUDIT",first);
    return;
  }
  if(first.ledger.complete){
    report("ALREADY_RECONCILED",first);
    return;
  }
  const recovery=bookmark();
  const fresh=inspect(expectedPrior);
  ensure(JSON.stringify(first.ledgerRows)===JSON.stringify(fresh.ledgerRows),
    "LEDGER_CONCURRENT_HISTORY_CHANGE");
  ensure(JSON.stringify(first.physical)===JSON.stringify(fresh.physical),
    "LEDGER_CONCURRENT_SCHEMA_OR_COUNT_CHANGE");
  report("RECOVERY_POINT",fresh,recovery);
  // Exactly one atomic SQL INSERT; no UPDATE, DELETE, DDL or OR IGNORE.
  execute(receiptInsertSql(fresh.ledger.missing));
  const after=inspect(expectedPrior);
  ensure(after.ledger.complete, "LEDGER_POSTFLIGHT_INCOMPLETE");
  ensure(after.ledgerRows.length===first.ledgerRows.length+first.ledger.missing.length,
    "LEDGER_POSTFLIGHT_UNEXPECTED_RECEIPT_COUNT");
  ensure(first.ledgerRows.every((row,i)=>
    JSON.stringify(row)===JSON.stringify(after.ledgerRows[i])),
    "LEDGER_ORIGINAL_RECORDS_CHANGED");
  report("POSTFLIGHT",after,recovery);
}
try{main();}catch(err){
  console.error(JSON.stringify({phase:"FAILED",code:err instanceof Error?err.message:"LEDGER_UNKNOWN_ERROR"}));
  process.exitCode=1;
}
