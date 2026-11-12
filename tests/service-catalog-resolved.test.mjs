import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {serviceCatalog} from "../lib/service-catalog-contract.ts";
import {
  resolveBuiltInServiceDefinitions,loadResolvedBuiltinServiceOverrides,loadResolvedServiceDefinitions,
} from "../lib/service-catalog-resolved.ts";
import {canonicalPublicServiceOptions} from "../lib/service-catalog-public-service-filter.ts";

const original=serviceCatalog.find(x=>x.id==="svc.vet.vaccination");
assert.ok(original);
const dynamicId="svc.admin."+"c".repeat(32);
class Statement{
 constructor(sqlite,sql){
  this.positions=[...sql.matchAll(/\?(\d+)/g)].map(x=>Number(x[1])-1);
  this.statement=sqlite.prepare(sql.replace(/\?\d+/g,"?"));
  this.values=[];
 }
 bind(...values){this.values=values;return this;}
 args(){return this.positions.map(i=>this.values[i]);}
 async first(){return this.statement.get(...this.args())??null;}
 async all(){return {results:this.statement.all(...this.args())};}
 async run(){return {meta:this.statement.run(...this.args())};}
}
function fixture({withOverrideTable=true}={}){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,category TEXT,services_json TEXT,updated_at TEXT)");
 sqlite.exec("CREATE TABLE service_catalog_admin_options(id TEXT PRIMARY KEY,kind TEXT,status TEXT,label TEXT,categories_json TEXT,group_name TEXT,meaning TEXT,version INTEGER)");
 if(withOverrideTable)sqlite.exec("CREATE TABLE service_catalog_builtin_overrides(option_id TEXT PRIMARY KEY,label TEXT,categories_json TEXT,group_name TEXT,meaning TEXT,version INTEGER)");
 sqlite.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?)").run(
  1,"treneri",JSON.stringify(["Očkovanie","Historický marketingový text"]),null);
 sqlite.prepare("INSERT INTO service_catalog_admin_options VALUES (?,?,?,?,?,?,?,?)").run(
  dynamicId,"service","ACTIVE","Tréning poslušnosti",JSON.stringify(["treneri"]),
  "Výcvik","Individuálny tréning poslušnosti.",1);
 const db={prepare(sql){return new Statement(sqlite,sql);}};
 return {sqlite,db,close:()=>sqlite.close()};
}
function setOverride(sqlite,label="Očkovanie psov",categories=["veterinari","treneri"]){
 sqlite.prepare("INSERT INTO service_catalog_builtin_overrides VALUES (?,?,?,?,?,?)").run(
  original.id,label,JSON.stringify(categories),original.group,original.meaning,1);
}
test("override is the single current source of labels, categories and historical aliases",async()=>{
 const f=fixture();
 try{
  setOverride(f.sqlite);
  const effective=await loadResolvedServiceDefinitions(f.db,"treneri");
  const option=effective.find(x=>x.id===original.id);
  assert.ok(option);
  assert.equal(option.label,"Očkovanie psov");
  assert.deepEqual(option.categories,["veterinari","treneri"]);
  assert.ok(option.aliases.includes("Očkovanie"));
  assert.ok(option.aliases.includes("Vakcinácia"));
  assert.ok(effective.some(x=>x.id===dynamicId));
  assert.equal(new Set(effective.map(x=>x.id)).size,effective.length);
  assert.deepEqual((await loadResolvedBuiltinServiceOverrides(f.db)).map(x=>x.id),[original.id]);
  const admin=resolveBuiltInServiceDefinitions([
   {id:original.id,label:option.label,categories:option.categories,group:option.group,
    meaning:option.meaning,version:option.version},
  ]).find(x=>x.id===original.id);
  assert.deepEqual(admin,option);
  const publicRows=[{
   optionId:original.id,label:null,kind:null,status:null,mirrorStatus:null,categoriesJson:null,
   builtinLabel:option.label,builtinCategoriesJson:JSON.stringify(option.categories),
  }];
  assert.deepEqual(canonicalPublicServiceOptions("treneri",publicRows),
   [{id:original.id,label:option.label}]);
  assert.deepEqual(canonicalPublicServiceOptions("fyzioterapia",publicRows),[]);
 }finally{f.close();}
});
test("code-first deployment without 0149 uses original canonical services",async()=>{
 const f=fixture({withOverrideTable:false});
 try{
  assert.deepEqual(await loadResolvedBuiltinServiceOverrides(f.db),[]);
  const services=await loadResolvedServiceDefinitions(f.db,"veterinari");
  assert.ok(services.some(x=>x.id===original.id&&x.label===original.label));
  assert.ok(!services.some(x=>x.id===dynamicId));
 }finally{f.close();}
});
test("invalid override categories fail visibly instead of silently changing eligibility",async()=>{
 const f=fixture();
 try{
  f.sqlite.prepare("INSERT INTO service_catalog_builtin_overrides VALUES (?,?,?,?,?,?)").run(
   original.id,"Očkovanie psov","not-valid-json",original.group,original.meaning,1);
  await assert.rejects(()=>loadResolvedServiceDefinitions(f.db,"veterinari"),/SERVICE_CATALOG_INVALID_CATEGORIES/);
 }finally{f.close();}
});
test("Notion relations resolve the same catalog as Admin without projecting legacy text",()=>{
 const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const relation=read("lib/service-catalog-notion-relations.ts");
 const admin=read("lib/service-catalog-admin-editor-view.ts");
 const sync=read("lib/service-catalog-simple-sync.ts");
 assert.match(relation,/loadResolvedServiceDefinitions\(db,category\)/);
 assert.doesNotMatch(relation,/projectServiceChoiceToDirectoryNotion|ensureCanonicalServiceChoicesInLegacy|reflectPublicServiceText/);
 assert.match(admin,/resolveBuiltInServiceDefinitions\(overrides\)/);
 assert.match(sync,/loadResolvedBuiltinServiceOverrides\(db\)/);
 assert.match(sync,/if\(row.source==="built_in"\)throw Error\("BUILTIN_NOTION_PAGE_MISSING"\)/);
});
