#!/usr/bin/env node
/** One-off D1-only mutation. No Notion network calls or Notion credentials. */
import { readFile, appendFile } from "node:fs/promises";
const account="5ff902d3d80376478b9213b2b8ae8d6e",database="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const marker="HISTORICAL_SQL_ONLY_NOTION_RETAINED";
const confirmation="VYMAZAT LEN 140 SQL KOPII NOTION PONECHAT";
async function query(sql) {
 const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{
  method:"POST",headers:{"Authorization":`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,"Content-Type":"application/json"},
  body:JSON.stringify({sql})
 });
 const value=await res.json().catch(()=>null);
 if(!res.ok||value?.success!==true||!Array.isArray(value?.result)||value.result.some(r=>r.success!==true))
   throw Error("D1_QUERY_FAILED_"+res.status+"_"+(value?.errors??[]).map(e=>e.code).join("_"));
 return value.result;
}
async function main() {
 if(process.env.GITHUB_REPOSITORY!=="investradarsk/psipedia-sk"||process.env.GITHUB_REF!=="refs/heads/main"
   || !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA??"")
   || !["push","workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME??""))
   throw Error("REPO_BRANCH_NOT_AUTHORIZED");
 if(process.env.GITHUB_EVENT_NAME==="workflow_dispatch" && process.env.HELP_SQL_CONFIRMATION!==confirmation)
   throw Error("OWNER_CONFIRMATION_REQUIRED");
 if(process.env.GITHUB_EVENT_NAME==="push" &&
   !(process.env.HEAD_COMMIT_MESSAGE??"").includes("historical SQL cleanup (#"))
   throw Error("UNEXPECTED_AUTOMATED_TRIGGER");
 if(!process.env.CLOUDFLARE_API_TOKEN)throw Error("D1_WRITE_TOKEN_MISSING");
 const config=JSON.parse(await readFile(new URL("../../config/cloudflare-resources.json",import.meta.url),"utf8"));
 if(config.account_id!==account||config.d1?.database_id!==database||config.d1?.database_name!=="psipedia-sk-db")
   throw Error("CANONICAL_DATABASE_ID_MISMATCH");
 const res=await query(`SELECT
   (SELECT COUNT(*) FROM help_cases WHERE category='adopcia') adoption,
   (SELECT COUNT(*) FROM help_cases WHERE category='utulky') shelters,
   (SELECT COUNT(*) FROM help_cases WHERE category='stratene-a-najdene') lost,
   (SELECT COUNT(*) FROM admin_record_tombstones WHERE kind='help' AND
    record_external_key='${marker}' AND state='COMPLETE') completed`);
 const before=res[0]?.results?.[0];
 if(before?.adoption===0 && before?.shelters===0 && before?.lost===0 && before?.completed===140){
  process.stdout.write("SUCCESS: already removed 140/140 in D1. Notion untouched.\n");return;
 }
 if(before?.adoption!==36||before?.shelters!==104||before?.lost!==0||before?.completed!==0)
   throw Error("COUNTS_CHANGED_NO_WRITES");
 const batch=await readFile(new URL("./help-legacy-140.sql",import.meta.url),"utf8");
 if(!batch.includes("__psipedia_help_legacy_140_guard_20261120")||/\b(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(batch))
   throw Error("SQL_CONTENT_INVALID");
 const output=await query(batch);
 const last=output.findLast(r=>r.results?.length)?.results?.[0]??{};
 if(last.historical_remaining!==0||last.historical_removed!==140||last.obsolete_mapping_remaining!==0)
   throw Error("POSTCHECK_NOT_VERIFIED");
 process.stdout.write("SUCCESS: 140 SQL rows removed; canonical D1 and Notion pages intact.\n");
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,
   "## Pomoc psom\nRemoved 140/140 historic SQL rows; no Notion calls; technical JSON untouched.\n");
}
main().catch(e=>{process.stderr.write("HELP_SQL_CLEANUP_ABORTED: "+
 (e instanceof Error?e.message:"UNKNOWN")+"\n");process.exitCode=1});
