#!/usr/bin/env node
/** Standalone read-only audit and guarded one-time station/club breed relation reset. */
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
const OUTPUT = resolve(".production-d1-breeder-link-reset");
const CONFIG = resolve(OUTPUT, "wrangler.json");
const REPORT = resolve(OUTPUT, "report.json");
const SQL = resolve(ROOT, "drizzle", BREEDER_0169_FILE);
const failUnless = (ok, code) => { if (!ok) throw Error("BREEDER_0169_" + code); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
let bookmark = null;
let state = null;
let stage = "START";

function authorize() {
  failUnless(["audit", "reset"].includes(mode), "INVALID_MODE");
  failUnless(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "MANUAL_ONLY");
  failUnless(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk", "REPOSITORY");
  failUnless(process.env.GITHUB_REF === "refs/heads/main", "MAIN_ONLY");
  failUnless(Boolean(process.env.GITHUB_SHA), "COMMIT_MISSING");
  failUnless(process.env.CLOUDFLARE_ACCOUNT_ID === ACCOUNT, "ACCOUNT_MISMATCH");
  failUnless(Boolean(process.env.CLOUDFLARE_API_TOKEN), "PROTECTED_TOKEN_MISSING");
  const expected = (mode === "reset" ? "RESET-BREEDER-LINKS" : "AUDIT-BREEDER-LINKS") + "-psipedia-sk-db";
  failUnless(process.env.BREEDER_RESET_CONFIRMATION === expected, "CONFIRMATION_REQUIRED");
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

const SCOPE = "SELECT id FROM directory_profiles WHERE category IN ('chovatelske-stanice','chovatelske-kluby')";
const SNAPSHOT = "SELECT COALESCE(json_group_array(json_array(breed_id,profile_id,relation_type,source,created_at,created_by)),'[]') FROM (SELECT breed_id,profile_id,relation_type,source,created_at,created_by FROM breed_directory_relations WHERE profile_id IN ("+SCOPE+") ORDER BY profile_id,breed_id)";
const OUTSIDE = "SELECT COALESCE(json_group_array(json_array(breed_id,profile_id,relation_type,source,created_at,created_by)),'[]') FROM (SELECT breed_id,profile_id,relation_type,source,created_at,created_by FROM breed_directory_relations WHERE profile_id NOT IN ("+SCOPE+") ORDER BY profile_id,breed_id)";
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
  const triggers=select("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='breed_directory_relations'");
  failUnless(triggers.length===0,"RESET_TRIGGER_REVIEW_REQUIRED");
  const counts=select("SELECT p.category, COUNT(*) AS n FROM breed_directory_relations r JOIN directory_profiles p ON p.id=r.profile_id WHERE p.category IN ('chovatelske-stanice','chovatelske-kluby') GROUP BY p.category ORDER BY p.category");
  const profiles=select("SELECT p.id,p.category,m.notion_page_id FROM directory_profiles p LEFT JOIN directory_notion_sync m ON p.id=m.directory_profile_id WHERE p.category IN ('chovatelske-stanice','chovatelske-kluby') ORDER BY p.id");
  failUnless(profiles.length===schema.profiles.stations+schema.profiles.clubs &&
    new Set(profiles.map(p=>p.id)).size===profiles.length,"RESET_MAPPING_INVALID");
  return {schema,snapshot,outsideHash:sha256(outside),outsideCount:outsideRows.length,
    counts,profiles,profileHash:sha256(JSON.stringify(profiles)),fingerprint:sha256(snapshot)};
}
const notionId=v=>String(v??"").replace(/-/g,"").toLowerCase();
function textProperty(p) {
  if(!p || p.type!=="rich_text" || !Array.isArray(p.rich_text)) throw Error("RESET_NOTION_PROPERTY_TYPE");
  return p.rich_text.map(t=>t.plain_text??t.text?.content??"").join("");
}
async function verifyNotion(profiles) {
  const token=process.env.NOTION_API_TOKEN, source=process.env.NOTION_DIRECTORY_DATA_SOURCE_ID;
  if(!token || !source) return {verified:false,reason:"NOTION_CREDENTIALS_MISSING"};
  const mapped=profiles.filter(p=>p.notion_page_id);
  if(mapped.length!==profiles.length) return {verified:false,reason:"UNMAPPED_PROFILES",unmapped:profiles.length-mapped.length};
  const targets=new Map(mapped.map(p=>[notionId(p.notion_page_id),p]));
  if(targets.size!==mapped.length) throw Error("RESET_DUPLICATE_NOTION_MAPPING");
  const seen=new Set(); let nonempty=0, cursor, pages=0;
  do {
    if(++pages>100) throw Error("RESET_NOTION_PAGE_LIMIT");
    const resp=await fetch("https://api.notion.com/v1/data_sources/"+encodeURIComponent(source)+"/query",{
      method:"POST",headers:{Authorization:"Bearer "+token,"Notion-Version":"2025-09-03","Content-Type":"application/json"},
      body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})}),signal:AbortSignal.timeout(30000)});
    if(!resp.ok) throw Error("RESET_NOTION_HTTP_"+resp.status);
    const data=await resp.json();
    if(!Array.isArray(data.results)) throw Error("RESET_NOTION_RESPONSE_INVALID");
    for(const page of data.results) {
      const id=notionId(page.id), profile=targets.get(id);
      if(!profile) continue;
      if(seen.has(id)||page.archived||page.in_trash||notionId(page.parent?.data_source_id)!==notionId(source)) throw Error("RESET_NOTION_IDENTITY");
      seen.add(id);
      const props=page.properties??{};
      const identity=props["Psipedia ID"];
      const value=identity?.type==="number"?String(identity.number):textProperty(identity);
      if(value!==String(profile.id)) throw Error("RESET_NOTION_PROFILE_ID_MISMATCH");
      // A missing property cannot be interpreted by the sync; existing properties must be plain text and empty.
      const fields=profile.category==="chovatelske-stanice"?["Prepojené plemená","Prepojené kluby"]:["Prepojené plemená"];
      for(const name of fields) if(Object.hasOwn(props,name)&&textProperty(props[name]).trim()) nonempty++;
    }
    cursor=data.has_more?data.next_cursor:null;
    if(data.has_more&&!cursor) throw Error("RESET_NOTION_CURSOR_MISSING");
  }while(cursor);
  return {verified:seen.size===targets.size&&nonempty===0,mapped:targets.size,seen:seen.size,nonemptyFields:nonempty};
}
function report(phase, now, notion, errorCode=null) {
  stage=phase;
  mkdirSync(OUTPUT,{recursive:true});
  const data={phase,mode,database:DATABASE,sourceCommit:process.env.GITHUB_SHA,bookmark,
    snapshotFingerprint:now?.fingerprint??null,counts:now?.counts??null,
    profiles:now?.schema.profiles??null,oldBreedLinks:now?.schema.oldBreedLinks??null,
    newStationClubLinks:now?.schema.newStationClubLinks??null,outsideCount:now?.outsideCount??null,
    outsideHash:now?.outsideHash??null,notion,errorCode};
  writeFileSync(REPORT,JSON.stringify(data,null,2)+"\n");
  console.log(JSON.stringify(data));
}
function unchanged(a,b){
  failUnless(a.snapshot===b.snapshot&&a.outsideHash===b.outsideHash&&a.profileHash===b.profileHash&&
    a.schema.ledgerHash===b.schema.ledgerHash&&a.schema.dependencyHash===b.schema.dependencyHash,"RESET_CONCURRENT_CHANGE");
}
async function run(){
  authorize();
  const sql=readPinnedSql(); prepare();
  state=inspect(sql);
  let notion=await verifyNotion(state.profiles);
  if(mode==="audit"){report("AUDIT",state,notion);return;}
  failUnless(false,"RESET_DISABLED_PENDING_RUNTIME_FREEZE_AND_NOTION_VERIFICATION");
  failUnless(notion.verified,"RESET_NOTION_NOT_CLEARED");
  failUnless(process.env.BREEDER_RESET_FREEZE==="EDITORS-AND-SYNC-QUIESCENT","RESET_FREEZE_REQUIRED");
  failUnless(/^[a-f0-9]{64}$/.test(process.env.BREEDER_RESET_FINGERPRINT??"")&&
    state.fingerprint===process.env.BREEDER_RESET_FINGERPRINT,"RESET_AUDIT_FINGERPRINT_MISMATCH");
  failUnless(state.schema.oldBreedLinks>0,"RESET_ALREADY_EMPTY");
  bookmark=timeTravelBookmark();
  const fresh=inspect(sql); unchanged(state,fresh);
  notion=await verifyNotion(fresh.profiles);
  failUnless(notion.verified,"RESET_NOTION_CHANGED");
  report("RECOVERY_POINT",fresh,notion);
  // The single write is constrained to the audited scope. The full ordered row
  // snapshot is compared atomically by SQLite, including creation metadata.
  const literal="'"+fresh.snapshot.replace(/'/g,"''")+"'";
  const command="DELETE FROM breed_directory_relations WHERE profile_id IN ("+SCOPE+
    ") AND (SELECT COUNT(*) FROM directory_breeder_club_relations)=0 AND ("+SNAPSHOT+")="+literal;
  wrangler(["d1","execute",DATABASE,"--remote","--config",CONFIG,"--command",command,"--yes","--json"]);
  const after=inspect(sql);
  failUnless(after.schema.oldBreedLinks===0 && after.outsideHash===fresh.outsideHash &&
    after.profileHash===fresh.profileHash&&after.schema.ledgerHash===fresh.schema.ledgerHash&&
    after.schema.dependencyHash===fresh.schema.dependencyHash,"RESET_POSTFLIGHT_FAILED");
  const finalNotion=await verifyNotion(after.profiles);
  failUnless(finalNotion.verified,"RESET_POSTFLIGHT_NOTION_CHANGED");
  report("POSTFLIGHT",after,finalNotion);
}
try{await run();}catch(error){
  const code=error instanceof Error?error.message:"RESET_UNKNOWN";
  console.error(JSON.stringify({phase:"FAILED",stage,code}));
  try{report("FAILED",state,null,code);}catch{}
  process.exitCode=1;
}
