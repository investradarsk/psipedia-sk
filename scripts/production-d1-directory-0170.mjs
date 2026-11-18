#!/usr/bin/env node
/** Exactly one owner-dispatched 0170 schema operation; never generic migration apply. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
 FILE_0170,BLOB_0170,TABLES_0170,INDEXES_0170,CONTACTS_0170,
 DEPENDENCIES_0170,statements0170,inspect0170,
} from "../lib/production-d1-directory-0170-guard.mjs";

const MODE=process.argv[2]??"";
const DATABASE="psipedia-sk-db";
const ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const OUTPUT=resolve(".production-d1-directory-0170");
const CONFIG=resolve(OUTPUT,"wrangler.json");
const SQL=resolve("drizzle",FILE_0170);
const REPORT=resolve(OUTPUT,"report.json");
const must=(ok,code)=>{if(!ok)throw Error("DIRECTORY_0170_"+code);};
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
let stage="START",bookmark=null,baseline=null;
function authorize(){
 must(["audit","apply"].includes(MODE),"INVALID_MODE");
 must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
 must(process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk","WRONG_REPOSITORY");
 must(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
 must(Boolean(process.env.GITHUB_SHA),"COMMIT_MISSING");
 must(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT,"WRONG_ACCOUNT");
 must(Boolean(process.env.CLOUDFLARE_API_TOKEN),"PROTECTED_TOKEN_REQUIRED");
 const expected=(MODE==="audit"?"AUDIT":"APPLY")+"-0170-psipedia-sk-db";
 must(process.env.DIRECTORY_0170_CONFIRMATION===expected,"BAD_CONFIRMATION");
}
function pinnedSql(){
 const bytes=readFileSync(SQL);
 const blob=createHash("sha1")
   .update(Buffer.concat([Buffer.from("blob "+bytes.length+"\0"),bytes]))
   .digest("hex");
 must(blob===BLOB_0170,"PINNED_SQL_CHANGED");
 const sql=bytes.toString("utf8");
 statements0170(sql);
 return sql;
}
function config(){
 const resources=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
 must(resources.account_id===ACCOUNT&&resources.d1?.database_id===ID&&
  resources.d1?.database_name===DATABASE&&resources.d1?.binding==="DB",
  "WRONG_TARGET_DATABASE");
 mkdirSync(OUTPUT,{recursive:true});
 // Deliberately no migrations_dir: cannot replay 0163–0169 or edit ledger.
 writeFileSync(CONFIG,JSON.stringify({
  name:"psipedia-directory-0170-isolated-schema",
  compatibility_date:"2026-11-18",
  d1_databases:[{binding:"DB",database_name:DATABASE,database_id:ID}],
 },null,2));
}
function parseJson(stdout){
 const s=stdout.trim();
 try{return JSON.parse(s)}catch{}
 for(const first of [s.indexOf("["),s.indexOf("{")].filter(x=>x>=0)){
  for(const last of [s.lastIndexOf("]"),s.lastIndexOf("}")].filter(x=>x>first)){
   try{return JSON.parse(s.slice(first,last+1))}catch{}
  }
 }
 throw Error("DIRECTORY_0170_INVALID_WRANGLER_RESULT");
}
function wrangler(args){
 const run=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
  ["--no-install","wrangler",...args],{
   encoding:"utf8",maxBuffer:10*1024*1024,
   env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
  });
 must(!run.error&&run.status===0,"WRANGLER_FAILED");
 return run.stdout??"";
}
function select(sql){
 must(/^\s*SELECT\b/i.test(sql)&&!sql.includes(";")&&
  !/\b(?:INSERT|DELETE|UPDATE|DROP|ALTER|REPLACE|ATTACH|VACUUM|PRAGMA)\b/i.test(sql),
  "READ_ONLY_SELECT_REQUIRED");
 const decoded=parseJson(wrangler(["d1","execute",DATABASE,"--remote",
  "--config",CONFIG,"--command",sql,"--json"]));
 const pages=Array.isArray(decoded)?decoded:[decoded];
 must(pages.length>0&&pages.every(p=>p.success!==false&&Array.isArray(p.results)),
  "REMOTE_QUERY_FAILED");
 return pages.flatMap(p=>p.results);
}
function state(sql){
 const objectNames=[...DEPENDENCIES_0170,...TABLES_0170,...INDEXES_0170]
  .map(x=>"'"+x+"'").join(",");
 const objects=select("SELECT type,name,sql FROM sqlite_master WHERE name IN ("+
   objectNames+") ORDER BY name");
 const history=select("SELECT name FROM d1_migrations ORDER BY id").map(x=>x.name);
 const baseColumns=select("SELECT name,type,\"notnull\" AS \"notnull\",pk,dflt_value "+
  "FROM pragma_table_info('directory_profiles') ORDER BY cid");
 const installed=TABLES_0170.some(x=>objects.some(o=>o.name===x&&o.type==="table"));
 const tableColumns={},foreignKeys={},indexColumns={},newCounts={};
 if(installed){
  for(const name of TABLES_0170){
   if(!objects.some(o=>o.name===name&&o.type==="table"))continue;
   tableColumns[name]=select("SELECT name,type,\"notnull\" AS \"notnull\",pk,dflt_value "+
    "FROM pragma_table_info('"+name+"') ORDER BY cid");
   foreignKeys[name]=select("SELECT \"table\",\"from\",\"to\",on_delete "+
    "FROM pragma_foreign_key_list('"+name+"') ORDER BY id");
   newCounts[name]=Number(select("SELECT COUNT(*) AS n FROM "+name)[0]?.n);
  }
  for(const name of INDEXES_0170){
   if(!objects.some(o=>o.name===name&&o.type==="index"))continue;
   indexColumns[name]=select("SELECT name FROM pragma_index_info('"+name+
    "') ORDER BY seqno").map(x=>x.name);
  }
 }
 const baseNames=DEPENDENCIES_0170.filter(x=>x!=="d1_migrations");
 const counts=select("SELECT "+baseNames.map(name=>"(SELECT COUNT(*) FROM "+name+
  ') AS "'+name+'"').join(", "))[0];
 must(Boolean(counts),"NO_BASE_COUNTS");
 const baseCounts=Object.fromEntries(baseNames.map(name=>[name,Number(counts[name])]));
 const sums=select("SELECT "+
  "COUNT(*) AS profiles, COALESCE(SUM(length(source_data_json)),0) AS source_json_chars,"+
  "COALESCE(SUM(length(services_json)),0) AS services_json_chars,"+
  "COALESCE(SUM(length(qualifications_json)),0) AS qualifications_json_chars,"+
  "COALESCE(SUM(length(seo_json)),0) AS seo_json_chars "+
  "FROM directory_profiles")[0];
 must(Boolean(sums)&&Object.values(sums).every(x=>Number.isSafeInteger(Number(x))),
  "INVALID_LEGACY_AGGREGATES");
 const legacy=Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,Number(v)]));
 const assessed=inspect0170({sql,objects,history,baseColumns,tableColumns,foreignKeys,
  indexColumns,baseCounts,newCounts});
 return {
  ...assessed,baseCounts,legacy,newCounts,
  ledgerHash:digest(history),existingObjectsHash:digest(
   objects.filter(x=>DEPENDENCIES_0170.includes(x.name))),
 };
}
function recoveryBookmark(){
 const decoded=parseJson(wrangler(["d1","time-travel","info",DATABASE,
  "--config",CONFIG,"--json"]));
 const find=x=>{
  if(!x||typeof x!=="object")return null;
  if(typeof x.bookmark==="string"&&x.bookmark)return x.bookmark;
  for(const v of Object.values(x)){const z=find(v);if(z)return z}
  return null;
 };
 const b=find(decoded);
 must(Boolean(b),"RECOVERY_BOOKMARK_MISSING");
 return b;
}
function report(phase,now,applied=false,error=null){
 stage=phase;
 const out={
  phase,mode:MODE,migration:FILE_0170,pinnedGitBlob:BLOB_0170,
  sourceCommit:process.env.GITHUB_SHA,database:DATABASE,
  installed:now?.installed??null,profiles:now?.profiles??null,
  tableCounts:now?.baseCounts??null,newTableCounts:now?.newCounts??null,
  legacyAggregateHash:now?.legacy?digest(now.legacy):null,
  ledgerHash:now?.ledgerHash??null,recoveryBookmark:bookmark,
  applied,migrationLedgerWritten:false,legacyBackfill:false,
  ...(error?{error}:{}),
 };
 mkdirSync(OUTPUT,{recursive:true});
 writeFileSync(REPORT,JSON.stringify(out,null,2)+"\n");
 // Do not log bookmark or individual public/private field values.
 console.log(JSON.stringify({phase,installed:out.installed,applied,
  profiles:out.profiles,migrationLedgerWritten:false,error}));
}
function unchanged(a,b){
 must(a.ledgerHash===b.ledgerHash,"LEDGER_CHANGED");
 must(a.existingObjectsHash===b.existingObjectsHash,"BASE_SCHEMA_CHANGED");
 must(digest(a.baseCounts)===digest(b.baseCounts),"BASE_COUNTS_CHANGED");
 must(digest(a.legacy)===digest(b.legacy),"LEGACY_AGGREGATES_CHANGED");
}
function main(){
 authorize();
 const sql=pinnedSql();
 config();
 baseline=state(sql);
 if(MODE==="audit"){report("AUDIT",baseline);return}
 if(baseline.installed){report("ALREADY_INSTALLED",baseline);return}
 must(baseline.readyToApply,"SCHEMA_NOT_READY");
 bookmark=recoveryBookmark();
 const fresh=state(sql);
 unchanged(baseline,fresh);
 must(!fresh.installed,"CONCURRENT_APPLY");
 report("RECOVERY_POINT",fresh);
 // The only remote write: exactly four ALTERs, three empty tables, three indexes.
 // Never call d1 migrations apply or modify d1_migrations.
 wrangler(["d1","execute",DATABASE,"--remote","--config",CONFIG,
  "--file",SQL,"--yes","--json"]);
 const after=state(sql);
 unchanged(baseline,after);
 must(after.installed,"POSTFLIGHT_NOT_INSTALLED");
 must(TABLES_0170.every(x=>after.newCounts[x]===0),"POSTFLIGHT_NEW_ROWS");
 must(CONTACTS_0170.every(x=>true),"POSTFLIGHT_CONTACTS_VALIDATED");
 report("POSTFLIGHT",after,true);
}
try{main()}catch(error){
 const code=error instanceof Error?error.message:"DIRECTORY_0170_UNKNOWN_ERROR";
 console.error(JSON.stringify({phase:"FAILED",stage,code}));
 try{report("FAILED",baseline,false,code)}catch{}
 process.exitCode=1;
}
