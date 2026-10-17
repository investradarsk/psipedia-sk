import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  createAdminCatalogOption,listAdminCatalogOptions,saveAdminServiceChoice,
  ServiceCatalogConflictError,ServiceCatalogInputError
} from "../lib/service-catalog-admin-store.ts";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const migration=read("drizzle/0132_services_canonical_admin_foundation.sql");
// D1 accepts SQLite numbered ?1 placeholders; node:sqlite's positional
// binder does not. Expand numbered references to anonymous placeholders
// while retaining the exact original D1 parameter mapping (including repeats).
class Stmt {
  constructor(sqlite,sql){
    this.positions=[...sql.matchAll(/\?(\d+)/g)].map(m=>Number(m[1])-1);
    this.statement=sqlite.prepare(sql.replace(/\?\d+/g,"?"));
    this.bound=[];
  }
  bind(...values){this.bound=values;return this;}
  resolved(){return this.positions.map(i=>this.bound[i]);}
  async first(){return this.statement.get(...this.resolved())??null;}
  async all(){return {results:this.statement.all(...this.resolved())};}
  async run(){return {meta:this.statement.run(...this.resolved())};}
}
class TestD1 {
  constructor(sqlite){this.sqlite=sqlite;}
  prepare(sql){return new Stmt(this.sqlite,sql);}
}
function setup(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL)");
  sqlite.exec(migration);
  sqlite.exec("INSERT INTO directory_profiles (id,category,status) VALUES (1,'veterinari','published'),(2,'treneri','published'),(3,'veterinari','archived')");
  return {sqlite,db:new TestD1(sqlite)};
}
const item=(name="Nová očná diagnostika")=>({
 name,category:"veterinari",kind:"service",group:"Vyšetrenia",meaning:"Konkrétne špecializované vyšetrenie bez implicitných výkonov."
});
test("0132 is additive schema-only and starts with no choices, dynamic options or properties",()=>{
 assert.doesNotMatch(migration,/^\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/im);
 const {sqlite}=setup();
 try{
  for(const table of ["service_catalog_admin_options","service_profile_option_choices","service_profile_property_values"]){
   assert.equal(sqlite.prepare("SELECT COUNT(*) as n FROM "+table).get().n,0);
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM directory_profiles").get().n,3);
  assert.throws(()=>sqlite.exec("INSERT INTO service_profile_option_choices(profile_id,option_id,choice,created_at,updated_at,created_by,updated_by) VALUES (1,'svc.vet.ct','unknown','t','t','a','a')"),/CHECK constraint/i);
  assert.throws(()=>sqlite.exec("INSERT INTO service_profile_option_choices(profile_id,option_id,choice,created_at,updated_at,created_by,updated_by) VALUES (999,'svc.vet.ct','yes','t','t','a','a')"),/FOREIGN KEY constraint/i);
 }finally{sqlite.close();}
});
test("Admin create mints immutable globally unique IDs with DRAFT/PENDING and audit",async()=>{
 const {sqlite,db}=setup();
 try{
  const created=await createAdminCatalogOption(db,item(),"OWNER@EXAMPLE.COM",new Date("2026-10-18T00:00:00Z"));
  assert.match(created.id,/^svc\.admin\.[0-9a-f]{32}$/);
  assert.equal(created.status,"DRAFT");
  assert.equal(created.notionMirrorStatus,"PENDING");
  assert.deepEqual(created.categories,["veterinari"]);
  assert.equal(created.version,1);
  const row=sqlite.prepare("SELECT created_by,updated_by,normalized_label FROM service_catalog_admin_options WHERE id=?").get(created.id);
  assert.equal(row.created_by,"owner@example.com");
  assert.equal(row.updated_by,"owner@example.com");
  assert.equal(row.normalized_label,"nová očná diagnostika");
  assert.deepEqual((await listAdminCatalogOptions(db)).map(x=>x.id),[created.id]);
  await assert.rejects(()=>createAdminCatalogOption(db,item("  NOVÁ OČNÁ DIAGNOSTIKA  "),"owner@example.com"),ServiceCatalogConflictError);
 }finally{sqlite.close();}
});
test("Admin create rejects all client-provided identity/control fields and static aliases",async()=>{
 const {sqlite,db}=setup();
 try{
  for(const illegal of [{id:"svc.admin.fake"},{status:"ACTIVE"},{notionMirrorStatus:"SYNCED"},{version:999},{createdBy:"attacker"}]){
   await assert.rejects(()=>createAdminCatalogOption(db,{...item(),...illegal},"owner@example.com"),ServiceCatalogInputError);
  }
  await assert.rejects(()=>createAdminCatalogOption(db,item("RTG vyšetrenie"),"owner@example.com"),ServiceCatalogInputError);
  await assert.rejects(()=>createAdminCatalogOption(db,{...item("Röntgenové vyšetrenie"),category:"treneri"},"owner@example.com"),ServiceCatalogInputError);
  await assert.rejects(()=>createAdminCatalogOption(db,{...item(),meaning:"short"},"owner@example.com"),ServiceCatalogInputError);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM service_catalog_admin_options").get().n,0);
 }finally{sqlite.close();}
});
test("explicit YES/NO CAS: absence stays unknown, stale updates cannot overwrite",async()=>{
 const {sqlite,db}=setup();
 try{
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM service_profile_option_choices").get().n,0);
  const raw={profileId:1,optionId:"svc.vet.ct",choice:"yes",expectedVersion:0};
  assert.deepEqual(await saveAdminServiceChoice(db,raw,"owner@example.com"),{profileId:1,optionId:"svc.vet.ct",choice:"yes",version:1});
  await assert.rejects(()=>saveAdminServiceChoice(db,raw,"owner@example.com"),ServiceCatalogConflictError);
  assert.deepEqual(await saveAdminServiceChoice(db,{...raw,choice:"no",expectedVersion:1},"owner@example.com"),{profileId:1,optionId:"svc.vet.ct",choice:"no",version:2});
  await assert.rejects(()=>saveAdminServiceChoice(db,{...raw,expectedVersion:1},"owner@example.com"),ServiceCatalogConflictError);
  assert.equal(sqlite.prepare("SELECT choice FROM service_profile_option_choices WHERE profile_id=1").get().choice,"no");
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM service_profile_option_choices").get().n,1);
 }finally{sqlite.close();}
});
test("invalid category, archived profiles, missing profiles, unknown and DRAFT IDs are blocked",async()=>{
 const {sqlite,db}=setup();
 try{
  const base={profileId:1,optionId:"svc.vet.ct",choice:"yes",expectedVersion:0};
  for(const changes of [{profileId:2},{profileId:3},{profileId:999},{optionId:"svc.fake"},{choice:"unknown"},{expectedVersion:-1}]){
   await assert.rejects(()=>saveAdminServiceChoice(db,{...base,...changes},"owner@example.com"));
  }
  const drafted=await createAdminCatalogOption(db,item(),"owner@example.com");
  await assert.rejects(()=>saveAdminServiceChoice(db,{...base,optionId:drafted.id},"owner@example.com"),ServiceCatalogInputError);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM service_profile_option_choices").get().n,0);
 }finally{sqlite.close();}
});
test("Admin API requires verified server auth, same-origin, and two disabled-by-default activation gates",()=>{
 for(const path of ["app/api/admin/service-catalog/options/route.ts","app/api/admin/directory/[id]/service-options/route.ts"]){
  const source=read(path);
  assert.match(source,/requireAdminMutation\(request\)/);
  assert.match(source,/SERVICE_CATALOG_ADMIN_WRITES_ENABLED/);
  assert.match(source,/SERVICE_CATALOG_NOTION_MIRROR_READY/);
  assert.doesNotMatch(source,/notionRequest|writeProfileToNotion|gemini/i);
 }
 const wrangler=read("wrangler.jsonc");
 assert.doesNotMatch(wrangler,/"SERVICE_CATALOG_ADMIN_WRITES_ENABLED"/);
 assert.doesNotMatch(wrangler,/"SERVICE_CATALOG_NOTION_MIRROR_READY"/);
});
