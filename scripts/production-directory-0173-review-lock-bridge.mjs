#!/usr/bin/env node
/**
 * Manual, owner-confirmed, additive-only D1 bridge for <=8 historical review locks.
 * No JSON/profile UPDATE, Notion request, migration or bulk re-import.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  DIRECTORY_0173_REVIEW_BRIDGE_COUNT_SQL as CANDIDATES_SQL,
  DIRECTORY_0173_REVIEW_BRIDGE_INVALID_JSON_SQL as INVALID_SQL,
  DIRECTORY_0173_REVIEW_BRIDGE_PROFILE_COUNT_SQL as PROFILES_SQL,
  DIRECTORY_0173_REVIEW_BRIDGE_SQL_COUNT_SQL as REVIEW_ROWS_SQL,
  DIRECTORY_0173_REVIEW_BRIDGE_PARITY_SQL as PARITY_SQL,
  DIRECTORY_0173_REVIEW_BRIDGE_APPLY_SQL as APPLY_SQL,
} from "../lib/directory-0173-review-lock-bridge.mjs";

const DB="psipedia-sk-db";
const DB_ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const CONFIRM="APPLY-DIRECTORY-REVIEW-0173-psipedia-sk-db";
const DIR=resolve(".directory-review-0173-bridge");
function must(ok,code){if(!ok)throw Error("DIRECTORY_REVIEW_BRIDGE_"+code)}
function auth(){
  must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
  must(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
  must(process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk","WRONG_REPOSITORY");
  must(process.env.DIRECTORY_REVIEW_BRIDGE_CONFIRMATION===CONFIRM,"CONFIRMATION");
  must(Boolean(process.env.CLOUDFLARE_API_TOKEN),"NO_TOKEN");
  must(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT,"ACCOUNT");
  const config=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
  must(config.account_id===ACCOUNT&&config.d1?.database_id===DB_ID&&
    config.d1?.database_name===DB,"WRONG_DATABASE");
}
async function query(sql,write=false){
  must(typeof sql==="string"&&!sql.includes(";"),"MULTI_STATEMENT");
  must(write ? /^INSERT INTO directory_profile_review_state /i.test(sql)
    : /^SELECT /i.test(sql),"SQL_NOT_ALLOWLISTED");
  const endpoint="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+
    "/d1/database/"+DB_ID+"/query";
  let response;
  try{
    response=await fetch(endpoint,{
      method:"POST",
      headers:{Authorization:"Bearer "+process.env.CLOUDFLARE_API_TOKEN,
        "Content-Type":"application/json"},
      body:JSON.stringify({sql}),
      signal:AbortSignal.timeout(30000),
    });
  }catch{throw Error("DIRECTORY_REVIEW_BRIDGE_NETWORK")}
  must(response.ok,"D1_HTTP_"+response.status);
  let payload;
  try{payload=await response.json()}catch{must(false,"D1_JSON")}
  must(payload.success===true&&Array.isArray(payload.result)&&
    payload.result.length===1&&payload.result[0].success===true&&
    Array.isArray(payload.result[0].results),"D1_QUERY");
  return payload.result[0].results;
}
async function count(sql){
  const rows=await query(sql);
  const n=Number(rows?.[0]?.n);
  must(Number.isSafeInteger(n)&&n>=0,"COUNT_INVALID");
  return n;
}
async function state(){
  const profiles=await count(PROFILES_SQL);
  const invalidJson=await count(INVALID_SQL);
  const missingLocks=await count(CANDIDATES_SQL);
  const sqlReviewRows=await count(REVIEW_ROWS_SQL);
  const mismatches=await count(PARITY_SQL);
  return{profiles,invalidJson,missingLocks,sqlReviewRows,mismatches};
}
async function main(){
  auth();
  mkdirSync(DIR,{recursive:true});
  const before=await state();
  must(before.profiles>=1800&&before.profiles<10000,"PROFILE_RANGE");
  must(before.invalidJson===0,"INVALID_HISTORICAL_JSON");
  must(before.missingLocks<=8,"UNEXPECTED_HISTORICAL_LOCK_COUNT");
  must(before.mismatches===0,"CONFLICTING_SQL_REVIEW_LOCKS");
  // A single D1 statement commits at most the eight legacy lock copies.
  // No row in directory_profiles or Notion is ever written.
  await query(APPLY_SQL,true);
  const after=await state();
  const inserted=after.sqlReviewRows-before.sqlReviewRows;
  must(after.profiles===before.profiles,"PROFILE_COUNT_CHANGED");
  must(after.invalidJson===0,"INVALID_JSON_AFTER");
  must(after.missingLocks===0,"HISTORICAL_LOCKS_NOT_COVERED");
  must(after.mismatches===0,"REVIEW_PARITY");
  must(inserted>=0&&inserted<=8,"INSERTED_OUT_OF_BOUNDS");
  const report={phase:"DIRECTORY_0173_REVIEW_LOCK_BRIDGE",
    status:"POSTFLIGHT",additiveOnly:true,noProfileWrites:true,
    noNotionWrites:true,noLegacyJsonDeletion:true,before,after,inserted};
  writeFileSync(resolve(DIR,"report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report));
}
main().catch(error=>{
  console.error(error instanceof Error?error.message:"DIRECTORY_REVIEW_BRIDGE_UNKNOWN");
  process.exitCode=1;
});
