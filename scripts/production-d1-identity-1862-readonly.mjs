#!/usr/bin/env node
/** Manual, SELECT-only production D1 investigation of Notion ↔ Admin identity.
 * It cannot publish, unlink, change an ID, create a profile or delete anything.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO="investradarsk/psipedia-sk";
const DATABASE="psipedia-sk-db";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const DATABASE_ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const TEST_PAGE="415793fc-1d18-81ba-a7dc-eabdd37ca3f4";
const TEST_SLUG="test-psipedia-lifecycle-0164-20261111";
const TEST_NAME="TEST – Psipedia 0164 – skúšobná psia škola";
const RECORD_ID=1862;
const FOLDER=resolve(".production-d1-identity-1862");
const CONFIG=resolve(FOLDER,"wrangler.json");
const requireCondition=(ok,code)=>{if(!ok)throw new Error(code)};

function authorize() {
  requireCondition(process.argv.length===2,"IDENTITY_1862_NO_ARGUMENTS_ALLOWED");
  requireCondition(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","IDENTITY_1862_MANUAL_ONLY");
  requireCondition(process.env.GITHUB_REPOSITORY===REPO,"IDENTITY_1862_WRONG_REPO");
  requireCondition(process.env.GITHUB_REF==="refs/heads/main","IDENTITY_1862_MAIN_ONLY");
  requireCondition(process.env.IDENTITY_1862_CONFIRMATION==="CHECK-1862-psipedia-sk-db",
    "IDENTITY_1862_CONFIRMATION_REQUIRED");
  requireCondition(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT,"IDENTITY_1862_WRONG_ACCOUNT");
  requireCondition(Boolean(process.env.CLOUDFLARE_API_TOKEN),"IDENTITY_1862_MISSING_TOKEN");
  const resource=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
  requireCondition(resource.account_id===ACCOUNT && resource.d1?.database_name===DATABASE &&
    resource.d1?.database_id===DATABASE_ID && resource.d1?.binding==="DB",
    "IDENTITY_1862_DATABASE_MISMATCH");
  mkdirSync(FOLDER,{recursive:true});
  writeFileSync(CONFIG,JSON.stringify({
    name:"psipedia-sk-identity-1862-readonly",compatibility_date:"2026-11-11",
    d1_databases:[{binding:"DB",database_name:DATABASE,database_id:DATABASE_ID}],
  },null,2));
}
function wrangler(args) {
  const cmd=process.platform==="win32"?"npx.cmd":"npx";
  const run=spawnSync(cmd,["wrangler",...args],{
    encoding:"utf8",maxBuffer:8*1024*1024,
    env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
  });
  if(run.error)throw run.error;
  requireCondition(run.status===0,"IDENTITY_1862_REMOTE_READ_FAILED");
  return run.stdout??"";
}
function decode(raw) {
  const source=raw.trim();
  try{return JSON.parse(source)}catch{/* optional wrangler banner */}
  for(const start of [source.indexOf("["),source.indexOf("{")]){
    if(start<0)continue;
    for(const marker of ["]","}"]){
      const end=source.lastIndexOf(marker);
      if(end>start)try{return JSON.parse(source.slice(start,end+1))}catch{/*next*/}
    }
  }
  throw Error("IDENTITY_1862_JSON_INVALID");
}
function select(query) {
  requireCondition(/^SELECT\s/i.test(query) && !query.includes(";") &&
    !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE|ATTACH|DETACH|PRAGMA)\b/i.test(query),
    "IDENTITY_1862_NON_READONLY_QUERY");
  const payload=decode(wrangler([
    "d1","execute",DATABASE,"--remote","--config",CONFIG,
    "--command",query,"--json",
  ]));
  const groups=Array.isArray(payload)?payload:[payload];
  requireCondition(groups.length>0 && groups.every(x=>x?.success===true&&Array.isArray(x.results)),
    "IDENTITY_1862_REMOTE_RESULT_UNVERIFIED");
  return groups.flatMap(x=>x.results);
}
const samePage=(value)=>String(value??"").replaceAll("-","").toLowerCase()===TEST_PAGE.replaceAll("-","");
function inspect() {
  const names=select("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('directory_profiles','directory_notion_sync','gemini_notion_created_pages','gemini_automation_concepts','admin_record_tombstones')")
    .map(x=>x.name);
  requireCondition(names.includes("directory_profiles")&&names.includes("directory_notion_sync"),
    "IDENTITY_1862_REQUIRED_TABLES_MISSING");
  const profiles=select("SELECT id,name,slug,category,status,import_key FROM directory_profiles WHERE id=1862 OR id=565 OR slug='test-psipedia-lifecycle-0164-20261111' OR lower(name)=lower('AgiPaws') ORDER BY id LIMIT 30");
  const mapping=select("SELECT notion_page_id,directory_profile_id FROM directory_notion_sync WHERE directory_profile_id IN (1862,565) OR notion_page_id IN ('415793fc-1d18-81ba-a7dc-eabdd37ca3f4','415793fc1d1881baa7dceabdd37ca3f4') ORDER BY directory_profile_id LIMIT 30");
  const geminiPages=names.includes("gemini_notion_created_pages")
    ? select("SELECT notion_page_id,canonical_entity_id,import_agenda,stable_key FROM gemini_notion_created_pages WHERE canonical_entity_id IN (1862,565) OR notion_page_id='415793fc-1d18-81ba-a7dc-eabdd37ca3f4' LIMIT 30"):null;
  const geminiConcepts=names.includes("gemini_automation_concepts")
    ? select("SELECT canonical_entity_id,notion_page_id,status,stable_key FROM gemini_automation_concepts WHERE canonical_entity_id IN (1862,565) LIMIT 30"):null;
  const tombstones=names.includes("admin_record_tombstones")
    ? select("SELECT kind,record_id,record_slug,notion_page_id,state FROM admin_record_tombstones WHERE kind='directory' AND (record_id IN (1862,565) OR record_slug='test-psipedia-lifecycle-0164-20261111') LIMIT 30"):null;
  const current=profiles.find(x=>x.id===RECORD_ID);
  const mappingById=mapping.filter(x=>x.directory_profile_id===RECORD_ID);
  const mappingByPage=mapping.filter(x=>samePage(x.notion_page_id));
  const geminiForId=geminiPages?.some(x=>x.canonical_entity_id===RECORD_ID)||
    geminiConcepts?.some(x=>x.canonical_entity_id===RECORD_ID);
  const safeToTest=Boolean(current?.slug===TEST_SLUG&&current?.name===TEST_NAME&&
    current?.status==="draft"&&mappingById.length===1&&
    samePage(mappingById[0]?.notion_page_id)&&mappingByPage.length===1&&
    mappingByPage[0]?.directory_profile_id===RECORD_ID&&
    !geminiForId&&geminiPages!==null&&geminiConcepts!==null&&
    tombstones!==null&&!tombstones.some(x=>x.record_id===RECORD_ID));
  return {safeToTest,expected:{id:RECORD_ID,name:TEST_NAME,slug:TEST_SLUG,
    notionPageId:TEST_PAGE},current:current??null,profiles,mapping,
    geminiPages,geminiConcepts,tombstones,
    signals:{
      matchingTestSlug:profiles.filter(x=>x.slug===TEST_SLUG).length,
      mappingById:mappingById.length,
      mappingByPage:mappingByPage.length,
      geminiForId:Boolean(geminiForId),
      externalDataIncomplete:geminiPages===null||geminiConcepts===null||tombstones===null,
    }};
}
function main() {
  authorize();
  const report={phase:"READ_ONLY_IDENTITY_AUDIT",timestamp:new Date().toISOString(),
    database:DATABASE,...inspect(),writes:false};
  writeFileSync(resolve(FOLDER,"report.json"),JSON.stringify(report,null,2)+"\n");
  process.stdout.write(JSON.stringify({phase:report.phase,safeToTest:report.safeToTest,
    current:report.current&&{id:report.current.id,name:report.current.name,
      slug:report.current.slug,status:report.current.status},
    mapping:report.mapping,signals:report.signals,writes:false})+"\n");
}
try{main()}catch(e){
  console.error(JSON.stringify({phase:"FAILED",code:e instanceof Error?e.message:"IDENTITY_1862_UNKNOWN"}));
  process.exitCode=1;
}
