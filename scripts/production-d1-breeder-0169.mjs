#!/usr/bin/env node
/**
 * Isolated, owner-dispatched D1 0169 schema operation.
 * Audit: read-only. Apply: ONLY pinned empty station-club table + 2 indexes.
 * Does not run generic migrations, backfill JSON, clear links, or edit the ledger.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BREEDER_0169_FILE, BREEDER_0169_GIT_BLOB, BREEDER_0169_OBJECTS,
  BREEDER_0169_DEPENDENCIES, assertBreeder0169State, assertBreeder0169PinnedDdl,
} from "../lib/production-d1-breeder-0169-guard.mjs";

const mode = process.argv[2] ?? "";
const DATABASE = "psipedia-sk-db";
const ACCOUNT = "5ff902d3d80376478b9213b2b8ae8d6e";
const DATABASE_ID = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ROOT = resolve(".");
const OUTPUT = resolve(".production-d1-breeder-0169");
const CONFIG = resolve(OUTPUT, "wrangler.json");
const REPORT = resolve(OUTPUT, "report.json");
const SQL = resolve(ROOT, "drizzle", BREEDER_0169_FILE);
const failUnless = (ok, code) => { if (!ok) throw Error("BREEDER_0169_" + code); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
let bookmark = null;
let state = null;
let stage = "START";

function authorize() {
  failUnless(["audit", "apply"].includes(mode), "INVALID_MODE");
  failUnless(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "MANUAL_ONLY");
  failUnless(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk", "REPOSITORY");
  failUnless(process.env.GITHUB_REF === "refs/heads/main", "MAIN_ONLY");
  failUnless(Boolean(process.env.GITHUB_SHA), "COMMIT_MISSING");
  failUnless(process.env.CLOUDFLARE_ACCOUNT_ID === ACCOUNT, "ACCOUNT_MISMATCH");
  failUnless(Boolean(process.env.CLOUDFLARE_API_TOKEN), "PROTECTED_TOKEN_MISSING");
  const expected = (mode === "apply" ? "APPLY" : "AUDIT") + "-0169-psipedia-sk-db";
  failUnless(process.env.BREEDER_0169_CONFIRMATION === expected, "CONFIRMATION_REQUIRED");
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
    name:"psipedia-breeder-links-0169-manual",
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
    select("SELECT name,type,\"notnull\" AS notnull,pk FROM pragma_table_info('directory_breeder_club_relations')"):[];
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

function findBookmark(value) {
  if(!value || typeof value!=="object")return null;
  if(typeof value.bookmark==="string" && value.bookmark)return value.bookmark;
  for(const item of Object.values(value)){
    const found=findBookmark(item);
    if(found)return found;
  }
  return null;
}
function timeTravelBookmark() {
  const response=parseJson(wrangler(["d1","time-travel","info",DATABASE,
    "--config",CONFIG,"--json"]));
  const value=findBookmark(response);
  failUnless(Boolean(value),"RECOVERY_BOOKMARK_MISSING");
  return value;
}
function report(phase,now,applied,errorCode=null){
  stage=phase;
  const data={
    phase,mode,migration:BREEDER_0169_FILE,pinnedGitBlob:BREEDER_0169_GIT_BLOB,
    sourceCommit:process.env.GITHUB_SHA,
    database:DATABASE,
    installed:now?.installed??null,
    originalBreedLinks:now?.oldBreedLinks??null,
    originalProfileCounts:now?.profiles??null,
    newStationClubLinks:now?.newStationClubLinks??null,
    ledgerHash:now?.ledgerHash??null,
    dependencyHash:now?.dependencyHash??null,
    bookmark,applied,migrationLedgerWritten:false,legacyBackfill:false,
    ...(errorCode?{errorCode}:{}),
  };
  mkdirSync(OUTPUT,{recursive:true});
  writeFileSync(REPORT,JSON.stringify(data,null,2)+"\n");
  console.log(JSON.stringify({phase,installed:data.installed,applied,
    newStationClubLinks:data.newStationClubLinks,migrationLedgerWritten:false,errorCode}));
}

function requireUnchanged(a,b){
  failUnless(a.ledgerHash===b.ledgerHash,"LEDGER_CHANGED");
  failUnless(a.dependencyHash===b.dependencyHash,"DEPENDENCIES_CHANGED");
  failUnless(JSON.stringify(a.profiles)===JSON.stringify(b.profiles),"PROFILE_COUNTS_CHANGED");
  failUnless(a.oldBreedLinks===b.oldBreedLinks,"EXISTING_BREED_LINKS_CHANGED");
}

function run() {
  authorize();
  const sql=readPinnedSql();
  prepare();
  state=queryState(sql);
  if(mode==="audit"){
    report("AUDIT",state,false);
    return;
  }
  if(state.installed){
    report("ALREADY_INSTALLED",state,false);
    return;
  }
  failUnless(state.readyToApply,"SCHEMA_NOT_READY");
  bookmark=timeTravelBookmark();
  const fresh=queryState(sql);
  requireUnchanged(state,fresh);
  failUnless(!fresh.installed,"CONCURRENT_SCHEMA");
  report("RECOVERY_POINT",fresh,null);
  // The ONLY remote write: exactly the pinned file with CREATE TABLE + 2 INDEX.
  wrangler(["d1","execute",DATABASE,"--remote","--config",CONFIG,
    "--file",SQL,"--yes","--json"]);
  const after=queryState(sql);
  requireUnchanged(state,after);
  failUnless(after.installed && after.newStationClubLinks===0,"POSTFLIGHT_SCHEMA_OR_ROWS");
  report("POSTFLIGHT",after,true);
}

try { run(); }
catch(error) {
  const code=error instanceof Error?error.message:"BREEDER_0169_UNKNOWN";
  console.error(JSON.stringify({phase:"FAILED",stage,code}));
  try { report("FAILED",state,null,code); } catch { /* error already logged */ }
  process.exitCode=1;
}
