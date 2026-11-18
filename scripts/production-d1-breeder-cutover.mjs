#!/usr/bin/env node
/** Owner-dispatched freeze, audit and guarded reset. No automatic deploy hook. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BREEDER_0169_FILE, BREEDER_0169_GIT_BLOB, BREEDER_0169_OBJECTS,
  BREEDER_0169_DEPENDENCIES, assertBreeder0169State, assertBreeder0169PinnedDdl,
} from "../lib/production-d1-breeder-0169-guard.mjs";

import { FREEZE_TRIGGERS, inspectFreeze, SNAPSHOT, OUTSIDE, GUARDED_RESET_SQL, RELEASE_SQL } from "../lib/production-d1-breeder-cutover.mjs";
const mode = process.argv[2] ?? "";
const DATABASE = "psipedia-sk-db";
const ACCOUNT = "5ff902d3d80376478b9213b2b8ae8d6e";
const DATABASE_ID = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ROOT = resolve(".");
const OUTPUT = resolve(".production-d1-breeder-cutover");
const CONFIG = resolve(OUTPUT, "wrangler.json");
const REPORT = resolve(OUTPUT, "report.json");
const SQL = resolve(ROOT, "drizzle", BREEDER_0169_FILE);
const failUnless = (ok, code) => { if (!ok) throw Error("BREEDER_0169_" + code); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
let state = null;
let stage = "START";

function authorize() {
  failUnless(["audit","freeze","reset","release"].includes(mode), "INVALID_MODE");
  failUnless(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "MANUAL_ONLY");
  failUnless(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk", "REPOSITORY");
  failUnless(process.env.GITHUB_REF === "refs/heads/main", "MAIN_ONLY");
  failUnless(Boolean(process.env.GITHUB_SHA), "COMMIT_MISSING");
  failUnless(process.env.CLOUDFLARE_ACCOUNT_ID === ACCOUNT, "ACCOUNT_MISMATCH");
  failUnless(Boolean(process.env.CLOUDFLARE_API_TOKEN), "PROTECTED_TOKEN_MISSING");
  const expected = mode.toUpperCase()+"-BREEDER-CUTOVER-psipedia-sk-db";
  failUnless(process.env.BREEDER_CUTOVER_CONFIRMATION === expected, "CONFIRMATION_REQUIRED");
}

function readPinnedSql() {
  const bytes=readFileSync(SQL);
  const blob=createHash("sha1")
    .update(Buffer.concat([Buffer.from("blob " + bytes.length + "\0"), bytes]))
    .digest("hex");
  failUnless(blob === BREEDER_0169_GIT_BLOB, "PINNED_SQL_CHANGED");
  const sql=bytes.toString("utf8");
  assertBreeder0169PinnedDdl(sql);
  return sql;
}

function prepare() {
  const resources=JSON.parse(readFileSync(resolve(ROOT,"config/cloudflare-resources.json"),"utf8"));
  failUnless(resources.account_id === ACCOUNT &&
    resources.d1?.database_name === DATABASE &&
    resources.d1?.database_id === DATABASE_ID &&
    resources.d1?.binding === "DB", "TARGET_IDENTITY_MISMATCH");
  mkdirSync(OUTPUT,{recursive:true});
  // Restricted configuration has NO migrations_dir; generic migration apply is impossible.
  writeFileSync(CONFIG,JSON.stringify({
    name:"psipedia-breeder-links-reset-manual",
    compatibility_date:"2026-11-17",
    d1_databases:[{binding:"DB",database_name:DATABASE,database_id:DATABASE_ID}],
  },null,2));
}

function parseJson(value) {
  const raw=value.trim();
  try { return JSON.parse(raw); } catch { /* Wrangler may print a banner */ }
  for (const start of [raw.indexOf("["),raw.indexOf("{")].filter(n=>n>=0)) {
    for (const endChar of ["]","}"]) {
      const end=raw.lastIndexOf(endChar);
      if (end<=start) continue;
      try { return JSON.parse(raw.slice(start,end+1)); } catch { /* fallback */ }
    }
  }
  throw Error("BREEDER_0169_UNPARSEABLE_WRANGLER_JSON");
}

function wrangler(args) {
  const child=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["--no-install","wrangler",...args],{
      encoding:"utf8",maxBuffer:10*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
    });
  failUnless(!child.error && child.status===0,"WRANGLER_FAILURE");
  return child.stdout ?? "";
}

function select(command) {
  failUnless(/^\s*SELECT\b/i.test(command) && !command.includes(";"), "SELECT_ONLY");
  const response=parseJson(wrangler(["d1","execute",DATABASE,"--remote",
    "--config",CONFIG,"--command",command,"--json"]));
  const pages=Array.isArray(response)?response:[response];
  failUnless(pages.length>0 && pages.every(page=>
    page.success!==false && Array.isArray(page.results)), "REMOTE_READ_FAILED");
  return pages.flatMap(page=>page.results);
}

function queryState(sql) {
  const names=[...BREEDER_0169_DEPENDENCIES,...BREEDER_0169_OBJECTS];
  const quoted=names.map(name=>"'"+name+"'").join(",");
  const rows=select("SELECT type,name,sql FROM sqlite_master WHERE name IN ("+quoted+") ORDER BY name");
  const historyNames=select("SELECT name FROM d1_migrations ORDER BY id").map(row=>row.name);
  const hasTable=rows.some(row=>row.name===BREEDER_0169_OBJECTS[0] && row.type==="table");
  const columns=hasTable?
    select("SELECT name,type,\"notnull\" AS \"notnull\",pk FROM pragma_table_info('directory_breeder_club_relations')"):[];
  const indexes=hasTable?
    select("SELECT name,\"unique\" AS \"unique\" FROM pragma_index_list('directory_breeder_club_relations')"):[];
  const indexColumns={};
  if(hasTable)for(const name of BREEDER_0169_OBJECTS.slice(1)){
    indexColumns[name]=select("SELECT name FROM pragma_index_info('"+name+"') ORDER BY seqno").map(x=>x.name);
  }
  const originalCount=hasTable?
    Number(select("SELECT COUNT(*) AS n FROM directory_breeder_club_relations")[0]?.n):0;
  const counts=select("SELECT "+
    "(SELECT COUNT(*) FROM directory_profiles WHERE category='chovatelske-stanice') AS stations,"+
    "(SELECT COUNT(*) FROM directory_profiles WHERE category='chovatelske-kluby') AS clubs,"+
    "(SELECT COUNT(*) FROM breed_directory_relations r JOIN directory_profiles d ON d.id=r.profile_id WHERE d.category IN ('chovatelske-stanice','chovatelske-kluby')) AS old_breed_links")[0];
  failUnless(Boolean(counts) && Object.values(counts).every(v=>Number.isSafeInteger(Number(v))),
    "COUNTS_INVALID");
  const inspected=assertBreeder0169State({
    sql,rows,historyNames,columns,indexes,indexColumns,originalCount,
  });
  const dependencies=rows.filter(row=>BREEDER_0169_DEPENDENCIES.includes(row.name));
  return {
    ...inspected,
    ledgerHash:sha256(JSON.stringify(historyNames)),
    dependencyHash:sha256(JSON.stringify(dependencies)),
    profiles:{stations:Number(counts.stations),clubs:Number(counts.clubs)},
    oldBreedLinks:Number(counts.old_breed_links),
    newStationClubLinks:originalCount,
  };
}

const scalar = (sql) => select("SELECT ("+sql+") AS value")[0]?.value;
function inspect(sql) {
  const schema=queryState(sql);
  failUnless(schema.installed && schema.newStationClubLinks===0,"RESET_REQUIRES_EMPTY_0169");
  const snapshot=scalar(SNAPSHOT);
  const outside=scalar(OUTSIDE);
  failUnless(typeof snapshot==="string" && typeof outside==="string","RESET_SNAPSHOT_INVALID");
  const rows=JSON.parse(snapshot), outsideRows=JSON.parse(outside);
  failUnless(Array.isArray(rows) && rows.length===schema.oldBreedLinks &&
    rows.every(r=>r.length===6 && Number.isSafeInteger(r[0]) && Number.isSafeInteger(r[1]) &&
      r[0]>0 && r[1]>0 && r.slice(2).every(v=>typeof v==="string")), "RESET_ROWS_INVALID");
  const triggers=select("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='trigger' AND (tbl_name IN ('breed_directory_relations','directory_breeder_club_relations') OR name LIKE 'psipedia_breeder_cutover_%') ORDER BY name");
  const missing=inspectFreeze(triggers);
  const counts=select("SELECT p.category, COUNT(*) AS n FROM breed_directory_relations r JOIN directory_profiles p ON p.id=r.profile_id WHERE p.category IN ('chovatelske-stanice','chovatelske-kluby') GROUP BY p.category ORDER BY p.category");
  const profiles=select("SELECT p.id,p.category,m.notion_page_id FROM directory_profiles p LEFT JOIN directory_notion_sync m ON p.id=m.directory_profile_id WHERE p.category IN ('chovatelske-stanice','chovatelske-kluby') ORDER BY p.id");
  failUnless(profiles.length===schema.profiles.stations+schema.profiles.clubs &&
    new Set(profiles.map(p=>p.id)).size===profiles.length,"RESET_MAPPING_INVALID");
  return {schema,snapshot,outside,missing,outsideHash:sha256(outside),outsideCount:outsideRows.length,
    counts,profiles,profileHash:sha256(JSON.stringify(profiles)),fingerprint:sha256(snapshot)};
}


let bookmark=null;
function findBookmark(value){
  if(!value||typeof value!=="object")return null;
  if(typeof value.bookmark==="string"&&value.bookmark)return value.bookmark;
  for(const item of Object.values(value)){const found=findBookmark(item);if(found)return found;}
  return null;
}
function recoveryPoint(){
  const value=findBookmark(parseJson(wrangler(["d1","time-travel","info",DATABASE,"--config",CONFIG,"--json"])));
  failUnless(Boolean(value),"RECOVERY_BOOKMARK_MISSING");return value;
}
async function write(sql,params=[]){
  // One fixed statement per request. Never rely on REST multi-statement atomicity.
  failUnless(FREEZE_TRIGGERS.some(t=>t.sql===sql)||sql===GUARDED_RESET_SQL||RELEASE_SQL.includes(sql),"WRITE_NOT_ALLOWLISTED");
  const resp=await fetch("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/d1/database/"+DATABASE_ID+"/query",{
    method:"POST",headers:{Authorization:"Bearer "+process.env.CLOUDFLARE_API_TOKEN,"Content-Type":"application/json"},
    body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(60000),
  });
  const data=await resp.json();
  failUnless(resp.ok&&data.success===true&&Array.isArray(data.result)&&data.result.length===1&&data.result[0].success===true,"D1_WRITE_FAILED");
  return data.result[0];
}
function report(phase,now,errorCode=null){
  stage=phase;
  mkdirSync(OUTPUT,{recursive:true});
  const data={phase,mode,database:DATABASE,sourceCommit:process.env.GITHUB_SHA,bookmark,
    snapshotFingerprint:now?.fingerprint??null,counts:now?.counts??null,profiles:now?.schema.profiles??null,
    oldBreedLinks:now?.schema.oldBreedLinks??null,newStationClubLinks:now?.schema.newStationClubLinks??null,
    outsideCount:now?.outsideCount??null,outsideHash:now?.outsideHash??null,
    missingFreezeTriggers:now?.missing.map(t=>t.name)??null,
    mappedProfiles:now?.profiles.filter(p=>p.notion_page_id).length??null,
    unmappedProfiles:now?.profiles.filter(p=>!p.notion_page_id).length??null,
    notion:{verifiedByWorkflow:false},errorCode};
  writeFileSync(REPORT,JSON.stringify(data,null,2)+"\n");console.log(JSON.stringify(data));
}
function same(a,b){
  failUnless(a.snapshot===b.snapshot&&a.outside===b.outside&&a.profileHash===b.profileHash&&
    a.schema.ledgerHash===b.schema.ledgerHash&&a.schema.dependencyHash===b.schema.dependencyHash,"SNAPSHOT_CHANGED");
}
function expected(s){
  failUnless(/^[a-f0-9]{64}$/.test(process.env.BREEDER_CUTOVER_FINGERPRINT??"")&&
    s.fingerprint===process.env.BREEDER_CUTOVER_FINGERPRINT,"EXPECTED_FINGERPRINT_MISMATCH");
  failUnless(s.profiles.every(p=>Boolean(p.notion_page_id)),"UNMAPPED_PROFILE");
  failUnless(s.schema.oldBreedLinks>0,"RESET_ALREADY_EMPTY");
}
async function run(){
  authorize();const sql=readPinnedSql();prepare();state=inspect(sql);
  if(mode==="audit"){report("AUDIT",state);return;}
  if(mode==="release"){
    failUnless(process.env.BREEDER_CUTOVER_RELEASE==="NEW-1414-RUNTIME-VERIFIED","RELEASE_DEPLOYMENT_VERIFICATION_REQUIRED");
    failUnless(process.env.BREEDER_CUTOVER_NOTION==="NOTION-RELATION-FIELDS-VERIFIED-EMPTY","NOTION_VERIFICATION_REQUIRED");
    failUnless(state.schema.oldBreedLinks===0 && state.schema.newStationClubLinks===0 && state.outsideCount===0 &&
      state.snapshot==="[]" && state.fingerprint===process.env.BREEDER_CUTOVER_FINGERPRINT,"RELEASE_NOT_EMPTY");
    failUnless(state.profiles.every(p=>Boolean(p.notion_page_id)),"UNMAPPED_PROFILE");
    failUnless(state.missing.length<FREEZE_TRIGGERS.length,"RELEASE_ALREADY_UNLOCKED");
    bookmark=recoveryPoint();report("RELEASE_RECOVERY_POINT",state);
    const fresh=inspect(sql);same(state,fresh);
    failUnless(JSON.stringify(state.missing)===JSON.stringify(fresh.missing),"RELEASE_TRIGGER_DRIFT");
    for(const t of FREEZE_TRIGGERS){
      if(!fresh.missing.some(m=>m.name===t.name))await write("DROP TRIGGER "+t.name);
    }
    const after=inspect(sql);same(fresh,after);
    failUnless(after.missing.length===FREEZE_TRIGGERS.length,"RELEASE_INCOMPLETE");
    report("RELEASE_POSTFLIGHT",after);return;
  }
  expected(state);bookmark=recoveryPoint();report("RECOVERY_POINT",state);
  if(mode==="freeze"){
    // Partial application is detectable and safe to resume after inspection.
    for(const t of state.missing)await write(t.sql);
    const after=inspect(sql);same(state,after);
    failUnless(after.missing.length===0,"FREEZE_INCOMPLETE");
    report("FROZEN",after);return;
  }
  failUnless(state.missing.length===0,"FREEZE_INCOMPLETE");
  failUnless(process.env.BREEDER_CUTOVER_NOTION==="NOTION-RELATION-FIELDS-VERIFIED-EMPTY","NOTION_VERIFICATION_REQUIRED");
  const fresh=inspect(sql);same(state,fresh);expected(fresh);
  failUnless(fresh.missing.length===0,"FREEZE_INCOMPLETE");
  const receipt=await write(GUARDED_RESET_SQL,[fresh.snapshot,fresh.outside]);
  failUnless(Number(receipt.meta?.changes)===fresh.schema.oldBreedLinks,"RESET_ROW_COUNT_MISMATCH");
  const after=inspect(sql);
  failUnless(after.schema.oldBreedLinks===0&&after.schema.newStationClubLinks===0&&after.missing.length===0&&
    after.outside===fresh.outside&&after.profileHash===fresh.profileHash&&
    after.schema.ledgerHash===fresh.schema.ledgerHash&&after.schema.dependencyHash===fresh.schema.dependencyHash,"RESET_POSTFLIGHT_FAILED");
  report("RESET_POSTFLIGHT",after);
}
try{await run();}catch(error){
  const code=error instanceof Error?error.message:"CUTOVER_UNKNOWN";
  console.error(JSON.stringify({phase:"FAILED",stage,code}));
  try{report("FAILED",state,code);}catch{/* fail closed */}
  process.exitCode=1;
}
