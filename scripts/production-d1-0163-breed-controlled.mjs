#!/usr/bin/env node
/**
 * 0163 controlled breed values, manual D1 schema-only rollout.
 * audit: strictly SELECT-only; apply: exactly the pinned CREATE TABLE.
 * Does not edit the Notion data, managed_breeds, 344 identity links,
 * existing source receipts, feature flags or d1_migrations.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync,readFileSync,writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BREED_0163_TARGET,BREED_0163_TABLE,BREED_0163_BLOB_SHA,
  classifyBreed0163,assertBreed0163ApplyReady,assertBreed0163Postflight,
} from "../lib/production-d1-0163-guard.mjs";

const mode=process.argv[2]||"";
const database="psipedia-sk-db";
const accountId="5ff902d3d80376478b9213b2b8ae8d6e";
const databaseId="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const reportDir=resolve(".production-d1-0163");
const configPath=resolve(reportDir,"wrangler.json");
const sqlPath=resolve("drizzle",BREED_0163_TARGET);
const ensure=(ok,code)=>{if(!ok) throw Error(code)};

function requireOperator() {
  ensure(mode==="audit"||mode==="apply","BREED_0163_INVALID_MODE");
  ensure(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","BREED_0163_MANUAL_ONLY");
  ensure(process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk","BREED_0163_WRONG_REPOSITORY");
  ensure(process.env.GITHUB_REF==="refs/heads/main","BREED_0163_MAIN_ONLY");
  ensure(Boolean(process.env.CLOUDFLARE_API_TOKEN),"BREED_0163_TOKEN_MISSING");
  ensure(process.env.CLOUDFLARE_ACCOUNT_ID===accountId,"BREED_0163_WRONG_ACCOUNT");
  ensure(process.env.BREED_0163_CONFIRMATION===
    (mode==="apply"?"APPLY-0163-psipedia-sk-db":"AUDIT-0163-psipedia-sk-db"),
    "BREED_0163_CONFIRMATION_REQUIRED");
}
function verifyPinnedSql() {
  const bytes=readFileSync(sqlPath);
  const blob=createHash("sha1").update(Buffer.concat([
    Buffer.from("blob "+bytes.length+"\0"),bytes,
  ])).digest("hex");
  ensure(blob===BREED_0163_BLOB_SHA,"BREED_0163_SQL_CHANGED");
  const sql=bytes.toString("utf8").replace(/--[^\n]*(\n|$)/g,"").trim();
  ensure(/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+breed_notion_controlled_values\s*\(/i.test(sql) &&
    sql.endsWith(");") && sql.split(";").length===2 &&
    !/\b(DROP|ALTER|INSERT|UPDATE|REPLACE|TRUNCATE)\b/i.test(sql),
    "BREED_0163_SQL_NOT_SINGLE_ADDITIVE_TABLE");
  return blob;
}
function configure() {
  const resources=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
  ensure(resources.account_id===accountId &&
    resources.d1?.database_name===database &&
    resources.d1?.database_id===databaseId &&
    resources.d1?.binding==="DB","BREED_0163_DATABASE_MISMATCH");
  mkdirSync(reportDir,{recursive:true});
  writeFileSync(configPath,JSON.stringify({
    name:"psipedia-sk-0163-schema-only",
    compatibility_date:"2026-11-10",
    d1_databases:[{
      binding:"DB",database_name:database,database_id:databaseId,
    }],
  },null,2));
}
function wrangler(args) {
  const cmd=process.platform==="win32"?"npx.cmd":"npx";
  const result=spawnSync(cmd,["wrangler",...args],{
    encoding:"utf8",maxBuffer:8*1024*1024,
    env:{...process.env,NO_UPDATE_NOTIFIER:"1",WRANGLER_SEND_METRICS:"false"},
  });
  if(result.error) throw result.error;
  ensure(result.status===0,"BREED_0163_WRANGLER_FAILED");
  return result.stdout||"";
}
function json(raw) {
  const value=raw.trim();
  try {return JSON.parse(value)}catch { /* Cloudflare banner before JSON */ }
  for(const start of [value.indexOf("["),value.indexOf("{")]) {
    if(start<0) continue;
    for(const endChar of ["]","}"]) {
      const end=value.lastIndexOf(endChar);
      if(end>start) try {return JSON.parse(value.slice(start,end+1))} catch {/* next */}
    }
  }
  throw Error("BREED_0163_BAD_JSON");
}
function select(sql) {
  const decoded=json(wrangler(["d1","execute",database,"--remote","--config",
    configPath,"--command",sql,"--json"]));
  const batches=Array.isArray(decoded)?decoded:[decoded];
  ensure(batches.length>0&&batches.every(x=>x?.success===true&&Array.isArray(x.results)),
    "BREED_0163_REMOTE_SELECT_FAILED");
  return batches.flatMap(x=>x.results);
}
function inspect() {
  const names=select("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('managed_breeds','breed_notion_workcopy_links','lost_found_dog_reports','breed_notion_controlled_values')");
  const has=(name)=>names.some(x=>x.name===name);
  const managedBreedsPresent=has("managed_breeds");
  const workcopyLinksPresent=has("breed_notion_workcopy_links");
  const managedBreedCount=managedBreedsPresent
    ?Number(select("SELECT COUNT(*) AS n FROM managed_breeds")[0]?.n):null;
  const counts=workcopyLinksPresent?select(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active FROM breed_notion_workcopy_links",
  )[0]:null;
  const indexNames=select("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='directory_profiles'").map(x=>x.name);
  const shortDescriptionPresent=has("lost_found_dog_reports") &&
    select("SELECT name FROM pragma_table_info('lost_found_dog_reports')")
      .some(x=>x.name==="short_description");
  const tablePresent=has(BREED_0163_TABLE);
  const columns=tablePresent
    ?select("SELECT name,type,\"notnull\",dflt_value,pk FROM pragma_table_info('breed_notion_controlled_values')"):[];
  const foreignKeys=tablePresent
    ?select("SELECT * FROM pragma_foreign_key_list('breed_notion_controlled_values')"):[];
  const rowCount=tablePresent
    ?Number(select("SELECT COUNT(*) AS n FROM breed_notion_controlled_values")[0]?.n):null;
  return {
    managedBreedsPresent,workcopyLinksPresent,managedBreedCount,
    totalLinks:counts===null?null:Number(counts.total),
    activeLinks:counts===null?null:Number(counts.active),
    indexNames,shortDescriptionPresent,tablePresent,
    columns,foreignKeys,rowCount,
  };
}
function locateBookmark(value) {
  if(!value||typeof value!=="object")return null;
  if(typeof value.bookmark==="string"&&value.bookmark)return value.bookmark;
  for(const nested of Object.values(value)){
    const found=locateBookmark(nested);
    if(found)return found;
  }
  return null;
}
function bookmark(){
  const data=json(wrangler(["d1","time-travel","info",database,
    "--config",configPath,"--json"]));
  const found=locateBookmark(data);
  ensure(found,"BREED_0163_RECOVERY_BOOKMARK_MISSING");
  return found;
}
function record(payload){
  writeFileSync(resolve(reportDir,"report.json"),JSON.stringify(payload,null,2)+"\n");
  process.stdout.write(JSON.stringify({
    phase:payload.phase,success:payload.success,installed:payload.state?.installed,
    readyToApply:payload.state?.readyToApply,blockers:payload.state?.blockers,
    activeLinks:payload.state?.activeLinks,controlledRows:payload.state?.rowCount,
    applied:payload.applied,migrationHistoryRecorded:false,
  })+"\n");
}
function main(){
  requireOperator();
  const pinnedBlob=verifyPinnedSql();
  configure();
  const before=classifyBreed0163(inspect());
  if(mode==="audit"||before.installed){
    record({phase:mode==="audit"?"AUDIT":"ALREADY_INSTALLED",
      success:true,applied:false,pinnedBlob,state:before,migrationHistoryRecorded:false});
    return;
  }
  assertBreed0163ApplyReady(before);
  const recoveryBookmark=bookmark();
  const fresh=classifyBreed0163(inspect());
  assertBreed0163ApplyReady(fresh);
  ensure(fresh.activeLinks===before.activeLinks&&
    fresh.totalLinks===before.totalLinks&&
    fresh.managedBreedCount===before.managedBreedCount,
    "BREED_0163_COHORT_CHANGED_BEFORE_APPLY");
  // Write recovery evidence BEFORE any remote DDL. Failures leave the outcome unknown.
  record({phase:"RECOVERY_POINT",success:false,applied:null,
    pinnedBlob,recoveryBookmark,state:fresh,migrationHistoryRecorded:false});
  wrangler(["d1","execute",database,"--remote","--config",configPath,
    "--file",sqlPath,"--yes","--json"]);
  const after=classifyBreed0163(inspect());
  assertBreed0163Postflight(fresh,after);
  record({phase:"POSTFLIGHT",success:true,applied:true,pinnedBlob,
    recoveryBookmark,state:after,migrationHistoryRecorded:false,
    note:"0163 created an empty typed sidecar only; Notion, original prose and ledger untouched."});
}
try {main()}catch(error){
  console.error(JSON.stringify({phase:"FAILED",code:error instanceof Error
    ?error.message:"BREED_0163_UNKNOWN"}));
  process.exitCode=1;
}
