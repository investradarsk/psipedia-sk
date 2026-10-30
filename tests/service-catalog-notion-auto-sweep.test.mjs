import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {runServicesV3CatalogAutoSweep} from "../lib/service-catalog-notion-auto-sweep.ts";

const optionId="svc.admin."+"a".repeat(32);
const gates={
  NOTION_API_TOKEN:"fixture-only-secret",
  SERVICE_CATALOG_ADMIN_WRITES_ENABLED:"true",
  SERVICE_CATALOG_NOTION_MIRROR_READY:"true",
  SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED:"true",
  SERVICE_CATALOG_NOTION_AUTO_ENABLED:"true"
};
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const migration=read("drizzle/0139_services_catalog_notion_auto_attempts.sql");
function fixture({schema=true,version=1}={}){
  const sql=new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE service_catalog_admin_options(id TEXT PRIMARY KEY,version INTEGER,status TEXT,notion_mirror_status TEXT)");
  sql.prepare("INSERT INTO service_catalog_admin_options VALUES(?,?,?,?)").run(optionId,version,"DRAFT","PENDING");
  if(schema)sql.exec(migration);
  const db={
    prepare(query){
      let args=[];
      return {
        bind(...values){args=values;return this;},
        async all(){return {results:sql.prepare(query).all(...args)};},
        async first(){return sql.prepare(query).get(...args)??null;},
        async run(){return sql.prepare(query).run(...args);}
      };
    }
  };
  return {db,sql,close(){sql.close();}};
}
const inventory=(disposition="MAPPED_PENDING",extra={})=>({
  state:"INVENTORY",value:{blocked:false,
    items:[{optionId,version:1,disposition}],...extra}
});
function internal(operations,disposition="MAPPED_PENDING",outcome="VERIFIED"){
  return async i=>{
    operations.push({action:i.action,optionId:i.optionId});
    if(i.action==="INVENTORY")return inventory(disposition);
    if(i.action==="MIRROR_ONE")return {state:"MIRROR",result:{state:outcome,optionId}};
    return {state:"PROVISION",result:{state:outcome,optionId}};
  };
}

test("default OFF and missing any established write gate causes zero D1/Notion writes",async()=>{
 const f=fixture();
 try{
  const calls=[];
  assert.equal((await runServicesV3CatalogAutoSweep({db:f.db,bindings:{...gates,SERVICE_CATALOG_NOTION_AUTO_ENABLED:"false"},run:internal(calls)})).state,"DISABLED");
  assert.equal(calls.length,0);
  for(const name of ["NOTION_API_TOKEN","SERVICE_CATALOG_ADMIN_WRITES_ENABLED","SERVICE_CATALOG_NOTION_MIRROR_READY","SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED"]){
    const result=await runServicesV3CatalogAutoSweep({db:f.db,bindings:{...gates,[name]:name==="NOTION_API_TOKEN"?"":"false"},run:internal(calls)});
    assert.equal(result.state,"BLOCKED",name);
  }
  assert.equal(calls.length,0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM service_catalog_notion_auto_attempts").get().n,0);
 }finally{f.close();}
});

test("owner-approved automatic release with zero dynamic options performs no remote writes",async()=>{
 const f=fixture();
 try{
  f.sql.exec("DELETE FROM service_catalog_admin_options");
  const calls=[];
  const run=async input=>{
    calls.push(input.action);
    if(input.action!=="INVENTORY")throw Error("no option may be provisioned or mirrored");
    return {state:"INVENTORY",value:{blocked:false,items:[]}};
  };
  const flags={...gates,
    SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED:"true",
    SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED:"true"};
  const result=await runServicesV3CatalogAutoSweep({db:f.db,bindings:flags,run});
  assert.equal(result.state,"IDLE");
  assert.deepEqual(calls,["INVENTORY"]);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM service_catalog_notion_auto_attempts").get().n,0);
 }finally{f.close();}
});

test("0139 is mandatory: missing attempt journal fails closed before inventory/network",async()=>{
 const f=fixture({schema:false});
 try{
  const calls=[];
  const s=await runServicesV3CatalogAutoSweep({db:f.db,bindings:gates,run:internal(calls)});
  assert.equal(s.state,"BLOCKED");
  assert.equal(calls.length,0);
 }finally{f.close();}
});

test("mapped DRAFT/PENDING is mirrored once after durable claim, never repeated",async()=>{
 const f=fixture();
 try{
  const calls=[];
  const run=async input=>{
    if(input.action==="MIRROR_ONE"){
      assert.equal(f.sql.prepare("SELECT outcome FROM service_catalog_notion_auto_attempts").get().outcome,"CLAIMED");
    }
    return internal(calls)(input);
  };
  let result=await runServicesV3CatalogAutoSweep({db:f.db,bindings:gates,run});
  assert.deepEqual({state:result.state,action:result.action},{state:"VERIFIED",action:"MIRROR_ONE"});
  assert.equal(f.sql.prepare("SELECT outcome FROM service_catalog_notion_auto_attempts").get().outcome,"VERIFIED");
  result=await runServicesV3CatalogAutoSweep({db:f.db,bindings:gates,run});
  assert.equal(result.state,"IDLE");
  assert.deepEqual(calls.map(x=>x.action),["INVENTORY","MIRROR_ONE","INVENTORY"]);
 }finally{f.close();}
});

test("RETRY, timeouts and ambiguous results are permanently quarantined: no auto retry",async()=>{
 const f=fixture();
 try{
  const calls=[],run=internal(calls,"MAPPED_PENDING","RETRY");
  let s=await runServicesV3CatalogAutoSweep({db:f.db,bindings:gates,run});
  assert.equal(s.state,"QUARANTINED");assert.equal(s.reason,"RETRY");
  assert.equal((await runServicesV3CatalogAutoSweep({db:f.db,bindings:gates,run})).state,"IDLE");
  assert.equal(calls.filter(x=>x.action==="MIRROR_ONE").length,1);
  assert.throws(()=>f.sql.prepare("DELETE FROM service_catalog_notion_auto_attempts").run(),/history is durable/);
  assert.throws(()=>f.sql.prepare("UPDATE service_catalog_notion_auto_attempts SET outcome='VERIFIED'").run(),/cannot be rewritten/);
 }finally{f.close();}
});

test("ambiguous Notion page creation is OFF by default and requires TWO additional explicit gates",async()=>{
 const f=fixture();try{
  const calls=[],run=internal(calls,"NEEDS_PAGE","CREATED_NEEDS_MIRROR");
  assert.equal((await runServicesV3CatalogAutoSweep({db:f.db,bindings:gates,run})).state,"IDLE");
  assert.equal((await runServicesV3CatalogAutoSweep({db:f.db,bindings:{...gates,SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED:"true"},run})).state,"IDLE");
  const enabled={...gates,SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED:"true",SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED:"true"};
  const s=await runServicesV3CatalogAutoSweep({db:f.db,bindings:enabled,run});
  assert.deepEqual({state:s.state,action:s.action},{state:"PAGE_READY",action:"PROVISION_ONE"});
  assert.equal((await runServicesV3CatalogAutoSweep({db:f.db,bindings:enabled,run})).state,"IDLE");
  assert.equal(calls.filter(x=>x.action==="PROVISION_ONE").length,1);
  assert.equal(f.sql.prepare("SELECT outcome FROM service_catalog_notion_auto_attempts").get().outcome,"CREATED_NEEDS_MIRROR");
 }finally{f.close();}
});

test("canonical version/state CAS and inventory conflicts prevent remote execution",async()=>{
 const f=fixture({version:2});try{
  const calls=[],run=internal(calls);
  assert.equal((await runServicesV3CatalogAutoSweep({db:f.db,bindings:gates,run})).state,"IDLE");
  assert.equal(calls.filter(x=>x.action==="MIRROR_ONE").length,0);
  f.sql.prepare("UPDATE service_catalog_admin_options SET version=1,status='ACTIVE'").run();
  assert.equal((await runServicesV3CatalogAutoSweep({db:f.db,bindings:gates,run})).state,"IDLE");
  assert.equal(calls.filter(x=>x.action==="MIRROR_ONE").length,0);
  const blocked=async()=>({state:"INVENTORY",value:{blocked:true,items:[{optionId,version:1,disposition:"MAPPED_PENDING"}]}});
  assert.equal((await runServicesV3CatalogAutoSweep({db:f.db,bindings:gates,run:blocked})).state,"BLOCKED");
 }finally{f.close();}
});

test("cron wiring is hourly only, owner-approved Wrangler flags, never an HTTP writer",()=>{
 const worker=read("worker/index.ts");
 const runner=read("lib/service-catalog-notion-auto-sweep.ts");
 const route=read("app/api/admin/service-catalog/notion-mirror/route.ts");
 assert.match(worker,/if \(isFullHourlyScheduledSweep\(controller\)\) \{/);
 assert.match(worker,/SERVICE_CATALOG_NOTION_AUTO_ENABLED==="true"/);
 assert.match(worker,/_ctx\.waitUntil\(/);
 assert.match(worker,/runSimpleServiceCatalogSync/);
 assert.match(worker,/controller\.cron === ADMIN_PUSH_CRON/);
 assert.doesNotMatch(worker,/runServicesV3CatalogAutoSweep\(\{/);
 assert.match(runner,/ON CONFLICT\(option_id,option_version,action\) DO NOTHING/);
 assert.match(runner,/state:"QUARANTINED"/);
 assert.match(route,/strictProvenance:true/);
 const flags=JSON.parse(read("wrangler.jsonc")).vars;
 assert.equal(flags.SERVICE_CATALOG_NOTION_AUTO_ENABLED,"true");
 assert.equal(flags.SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED,"true");
 assert.equal(flags.SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED,"true");
 assert.doesNotMatch(runner,/setInterval|while\(true\)|fetch\(/);
});
