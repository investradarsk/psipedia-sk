#!/usr/bin/env node
/**
 * Breed controlled mirror 344: owner-triggered audit/atomic seed.
 * Independent of 0174; touches only missing rows in
 * breed_notion_controlled_values. Does NOT change Notion, managed_breeds,
 * synced receipts or existing controlled mirror rows.
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {
  MIRROR_COHORT,planBreedControlledMirrorBackfill,
  breedControlledMirrorAtomicInsert,isBreedControlledMirrorInsertOnlySql,
} from "../lib/breed-controlled-mirror-backfill.mjs";

const MODE=process.argv[2];
const resources=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
const vars=JSON.parse(readFileSync("wrangler.jsonc","utf8")).vars;
const NAME="psipedia-sk-db", SOURCE="f460b1e5-4454-4a10-9200-3b35106f9e32";
const DIR=resolve(".production-breed-mirror-344");
const CFG=resolve(DIR,"wrangler.json");
const SQL=resolve(DIR,"seed-missing.sql");
const REPORT=resolve(DIR,"report.json");
const required=(ok,code)=>{if(!ok)throw Error("BREED_MIRROR_"+code)};
const uuid=s=>String(s??"").replaceAll("-","").toLowerCase();
const digest=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
let stage="init",bookmark=null,current=null,inserted=false;

function authorize(){
 required(MODE==="audit"||MODE==="apply","MODE_INVALID");
 required(process.env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
   process.env.GITHUB_REF==="refs/heads/main"&&
   process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk",
   "OWNER_MAIN_ONLY");
 required(process.env.BREED_MIRROR_CONFIRMATION===
   (MODE==="audit"?"AUDIT-BREED-MIRRORS-344":"APPLY-BREED-MIRRORS-344"),
   "CONFIRMATION_REQUIRED");
 required(Boolean(process.env.CLOUDFLARE_API_TOKEN)&&
   Boolean(process.env.BREED_MIRROR_NOTION_TOKEN)&&
   process.env.CLOUDFLARE_ACCOUNT_ID===resources.account_id,
   "SECRETS_OR_ACCOUNT_MISMATCH");
 required(resources.d1?.database_name===NAME&&resources.d1?.binding==="DB"&&
   resources.d1?.database_id==="8f7a0c3e-4d77-4a35-8192-a7bd57147950",
   "PRODUCTION_DATABASE_MISMATCH");
 required(vars.NOTION_BREED_WORKCOPY_SYNC_ENABLED==="true"&&
   vars.NOTION_BREED_SYNC_ENABLED==="false"&&
   uuid(vars.NOTION_BREEDS_WORK_DATA_SOURCE_ID)===uuid(SOURCE),
   "NOTION_SOURCE_CONFIG_CHANGED");
 mkdirSync(DIR,{recursive:true});
 writeFileSync(CFG,JSON.stringify({
   name:"psipedia-breed-mirror-344-owner-backfill",
   compatibility_date:"2026-11-19",
   d1_databases:[{binding:"DB",database_name:NAME,
     database_id:resources.d1.database_id}],
 },null,2));
}
function decoded(text){
 const value=text.trim();
 try{return JSON.parse(value)}catch{}
 for(const start of [value.indexOf("["),value.indexOf("{")].filter(i=>i>=0)){
   for(const end of [value.lastIndexOf("]"),value.lastIndexOf("}")].filter(i=>i>start)){
     try{return JSON.parse(value.slice(start,end+1))}catch{}
   }
 }
 throw Error("BREED_MIRROR_REMOTE_JSON_INVALID");
}
function wrangler(args){
 const r=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
   ["--no-install","wrangler",...args],{
   encoding:"utf8",maxBuffer:32*1024*1024,
   env:{...process.env,WRANGLER_SEND_METRICS:"false",
     NO_UPDATE_NOTIFIER:"1"},
 });
 required(!r.error&&r.status===0,"REMOTE_WRANGLER_FAILED");
 return decoded(r.stdout??"");
}
function select(query){
 required(/^SELECT\s/i.test(query)&&!query.includes(";")&&
   !/\b(?:UPDATE|DELETE|DROP|INSERT|ALTER|ATTACH|VACUUM|PRAGMA|REPLACE)\b/i.test(query),
   "SELECT_ONLY_REQUIRED");
 const raw=wrangler(["d1","execute",NAME,"--remote","--config",CFG,
   "--command",query,"--json"]);
 const batches=Array.isArray(raw)?raw:[raw];
 required(batches.length&&batches.every(x=>x?.success!==false&&
   Array.isArray(x?.results)),"REMOTE_SELECT_FAILED");
 return batches.flatMap(x=>x.results);
}
function inspectD1(){
 const breeds=select("SELECT id FROM managed_breeds ORDER BY id");
 const links=select("SELECT breed_id,work_notion_page_id,work_data_source_id,status FROM breed_notion_workcopy_links WHERE status='ACTIVE' ORDER BY breed_id");
 const existing=select("SELECT breed_id,values_json,notion_values_json,revision FROM breed_notion_controlled_values ORDER BY breed_id");
 required(breeds.length===MIRROR_COHORT.breeds&&
   links.length===MIRROR_COHORT.active,"347_344_COUNTS_CHANGED");
 const ids=new Set(links.map(x=>Number(x.breed_id)));
 const extras=breeds.filter(x=>!ids.has(Number(x.id))).map(x=>Number(x.id));
 required(JSON.stringify(extras)===JSON.stringify(MIRROR_COHORT.extraIds),
   "UNLINKED_BREED_IDS_CHANGED");
 required(existing.length<=MIRROR_COHORT.active,"TOO_MANY_EXISTING_MIRRORS");
 return {links,existing};
}
async function fetchNotion(){
 const pages=[],seen=new Set(),cursors=new Set();
 let cursor=null;
 do{
   let response=null;
   for(let attempt=0;attempt<5;attempt++){
     const res=await fetch("https://api.notion.com/v1/data_sources/"+
       encodeURIComponent(SOURCE)+"/query",{
       method:"POST",
       headers:{
         Authorization:"Bearer "+process.env.BREED_MIRROR_NOTION_TOKEN,
         "Notion-Version":"2025-09-03",
         "Content-Type":"application/json",
       },
       body:JSON.stringify({page_size:100,
         ...(cursor?{start_cursor:cursor}:{})}),
     });
     if(res.ok){response=await res.json();break}
     required([429,500,502,503,504].includes(res.status)&&attempt<4,
       "NOTION_HTTP_"+res.status);
     const delay=Math.max(Number(res.headers.get("retry-after")||0)*1000,
       500*2**attempt);
     await new Promise(ok=>setTimeout(ok,delay));
   }
   required(response&&Array.isArray(response.results),"NOTION_RESPONSE_INVALID");
   for(const page of response.results){
     const id=uuid(page.id);
     required(id&&!seen.has(id),"NOTION_DUPLICATE_PAGE");
     seen.add(id);pages.push(page);
   }
   cursor=response.has_more?response.next_cursor:null;
   required(!response.has_more||(cursor&&!cursors.has(cursor)),
     "NOTION_CURSOR_INVALID");
   if(cursor)cursors.add(cursor);
   required(pages.length<=344,"NOTION_TOO_MANY_PAGES");
 }while(cursor);
 required(pages.length===344,"NOTION_MUST_HAVE_344_PAGES");
 return pages;
}
async function prepared(){
 const [d1,pages]=await Promise.all([Promise.resolve().then(inspectD1),fetchNotion()]);
 const plan=planBreedControlledMirrorBackfill({
   links:d1.links,pages,existing:d1.existing,expectedSource:SOURCE,
 });
 current={ready:plan.ready,activeLinks:plan.linkedCount,
   notionPages:plan.notionCount,existing:plan.existingCount,
   missing:plan.missingCount,issues:plan.issues.slice(0,30)};
 required(plan.ready,"AUDIT_BLOCKED_"+plan.issues[0]?.code);
 return {d1,plan};
}
function recovery(){
 const response=wrangler(["d1","time-travel","info",NAME,
   "--config",CFG,"--json"]);
 const find=x=>{
   if(!x||typeof x!=="object")return null;
   if(typeof x.bookmark==="string"&&x.bookmark)return x.bookmark;
   for(const v of Object.values(x)){const found=find(v);if(found)return found}
   return null;
 };
 bookmark=find(response);
 required(Boolean(bookmark),"RECOVERY_BOOKMARK_MISSING");
}
function report(phase,error=null){
 const r={phase,mode:MODE,githubSha:process.env.GITHUB_SHA,
   dbName:NAME,databaseId:resources.d1.database_id,
   audit:current,applied:inserted,
   recoveryBookmark:bookmark,notionPatched:false,
   existingRowsUpdated:false,publicCutover:false,
   ...(error?{error}:{})};
 mkdirSync(DIR,{recursive:true});
 writeFileSync(REPORT,JSON.stringify(r,null,2)+"\n");
 console.log(JSON.stringify({phase,mode:MODE,
   existing:current?.existing,missing:current?.missing,
   applied:inserted,issues:current?.issues?.slice(0,4),error}));
}

async function main(){
 authorize();
 stage="audit";
 const first=await prepared();
 if(MODE==="audit"||first.plan.missingCount===0){
   report(first.plan.missingCount?"audit-ready":"already-complete");
   return;
 }
 recovery();
 stage="fresh-preflight";
 const second=await prepared();
 const stable=x=>digest({
   links:x.d1.links,existing:x.d1.existing,
   candidates:x.plan.newRows,
 });
 required(stable(first)===stable(second),"NOTION_OR_D1_CHANGED_AFTER_AUDIT");
 const sql=breedControlledMirrorAtomicInsert(second.plan,SOURCE);
 required(isBreedControlledMirrorInsertOnlySql(sql),
   "SQL_INSERT_ONLY_REQUIRED");
 stage="apply";
 writeFileSync(SQL,sql+"\n",{mode:0o600});
 try{
   const result=wrangler(["d1","execute",NAME,"--remote",
     "--config",CFG,"--file",SQL,"--yes","--json"]);
   const batches=Array.isArray(result)?result:[result];
   required(batches.length>0&&batches.every(x=>x?.success!==false),
     "D1_ATOMIC_INSERT_FAILED");
 }finally{unlinkSync(SQL)}
 inserted=true;
 stage="postflight";
 const third=await prepared();
 required(third.plan.missingCount===0&&third.plan.existingCount===344,
   "POSTFLIGHT_NOT_344");
 for(const old of second.d1.existing){
   const found=third.d1.existing.find(x=>Number(x.breed_id)===Number(old.breed_id));
   required(found&&found.values_json===old.values_json&&
     found.notion_values_json===old.notion_values_json&&
     Number(found.revision)===Number(old.revision),
     "EXISTING_MIRROR_CHANGED");
 }
 report("postflight-success");
}
main().catch(e=>{
 const code=e instanceof Error?e.message:"BREED_MIRROR_UNKNOWN";
 console.error(JSON.stringify({phase:"blocked",stage,code}));
 try{report("blocked",code)}catch{}
 process.exitCode=1;
});
