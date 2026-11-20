#!/usr/bin/env node
/**
 * OWNER-REQUESTED DESTRUCTIVE DIRECTORY CLEANUP
 *
 * A single manual GitHub Actions run clears historical directory source JSON
 * without reconciling editorial values or reimporting anything from Notion.
 * The column remains as an empty compatibility shim; DROP COLUMN is unsafe
 * until existing D1 prepared statements and Notion adapters stop naming it.
 */
import {readFileSync} from "node:fs";
import {
  DIRECTORY_LEGACY_JSON_PURGE_SQL,
  DIRECTORY_LEGACY_JSON_STATUS_SQL,
  DIRECTORY_LEGACY_JSON_PROTECTED_COUNT_SQL,
} from "../lib/directory-legacy-json-purge.mjs";

const repo="investradarsk/psipedia-sk";
const account="5ff902d3d80376478b9213b2b8ae8d6e";
const database="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const name="psipedia-sk-db";
const confirmation="DELETE-DIRECTORY-LEGACY-JSON-psipedia-sk-db";
function requireOk(ok,code) {if(!ok)throw Error("DIRECTORY_JSON_PURGE_"+code);}
function authorized() {
  requireOk(process.argv[2]==="apply","INVALID_MODE");
  requireOk(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
  requireOk(process.env.GITHUB_REF==="refs/heads/main","MAIN_ONLY");
  requireOk(process.env.GITHUB_REPOSITORY===repo,"WRONG_REPOSITORY");
  requireOk(process.env.DIRECTORY_JSON_PURGE_CONFIRMATION===confirmation,"CONFIRMATION");
  requireOk(process.env.CLOUDFLARE_ACCOUNT_ID===account,"ACCOUNT");
  requireOk(Boolean(process.env.CLOUDFLARE_API_TOKEN),"MISSING_TOKEN");
  const config=JSON.parse(readFileSync(new URL("../config/cloudflare-resources.json",import.meta.url),"utf8"));
  requireOk(config.account_id===account &&
    config.d1?.database_id===database &&
    config.d1?.database_name===name,"WRONG_DATABASE");
}
async function query(sql) {
  const result=await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{
    method:"POST",
    headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type":"application/json"},
    body:JSON.stringify({sql}),
    signal:AbortSignal.timeout(60000),
  });
  requireOk(result.ok,"REMOTE_HTTP_"+result.status);
  const body=await result.json();
  requireOk(body?.success===true&&Array.isArray(body.result)&&
    body.result.length===1&&body.result[0].success===true,"D1_QUERY_FAILED");
  return body.result[0].results??[];
}
function number(row,key) {
  const n=Number(row?.[key]??0);
  requireOk(Number.isSafeInteger(n)&&n>=0,"BAD_COUNT_"+key);
  return n;
}
async function main() {
  authorized();
  const names=(await query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+
    "'directory_profiles','directory_profile_extra_fields',"+
    "'directory_profile_service_texts','directory_profile_review_state',"+
    "'directory_profile_additional_categories',"+
    "'partner_resources','partner_memberships')"
  )).map(x=>x.name);
  requireOk(names.length===7,"SQL_SCHEMA_INCOMPLETE");
  const cols=await query("SELECT name FROM pragma_table_info('directory_profiles') WHERE name='source_data_json'");
  requireOk(cols.length===1,"SOURCE_COLUMN_MISSING");

  const before=(await query(DIRECTORY_LEGACY_JSON_STATUS_SQL))[0];
  const retained=number((await query(DIRECTORY_LEGACY_JSON_PROTECTED_COUNT_SQL))[0],"protected_profiles");
  await query(DIRECTORY_LEGACY_JSON_PURGE_SQL);
  const after=(await query(DIRECTORY_LEGACY_JSON_STATUS_SQL))[0];
  const profiles=number(after,"profiles");
  const oldRemaining=number(after,"remaining_legacy");
  const removed=number(before,"remaining_legacy")-oldRemaining;
  requireOk(oldRemaining<=retained,"UNEXPECTED_JSON_LEFTOVER");
  requireOk(profiles===number(before,"profiles"),"PROFILE_COUNT_CHANGED");
  console.log(JSON.stringify({
    action:"DIRECTORY_LEGACY_SOURCE_JSON_PURGED",
    erasedProfilePayloads:removed,
    protectedProfilesRetained:oldRemaining,
    profilesPreserved:profiles,
    canonicalSqlUnaffected:true,
    contentDifferencesDeliberatelyIgnored:true,
    // Honest metadata: no physical DROP until every legacy SQL reference is gone.
    legacyColumnPhysicallyPresent:true,
  }));
}
main().catch(error=>{
  console.error(JSON.stringify({error:error instanceof Error?error.message:"UNKNOWN"}));
  process.exitCode=1;
});
