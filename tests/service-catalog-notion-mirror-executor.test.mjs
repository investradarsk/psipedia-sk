import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createAdminCatalogOption} from "../lib/service-catalog-admin-store.ts";
import {executeServiceCatalogNotionMirror} from "../lib/service-catalog-notion-mirror-executor.ts";
import {createServiceCatalogNotionHttpPort} from "../lib/service-catalog-notion-http-port.ts";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql133=read("drizzle/0133_services_canonical_admin_foundation.sql");
const sql134=read("drizzle/0134_services_admin_change_audit.sql");
const PAGE="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_PAGE="ffffffff-ffff-4fff-8fff-ffffffffffff";
const SOURCE="11111111-2222-4333-8444-555555555555";
const TIME="2026-10-19T12:01:01Z";
class Statement{
  constructor(sqlite,sql){
    this.sql=sql;this.positions=[...sql.matchAll(/\?(\d+)/g)].map(m=>Number(m[1])-1);
    this.stmt=sqlite.prepare(sql.replace(/\?\d+/g,"?"));this.values=[];
  }
  bind(...values){this.values=values;return this;}
  args(){return this.positions.map(i=>this.values[i]);}
  async first(){return this.stmt.get(...this.args())??null;}
  async all(){return {results:this.stmt.all(...this.args())};}
  async run(){return {meta:this.stmt.run(...this.args())};}
}
async function fixture(opts={}){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,category TEXT,status TEXT)");
  sqlite.exec(sql133);
  if(!opts.no134)sqlite.exec(sql134);
  const db={
    prepare(sql){return new Statement(sqlite,sql);},
    async batch(statements){
      sqlite.exec("BEGIN");
      try{
        const result=[];
        for(const stmt of statements)result.push(await stmt.run());
        sqlite.exec("COMMIT");return result;
      }catch(err){sqlite.exec("ROLLBACK");throw err;}
    }
  };
  const created=await createAdminCatalogOption(db,{
    name:"Mobilná veterinárna pomoc",kind:"service",category:"veterinari",
    group:"Veterinárna starostlivosť",meaning:"Ošetrenie domácich zvierat mimo veterinárnej ambulancie."
  },"admin@example.com");
  const local=()=>{const x=sqlite.prepare("SELECT * FROM service_catalog_admin_options WHERE id=?").get(created.id);
    return {id:x.id,version:x.version,status:x.status,notionMirrorStatus:x.notion_mirror_status,
      kind:x.kind,label:x.label,group:x.group_name,meaning:x.meaning,
      primaryCategory:x.primary_category,categories:JSON.parse(x.categories_json),valueKind:x.value_kind};};
  const state={pageId:PAGE,dataSourceId:SOURCE,sourceOptionId:created.id,
    sourceOptionVersion:0,notionLastEditedAt:"2026-10-19T12:00:59Z",
    archived:false,inTrash:false,fields:((x)=>({
      kind:x.kind,label:x.label,group:x.group,meaning:x.meaning,
      primaryCategory:x.primaryCategory,categories:x.categories,valueKind:x.valueKind}))(local())};
  const count=()=>sqlite.prepare("SELECT COUNT(*) n FROM service_catalog_admin_notion_receipts").get().n;
  const registry={
    async get(id){return opts.missingMapping?null:{optionId:id,pageId:PAGE,dataSourceId:SOURCE};},
    async list(){return [{optionId:created.id,pageId:PAGE,dataSourceId:SOURCE},
      ...(opts.doubleOwnership?[{optionId:"svc.admin."+"b".repeat(32),pageId:PAGE,dataSourceId:SOURCE}]:[])]}
  };
  const stats={reads:0,writes:0,lease:0};
  const port={
    async readPage(){
      stats.reads++;
      if(opts.readError && stats.reads===2)throw new Error("NOTION_503");
      const item=structuredClone(state);
      if(stats.reads>1&&opts.mismatchedContent)item.fields.meaning="Spoofed remote meaning";
      if(stats.reads>1&&opts.wrongIdentity)item.sourceOptionId="svc.admin."+"f".repeat(32);
      if(stats.reads>1&&opts.wrongSource)item.dataSourceId=OTHER_PAGE;
      return item;
    },
    async writePage(_page,x){
      stats.writes++;
      if(opts.writeFail)throw new Error("NOTION_403");
      state.sourceOptionVersion=x.version;
      state.fields={kind:x.kind,label:x.label,group:x.group,meaning:x.meaning,
        primaryCategory:x.primaryCategory,categories:[...x.categories],valueKind:x.valueKind};
      if(opts.timeoutAfterWrite && stats.writes===1)throw new Error("TIMEOUT_AFTER_REMOTE_SUCCESS");
      return {pageId:PAGE,notionLastEditedAt:state.notionLastEditedAt};
    }
  };
  const lease={async runExclusive(_id,callback){stats.lease++;return callback();}};
  const deps={db,flags:{adminWrites:"true",notionMirrorReady:"true",mirrorExecutor:"true"},
    registry,lease,notion:port,now:()=>new Date(TIME)};
  return {sqlite,db,created,local,state,count,stats,deps};
}
test("write -> independent readback -> atomic verified receipt; no profile table mutation",async()=>{
  const f=await fixture();try{
    const result=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
    assert.equal(result.state,"VERIFIED",JSON.stringify(result));
    assert.equal(result.version,2);
    assert.equal(f.stats.reads,2);assert.equal(f.stats.writes,1);
    assert.equal(f.local().notionMirrorStatus,"SYNCED");
    const receipt=f.sqlite.prepare("SELECT * FROM service_catalog_admin_notion_receipts").get();
    assert.equal(receipt.option_id,f.created.id);assert.equal(receipt.option_version,2);
    assert.equal(receipt.notion_page_id,PAGE);
    assert.equal(receipt.remote_payload_sha256.length,64);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM service_profile_option_choices").get().n,0);
    const again=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
    assert.deepEqual({state:again.state,reason:again.reason},{state:"REVIEW",reason:"NOT_PENDING"});
    assert.equal(f.stats.writes,1);assert.equal(f.count(),1);
  }finally{f.sqlite.close();}
});
for(const [name,opts,reason] of [
  ["mismatched readback",{mismatchedContent:true},"PROOF_PAYLOAD_MISMATCH"],
  ["wrong canonical ID",{wrongIdentity:true},"PROOF_SOURCE_MISMATCH"],
  ["wrong data source",{wrongSource:true},"PROOF_SOURCE_MISMATCH"],
  ["missing mapping",{missingMapping:true},"NOTION_MAPPING_MISSING"],
  ["ambiguous page ownership",{doubleOwnership:true},"PAGE_OWNERSHIP_CONFLICT"],
  ["Notion write failure",{writeFail:true},"WRITE_UNCERTAIN"],
  ["write succeeded but GET failed",{readError:true},"READBACK_UNAVAILABLE"]
]){
  test(name+" refuses receipt and remains PENDING",async()=>{
    const f=await fixture(opts);try{
      const result=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
      assert.equal(result.reason,reason,JSON.stringify(result));
      assert.notEqual(result.state,"VERIFIED");assert.equal(f.count(),0);
      assert.equal(f.local().notionMirrorStatus,"PENDING");
      assert.equal(f.local().version,1);
    }finally{f.sqlite.close();}
  });
}
test("timeout after remote PATCH keeps D1 PENDING; retry re-reads and succeeds",async()=>{
  const f=await fixture({timeoutAfterWrite:true});try{
    const first=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
    assert.deepEqual({state:first.state,reason:first.reason},{state:"RETRY",reason:"WRITE_UNCERTAIN"});
    assert.equal(f.count(),0);assert.equal(f.stats.writes,1);
    const retry=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
    assert.equal(retry.state,"VERIFIED");assert.equal(f.stats.writes,2);assert.equal(f.count(),1);
  }finally{f.sqlite.close();}
});
test("stale canonical revision after PATCH cannot commit receipt",async()=>{
  const f=await fixture();try{
    const write=f.deps.notion.writePage;
    f.deps.notion.writePage=async(...args)=>{
      const ack=await write(...args);
      f.sqlite.prepare("UPDATE service_catalog_admin_options SET version=version+1 WHERE id=?").run(f.created.id);
      return ack;
    };
    const result=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
    assert.equal(result.reason,"STALE_CANONICAL_VERSION");assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("SQL-level stale CAS/ownership failure rolls back entire batch, no orphan receipt",async()=>{
  const f=await fixture();try{
    const original=f.db.batch;
    f.db.batch=async statements=>{
      f.sqlite.prepare("UPDATE service_catalog_admin_options SET version=version+1 WHERE id=?").run(f.created.id);
      return original(statements);
    };
    const result=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
    assert.equal(result.reason,"ATOMIC_COMMIT_FAILED");assert.equal(f.count(),0);
    assert.equal(f.local().notionMirrorStatus,"PENDING");
  }finally{f.sqlite.close();}
});
test("no authority to write if any of three flags is disabled",async()=>{
  const f=await fixture();try{
    for(const key of ["adminWrites","notionMirrorReady","mirrorExecutor"]){
      const original=f.deps.flags[key];f.deps.flags[key]="false";
      const result=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
      assert.equal(result.reason,"FEATURE_DISABLED");
      f.deps.flags[key]=original;
    }
    assert.equal(f.stats.reads,0);assert.equal(f.stats.writes,0);
  }finally{f.sqlite.close();}
});
test("0134 source present is not enough; missing schema blocks BEFORE Notion calls",async()=>{
  const f=await fixture({no134:true});try{
    const result=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
    assert.deepEqual({state:result.state,reason:result.reason},
      {state:"BLOCKED",reason:"SCHEMA_0134_UNVERIFIED"});
    assert.equal(f.stats.writes,0);
  }finally{f.sqlite.close();}
});
test("wrong page in existing registry is never patched",async()=>{
  const f=await fixture();try{
    f.deps.registry.get=async id=>({optionId:id,pageId:OTHER_PAGE,dataSourceId:SOURCE});
    const result=await executeServiceCatalogNotionMirror(f.deps,f.created.id);
    assert.notEqual(result.state,"VERIFIED");assert.equal(f.stats.writes,0);
  }finally{f.sqlite.close();}
});
test("Notion cannot mutate unrelated D1 profiles or canonical option",async()=>{
  const f=await fixture({mismatchedContent:true});try{
    const before=f.local();
    await executeServiceCatalogNotionMirror(f.deps,f.created.id);
    assert.deepEqual(f.local(),before);assert.equal(f.count(),0);
    const code=read("lib/service-catalog-notion-mirror-executor.ts");
    assert.doesNotMatch(code,/UPDATE\s+directory_profiles|INSERT\s+INTO\s+service_profile_option_choices/i);
    assert.doesNotMatch(code,/recordCatalogMirrorOutcome/);
  }finally{f.sqlite.close();}
});
test("no worker/route automatically activates the new executor",()=>{
  const route=read("app/api/admin/service-catalog/options/[id]/route.ts");
  const wrangler=read("wrangler.jsonc");
  assert.doesNotMatch(route,/executeServiceCatalogNotionMirror/);
  assert.doesNotMatch(wrangler,/SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED/);
});
const keys={optionId:"Canonical ID",optionVersion:"Canonical Version",kind:"Kind",label:"Display Name",
  group:"Group",meaning:"Meaning",primaryCategory:"Primary Category",
  categories:"Categories",valueKind:"Value Kind"};
test("Notion transport refuses writes by default and rejects legacy Služby mapping",async()=>{
  const x=createServiceCatalogNotionHttpPort({token:"fake",dataSourceId:SOURCE,properties:keys,
    fetcher:async()=>{throw Error("Should not request network");}});
  await assert.rejects(()=>x.writePage(PAGE,{}),/NOTION_WRITES_DISABLED/);
  assert.throws(()=>createServiceCatalogNotionHttpPort({token:"fake",dataSourceId:SOURCE,
    properties:{...keys,label:"Služby"}}),/CATALOG_SCHEMA_NOT_APPROVED/);
});
test("Notion transport PATCH touches only approved catalog fields",async()=>{
  const calls=[];
  const f=await fixture();try{
    const x=createServiceCatalogNotionHttpPort({token:"fake",dataSourceId:SOURCE,
      properties:keys,allowWrites:true,fetcher:async (url,init)=>{
        calls.push({url,method:init.method,body:init.body?JSON.parse(init.body):null});
        return {ok:true,json:async()=>({id:PAGE,last_edited_time:"2026-10-19T12:00:59Z"})};
      }});
    await x.writePage(PAGE,f.local());
    assert.equal(calls.length,1);assert.equal(calls[0].method,"PATCH");
    assert.deepEqual(Object.keys(calls[0].body),["properties"]);
    assert.deepEqual(Object.keys(calls[0].body.properties).sort(),Object.values(keys).sort());
    assert.equal(calls[0].body.properties["Canonical ID"].rich_text[0].text.content,f.created.id);
    assert.equal(calls[0].body.properties["Canonical Version"].number,1);
  }finally{f.sqlite.close();}
});
test("HTTP page read requires designated catalog data-source, not arbitrary profile page",async()=>{
  const x=createServiceCatalogNotionHttpPort({token:"fake",dataSourceId:SOURCE,
    properties:keys,fetcher:async()=>({ok:true,json:async()=>({
      id:PAGE,parent:{type:"data_source_id",data_source_id:OTHER_PAGE},properties:{}
    })})});
  await assert.rejects(()=>x.readPage(PAGE),/WRONG_CATALOG_DATA_SOURCE/);
});
