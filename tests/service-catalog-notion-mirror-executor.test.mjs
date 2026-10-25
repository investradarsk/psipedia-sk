import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createAdminCatalogOption} from "../lib/service-catalog-admin-store.ts";
import {buildServicesV3NotionBootstrapInventory} from "../lib/service-catalog-notion-bootstrap-plan.ts";
import {provisionServiceCatalogNotionPage} from "../lib/service-catalog-notion-page-provisioner.ts";
import {createServicesV3CatalogD1Lease,inspectServicesV3CatalogLease,ServiceCatalogLeaseBusy} from "../lib/service-catalog-notion-durable-lease.ts";
import {runServicesV3CatalogInternal} from "../lib/service-catalog-notion-internal-runner.ts";
import {executeServiceCatalogNotionMirror} from "../lib/service-catalog-notion-mirror-executor.ts";
import {createServiceCatalogNotionHttpPort, createPsipediaServiceCatalogNotionHttpPort,
  PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING, createPsipediaServiceCatalogReadOnlyRegistry} from "../lib/service-catalog-notion-http-port.ts";

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
  // Legacy manual mirror executor still protects DRAFT options. Normal new
  // catalog entries are now ACTIVE immediately and use the automatic sync.
  sqlite.prepare("UPDATE service_catalog_admin_options SET status='DRAFT' WHERE id=?").run(created.id);
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
  assert.match(wrangler,/SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED/);
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

test("confirmed Psipedia Notion catalog binding has exact 9 properties and stays write-disabled",async()=>{
  const b=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING;
  assert.equal(b.dataSourceId,"8785fd64-36c3-4acf-aade-ad99c30ad45d");
  assert.deepEqual(b.properties,{
    optionId:"Option ID",optionVersion:"Verzia",kind:"Typ",label:"Názov",
    group:"Skupina",meaning:"Význam",primaryCategory:"Hlavná kategória",
    categories:"Kategórie",valueKind:"Druh hodnoty"
  });
  assert.equal(Object.keys(b.properties).length,9);
  assert.ok(!Object.values(b.properties).includes("Služby"));
  const adapter=createPsipediaServiceCatalogNotionHttpPort({
    token:"offline-test-only",
    fetcher:async()=>{throw Error("Network unreachable when disabled");}
  });
  await assert.rejects(()=>adapter.writePage(PAGE,{}),/NOTION_WRITES_DISABLED/);
});
test("confirmed catalog adapter rejects page from Adresar data source",async()=>{
  const adapter=createPsipediaServiceCatalogNotionHttpPort({
    token:"offline-test-only",
    fetcher:async()=>({ok:true,json:async()=>({
      id:PAGE,parent:{type:"data_source_id",data_source_id:"84e0664c-ca47-405f-9d54-31b20287bc8c"},
      properties:{}
    })})
  });
  await assert.rejects(()=>adapter.readPage(PAGE),/WRONG_CATALOG_DATA_SOURCE/);
});

const CATALOG_SOURCE=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
const REGISTRY_OPTION="svc.admin."+"a".repeat(32);
const REGISTRY_OTHER_OPTION="attr.admin."+"b".repeat(32);
function notionOptionPage(id=PAGE,optionId=REGISTRY_OPTION) {
  const p=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.properties;
  const rt=s=>({rich_text:[{plain_text:s}]});
  const sel=s=>({select:{name:s}});
  return {
    id,parent:{type:"data_source_id",data_source_id:CATALOG_SOURCE},
    archived:false,in_trash:false,
    properties:{
      [p.optionId]:rt(optionId),
      [p.optionVersion]:{number:1},
      [p.kind]:sel(optionId.startsWith("svc.")?"service":"attribute"),
      [p.label]:{title:[{plain_text:"Mobilná veterinárna pomoc"}]},
      [p.group]:rt("Veterinárna starostlivosť"),
      [p.meaning]:rt("Starostlivosť o psa mimo ambulancie"),
      [p.primaryCategory]:sel("veterinari"),
      [p.categories]:{multi_select:[{name:"veterinari"}]},
      [p.valueKind]:sel("tri_state")
    }
  };
}
function registryMock(responses,calls){
  let index=0;
  return createPsipediaServiceCatalogReadOnlyRegistry({
    token:"offline-token",
    fetcher:async (url,init)=>{
      calls.push({url,method:init.method,body:JSON.parse(init.body),version:init.headers["Notion-Version"]});
      const data=responses[Math.min(index++,responses.length-1)];
      if(data instanceof Error)throw data;
      return {ok:true,json:async()=>structuredClone(data)};
    }
  });
}
test("read-only catalog registry scans full pagination and correctly maps dynamic option identity",async()=>{
  const calls=[];
  const registry=registryMock([
    {results:[notionOptionPage()],has_more:true,next_cursor:"next-page"},
    {results:[notionOptionPage(OTHER_PAGE,REGISTRY_OTHER_OPTION)],has_more:false,next_cursor:null},
  ],calls);
  const all=await registry.list();
  assert.deepEqual(all,[
    {optionId:REGISTRY_OPTION,pageId:PAGE,dataSourceId:CATALOG_SOURCE},
    {optionId:REGISTRY_OTHER_OPTION,pageId:OTHER_PAGE,dataSourceId:CATALOG_SOURCE}
  ]);
  assert.equal(calls.length,2);
  assert.equal(calls[0].url,"https://api.notion.com/v1/data_sources/"+CATALOG_SOURCE+"/query");
  assert.deepEqual(calls.map(x=>x.method),["POST","POST"]);
  assert.equal(calls[0].version,"2025-09-03");
  assert.deepEqual(calls[0].body,{page_size:100});
  assert.deepEqual(calls[1].body,{page_size:100,start_cursor:"next-page"});
  assert.deepEqual(await registry.get(REGISTRY_OTHER_OPTION),all[1]);
});
test("empty catalog returns no options; no page creation or profile lookups",async()=>{
  const calls=[];
  const registry=registryMock([{results:[],has_more:false,next_cursor:null}],calls);
  assert.deepEqual(await registry.list(),[]);
  assert.equal(await registry.get(REGISTRY_OPTION),null);
  assert.equal(await registry.get("svc.vet.vaccination"),null);
  assert.equal(calls.length,2);
  assert.ok(calls.every(x=>x.method==="POST"&&x.url.includes("/data_sources/")));
});
test("registry must not quietly ignore duplicate owners, wrong parents or invalid option types",async()=>{
  for (const pages of [
    [notionOptionPage(),notionOptionPage(OTHER_PAGE,REGISTRY_OPTION)],
    [{...notionOptionPage(),parent:{type:"data_source_id",data_source_id:"84e0664c-ca47-405f-9d54-31b20287bc8c"}}],
    [{...notionOptionPage(),archived:true}],
    [{...notionOptionPage(),properties:{}}],
    [{...notionOptionPage(),properties:{
      ...notionOptionPage().properties,
      [PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.properties.optionId]:{rich_text:[{plain_text:"svc.vet.vaccination"}]}
    }}]
  ]) {
    const registry=registryMock([{results:pages,has_more:false,next_cursor:null}],[]);
    await assert.rejects(()=>registry.list(),/NOTION_REGISTRY_/);
  }
});
test("truncated or malformed query result blocks complete ownership assertions",async()=>{
  for (const item of [
    {results:[],has_more:true,next_cursor:null},
    {results:[],has_more:true,next_cursor:"loop"},
    {results:[notionOptionPage()],has_more:false,next_cursor:"unexpected"},
    {results:{bad:true},has_more:false},
  ]) {
    const responses=item.next_cursor==="loop"?[item,item]:[item];
    const registry=registryMock(responses,[]);
    await assert.rejects(()=>registry.list(),/NOTION_REGISTRY_/);
  }
});


test("bootstrap inventory reports absent catalog pages without D1 or Notion writes",async()=>{
  const f=await fixture();
  try{
    const plan=await buildServicesV3NotionBootstrapInventory(f.db,{list:async()=>[]});
    assert.equal(plan.mode,"READ_ONLY");
    assert.equal(plan.canonicalDynamicCount,1);
    assert.equal(plan.notionPageCount,0);
    assert.equal(plan.receiptCount,0);
    assert.equal(plan.safeForAutomaticWrite,false);
    assert.equal(plan.blocked,false);
    assert.deepEqual(plan.items,[{optionId:f.created.id,version:1,disposition:"NEEDS_PAGE"}]);
    assert.deepEqual(plan.unmappedNotionOptionIds,[]);
    assert.equal(f.local().notionMirrorStatus,"PENDING");
    assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("bootstrap inventory accepts existing exact catalog mapping but cannot assert write success",async()=>{
  const f=await fixture();
  try{
    const src=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
    const result=await buildServicesV3NotionBootstrapInventory(f.db,{
      list:async()=>[{optionId:f.created.id,pageId:PAGE,dataSourceId:src}]
    });
    assert.equal(result.safeForAutomaticWrite,false);
    assert.equal(result.blocked,false);
    assert.deepEqual(result.items,[{
      optionId:f.created.id,version:1,disposition:"MAPPED_PENDING",pageId:PAGE
    }]);
    assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("bootstrap inventory recognizes an already synced version only with matching immutable receipt",async()=>{
  const f=await fixture();
  try{
    f.sqlite.prepare("INSERT INTO service_catalog_admin_notion_receipts (option_id,option_version,notion_page_id,notion_last_edited_at,remote_payload_sha256,verified_at,verified_by) VALUES (?,?,?,?,?,?,?)")
      .run(f.created.id,2,PAGE,"2026-10-20T12:00:00Z","f".repeat(64),"2026-10-20T12:00:01Z","offline-fixture");
    f.sqlite.prepare("UPDATE service_catalog_admin_options SET version=2,notion_mirror_status='SYNCED' WHERE id=?").run(f.created.id);
    const p=await buildServicesV3NotionBootstrapInventory(f.db,{list:async()=>[{
      optionId:f.created.id,pageId:PAGE,dataSourceId:PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId
    }]});
    assert.deepEqual(p.items,[{optionId:f.created.id,version:2,disposition:"SYNCED_VERIFIED",pageId:PAGE}]);
    assert.equal(p.blocked,false);
    assert.equal(p.receiptCount,1);
  }finally{f.sqlite.close();}
});
test("bootstrap inventory detects invalid source, duplicate ownership, orphan page and stale receipt",async()=>{
  const f=await fixture();
  try{
    const src=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
    const owner={optionId:f.created.id,pageId:PAGE,dataSourceId:src};
    const dup={...owner,pageId:OTHER_PAGE};
    await assert.rejects(()=>buildServicesV3NotionBootstrapInventory(f.db,{
      list:async()=>[owner,dup]
    }),/CATALOG_BOOTSTRAP_DUPLICATE_NOTION_MAPPING/);
    await assert.rejects(()=>buildServicesV3NotionBootstrapInventory(f.db,{
      list:async()=>[{...owner,dataSourceId:SOURCE}]
    }),/CATALOG_BOOTSTRAP_INVALID_NOTION_MAPPING/);
    const orphan=await buildServicesV3NotionBootstrapInventory(f.db,{
      list:async()=>[owner,{optionId:"attr.admin."+"b".repeat(32),pageId:OTHER_PAGE,dataSourceId:src}]
    });
    assert.equal(orphan.blocked,true);
    assert.deepEqual(orphan.unmappedNotionOptionIds,["attr.admin."+"b".repeat(32)]);
    f.sqlite.prepare("INSERT INTO service_catalog_admin_notion_receipts (option_id,option_version,notion_page_id,notion_last_edited_at,remote_payload_sha256,verified_at,verified_by) VALUES (?,?,?,?,?,?,?)")
      .run(f.created.id,2,OTHER_PAGE,"2026-10-20T12:00:00Z","f".repeat(64),"2026-10-20T12:00:01Z","offline-fixture");
    const conflict=await buildServicesV3NotionBootstrapInventory(f.db,{list:async()=>[owner]});
    assert.equal(conflict.blocked,true);
    assert.equal(conflict.items[0].disposition,"BLOCKED");
    assert.equal(conflict.items[0].reason,"RECEIPT_OWNERSHIP_OR_VERSION_CONFLICT");
  }finally{f.sqlite.close();}
});
test("bootstrap inventory requires complete 0134 schema before reading remote registry",async()=>{
  const f=await fixture({no134:true});
  try{
    let called=false;
    await assert.rejects(()=>buildServicesV3NotionBootstrapInventory(f.db,{
      list:async()=>{called=true;return [];}
    }),/0134|not provisioned/i);
    assert.equal(called,false);
  }finally{f.sqlite.close();}
});
test("bootstrap distinguishes empty dynamic D1 table from 91 static service definitions",async()=>{
  const f=await fixture();
  try{
    f.sqlite.prepare("DELETE FROM service_catalog_admin_options WHERE id=?").run(f.created.id);
    const plan=await buildServicesV3NotionBootstrapInventory(f.db,{list:async()=>[]});
    assert.deepEqual(plan.items,[]);
    assert.equal(plan.canonicalDynamicCount,0);
    assert.equal(plan.notionPageCount,0);
    assert.equal(plan.blocked,false);
    assert.equal(plan.safeForAutomaticWrite,false);
    assert.ok(read("lib/service-catalog-contract.ts").includes("svc.vet.preventive_exam"));
  }finally{f.sqlite.close();}
});


async function manualPageFixture(opts={}){
  const f=await fixture(opts);
  const counters={create:0,read:0,registry:0,lock:0};
  const src=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
  let created=false;
  const registry={
    async list(){
      counters.registry++;
      const owned=created||opts.existingPage;
      return owned?[{optionId:f.created.id,pageId:PAGE,dataSourceId:src}]:[];
    }
  };
  const notion={
    async createPage(local){
      counters.create++;
      if(opts.timeoutAfterCreate){created=true;throw Error("TIMEOUT_AFTER_WRITE");}
      created=true;
      if(opts.editDuringCreate){
        f.sqlite.prepare("UPDATE service_catalog_admin_options SET label='Rival options',version=version+1 WHERE id=?").run(f.created.id);
      }
      return {pageId:PAGE};
    },
    async readPage(id){
      counters.read++;
      if(opts.readbackFailure)throw Error("NOTION_READ_503");
      const x={...f.local()};
      // A stale concurrent D1 edit must not change the Notion source being read.
      const initial={...x,label:opts.editDuringCreate?"Mobilná veterinárna pomoc":x.label,version:1};
      return {
        pageId:id,dataSourceId:src,sourceOptionId:f.created.id,
        sourceOptionVersion:initial.version,archived:false,inTrash:false,
        fields:{kind:initial.kind,label:initial.label,group:initial.group,
          meaning:initial.meaning,primaryCategory:initial.primaryCategory,
          categories:initial.categories,valueKind:initial.valueKind}
      };
    }
  };
  const lease={async runExclusive(_id,fn){counters.lock++;return await fn();}};
  const flags={adminWrites:"true",notionMirrorReady:"true",mirrorExecutor:"true",
    allowPageProvisioning:"true"};
  return {...f,counters,deps:{db:f.db,registry,lease,flags,notion}};
}
test("manual page creation requires four explicit gates and a lease",async()=>{
  const f=await manualPageFixture();
  try{
    const flags={...f.deps.flags,allowPageProvisioning:"false"};
    const stopped=await provisionServiceCatalogNotionPage({...f.deps,flags},f.created.id);
    assert.deepEqual(stopped,{optionId:f.created.id,state:"BLOCKED",reason:"FEATURE_DISABLED"});
    assert.equal(f.counters.create,0);
    assert.equal(f.counters.lock,0);
    const noLease=await provisionServiceCatalogNotionPage({...f.deps,lease:undefined},f.created.id);
    assert.equal(noLease.state,"BLOCKED");
    assert.equal(f.counters.create,0);
  }finally{f.sqlite.close();}
});
test("manual provisioning creates just one page and never writes D1 receipt/option status",async()=>{
  const f=await manualPageFixture();
  try{
    const first=await provisionServiceCatalogNotionPage(f.deps,f.created.id);
    assert.deepEqual(first,{optionId:f.created.id,state:"CREATED_NEEDS_MIRROR",pageId:PAGE});
    assert.equal(f.counters.create,1);
    assert.equal(f.counters.read,1);
    assert.equal(f.counters.lock,1);
    assert.equal(f.count(),0);
    assert.equal(f.local().notionMirrorStatus,"PENDING");
    const second=await provisionServiceCatalogNotionPage(f.deps,f.created.id);
    assert.deepEqual(second,{optionId:f.created.id,state:"EXISTS",pageId:PAGE});
    assert.equal(f.counters.create,1);
  }finally{f.sqlite.close();}
});
test("uncertain Notion create outcome is REVIEW, not retried or marked SYNCED",async()=>{
  const f=await manualPageFixture({timeoutAfterCreate:true});
  try{
    const first=await provisionServiceCatalogNotionPage(f.deps,f.created.id);
    assert.deepEqual(first,{optionId:f.created.id,state:"REVIEW",reason:"CREATE_OUTCOME_UNKNOWN"});
    assert.equal(f.counters.create,1);
    assert.equal(f.count(),0);
    // Later independent ownership visibility must detect existing page, not re-POST.
    const second=await provisionServiceCatalogNotionPage(f.deps,f.created.id);
    assert.equal(second.state,"EXISTS");
    assert.equal(f.counters.create,1);
  }finally{f.sqlite.close();}
});
test("concurrent canonical edit after Notion create requires human reconciliation",async()=>{
  const f=await manualPageFixture({editDuringCreate:true});
  try{
    const result=await provisionServiceCatalogNotionPage(f.deps,f.created.id);
    assert.equal(result.state,"REVIEW");
    assert.equal(result.reason,"STALE_CANONICAL_ROW");
    assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("missing independent Notion readback requires human reconciliation",async()=>{
  const f=await manualPageFixture({readbackFailure:true});
  try{
    const result=await provisionServiceCatalogNotionPage(f.deps,f.created.id);
    assert.deepEqual(result,{optionId:f.created.id,state:"REVIEW",
      reason:"READBACK_UNAVAILABLE",pageId:PAGE});
    assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("creation primitive is double gated and posts ONLY nine canonical catalog properties",async()=>{
  const data=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
  const payload={
    id:REGISTRY_OPTION,version:1,kind:"service",label:"Mobilná veterinárna pomoc",
    group:"Veterinárna starostlivosť",meaning:"Starostlivosť o psa mimo ambulancie",
    primaryCategory:"veterinari",categories:["veterinari"],valueKind:"tri_state"
  };
  const calls=[];
  const adapter=createPsipediaServiceCatalogNotionHttpPort({token:"offline",
    fetcher:async(url,init)=>{
      calls.push({url,body:JSON.parse(init.body),method:init.method});
      return {ok:true,json:async()=>({id:PAGE,parent:{type:"data_source_id",data_source_id:data}})};
    }
  });
  await assert.rejects(()=>adapter.createPage(payload),/NOTION_CREATES_DISABLED/);
  assert.equal(calls.length,0);
  const enabled=createPsipediaServiceCatalogNotionHttpPort({token:"offline",
    allowWrites:true,allowCreates:true,fetcher:async(url,init)=>{
      calls.push({url,body:JSON.parse(init.body),method:init.method});
      return {ok:true,json:async()=>({id:PAGE,parent:{type:"data_source_id",data_source_id:data}})};
    }
  });
  assert.deepEqual(await enabled.createPage(payload),{pageId:PAGE});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://api.notion.com/v1/pages");
  assert.equal(calls[0].method,"POST");
  assert.deepEqual(calls[0].body.parent,{type:"data_source_id",data_source_id:data});
  assert.deepEqual(Object.keys(calls[0].body.properties).sort(),
    Object.values(PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.properties).sort());
  assert.ok(!Object.keys(calls[0].body.properties).includes("Služby"));
});


test("durable Services V3 per-option lock excludes an independent caller before work",async()=>{
  const f=await fixture();
  try{
    f.sqlite.exec(read("drizzle/0124_gemini_notion_review_locks.sql"));
    const a=createServicesV3CatalogD1Lease(f.db);
    const b=createServicesV3CatalogD1Lease(f.db);
    let releaseFirst;
    let entered=false;
    const first=a.runExclusive(f.created.id,async()=>{
      entered=true;
      await new Promise(resolve=>{releaseFirst=resolve;});
      return {state:"VERIFIED"};
    });
    // The first async work callback has been entered after acquiring the D1 PK lock.
    for(let n=0;n<20&&!entered;n++)await Promise.resolve();
    assert.equal(entered,true);
    await assert.rejects(()=>b.runExclusive(f.created.id,async()=>({state:"VERIFIED"})),
      ServiceCatalogLeaseBusy);
    assert.equal((await inspectServicesV3CatalogLease(f.db,f.created.id)).held,true);
    releaseFirst();
    assert.equal((await first).state,"VERIFIED");
    assert.equal((await inspectServicesV3CatalogLease(f.db,f.created.id)).held,false);
    assert.equal((await b.runExclusive(f.created.id,async()=>({state:"BLOCKED"}))).state,"BLOCKED");
    assert.equal((await inspectServicesV3CatalogLease(f.db,f.created.id)).held,false);
    assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("uncertain Notion outcome retains durable lock across subsequent invocations",async()=>{
  const f=await fixture();
  try{
    f.sqlite.exec(read("drizzle/0124_gemini_notion_review_locks.sql"));
    const lease=createServicesV3CatalogD1Lease(f.db);
    const result=await lease.runExclusive(f.created.id,async()=>({state:"REVIEW",reason:"CREATE_OUTCOME_UNKNOWN"}));
    assert.equal(result.reason,"CREATE_OUTCOME_UNKNOWN");
    const lock=await inspectServicesV3CatalogLease(f.db,f.created.id);
    assert.equal(lock.held,true);
    assert.ok(lock.createdAt);
    await assert.rejects(()=>createServicesV3CatalogD1Lease(f.db)
      .runExclusive(f.created.id,async()=>({state:"CREATED_NEEDS_MIRROR"})),ServiceCatalogLeaseBusy);
    assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("unknown thrown error also keeps lock, but verified safe states release owner-CAS",async()=>{
  const f=await fixture();
  try{
    f.sqlite.exec(read("drizzle/0124_gemini_notion_review_locks.sql"));
    const lease=createServicesV3CatalogD1Lease(f.db);
    await assert.rejects(()=>lease.runExclusive(f.created.id,async()=>{
      throw Error("SIMULATED_UNCERTAIN_TRANSPORT");
    }),/SIMULATED_UNCERTAIN_TRANSPORT/);
    assert.equal((await inspectServicesV3CatalogLease(f.db,f.created.id)).held,true);
    // Unit fixture only: manual reset simulates separately approved operator recovery.
    f.sqlite.prepare("DELETE FROM gemini_notion_review_locks WHERE notion_page_id=?")
      .run("psipedia:services-v3:catalog:"+f.created.id);
    assert.equal((await lease.runExclusive(f.created.id,
      async()=>({state:"CREATED_NEEDS_MIRROR"}))).state,"CREATED_NEEDS_MIRROR");
    assert.equal((await inspectServicesV3CatalogLease(f.db,f.created.id)).held,false);
  }finally{f.sqlite.close();}
});
test("Services V3 coordination namespace is disjoint from existing Gemini UUID locks",async()=>{
  const f=await fixture();
  try{
    f.sqlite.exec(read("drizzle/0124_gemini_notion_review_locks.sql"));
    const key=f.created.id;
    f.sqlite.prepare("INSERT INTO gemini_notion_review_locks(notion_page_id,owner) VALUES (?,?)")
      .run(PAGE,"gemini-fixture");
    const lease=createServicesV3CatalogD1Lease(f.db);
    assert.equal((await lease.runExclusive(key,async()=>({state:"EXISTS"}))).state,"EXISTS");
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM gemini_notion_review_locks").get().n,1);
    assert.equal(f.sqlite.prepare("SELECT owner FROM gemini_notion_review_locks WHERE notion_page_id=?")
      .get(PAGE).owner,"gemini-fixture");
    assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("lease refuses invalid static IDs and lost-release ownership, without unlocking someone else",async()=>{
  const f=await fixture();
  try{
    f.sqlite.exec(read("drizzle/0124_gemini_notion_review_locks.sql"));
    const lease=createServicesV3CatalogD1Lease(f.db);
    await assert.rejects(()=>lease.runExclusive("svc.vet.vaccination",
      async()=>({state:"VERIFIED"})),/SERVICES_V3_LEASE_INVALID_OPTION_ID/);
    await assert.rejects(()=>lease.runExclusive(f.created.id,async()=>{
      f.sqlite.prepare("UPDATE gemini_notion_review_locks SET owner='different-owner' WHERE notion_page_id=?")
        .run("psipedia:services-v3:catalog:"+f.created.id);
      return {state:"VERIFIED"};
    }),/SERVICES_V3_LEASE_RELEASE_OWNERSHIP_LOST/);
    assert.equal((await inspectServicesV3CatalogLease(f.db,f.created.id)).held,true);
  }finally{f.sqlite.close();}
});


test("unwired internal catalog runner rejects unauthorized operator before any network call",async()=>{
  const f=await fixture();
  try{
    let requests=0;
    const result=await runServicesV3CatalogInternal({
      db:f.db,action:"INVENTORY",env:{NOTION_API_TOKEN:"offline-fixture"},
      authorize:async()=>false,fetcher:async()=>{requests++;throw Error("NO_EXTERNAL_ACCESS");}
    });
    assert.deepEqual(result,{state:"BLOCKED",reason:"UNAUTHORIZED",action:"INVENTORY"});
    assert.equal(requests,0);
    assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("internal runner allows only authorized read-only inventory with all production write flags OFF",async()=>{
  const f=await fixture();
  try{
    const requests=[];
    const result=await runServicesV3CatalogInternal({
      db:f.db,action:"INVENTORY",env:{NOTION_API_TOKEN:"offline-fixture"},
      authorize:async()=>true,fetcher:async(url,init)=>{
        requests.push({url,method:init.method});
        return {ok:true,json:async()=>({results:[],has_more:false,next_cursor:null})};
      }
    });
    assert.equal(result.state,"INVENTORY");
    assert.equal(result.value.canonicalDynamicCount,1);
    assert.equal(result.value.notionPageCount,0);
    assert.equal(result.value.items[0].disposition,"NEEDS_PAGE");
    assert.equal(result.value.safeForAutomaticWrite,false);
    assert.equal(requests.length,1);
    assert.ok(requests[0].url.includes("v1/data_sources/"));
    assert.equal(requests[0].method,"POST"); // Notion data-source QUERY, NOT page creation
    assert.equal(f.count(),0);
    assert.equal(f.local().notionMirrorStatus,"PENDING");
  }finally{f.sqlite.close();}
});
test("internal provision and mirror refuse any external mutation until flag gates are active",async()=>{
  const f=await fixture();
  try{
    let network=0;
    for(const action of ["PROVISION_ONE","MIRROR_ONE"]){
      const stopped=await runServicesV3CatalogInternal({
        db:f.db,action,optionId:f.created.id,
        env:{NOTION_API_TOKEN:"offline-fixture"},
        authorize:async()=>true,
        fetcher:async()=>{network++;throw Error("SHOULD_NOT_BE_CALLED");}
      });
      assert.deepEqual(stopped,{state:"BLOCKED",reason:"FEATURE_DISABLED",action});
    }
    const missingCreate=await runServicesV3CatalogInternal({
      db:f.db,action:"PROVISION_ONE",optionId:f.created.id,
      env:{NOTION_API_TOKEN:"offline-fixture",
        SERVICE_CATALOG_ADMIN_WRITES_ENABLED:"true",
        SERVICE_CATALOG_NOTION_MIRROR_READY:"true",
        SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED:"true"},
      authorize:async()=>true,
      fetcher:async()=>{network++;throw Error("SHOULD_NOT_BE_CALLED");}
    });
    assert.equal(missingCreate.reason,"PAGE_CREATION_DISABLED");
    assert.equal(network,0);
    assert.equal(f.count(),0);
  }finally{f.sqlite.close();}
});
test("Services V3 automatic sync is enabled while legacy admin route remains isolated",()=>{
  const wrangler=read("wrangler.jsonc");
  const route=read("app/api/admin/service-catalog/options/[id]/route.ts");
  assert.match(wrangler,/SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED/);
  assert.match(wrangler,/SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED/);
  assert.doesNotMatch(route,/runServicesV3CatalogInternal|provisionServiceCatalogNotionPage/);
});


test("offline full internal D1 -> Notion create -> readback -> verified receipt sync",async()=>{
  const f=await fixture();
  try{
    f.sqlite.exec(read("drizzle/0124_gemini_notion_review_locks.sql"));
    const source=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
    let remote=null;
    const events=[];
    const copyNotionProperties=payload=>{
      const props=structuredClone(payload);
      for(const v of Object.values(props)){
        for(const mode of ["rich_text","title"]){
          if(Array.isArray(v[mode]))for(const item of v[mode]){
            if(item.text && typeof item.text.content==="string")
              item.plain_text=item.text.content;
          }
        }
      }
      return props;
    };
    const json=obj=>({ok:true,json:async()=>structuredClone(obj)});
    const fetcher=async(url,init)=>{
      const method=init.method;
      if(url.endsWith("/query")){
        events.push("READ_REGISTRY");
        return json({results:remote?[remote]:[],has_more:false,next_cursor:null});
      }
      if(url==="https://api.notion.com/v1/pages"&&method==="POST"){
        assert.equal(remote,null,"must not double-create an option");
        events.push("CREATE");
        const body=JSON.parse(init.body);
        assert.deepEqual(body.parent,{type:"data_source_id",data_source_id:source});
        remote={id:PAGE,parent:body.parent,
          last_edited_time:"2026-10-19T12:00:59Z",archived:false,in_trash:false,
          properties:copyNotionProperties(body.properties)};
        return json(remote);
      }
      if(url==="https://api.notion.com/v1/pages/"+PAGE&&method==="GET"){
        events.push("GET_PAGE");
        if(!remote)throw Error("Page missing");
        return json(remote);
      }
      if(url==="https://api.notion.com/v1/pages/"+PAGE&&method==="PATCH"){
        events.push("PATCH");
        if(!remote)throw Error("Page missing");
        remote.properties=copyNotionProperties(JSON.parse(init.body).properties);
        remote.last_edited_time="2026-10-19T12:01:00Z";
        return json(remote);
      }
      throw Error("UNAPPROVED_NOTION_REQUEST "+method+" "+url);
    };
    const fullEnv={
      NOTION_API_TOKEN:"offline-only",
      SERVICE_CATALOG_ADMIN_WRITES_ENABLED:"true",
      SERVICE_CATALOG_NOTION_MIRROR_READY:"true",
      SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED:"true",
      SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED:"true",
    };
    const invoke=(action,env=fullEnv)=>runServicesV3CatalogInternal({
      action,db:f.db,env,authorize:async()=>true,
      ...(action==="INVENTORY"?{}:{optionId:f.created.id}),
      fetcher
    });
    const before=await invoke("INVENTORY",{NOTION_API_TOKEN:"offline-only"});
    assert.equal(before.state,"INVENTORY");
    assert.deepEqual(before.value.items,[{
      optionId:f.created.id,version:1,disposition:"NEEDS_PAGE"
    }]);
    assert.equal(f.count(),0);
    const created=await invoke("PROVISION_ONE");
    assert.equal(created.state,"PROVISION");
    assert.equal(created.result.state,"CREATED_NEEDS_MIRROR");
    assert.equal(created.result.pageId,PAGE);
    assert.equal(f.count(),0);
    const middle=await invoke("INVENTORY",{NOTION_API_TOKEN:"offline-only"});
    assert.equal(middle.value.items[0].disposition,"MAPPED_PENDING");
    const synced=await invoke("MIRROR_ONE");
    assert.equal(synced.state,"MIRROR");
    assert.deepEqual(synced.result,{
      state:"VERIFIED",optionId:f.created.id,version:2,pageId:PAGE
    });
    assert.equal(f.count(),1);
    assert.equal(f.local().notionMirrorStatus,"SYNCED");
    assert.equal(f.local().version,2);
    assert.equal(f.local().status,"DRAFT");
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM gemini_notion_review_locks").get().n,0);
    const end=await invoke("INVENTORY",{NOTION_API_TOKEN:"offline-only"});
    assert.equal(end.state,"INVENTORY");
    assert.equal(end.value.items[0].disposition,"SYNCED_VERIFIED");
    assert.equal(events.filter(x=>x==="CREATE").length,1);
    assert.equal(events.filter(x=>x==="PATCH").length,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM service_profile_option_choices").get().n,0);
  }finally{f.sqlite.close();}
});


test("end-to-end unknown Notion create cannot perform a second POST across fresh worker calls",async()=>{
  const f=await fixture();
  try{
    f.sqlite.exec(read("drizzle/0124_gemini_notion_review_locks.sql"));
    let createAttempts=0;
    const fetcher=async(url,init)=>{
      if(url.endsWith("/query"))
        return {ok:true,json:async()=>({results:[],has_more:false,next_cursor:null})};
      if(url==="https://api.notion.com/v1/pages"&&init.method==="POST"){
        createAttempts++;
        throw Error("TRANSPORT_TIMEOUT_AFTER_SEND");
      }
      throw Error("UNEXPECTED_REQUEST");
    };
    const request=()=>runServicesV3CatalogInternal({
      action:"PROVISION_ONE",optionId:f.created.id,db:f.db,fetcher,
      authorize:async()=>true,
      env:{
        NOTION_API_TOKEN:"offline-only",
        SERVICE_CATALOG_ADMIN_WRITES_ENABLED:"true",
        SERVICE_CATALOG_NOTION_MIRROR_READY:"true",
        SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED:"true",
        SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED:"true"
      }
    });
    const first=await request();
    assert.equal(first.state,"PROVISION");
    assert.equal(first.result.state,"REVIEW");
    assert.equal(first.result.reason,"CREATE_OUTCOME_UNKNOWN");
    assert.equal(createAttempts,1);
    assert.equal((await inspectServicesV3CatalogLease(f.db,f.created.id)).held,true);
    const retry=await request();
    assert.equal(retry.state,"PROVISION");
    assert.equal(retry.result.state,"REVIEW");
    assert.equal(retry.result.reason,"LEASE_OR_EXECUTION_FAILURE");
    assert.equal(createAttempts,1,"second worker must NOT issue a duplicate POST");
    assert.equal(f.count(),0);
    assert.equal(f.local().notionMirrorStatus,"PENDING");
  }finally{f.sqlite.close();}
});


test("new Services V3 manual route requires real Admin and strict origin before mutation",()=>{
  const source=read("app/api/admin/service-catalog/notion-mirror/route.ts");
  assert.match(source,/getAdminApiUser\(\)/);
  assert.match(source,/requireAdminMutation\(request,\{strictProvenance:true\}\)/);
  assert.match(source,/SERVICE_CATALOG_ADMIN_WRITES_ENABLED!=="true"/);
  assert.match(source,/SERVICE_CATALOG_NOTION_MIRROR_READY!=="true"/);
  assert.match(source,/SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED!=="true"/);
  assert.match(source,/SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED!=="true"/);
  assert.match(source,/ACTIONS=\["PROVISION_ONE","MIRROR_ONE"\]/);
  assert.match(source,/EXPLICIT_CONFIRMATION_REQUIRED/);
  assert.match(source,/UNEXPECTED_REQUEST_FIELDS/);
  assert.match(source,/size>1024/);
  assert.match(source,/runServicesV3CatalogInternal/);
  assert.doesNotMatch(source,/listReadyNotionPages|runNotionDirectorySync|scheduled\(/);
});
test("manual Services V3 route and runner do not activate any environment flag or make GET mutate",()=>{
  const route=read("app/api/admin/service-catalog/notion-mirror/route.ts");
  const wrangler=read("wrangler.jsonc");
  const routeGet=route.split("export async function GET(){")[1]?.split("export async function POST(request:Request)")[0];
  assert.ok(routeGet);
  assert.match(routeGet,/action:"INVENTORY"/);
  assert.doesNotMatch(routeGet,/PROVISION_ONE|MIRROR_ONE|createPage\(/);
  assert.match(wrangler,/SERVICE_CATALOG_ADMIN_WRITES_ENABLED/);
  assert.ok(!read(".github/workflows/services-v3-notion-mirror-offline.yml").includes("CLOUDFLARE_D1_API_TOKEN"));
});

test("a remote catalog edit after the last verified receipt cannot be overwritten by Psipedia", async () => {
  const f = await fixture();
  try {
    const prepare = f.db.prepare;
    f.db.prepare = (sql) => {
      if (sql.startsWith("SELECT option_id,option_version,notion_page_id,notion_last_edited_at")) {
        return { async all() {
          return { results: [{
            option_id: f.created.id,
            option_version: 1,
            notion_page_id: PAGE,
            notion_last_edited_at: "2026-10-19T11:00:00Z",
            remote_payload_sha256: "0".repeat(64),
          }] };
        } };
      }
      return prepare(sql);
    };
    const result = await executeServiceCatalogNotionMirror(f.deps, f.created.id);
    assert.deepEqual({state:result.state,reason:result.reason},
      {state:"REVIEW", reason:"NOTION_CATALOG_REMOTE_CHANGED"});
    assert.equal(f.stats.reads, 1);
    assert.equal(f.stats.writes, 0);
    assert.equal(f.count(), 0);
    assert.equal(f.local().notionMirrorStatus, "PENDING");
  } finally { f.sqlite.close(); }
});

test("Services V3 prewrite guard checks last verified content hash, not only Notion edit time", async () => {
  const f = await fixture();
  try {
    const prepare = f.db.prepare;
    f.db.prepare = (sql) => {
      if (sql.startsWith("SELECT option_id,option_version,notion_page_id,notion_last_edited_at")) {
        return { async all() {
          return {results:[{
            option_id: f.created.id,
            option_version: 1,
            notion_page_id: PAGE,
            notion_last_edited_at: f.state.notionLastEditedAt,
            remote_payload_sha256: "0".repeat(64),
          }]};
        }};
      }
      return prepare(sql);
    };
    const result = await executeServiceCatalogNotionMirror(f.deps, f.created.id);
    assert.equal(result.reason, "NOTION_CATALOG_REMOTE_CHANGED");
    assert.equal(f.stats.writes, 0);
  } finally { f.sqlite.close(); }
});
