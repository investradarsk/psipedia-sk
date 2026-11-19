#!/usr/bin/env node
/**
 * Owner-only production cleanup of duplicate Notion/SQL scalar keys in
 * directory_profiles.source_data_json. Audit never mutates D1.
 * Apply removes 12 scalar and 5 contact groups, regardless of SQL values.
 */
import {spawnSync} from "node:child_process";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS,
  directoryScalarCleanupCountSql,
  directoryScalarCleanupUpdateSql,
  directoryScalarCleanupSummary,
} from "../lib/directory-sql-notion-scalar-cleanup.mjs";

const MODE=process.argv[2]??"";
const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const DB="psipedia-sk-db";
const DB_ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const DIR=resolve(ROOT,".directory-sql-notion-scalar-cleanup");
const CONFIG=resolve(DIR,"wrangler.json");
const REPORT=resolve(DIR,"report.json");
const fail=code=>{throw new Error("DIRECTORY_SCALAR_CLEANUP_"+code);};
const must=(ok,code)=>{if(!ok)fail(code);};
let stage="START",bookmark=null,before=null;
const appliedColumns=[];

function authorize(){
  must(MODE==="audit"||MODE==="apply","INVALID_MODE");
  must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
  must(process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk","WRONG_REPO");
  must(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
  must(Boolean(process.env.GITHUB_SHA),"MISSING_COMMIT");
  must(Boolean(process.env.CLOUDFLARE_API_TOKEN),"TOKEN_MISSING");
  must(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT,"WRONG_ACCOUNT");
  const expected=MODE==="audit"
    ?"AUDIT-DIRECTORY-SQL-SCALARS-psipedia-sk-db"
    :"APPLY-DIRECTORY-SQL-SCALARS-psipedia-sk-db";
  must(process.env.DIRECTORY_SCALAR_CLEANUP_CONFIRMATION===expected,"WRONG_CONFIRMATION");
  const resource=JSON.parse(readFileSync(resolve(ROOT,"config/cloudflare-resources.json"),"utf8"));
  must(resource.account_id===ACCOUNT&&resource.d1?.database_id===DB_ID&&
    resource.d1?.database_name===DB&&resource.d1?.binding==="DB","WRONG_DATABASE");
  mkdirSync(DIR,{recursive:true});
  writeFileSync(CONFIG,JSON.stringify({
    name:"directory-sql-notion-scalars-owner-cleanup",
    compatibility_date:"2026-11-19",
    d1_databases:[{binding:"DB",database_name:DB,database_id:DB_ID}],
  }));
}
function remote(args) {
  const run=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["--no-install","wrangler",...args],{
      cwd:ROOT,encoding:"utf8",maxBuffer:14*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
    });
  // Never display remote data, personal addresses, full JSON or secret logs.
  must(!run.error&&run.status===0,"REMOTE_COMMAND_FAILED");
  try{return JSON.parse(run.stdout);}
  catch{fail("INVALID_REMOTE_RESULT");}
}
function query(sql,write=false){
  must(typeof sql==="string"&&!sql.includes(";"),"BAD_SQL");
  if(write){
    must(DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS.some(column=>
      sql===directoryScalarCleanupUpdateSql(column)),"UNEXPECTED_UPDATE");
  } else {
    must(/^SELECT\s/i.test(sql),"READ_ONLY_SELECT_REQUIRED");
  }
  const r=remote(["d1","execute",DB,"--remote","--config",CONFIG,
    "--command",sql,"--json",...(write?["--yes"]:[])]);
  const batches=Array.isArray(r)?r:[r];
  must(batches.length>0&&batches.every(x=>x?.success!==false&&
    Array.isArray(x?.results)),"REMOTE_QUERY_FAILED");
  return batches.flatMap(x=>x.results);
}
function ensureSchema() {
  const tables=query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('directory_profiles','admin_record_tombstones')");
  must(tables.length===2,"TABLE_MISSING");
  const sql="SELECT name FROM pragma_table_info('directory_profiles') WHERE name IN ("+
    ["id","category","status","source_data_json","updated_at",
     ...DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS].map(k=>"'"+k+"'").join(",")+")";
  const columns=query(sql).map(x=>x.name);
  must(new Set(columns).size===DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS.length+5,
    "CANONICAL_COLUMN_MISSING");
}
function recoveryBookmark(){
  const data=remote(["d1","time-travel","info",DB,"--config",CONFIG,"--json"]);
  const find=x=>{
    if(!x||typeof x!=="object")return null;
    if(typeof x.bookmark==="string"&&x.bookmark)return x.bookmark;
    for(const v of Object.values(x)){const b=find(v);if(b)return b;}
    return null;
  };
  const value=find(data);
  must(Boolean(value),"RECOVERY_POINT_MISSING");
  return value;
}
function baseline(){
  const aggregations=[
    "COUNT(*) AS profiles",
    "COALESCE(SUM(id),0) AS id_sum",
    "COALESCE(MAX(id),0) AS max_id",
    "COALESCE(MAX(updated_at),'') AS latest_update",
    "COALESCE(SUM(LENGTH(source_data_json)),0) AS json_chars",
    ...DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS.flatMap(column=>[
      "COALESCE(SUM(LENGTH(COALESCE("+column+",''))),0) AS "+column+"_chars",
      "COUNT("+column+") AS "+column+"_non_null",
    ]),
  ];
  const row=query("SELECT "+aggregations.join(", ")+" FROM directory_profiles")[0];
  must(row&&typeof row.latest_update==="string","BAD_BASELINE");
  const converted={};
  for(const [key,value] of Object.entries(row)){
    if(key==="latest_update")converted[key]=value;
    else{
      must(Number.isSafeInteger(Number(value))&&Number(value)>=0,"BAD_BASELINE");
      converted[key]=Number(value);
    }
  }
  return converted;
}
function candidates(){return directoryScalarCleanupSummary(query(directoryScalarCleanupCountSql()));}
function stable(a,b) {
  return Object.keys(a).filter(k=>k!=="json_chars").every(k=>a[k]===b[k]);
}
function writeReport(status,fields={}){
  stage=status;
  const report={
    phase:"DIRECTORY_SQL_NOTION_SCALAR_JSON_CLEANUP",status,mode:MODE,
    database:DB,sourceCommit:process.env.GITHUB_SHA,
    recoveryBookmark:bookmark,
    appliedColumns,
    sqlValuesChanged:false,
    notionUpdated:false,
    droppedColumns:false,
    ...fields,
  };
  mkdirSync(DIR,{recursive:true});
  writeFileSync(REPORT,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({
    phase:report.phase,status,mode:MODE,
    before:report.before?.candidates?.totals??null,
    after:report.after?.candidates?.totals??null,
    invariantsPassed:report.invariantsPassed??null,
    recoveryPointCreated:Boolean(bookmark),
    appliedColumns,
  }));
}
try{
  authorize();
  ensureSchema();
  const original=baseline();
  before={baseline:original,candidates:candidates()};
  must(original.profiles===before.candidates.profiles,"COUNT_MISMATCH");
  if(MODE==="audit"){
    writeReport("AUDIT_ONLY",{readOnly:true,applied:false,before});
  }else{
    bookmark=recoveryBookmark();
    must(JSON.stringify(original)===JSON.stringify(baseline()),"CONCURRENT_BASELINE");
    must(JSON.stringify(before.candidates)===JSON.stringify(candidates()),
      "CONCURRENT_CANDIDATES");
    stage="APPLYING";
    for(const column of DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS){
      query(directoryScalarCleanupUpdateSql(column),true);
      appliedColumns.push(column);
    }
    const after={baseline:baseline(),candidates:candidates()};
    const ok=stable(original,after.baseline)&&
      after.baseline.json_chars<=original.json_chars&&
      after.candidates.totals.invalidJson===before.candidates.totals.invalidJson &&
      DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS.every(column=>
        after.candidates.totals.removable[column]===0 &&
        after.candidates.totals.withoutSqlValue[column]===0);
    writeReport("POSTFLIGHT",{readOnly:false,applied:true,before,after,
      invariantsPassed:ok});
    must(ok,"POSTFLIGHT_INVARIANTS");
  }
}catch(error){
  const code=error instanceof Error&&/^DIRECTORY_SCALAR_CLEANUP_[A-Z_]+$/.test(error.message)
    ?error.message:"DIRECTORY_SCALAR_CLEANUP_FAILED";
  try{writeReport("FAILED",{before,applied:appliedColumns.length>0,error:code});}catch{}
  console.error(JSON.stringify({stage,error:code,completedColumns:appliedColumns}));
  process.exitCode=1;
}
