#!/usr/bin/env node
/** Single owner-dispatched Notion -> SQL import. Legacy JSON is never the editorial source. */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { notionId, planNotionDirectoryImport } from "../lib/directory-notion-onetime-import.mjs";

const MODE=process.argv[2]??"";
const ROOT=resolve(new URL("..",import.meta.url).pathname);
const WORK=resolve(ROOT,".directory-notion-one-time");
const DB="psipedia-sk-db",DB_ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const SOURCE="84e0664c-ca47-405f-9d54-31b20287bc8c";
const ACTOR="NOTION_ONE_TIME_IMPORT_20261120";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const norm=s=>String(s??"").toLowerCase().replaceAll("-","");
const fail=code=>{throw Error("NOTION_D1_IMPORT_"+code);};
const must=(ok,code)=>{if(!ok)fail(code);};
const counts={notion:0,linked:0,withoutId:0,d1:0,eligible:0,imported:0,
  skipped:{},writtenFields:{},samples:{}};
let stage="START",bookmarked=false;
const mark=(reason,id)=>{
  counts.skipped[reason]=(counts.skipped[reason]??0)+1;
  const ids=counts.samples[reason]??=[];
  if(Number.isSafeInteger(id)&&ids.length<12)ids.push(id);
};
const inc=(key)=>{counts.writtenFields[key]=(counts.writtenFields[key]??0)+1;};
function report(status,more={}){
  stage=status;mkdirSync(WORK,{recursive:true});
  const data={phase:"DIRECTORY_NOTION_ONE_TIME_SQL",mode:MODE,status,readOnly:MODE==="audit",
    notionUnchanged:true,legacyJsonNotEditorialSource:true,deleteOldJson:false,
    bookmarkCreated:bookmarked,counts,sourceCommit:process.env.GITHUB_SHA,...more};
  writeFileSync(resolve(WORK,"report.json"),JSON.stringify(data,null,2)+"\n");
  console.log(JSON.stringify({phase:data.phase,mode:MODE,status,counts,bookmarkCreated:bookmarked}));
}
function authorize(){
  must(["audit","apply"].includes(MODE),"INVALID_MODE");
  must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
  must(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
  must(process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk","REPOSITORY");
  must(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT,"ACCOUNT");
  must(norm(process.env.NOTION_DIRECTORY_DATA_SOURCE_ID)===norm(SOURCE),"SOURCE");
  must(Boolean(process.env.CLOUDFLARE_API_TOKEN&&process.env.AGENT_NOTION_ACCESS_TOKEN),"MISSING_TOKEN");
  must(process.env.NOTION_ONE_TIME_CONFIRMATION===(MODE==="audit"
    ?"AUDIT-NOTION-DIRECTORY-ONE-TIME-psipedia-sk-db"
    :"APPLY-NOTION-DIRECTORY-ONE-TIME-psipedia-sk-db"),"CONFIRMATION");
  const config=JSON.parse(readFileSync(resolve(ROOT,"config/cloudflare-resources.json"),"utf8"));
  must(config.account_id===ACCOUNT&&config.d1?.database_id===DB_ID&&
    config.d1?.database_name===DB,"DATABASE");
  mkdirSync(WORK,{recursive:true});
  writeFileSync(resolve(WORK,"wrangler.json"),JSON.stringify({
    name:"notion-directory-onetime",compatibility_date:"2026-11-20",
    d1_databases:[{binding:"DB",database_name:DB,database_id:DB_ID}]}));
}
async function api(url,token,method="GET",body){
  for(let attempt=0;attempt<5;attempt++){
    let result;
    try{
      result=await fetch(url,{method,headers:{
        Authorization:"Bearer "+token,"Content-Type":"application/json",
        ...(url.includes("api.notion.com")?{"Notion-Version":"2025-09-03"}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(30000)});
    }catch{if(attempt===4)fail("NETWORK");await sleep(500*(attempt+1));continue;}
    if([429,502,503,504].includes(result.status)){
      if(attempt===4)fail("REMOTE_LIMIT");
      await sleep(Math.min(10000,1000*(attempt+1)**2));continue;
    }
    must(result.ok,"REMOTE_HTTP");
    try{return await result.json();}catch{fail("REMOTE_JSON");}
  }
  fail("REMOTE_EXHAUSTED");
}
const notion=(p,m="GET",b)=>api("https://api.notion.com/v1"+p,
  process.env.AGENT_NOTION_ACCESS_TOKEN,m,b);
async function d1(statements){
  must(statements.length>0&&statements.length<150&&
    statements.every(s=>/^(SELECT|UPDATE|DELETE|INSERT)\s/i.test(s.sql)&&
      !s.sql.includes(";")&&Array.isArray(s.params)),"BATCH_INVALID");
  const r=await api("https://api.cloudflare.com/client/v4/accounts/"+
    ACCOUNT+"/d1/database/"+DB_ID+"/query",process.env.CLOUDFLARE_API_TOKEN,"POST",
    statements.length===1?statements[0]:{batch:statements});
  must(r?.success===true&&r.result?.length===statements.length&&
    r.result.every(x=>x.success===true&&Array.isArray(x.results)),"BATCH_FAILED");
  return r.result.map(x=>x.results);
}
const stmt=(sql,params=[])=>({sql,params:params.map(v=>String(v??""))});
async function select(sql,params=[]){
  must(sql.startsWith("SELECT ")&&!sql.includes(";"),"NON_SELECT");
  return (await d1([stmt(sql,params)]))[0];
}
async function scanNotion(){
  const schema=await notion("/data_sources/"+SOURCE);
  must(norm(schema?.id)===norm(SOURCE)&&
    schema.properties?.["Psipedia ID"]?.type==="rich_text"&&
    schema.properties?.["Odkontrolované"]?.type==="checkbox","SCHEMA_MISMATCH");
  const pages=[],seen=new Set(),ids=new Set(),cursors=new Set();
  let cursor=null;
  while(true){
    const res=await notion("/data_sources/"+SOURCE+"/query","POST",
      {page_size:100,...(cursor?{start_cursor:cursor}:{})});
    must(Array.isArray(res?.results)&&typeof res.has_more==="boolean","NOTION_INVALID_PAGE");
    for(const page of res.results){
      must(page?.id&&page.properties&&norm(page.parent?.data_source_id)===norm(SOURCE),"NOTION_WRONG_PARENT");
      must(!seen.has(norm(page.id)),"NOTION_DUPLICATE_PAGE");
      seen.add(norm(page.id));pages.push(page);counts.notion++;
      const id=notionId(page);
      if(!id){counts.withoutId++;continue;}
      must(!ids.has(id),"NOTION_DUPLICATE_ID");ids.add(id);counts.linked++;
    }
    if(!res.has_more)break;
    cursor=res.next_cursor;
    must(typeof cursor==="string"&&!cursors.has(cursor),"NOTION_CURSOR");
    cursors.add(cursor);await sleep(400);
  }
  must(pages.length>0&&pages.length<10000,"NOTION_COUNT");
  return pages;
}
export const PROFILE_SQL=[
  "SELECT p.id,p.category,p.slug,p.status,p.updated_at,p.name,p.excerpt,p.description,",
  "p.region,p.district,p.city,p.address,p.postal_code,p.street,p.house_number,p.price_note,",
  "p.website_url,p.public_phone,p.public_email,p.facebook_url,p.instagram_url,p.internal_email,p.image_url,",
  "m.notion_page_id,",
  "CASE WHEN json_valid(p.source_data_json) AND",
  "(COALESCE(json_extract(p.source_data_json,'$.\"_psipedia_profile_review_reviewed_at\"'),'')<>'' OR",
  "json_extract(p.source_data_json,'$.\"_psipedia_profile_review_unlock_pending\"')='1')",
  "THEN 1 ELSE 0 END AS legacy_review_locked,",
  "CASE WHEN EXISTS(SELECT 1 FROM directory_profile_review_state s WHERE s.profile_id=p.id",
  "AND (s.reviewed_at IS NOT NULL OR s.unlock_pending=1)) THEN 1 ELSE 0 END AS sql_review_locked,",
  "CASE WHEN EXISTS(SELECT 1 FROM partner_resources r JOIN partner_memberships pm ON pm.resource_id=r.id",
  "WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=p.id AND pm.revoked_at IS NULL)",
  "THEN 1 ELSE 0 END AS partner_active,",
  "CASE WHEN EXISTS(SELECT 1 FROM geo_points g WHERE g.directory_profile_id=p.id",
  "AND g.google_place_id IS NOT NULL AND g.google_place_source_fingerprint=g.source_fingerprint",
  "AND g.source_fingerprint IS NOT NULL) THEN 1 ELSE 0 END AS confirmed_google,",
  "CASE WHEN EXISTS(SELECT 1 FROM admin_record_tombstones tomb",
  "WHERE tomb.kind='directory' AND (tomb.record_id=p.id OR tomb.record_slug=p.slug",
  "OR (tomb.notion_page_id IS NOT NULL AND",
  "REPLACE(LOWER(tomb.notion_page_id),'-','')=REPLACE(LOWER(m.notion_page_id),'-',''))))",
  "THEN 1 ELSE 0 END AS tombstone",
  "FROM directory_profiles p LEFT JOIN directory_notion_sync m ON m.directory_profile_id=p.id",
  "WHERE p.id>? ORDER BY p.id LIMIT 200",
].join(" ");
async function scanD1(){
  const found=[];let last=0;
  while(true){
    const rows=await select(PROFILE_SQL,[last]);
    must(rows.length<=200,"D1_PAGE_SIZE");
    if(!rows.length)break;
    for(const row of rows){
      must(Number.isSafeInteger(row.id)&&row.id>last,"D1_SORT");
      last=row.id;found.push(row);
    }
    if(rows.length<200)break;
  }
  counts.d1=found.length;
  must(found.length>0&&found.length<10000,"D1_COUNT");
  return new Map(found.map(row=>[row.id,row]));
}
async function schema(){
  const tables=["directory_profiles","directory_notion_sync",
    "directory_profile_additional_categories","directory_profile_public_facts",
    "directory_profile_filter_values","directory_profile_qualifications",
    "directory_profile_opening_hours","directory_profile_seo",
    "directory_profile_quality_resolutions","directory_profile_review_state",
    "partner_resources","partner_memberships","admin_record_tombstones"];
  const got=await select("SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+
    tables.map(()=>"?").join(",")+")",tables);
  must(got.length===tables.length,"MISSING_TABLES");
}
async function baseline(){
  const row=(await select("SELECT COUNT(*) AS n,COALESCE(SUM(id),0) AS sum_id,COALESCE(MAX(id),0) AS max_id FROM directory_profiles"))[0];
  must(row&&Number.isSafeInteger(Number(row.n)),"BASELINE");
  return row;
}
function recoveryBookmark(){
  const result=spawnSync("npx",["--no-install","wrangler","d1","time-travel","info",DB,
    "--config",resolve(WORK,"wrangler.json"),"--json"],{
    cwd:ROOT,encoding:"utf8",maxBuffer:8000000,
    env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"}});
  must(!result.error&&result.status===0,"TIME_TRAVEL_FAILED");
  let payload;try{payload=JSON.parse(result.stdout);}catch{fail("TIME_TRAVEL_JSON");}
  const hasBookmark=x=>x&&typeof x==="object"&&(typeof x.bookmark==="string"&&x.bookmark||
    Object.values(x).some(hasBookmark));
  must(hasBookmark(payload),"NO_BOOKMARK");
  bookmarked=true;
}
export function buildBatch(p){
  const now=new Date().toISOString(),id=p.id;
  const cells=Object.entries(p.fields);
  const sets=cells.map(([column])=>column+"=?");
  const params=cells.map(([,val])=>val);
  // Compatibility marker only, never use historical JSON contents as data.
  if(p.secondary!==null)sets.push(
    "source_data_json=json_set(source_data_json,'$.\"_psipedia_additional_categories_sql_confirmed\"','1')");
  sets.push("updated_at=?","updated_by=?");params.push(now,ACTOR);
  const guard=[
    "id=? AND category=? AND updated_at=? AND status<>'archived'",
    "AND json_valid(source_data_json)",
    "AND COALESCE(json_extract(source_data_json,'$.\"_psipedia_profile_review_reviewed_at\"'),'')=''",
    "AND COALESCE(json_extract(source_data_json,'$.\"_psipedia_profile_review_unlock_pending\"'),'')<>'1'",
    "AND NOT EXISTS(SELECT 1 FROM directory_profile_review_state s",
    "WHERE s.profile_id=directory_profiles.id AND (s.reviewed_at IS NOT NULL OR s.unlock_pending=1))",
    "AND NOT EXISTS(SELECT 1 FROM partner_resources r JOIN partner_memberships pm ON pm.resource_id=r.id",
    "WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=directory_profiles.id",
    "AND pm.revoked_at IS NULL)",
    "AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones tomb",
    "WHERE tomb.kind='directory' AND (tomb.record_id=directory_profiles.id",
    "OR tomb.record_slug=directory_profiles.slug))",
    "AND EXISTS(SELECT 1 FROM directory_notion_sync m WHERE m.directory_profile_id=directory_profiles.id",
    "AND REPLACE(LOWER(m.notion_page_id),'-','')=?)",
  ].join(" ");
  params.push(id,p.category,p.expectedUpdatedAt,norm(p.pageId));
  const statements=[
    stmt("UPDATE directory_profiles SET "+sets.join(",")+" WHERE "+guard+" RETURNING id",params),
    stmt("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('BAD_CAS','$.invalid') END AS verified"),
  ];
  if(p.secondary!==null){
    // Non-destructive first: add/update wanted memberships before removing stale
    // SQL-only memberships. In a non-atomic partial execution, no existing
    // membership disappears before all the Notion membership rows are staged.
    for(const name of p.secondary)statements.push(stmt(
      "INSERT INTO directory_profile_additional_categories(profile_id,category,updated_at,updated_by) VALUES(?,?,?,?) "+
      "ON CONFLICT(profile_id,category) DO UPDATE SET updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [id,name,now,ACTOR]));
  }
  if(p.qualifications?.length){
    for(const [position,value] of p.qualifications.entries())statements.push(stmt(
      "INSERT INTO directory_profile_qualifications(profile_id,item_order,qualification_text,updated_at,updated_by) VALUES(?,?,?,?,?) "+
      "ON CONFLICT(profile_id,item_order) DO UPDATE SET qualification_text=excluded.qualification_text,"+
      "updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [id,position,value,now,ACTOR]));
  }
  if(p.hoursText){
    statements.push(stmt("INSERT INTO directory_profile_opening_hours(profile_id,day_of_week,hours_text,updated_at,updated_by) VALUES(?,0,?,?,?) "+
      "ON CONFLICT(profile_id,day_of_week) DO UPDATE SET hours_text=excluded.hours_text,"+
      "updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [id,p.hoursText,now,ACTOR]));
  }
  if(Object.keys(p.seo).length||p.noindex!==null){
    const cols=["title","description","focus_keyword","canonical_url","og_title","og_description","og_image_url"];
    const values=cols.map(col=>p.seo[col]??"");
    const updates=cols.map(col=>col+"=CASE WHEN excluded."+col+"<>'' THEN excluded."+col+
      " ELSE directory_profile_seo."+col+" END");
    updates.push(p.noindex===null?"noindex=directory_profile_seo.noindex":"noindex=excluded.noindex",
      "updated_at=excluded.updated_at","updated_by=excluded.updated_by");
    statements.push(stmt("INSERT INTO directory_profile_seo(profile_id,"+cols.join(",")+
      ",noindex,updated_at,updated_by) VALUES("+Array(11).fill("?").join(",")+
      ") ON CONFLICT(profile_id) DO UPDATE SET "+updates.join(","),
      [id,...values,p.noindex===true?1:0,now,ACTOR]));
  }
  for(const f of p.facts)statements.push(stmt(
    "INSERT INTO directory_profile_public_facts(profile_id,field_key,value_text,updated_at,updated_by) VALUES(?,?,?,?,?) "+
    "ON CONFLICT(profile_id,field_key) DO UPDATE SET value_text=excluded.value_text,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
    [id,f.key,f.value,now,ACTOR]));
  for(const f of p.filters)statements.push(stmt(
    "INSERT INTO directory_profile_filter_values(profile_id,category,filter_id,value_text,updated_at,updated_by) VALUES(?,?,?,?,?,?) "+
    "ON CONFLICT(profile_id,filter_id) DO UPDATE SET value_text=excluded.value_text,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
    [id,f.category,f.id,f.value,now,ACTOR]));
  for(const q of p.quality)statements.push(stmt(
    "INSERT INTO directory_profile_quality_resolutions(profile_id,quality_field,resolution_status,checked_at,updated_at,updated_by) VALUES(?,?,?,?,?,?) "+
    "ON CONFLICT(profile_id,quality_field) DO UPDATE SET resolution_status=excluded.resolution_status,checked_at=excluded.checked_at,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
    [id,q.field,q.status,q.checkedAt,now,ACTOR]));
  // Prune only AFTER all additive statements. Every stale SQL category is
  // removed ONLY when Notion has an explicitly present multi-select; an absent
  // property never clears a relation. No wholesale delete before inserts.
  if(p.secondary!==null){
    const except=p.secondary.length?" AND category NOT IN ("+
      p.secondary.map(()=>"?").join(",")+")":"";
    statements.push(stmt("DELETE FROM directory_profile_additional_categories WHERE profile_id=?"+except,
      [id,...p.secondary]));
  }
  if(p.qualifications?.length)statements.push(stmt(
    "DELETE FROM directory_profile_qualifications WHERE profile_id=? AND item_order>=?",
    [id,p.qualifications.length]));
  return statements;
}
async function run(){
  authorize();await schema();
  const before=await baseline(),pages=await scanNotion(),rows=await scanD1();
  must(Number(before.n)===rows.size,"D1_CHANGED_DURING_SCAN");
  const candidates=[];
  const revisionByPage=new Map(pages.map(p=>[p.id,p.last_edited_time]));
  for(const page of pages){
    const id=notionId(page);
    if(!id){mark("without_psipedia_id");continue;}
    const p=planNotionDirectoryImport(page,rows.get(id),SOURCE);
    if(!p.ok){mark(p.reason,id);continue;}
    candidates.push(p);counts.eligible++;
    for(const column of Object.keys(p.fields))inc(column);
    for(const key of ["qualifications","hoursText","seo","secondary","facts","filters","quality"])
      if(p[key]&&(Array.isArray(p[key])?p[key].length:Object.keys(p[key]).length))inc(key);
  }
  if(MODE==="audit"){report("AUDIT_ONLY",{
    next:"review linked/skipped identities and approve one-time apply separately"});
    return;}
  must(Number((await baseline()).n)===Number(before.n),"D1_COUNT_CHANGED");
  recoveryBookmark();
  for(const candidate of candidates){
    const page=await notion("/pages/"+candidate.pageId);
    if(page.id!==candidate.pageId||page.last_edited_time!==revisionByPage.get(page.id)){
      mark("notion_changed_during_scan",candidate.id);continue;
    }
    const live=(await select("SELECT updated_at,status FROM directory_profiles WHERE id=?",[candidate.id]))[0];
    if(!live||live.updated_at!==candidate.expectedUpdatedAt||live.status==="archived"){
      mark("d1_changed_during_scan",candidate.id);continue;
    }
    const batch=buildBatch(candidate);
    must(batch.length<150,"LARGE_PROFILE");
    try{
      const result=await d1(batch);
      must(Number(result[0]?.[0]?.id)===candidate.id&&
        Number(result[1]?.[0]?.verified)===1,"CAS_NOT_CONFIRMED");
    }catch{
      mark("batch_failure",candidate.id);
      report("FAILED_PARTIAL",{lastFailedProfileId:candidate.id});
      fail("WRITE_FAILED");
    }
    counts.imported++;
    if(counts.imported%50===0)report("APPLYING");
    await sleep(370);
  }
  const after=await baseline();
  must(String(after.n)===String(before.n)&&String(after.sum_id)===String(before.sum_id)&&
    String(after.max_id)===String(before.max_id),"D1_IDENTITIES_CHANGED");
  report("POSTFLIGHT",{needsFinalSqlReadCutover:true,
    note:"No Notion write and no legacy JSON content source; unresolved protected profiles preserved"});
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) run().catch(error=>{
  const code=error instanceof Error&&/^NOTION_D1_IMPORT_[A-Z_]+$/.test(error.message)
    ?error.message:"NOTION_D1_IMPORT_FAILED";
  if(stage!=="FAILED_PARTIAL")report("FAILED",{error:code});
  console.error(JSON.stringify({phase:"FAILED",stage,error:code,imported:counts.imported}));
  process.exitCode=1;
});
