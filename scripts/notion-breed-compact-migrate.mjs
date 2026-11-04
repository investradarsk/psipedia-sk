#!/usr/bin/env node
/**
 * Offline-safe, resumable Notion Plemená consolidation utility.
 *
 * Usage:
 *   NOTION_API_TOKEN=... node scripts/notion-breed-compact-migrate.mjs --mode=audit
 *   NOTION_API_TOKEN=... node scripts/notion-breed-compact-migrate.mjs --mode=apply --confirm=BACKUP_344_VERIFIED
 *   NOTION_API_TOKEN=... node scripts/notion-breed-compact-migrate.mjs --mode=verify
 *
 * This NEVER drops a Notion property. It reads all source pages first (stable
 * page-ID inventory), then updates only target fields, one profile at a time.
 * Errors are reported by ID, not hidden behind a whole-database status.
 */
import {
  BREED_COMPACT_MERGE,BREED_COMPACT_VISIBLE,BREED_COMPACT_HIDDEN,
  planBreedCompactMigration,
} from "../lib/breed-notion-compact-consolidation.mjs";

const API="https://api.notion.com/v1";
const VERSION="2025-09-03";
const id=process.env.NOTION_BREEDS_DATA_SOURCE_ID?.trim() ||
  "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2";
const token=process.env.NOTION_API_TOKEN?.trim();
const mode=process.argv.find(v=>v.startsWith("--mode="))?.split("=")[1] ?? "audit";
const confirm=process.argv.find(v=>v.startsWith("--confirm="))?.split("=")[1] ?? "";
const requestedLimit=Number(process.argv.find(v=>v.startsWith("--limit="))?.split("=")[1] ?? "0");
if(!["audit","apply","verify"].includes(mode))throw Error("INVALID_MODE");
if(!token)throw Error("NOTION_API_TOKEN_MISSING");
if(mode==="apply" && confirm!=="BACKUP_344_VERIFIED")throw Error("BACKUP_CONFIRMATION_REQUIRED");
if(requestedLimit && (!Number.isSafeInteger(requestedLimit)||requestedLimit<1))throw Error("INVALID_LIMIT");
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(method,path,body) {
  if(!/^\/(?:data_sources|pages)\//.test(path))throw Error("INVALID_NOTION_PATH");
  for(let attempt=0;attempt<5;attempt++){
    const response=await fetch(API+path,{
      method,
      headers:{
        "Authorization":"Bearer "+token,
        "Notion-Version":VERSION,
        "Content-Type":"application/json",
      },
      ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    });
    if(response.ok)return response.json();
    if([429,500,502,503,504].includes(response.status)&&attempt<4){
      const after=Number(response.headers.get("retry-after")??"0");
      await sleep(Math.max(Number.isFinite(after)?after*1000:0,500*2**attempt));
      continue;
    }
    throw Error("NOTION_HTTP_"+response.status+"_"+path.split("/")[1]);
  }
  throw Error("NOTION_RETRY_EXHAUSTED");
}
async function allPages(){
  const seen=new Set(),pages=[];
  let cursor;
  do{
    const response=await request("POST","/data_sources/"+encodeURIComponent(id)+"/query",{
      page_size:100,...(cursor?{start_cursor:cursor}:{})
    });
    for(const page of response.results??[]){
      if(!page?.id||seen.has(page.id))throw Error("INCOMPLETE_OR_DUPLICATE_PAGE_INVENTORY");
      seen.add(page.id);pages.push(page);
    }
    cursor=response.has_more?response.next_cursor:null;
    if(response.has_more&&!cursor)throw Error("PAGINATION_CURSOR_MISSING");
    await sleep(400);
  }while(cursor);
  if(pages.length!==344)throw Error("EXPECTED_344_PROFILES_FOUND_"+pages.length);
  return pages;
}
function notionText(p) {
  if(!p||typeof p!=="object")return "";
  if(p.type==="date")return String(p.date?.start??"");
  if(p.type==="url")return String(p.url??"");
  if(p.type==="number")return p.number==null?"":String(p.number);
  if(p.type==="checkbox")return p.checkbox?"__YES__":"__NO__";
  if(p.type==="select")return String(p.select?.name??"");
  const spans=p.rich_text??p.title;
  return Array.isArray(spans)?spans.map(x=>x.plain_text??x.text?.content??"").join(""):"";
}
function flat(page) {
  const result={};
  for(const [name,value] of Object.entries(page.properties??{}))result[name]=notionText(value);
  return result;
}
function richText(value){
  const characters=Array.from(value);
  if(characters.length>180000)throw Error("CONTENT_TOO_LONG");
  const out=[];
  for(let offset=0;offset<characters.length;offset+=1800){
    out.push({type:"text",text:{content:characters.slice(offset,offset+1800).join("")}});
  }
  return out;
}
const pages=await allPages();
const list=pages.slice(0,requestedLimit||undefined);
const stats={mode,inventory:pages.length,scanned:0,changed:0,verified:0,skipped:0,
  conflicts:0,propertyWrites:0,unresolvedSources:new Set(),failedIds:[]};
for(const summaryPage of list){
  await sleep(400);
  try{
    const page=mode==="audit"?summaryPage:
      await request("GET","/pages/"+encodeURIComponent(summaryPage.id));
    const raw=flat(page);
    const proposal=planBreedCompactMigration(raw);
    stats.scanned++;
    for(const problem of proposal.blocked)stats.unresolvedSources.add(problem.source);
    if(!proposal.ready){stats.conflicts++;stats.skipped++;stats.failedIds.push(page.id);continue;}
    const keys=Object.keys(proposal.changes);
    if(!keys.length){stats.verified++;continue;}
    if(mode==="audit"){stats.changed++;stats.propertyWrites+=keys.length;continue;}
    if(mode==="verify"){
      // Verification only succeeds after all source fields have been folded
      // into the retained target. No write here.
      stats.conflicts++;stats.failedIds.push(page.id);continue;
    }
    const properties=Object.fromEntries(keys.map(key=>[key,{rich_text:richText(proposal.changes[key])}]));
    await request("PATCH","/pages/"+encodeURIComponent(page.id),{properties});
    await sleep(400);
    const stored=flat(await request("GET","/pages/"+encodeURIComponent(page.id)));
    const mismatch=keys.filter(k=>stored[k]!==proposal.changes[k]);
    if(mismatch.length){stats.conflicts++;stats.failedIds.push(page.id);continue;}
    stats.changed++;stats.verified++;stats.propertyWrites+=keys.length;
  }catch(error){
    stats.conflicts++;stats.failedIds.push(summaryPage.id);
    console.error(JSON.stringify({event:"breed_compact_migration_error",pageId:summaryPage.id,
      code:error instanceof Error?error.message:"UNKNOWN"}));
  }
}
const result={...stats,unresolvedSources:[...stats.unresolvedSources]};
console.log(JSON.stringify(result));
if(stats.conflicts||stats.failedIds.length)process.exitCode=1;
if(mode==="verify"&&stats.scanned!==344)process.exitCode=1;
