#!/usr/bin/env node
/** Owner-only, exact-file 0175. The normal deploy never removes SQL columns. */
import {spawnSync} from "node:child_process";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const mode=process.argv[2],repo="investradarsk/psipedia-sk";
const resource=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
const name="psipedia-sk-db",file="scripts/sql/breeds_drop_four_legacy_objects.sql";
const legacy=["fci_standard_json","editorial_json","related_breeds_json","seo_json"];
const dir=resolve(".production-d1-breed-0175"),config=resolve(dir,"wrangler.json");
const output=resolve(dir,"report.json");
const fail=(ok,code)=>{if(!ok)throw Error("BREED_0175_"+code)};
let stage="auth",writeAttempted=false,before=null,after=null,recoveryBookmark=null;

function authorize(){
  fail(mode==="audit"||mode==="apply","MODE");
  fail(process.env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
    process.env.GITHUB_REF==="refs/heads/main"&&
    process.env.GITHUB_REPOSITORY===repo&&Boolean(process.env.GITHUB_SHA),
    "OWNER_MAIN_ONLY");
  fail(process.env.BREED_0175_CONFIRMATION===
    (mode==="apply"?"APPLY-BREEDS-0175-FOUR":"AUDIT-BREEDS-0175-FOUR"),
    "CONFIRMATION");
  fail(resource.d1?.database_name===name&&resource.d1?.binding==="DB"&&
    typeof resource.d1?.database_id==="string"&&
    process.env.CLOUDFLARE_ACCOUNT_ID===resource.account_id&&
    Boolean(process.env.CLOUDFLARE_API_TOKEN),"DATABASE_IDENTITY");
  const worker=JSON.parse(readFileSync("wrangler.jsonc","utf8"));
  fail(worker.vars?.BREED_SQL_V2_READ_MODE==="sql"&&
    worker.vars?.BREED_SQL_V2_WRITE_MODE==="sql","SQL_ONLY_FLAGS_REQUIRED");
  // File must contain precisely these four ALTER TABLE statements in order.
  const actual=readFileSync(file,"utf8").replace(/--> statement-breakpoint/g,"")
    .replace(/^--[^\n]*$/gm,"").replace(/\s+/g," ").trim();
  const expected=legacy.map(c=>"ALTER TABLE managed_breeds DROP COLUMN "+c+";").join(" ");
  fail(actual===expected,"DDL_NOT_EXACTLY_FOUR_DROPS");
  mkdirSync(dir,{recursive:true});
  writeFileSync(config,JSON.stringify({name:"psipedia-breed-0175-owner-only",
    compatibility_date:"2026-11-19",d1_databases:[{
      binding:"DB",database_name:name,database_id:resource.d1.database_id,
    }]},null,2));
}
function decode(raw){
  const s=String(raw??"").trim();
  try{return JSON.parse(s)}catch{}
  const from=s.indexOf("["),to=s.lastIndexOf("]");
  if(from>=0&&to>from)try{return JSON.parse(s.slice(from,to+1))}catch{}
  throw Error("BREED_0175_REMOTE_JSON_INVALID");
}
function wrangler(args){
  const result=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["--no-install","wrangler",...args],{encoding:"utf8",maxBuffer:16*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"}});
  fail(!result.error&&result.status===0,"REMOTE_WRANGLER_FAILED");
  return decode(result.stdout);
}
function read(sql){
  fail(/^SELECT\s/i.test(sql)&&!sql.includes(";")&&
    !/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA|VACUUM|ATTACH)\b/i.test(sql),
    "SELECT_ONLY");
  const data=wrangler(["d1","execute",name,"--remote","--config",config,
    "--command",sql,"--json"]);
  const pages=Array.isArray(data)?data:[data];
  fail(pages.length>0&&pages.every(x=>x?.success!==false&&Array.isArray(x.results)),
    "REMOTE_SELECT_FAILED");
  return pages.flatMap(x=>x.results);
}
function count(sql){
  const rows=read(sql),n=Number(rows[0]?.n);
  fail(rows.length===1&&Number.isSafeInteger(n)&&n>=0,"INVALID_COUNT");
  return n;
}
function inspect(){
  stage="preflight";
  const columns=new Set(read("SELECT name FROM pragma_table_info('managed_breeds')").map(x=>x.name));
  const present=legacy.filter(x=>columns.has(x)).length;
  fail(present===0||present===4,"PARTIAL_LEGACY_SCHEMA");
  for(const col of ["seo_title","seo_description","seo_canonical_url","seo_noindex"])
    fail(columns.has(col),"MISSING_SQL_SEO");
  const breeds=count("SELECT COUNT(*) AS n FROM managed_breeds");
  const links=count("SELECT COUNT(*) AS n FROM breed_notion_workcopy_links WHERE status='ACTIVE'");
  const mirrors=count("SELECT COUNT(*) AS n FROM breed_notion_controlled_values");
  const fci=count("SELECT COUNT(*) AS n FROM breed_fci_standard");
  const editorial=count("SELECT COUNT(*) AS n FROM breed_editorial_text");
  const facts=count("SELECT COUNT(*) AS n FROM breed_public_facts");
  const fk=count("SELECT COUNT(*) AS n FROM pragma_foreign_key_check");
  fail(breeds===347&&links===344&&mirrors===344&&fci===347&&
    editorial===347&&facts===344&&fk===0,"SQL_INTEGRITY");
  if(present===4){
    const deps=read("SELECT name,sql FROM sqlite_master WHERE type IN ('view','trigger','index') AND LOWER(COALESCE(sql,'')) LIKE '%managed_breeds%'");
    fail(!deps.some(x=>legacy.some(col=>String(x.sql??"").toLowerCase().includes(col))),
      "LEGACY_DEPENDENT_SQL_OBJECT");
  }
  return {present,breeds,links,mirrors,fci,editorial,facts,fk};
}
function recovery(){
  stage="recovery";
  const data=wrangler(["d1","time-travel","info",name,"--config",config,"--json"]);
  const find=x=>{
    if(!x||typeof x!=="object")return null;
    if(typeof x.bookmark==="string"&&x.bookmark)return x.bookmark;
    for(const v of Object.values(x)){const found=find(v);if(found)return found}
    return null;
  };
  recoveryBookmark=find(data);
  fail(Boolean(recoveryBookmark),"RECOVERY_BOOKMARK_REQUIRED");
}
function record(status,error=null){
  mkdirSync(dir,{recursive:true});
  const report={status,mode,stage,before,after,writeAttempted,
    recoveryAvailable:Boolean(recoveryBookmark),
    ...(error?{error}:{})};
  writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report));
}
try{
  authorize();
  before=inspect();
  if(mode==="audit")record("AUDIT");
  else if(before.present===0)record("ALREADY_CLEAN");
  else{
    recovery();
    fail(JSON.stringify(inspect())===JSON.stringify(before),"CONCURRENT_SCHEMA_CHANGE");
    stage="apply";writeAttempted=true;
    const result=wrangler(["d1","execute",name,"--remote","--config",config,
      "--file",file,"--yes","--json"]);
    const pages=Array.isArray(result)?result:[result];
    fail(pages.length>0&&pages.every(x=>x?.success!==false),"DDL_UNCONFIRMED");
    stage="postflight";after=inspect();
    fail(after.present===0&&after.breeds===before.breeds&&
      after.links===before.links&&after.mirrors===before.mirrors&&
      after.fci===before.fci&&after.editorial===before.editorial&&
      after.facts===before.facts,"POSTFLIGHT_MISMATCH");
    record("POSTFLIGHT_CLEAN");
  }
}catch(error){
  const code=error instanceof Error?error.message:"UNKNOWN";
  try{if(writeAttempted&&!after)after=inspect()}catch{}
  try{record("BLOCKED",code)}catch{}
  process.exitCode=1;
}
