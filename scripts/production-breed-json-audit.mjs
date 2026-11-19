#!/usr/bin/env node
/** Production D1 JSON read-only metrics for Plemená. No row payloads emitted.
 * Must be started manually by owner from current main.
 * No schema migrations, row modifications, Notion calls or deletions.
 */
import {spawnSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const COLUMNS=Object.freeze([
  "gallery_json","fci_standard_json","editorial_json","sports_json",
  "related_breeds_json","health_risks_json","good_for_json",
  "consider_json","sources_json","seo_json",
]);
const fail=(condition,code)=>{if(!condition)throw Error(code)};
const expected=process.env.BREED_JSON_AUDIT_CONFIRMATION;
fail(process.env.GITHUB_EVENT_NAME==="workflow_dispatch" &&
  process.env.GITHUB_REF==="refs/heads/main" &&
  process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk" &&
  expected==="AUDIT-BREED-JSON-READONLY",
  "BREED_JSON_MANUAL_CURRENT_MAIN_REQUIRED");
const configResource=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
fail(configResource.account_id===process.env.CLOUDFLARE_ACCOUNT_ID &&
  configResource.d1?.database_name==="psipedia-sk-db" &&
  configResource.d1?.binding==="DB" &&
  Boolean(process.env.CLOUDFLARE_API_TOKEN),
  "BREED_JSON_WRONG_ACCOUNT_OR_NO_READ_ACCESS");

const temp=mkdtempSync(join(tmpdir(),"breed-json-audit-"));
try {
  const config=join(temp,"wrangler.json");
  writeFileSync(config,JSON.stringify({
    name:"read-only-breed-json-audit",
    compatibility_date:"2026-11-19",
    d1_databases:[{
      binding:"DB",database_name:configResource.d1.database_name,
      database_id:configResource.d1.database_id,
    }],
  }));
  const readOnly=(sql)=>{
    fail(/^SELECT\s/i.test(sql), "BREED_JSON_READ_ONLY_SELECT_REQUIRED");
    fail(!/;.*\S/s.test(sql), "BREED_JSON_ONLY_ONE_STATEMENT");
    const r=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
      ["wrangler","d1","execute","psipedia-sk-db","--remote",
        "--config",config,"--command",sql,"--json"],
      {encoding:"utf8",maxBuffer:16*1024*1024,env:{
        ...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1",
      }});
    fail(!r.error&&r.status===0,"BREED_JSON_REMOTE_READ_FAILED");
    let batches;
    try{batches=JSON.parse(r.stdout.trim());}
    catch{
      const from=r.stdout.indexOf("[");
      const to=r.stdout.lastIndexOf("]");
      fail(from>=0&&to>from,"BREED_JSON_INVALID_WRANGLER_RESPONSE");
      batches=JSON.parse(r.stdout.slice(from,to+1));
    }
    if(!Array.isArray(batches))batches=[batches];
    fail(batches.length>0&&batches.every(b=>b.success===true),
      "BREED_JSON_SQL_READ_FAILED");
    return batches.flatMap(x=>x.results??[]);
  };
  const table=readOnly("SELECT name FROM pragma_table_info('managed_breeds')");
  const available=new Set(table.map(t=>t.name));
  fail(COLUMNS.every(c=>available.has(c)),"BREED_JSON_SCHEMA_CHANGED");
  const clauses=["COUNT(*) AS breed_rows"];
  for(const col of COLUMNS){
    clauses.push(`SUM(CASE WHEN ${col} IS NOT NULL AND LENGTH(TRIM(${col}))>0 AND ${col} NOT IN ('{}','[]') THEN 1 ELSE 0 END) AS filled_${col}`);
    clauses.push(`SUM(CASE WHEN json_valid(${col})=0 THEN 1 ELSE 0 END) AS invalid_${col}`);
  }
  const raw=readOnly("SELECT "+clauses.join(", ")+" FROM managed_breeds")[0]??{};
  const report={scope:"Cloudflare D1 read-only counts",timestamp:new Date().toISOString(),
    breedRows:Number(raw.breed_rows),columns:COLUMNS.map(column=>({
      name:column,filled:Number(raw["filled_"+column]??0),
      invalidJson:Number(raw["invalid_"+column]??0),
      dropApproved:false,
      note:"Storage use (count) != proof the production reader can be removed",
    }))};
  mkdirSync(".production-breed-json-audit",{recursive:true});
  writeFileSync(".production-breed-json-audit/report.json",
    JSON.stringify(report,null,2)+"\n");
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
} finally{rmSync(temp,{recursive:true,force:true});}
