import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {runSimpleServiceCatalogSync} from "../lib/service-catalog-simple-sync.ts";

const SOURCE="8785fd64-36c3-4acf-aade-ad99c30ad45d";
const ID="svc.admin."+"a".repeat(32);
const PAGE="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const STATIC="bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const migration=readFileSync(new URL("../drizzle/0139_services_catalog_notion_auto_attempts.sql",import.meta.url),"utf8");
const vars={NOTION_API_TOKEN:"test-notion-token",SERVICE_CATALOG_NOTION_AUTO_ENABLED:"true"};
class Statement{
  constructor(db,sql){
    this.positions=[...sql.matchAll(/\?(\d+)/g)].map(x=>Number(x[1])-1);
    this.stmt=db.prepare(sql.replace(/\?\d+/g,"?"));
    this.values=[];
  }
  bind(...values){this.values=values;return this;}
  params(){return this.positions.map(i=>this.values[i]);}
  async all(){return {results:this.stmt.all(...this.params())};}
  async first(){return this.stmt.get(...this.params())??null;}
  async run(){return this.stmt.run(...this.params());}
}
function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE service_catalog_admin_options (
    id TEXT PRIMARY KEY,kind TEXT,label TEXT,group_name TEXT,meaning TEXT,
    primary_category TEXT,categories_json TEXT,value_kind TEXT,version INTEGER,
    status TEXT,notion_mirror_status TEXT,created_at TEXT
  )`);
  sqlite.exec(migration);
  sqlite.prepare("INSERT INTO service_catalog_admin_options VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(ID,"service","BAER vyšetrenie sluchu","Diagnostika",
      "Objektívne vyšetrenie sluchu u psov.","veterinari",JSON.stringify(["veterinari"]),
      "tri_state",1,"ACTIVE","PENDING","2026-10-30T10:00:00Z");
  const db={prepare(sql){return new Statement(sqlite,sql)}};
  const status=()=>sqlite.prepare("SELECT * FROM service_catalog_admin_options WHERE id=?").get(ID);
  return {sqlite,db,status,close:()=>sqlite.close()};
}
function notionMock({timeoutAfterCreate=false,preexisting=null}={}){
  const pages=[];
  // Existing approved static services are owned by this same catalog. They
  // should never be created again or imported into canonical D1.
  pages.push({id:STATIC,parent:{type:"data_source_id",data_source_id:SOURCE},
    properties:{"Option ID":{rich_text:[{plain_text:"svc.vet.vaccination"}]},
      "Názov":{title:[{plain_text:"Očkovanie"}]}}});
  if(preexisting)pages.push(preexisting);
  const requests=[];
  let createAttempts=0;
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,
    headers:{"content-type":"application/json"}});
  async function fetcher(uri,init){
    const url=String(uri),method=init.method,body=init.body?JSON.parse(init.body):null;
    requests.push({url,method,body});
    if(url.endsWith("/data_sources/"+SOURCE+"/query")&&method==="POST")
      return response({results:pages,has_more:false,next_cursor:null});
    if(url.endsWith("/pages")&&method==="POST"){
      createAttempts++;
      const page={id:PAGE,parent:{type:"data_source_id",data_source_id:SOURCE},
        archived:false,in_trash:false,properties:body.properties};
      pages.push(page);
      if(timeoutAfterCreate)throw Error("TIMEOUT_AFTER_CREATE");
      return response(page);
    }
    const id=url.split("/").at(-1);
    const page=pages.find(p=>p.id===id);
    if(!page)return response({message:"not found"},404);
    if(method==="GET")return response(page);
    if(method==="PATCH"){
      page.properties=body.properties;
      return response(page);
    }
    throw Error("Unexpected Notion request: "+method+" "+url);
  }
  return {pages,requests,fetcher,get createAttempts(){return createAttempts}};
}
test("active D1 option is created in Notion without approval and verified by readback",async()=>{
  const f=fixture(),n=notionMock();
  try{
    const first=await runSimpleServiceCatalogSync({db:f.db,env:vars,fetcher:n.fetcher});
    assert.equal(first.state,"SYNCED",JSON.stringify(first));
    assert.equal(first.created,1);
    assert.equal(first.verified,1);
    assert.equal(n.pages.length,2);
    assert.equal(n.createAttempts,1);
    assert.equal(f.status().notion_mirror_status,"SYNCED");
    const second=await runSimpleServiceCatalogSync({db:f.db,env:vars,fetcher:n.fetcher});
    assert.equal(second.state,"IDLE");
    assert.equal(n.createAttempts,1);
  }finally{f.close();}
});
test("a network timeout after successful create is recovered by scanning the Notion page, not a duplicate POST",async()=>{
  const f=fixture(),n=notionMock({timeoutAfterCreate:true});
  try{
    const first=await runSimpleServiceCatalogSync({db:f.db,env:vars,fetcher:n.fetcher});
    assert.equal(first.state,"REVIEW");
    assert.equal(f.status().notion_mirror_status,"PENDING");
    assert.equal(n.createAttempts,1);
    const second=await runSimpleServiceCatalogSync({db:f.db,env:vars,fetcher:n.fetcher});
    assert.equal(second.state,"SYNCED");
    assert.equal(f.status().notion_mirror_status,"SYNCED");
    assert.equal(n.createAttempts,1);
  }finally{f.close();}
});
test("changing an existing Notion record never overwrites the Admin D1 definition",async()=>{
  const f=fixture(),n=notionMock();
  try{
    await runSimpleServiceCatalogSync({db:f.db,env:vars,fetcher:n.fetcher});
    n.pages[1].properties["Názov"]={title:[{plain_text:"Neplatné prepísanie z Notionu"}]};
    const next=await runSimpleServiceCatalogSync({db:f.db,env:vars,fetcher:n.fetcher});
    assert.equal(next.updated,1,JSON.stringify(next));
    assert.equal(f.status().label,"BAER vyšetrenie sluchu");
    assert.equal(n.pages[1].properties["Názov"].title[0].text.content,"BAER vyšetrenie sluchu");
    assert.equal(n.createAttempts,1);
  }finally{f.close();}
});
test("matching Notion name with missing option ID is flagged, not duplicated",async()=>{
  const f=fixture();
  const preexisting={id:PAGE,parent:{type:"data_source_id",data_source_id:SOURCE},
    properties:{"Názov":{title:[{plain_text:"BAER vyšetrenie sluchu"}]},
      "Option ID":{rich_text:[]}}};
  const n=notionMock({preexisting});
  try{
    const r=await runSimpleServiceCatalogSync({db:f.db,env:vars,fetcher:n.fetcher});
    assert.equal(r.state,"REVIEW");
    assert.equal(r.reason,"NOTION_NAME_ALREADY_EXISTS");
    assert.equal(n.createAttempts,0);
    assert.equal(f.status().notion_mirror_status,"PENDING");
  }finally{f.close();}
});
test("catalog sync is disabled without its own opt-in and cannot create any profile entries",async()=>{
  const f=fixture(),n=notionMock();
  try{
    const disabled=await runSimpleServiceCatalogSync({db:f.db,env:{
      ...vars,SERVICE_CATALOG_NOTION_AUTO_ENABLED:"false"},fetcher:n.fetcher});
    assert.equal(disabled.state,"DISABLED");
    const missing=await runSimpleServiceCatalogSync({db:f.db,env:{
      ...vars,NOTION_API_TOKEN:""},fetcher:n.fetcher});
    assert.equal(missing.state,"BLOCKED");
    assert.equal(n.requests.length,0);
    assert.equal(n.createAttempts,0);
    assert.equal(f.status().notion_mirror_status,"PENDING");
  }finally{f.close();}
});
