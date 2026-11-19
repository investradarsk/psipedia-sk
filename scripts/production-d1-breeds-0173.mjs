#!/usr/bin/env node
/** Owner-only additive schema 0173: creates only public-breed SQL tables. */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mode=process.argv[2];
const expected=mode==="apply"?"APPLY-0173-psipedia-sk-db":"AUDIT-0173-psipedia-sk-db";
const must=(ok,code)=>{if(!ok)throw Error(code)};
const resources=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
const migration=readFileSync("drizzle/0173_breed_public_relational_sql.sql","utf8");
const tables=["breed_public_profile","breed_public_list_items","breed_public_gallery",
  "breed_public_sports","breed_public_sources","breed_public_related_breeds"];
must(["audit","apply"].includes(mode),"BREED_0173_MODE_INVALID");
must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch" &&
  process.env.GITHUB_REF==="refs/heads/main" &&
  process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk",
  "BREED_0173_MANUAL_MAIN_REQUIRED");
must(process.env.BREED_0173_CONFIRMATION===expected,"BREED_0173_CONFIRMATION_INVALID");
must(resources.account_id===process.env.CLOUDFLARE_ACCOUNT_ID &&
  resources.d1?.binding==="DB" &&
  resources.d1?.database_name==="psipedia-sk-db" &&
  Boolean(process.env.CLOUDFLARE_API_TOKEN),"BREED_0173_RESOURCE_MISMATCH");
must((migration.match(/CREATE TABLE IF NOT EXISTS breed_public_/g)||[]).length===6 &&
  !/\bDROP\s|\bDELETE\s|\bUPDATE\s|\bALTER\s/i.test(migration) &&
  !/\b[a-z_]+_json\b/i.test(migration),
  "BREED_0173_UNEXPECTED_SQL");
const temp=mkdtempSync(join(tmpdir(),"breed-0173-"));
try {
  const config=join(temp,"wrangler.json");
  writeFileSync(config,JSON.stringify({name:"breed-sql-0173",
    compatibility_date:"2026-11-19",d1_databases:[{
      binding:"DB",database_name:resources.d1.database_name,
      database_id:resources.d1.database_id,
    }]}));
  const run=args=>{
    const result=spawnSync("npx",["wrangler","d1","execute","psipedia-sk-db",
      "--remote","--config",config,...args,"--json"],{
      encoding:"utf8",maxBuffer:32*1024*1024,env:{
        ...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1",
      }});
    must(!result.error && result.status===0,"BREED_0173_WRANGLER_FAILED");
    const stdout=result.stdout.trim();
    let data;
    try { data=JSON.parse(stdout); } catch {
      const from=stdout.indexOf("[");
      const end=stdout.lastIndexOf("]");
      must(from>=0 && end>from,"BREED_0173_WRANGLER_RESPONSE_INVALID");
      data=JSON.parse(stdout.slice(from,end+1));
    }
    const batches=Array.isArray(data)?data:[data];
    must(batches.length>0&&batches.every(x=>x.success===true),"BREED_0173_REMOTE_FAILED");
    return batches.flatMap(x=>Array.isArray(x.results)?x.results:[]);
  };
  const query=()=>run(["--command","SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'breed_public_%'"]);
  const before=query().map(x=>x.name);
  console.log(JSON.stringify({mode,before,expectedTables:tables}));
  if(mode==="apply") {
    const file=join(temp,"0173.sql");
    writeFileSync(file,migration,{mode:0o600});
    run(["--file",file]);
  }
  const after=query().map(x=>x.name);
  if(mode==="apply") must(tables.every(t=>after.includes(t)),"BREED_0173_READBACK_MISSING");
  console.log(JSON.stringify({mode,after,ready:tables.every(t=>after.includes(t))}));
} finally {rmSync(temp,{recursive:true,force:true});}
