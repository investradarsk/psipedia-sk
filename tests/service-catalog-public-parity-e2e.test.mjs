import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {serviceCatalog} from "../lib/service-catalog-contract.ts";
import {
  loadResolvedServiceDefinitions,
} from "../lib/service-catalog-resolved.ts";
import {
  canonicalPublicServiceWhere,canonicalPublicServiceOptions,
} from "../lib/service-catalog-public-service-filter.ts";
import {canonicalPublicProfileServices} from "../lib/service-catalog-public-profile-services.ts";
import {
  saveAdminServiceChoice,resetAdminServiceChoice,
} from "../lib/service-catalog-admin-store.ts";
import {importNotionServiceIds} from "../lib/service-profile-notion-bridge.ts";
import {planSignedCatalogRelationSync} from "../lib/service-catalog-notion-relation-plan.ts";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const builtin="svc.vet.vaccination";
const dynamicId="svc.admin."+"d".repeat(32);
const noId="svc.vet.microchipping";
const actor="admin@example.com";
assert.ok(serviceCatalog.some(x=>x.id===builtin));
assert.ok(serviceCatalog.some(x=>x.id===noId));
class Statement{
 constructor(sqlite,sql){
  this.sql=sql;
  this.positions=[...sql.matchAll(/\?(\d+)/g)].map(m=>Number(m[1])-1);
  this.statement=sqlite.prepare(sql.replace(/\?\d+/g,"?"));
  this.values=[];
 }
 bind(...values){this.values=values;return this;}
 args(){return this.positions.map(i=>this.values[i]);}
 async first(){return this.statement.get(...this.args())??null;}
 async all(){return {results:this.statement.all(...this.args())};}
 async run(){return {meta:this.statement.run(...this.args())};}
}
function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("PRAGMA foreign_keys=ON");
 sqlite.exec(`CREATE TABLE directory_profiles (
  id INTEGER PRIMARY KEY,category TEXT NOT NULL,status TEXT NOT NULL,
  services_json TEXT,updated_at TEXT
 )`);
 sqlite.exec(read("drizzle/0133_services_canonical_admin_foundation.sql"));
 sqlite.exec(read("drizzle/0134_services_admin_change_audit.sql"));
 sqlite.exec(read("drizzle/0149_services_builtin_admin_overrides.sql"));
 const write=sqlite.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?,?)");
 write.run(1,"veterinari","published",'["Očkovanie","Historický text"]',"2026-11-12T01:00:00.000Z");
 write.run(2,"veterinari","published",'["Očkovanie"]',"2026-11-12T01:00:00.000Z");
 write.run(3,"treneri","published",'["Očkovanie"]',"2026-11-12T01:00:00.000Z");
 write.run(4,"veterinari","draft","[]","2026-11-12T01:00:00.000Z");
 const db={
  prepare(sql){return new Statement(sqlite,sql);},
  async batch(statements){
   sqlite.exec("BEGIN");
   try{
    const result=[];
    for(const statement of statements)result.push(/^DELETE\s/i.test(statement.sql)
      ?await statement.all():await statement.run());
    sqlite.exec("COMMIT");return result;
   }catch(e){sqlite.exec("ROLLBACK");throw e;}
  },
 };
 return {sqlite,db,close:()=>sqlite.close()};
}
function chosen(sqlite,id=1){
 return sqlite.prepare("SELECT option_id,choice FROM service_profile_option_choices WHERE profile_id=?").all(id);
}
function legacy(sqlite,id=1){
 return JSON.parse(sqlite.prepare("SELECT services_json FROM directory_profiles WHERE id=?").get(id).services_json);
}
function selected(sqlite,category,id,builtinOverridesReady=true){
 const queryFor=alias=>{
  const query=canonicalPublicServiceWhere(category,id,true,alias,builtinOverridesReady);
  const table=alias==="d"?"directory_profiles AS d":"directory_profiles";
  return sqlite.prepare(`SELECT ${alias}.id FROM ${table} WHERE ${alias}.category=?
   AND ${alias}.status='published' AND ${query.clauses.join(" AND ")} ORDER BY ${alias}.id`)
   .all(category,...query.bindings).map(x=>x.id);
 };
 const list=queryFor("directory_profiles"),map=queryFor("d");
 assert.deepEqual(map,list,"public list and map must use exactly the same canonical scope");
 return list;
}
test("Admin YES→NO→UNKNOWN→YES shows the same canonical service in detail, list and map",async()=>{
 const f=fixture();
 try{
  const original=await saveAdminServiceChoice(f.db,{profileId:1,optionId:builtin,choice:"yes",expectedVersion:0},actor);
  // The canonical choice is independent of historical textual services.
  const resolved=await loadResolvedServiceDefinitions(f.db);
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin),[1]);
  assert.deepEqual(canonicalPublicProfileServices(["Historický text"],"veterinari",
    chosen(f.sqlite),resolved),["Historický text","Očkovanie"]);
  assert.deepEqual(legacy(f.sqlite),["Očkovanie","Historický text"],"V3 YES leaves legacy unchanged");
  const no=await saveAdminServiceChoice(f.db,{profileId:1,optionId:builtin,choice:"no",expectedVersion:original.version},actor);
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin),[]);
  // A stale legacy copy cannot override explicit canonical NO.
  assert.deepEqual(canonicalPublicProfileServices(["Očkovanie","Historický text"],
    "veterinari",chosen(f.sqlite),resolved),["Historický text"]);
  assert.deepEqual(legacy(f.sqlite),["Očkovanie","Historický text"],"V3 NO leaves legacy unchanged");
  await resetAdminServiceChoice(f.db,{profileId:1,optionId:builtin,expectedVersion:no.version},actor);
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin),[]);
  assert.deepEqual(legacy(f.sqlite),["Očkovanie","Historický text"]);
  const again=await saveAdminServiceChoice(f.db,{profileId:1,optionId:builtin,choice:"yes",expectedVersion:0},actor);
  assert.ok(again.version>no.version,"reset does not recycle historic selection versions");
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin),[1]);
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin,false),[1]);
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin,true),[1]);
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin),[1]);
  assert.deepEqual(selected(f.sqlite,"treneri",builtin),[]);
 }finally{f.close();}
});
test("Admin built-in rename/reclassification affects Notion metadata, dropdown, detail and map alike",async()=>{
 const f=fixture();
 try{
  // A historical category becomes newly valid in trainers and invalid in vets.
  const original=serviceCatalog.find(x=>x.id===builtin);
  f.sqlite.prepare(
   "INSERT INTO service_catalog_builtin_overrides(option_id,label,normalized_label,categories_json,group_name,meaning,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).run(builtin,"Očkovanie psov","ockovanie psov",JSON.stringify(["treneri"]),
    original.group,original.meaning,1,"2026-11-12T01:00:00.000Z",
    "2026-11-12T01:00:00.000Z",actor,actor);
  await saveAdminServiceChoice(f.db,{profileId:3,optionId:builtin,choice:"yes",expectedVersion:0},actor);
  const defs=await loadResolvedServiceDefinitions(f.db);
  const effective=defs.find(x=>x.id===builtin);
  assert.equal(effective.label,"Očkovanie psov");
  assert.deepEqual(effective.categories,["treneri"]);
  assert.ok(effective.aliases.includes("Očkovanie"));
  assert.deepEqual(selected(f.sqlite,"treneri",builtin),[3]);
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin),[]);
  assert.deepEqual(canonicalPublicProfileServices(legacy(f.sqlite,3),"treneri",
    chosen(f.sqlite,3),defs),["Očkovanie psov"]);
  const rows=[{optionId:builtin,label:null,kind:null,status:null,mirrorStatus:null,categoriesJson:null,
   builtinLabel:"Očkovanie psov",builtinCategoriesJson:'["treneri"]'}];
  assert.deepEqual(canonicalPublicServiceOptions("treneri",rows),[{id:builtin,label:"Očkovanie psov"}]);
  assert.deepEqual(canonicalPublicServiceOptions("veterinari",rows),[]);
  // Production fallback is used only before 0149 has been deployed.
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin,false),[]);
 }finally{f.close();}
});
test("Notion verified removal keeps unrelated historical text and a separate NO",async()=>{
 const f=fixture();
 try{
  await saveAdminServiceChoice(f.db,{profileId:1,optionId:builtin,choice:"yes",expectedVersion:0},actor);
  await saveAdminServiceChoice(f.db,{profileId:1,optionId:noId,choice:"no",expectedVersion:0},actor);
  assert.deepEqual(planSignedCatalogRelationSync([builtin],[],[builtin]),{action:"pull",target:[]});
  const removed=await importNotionServiceIds(f.db,1,"veterinari",[]);
  assert.deepEqual(removed,{added:0,removed:1});
  assert.deepEqual(legacy(f.sqlite),["Očkovanie","Historický text"],"Notion relation removal leaves legacy unchanged");
  assert.deepEqual(chosen(f.sqlite).map(({option_id,choice})=>({option_id,choice})),
    [{option_id:noId,choice:"no"}]);
  assert.deepEqual(selected(f.sqlite,"veterinari",builtin),[]);
  const selectedAgain=await importNotionServiceIds(f.db,1,"veterinari",[builtin]);
  assert.deepEqual(selectedAgain,{added:1,removed:0});
  const defs=await loadResolvedServiceDefinitions(f.db);
  assert.deepEqual(canonicalPublicProfileServices(legacy(f.sqlite),"veterinari",
   chosen(f.sqlite),defs),["Očkovanie","Historický text"]);
  assert.equal(chosen(f.sqlite).find(x=>x.option_id===noId).choice,"no");
 }finally{f.close();}
});
test("map production code uses the same 0149 schema readiness and canonical option predicate",()=>{
 const map=read("lib/map-query.ts");
 const listing=read("lib/directory-store.ts");
 const detail=read("app/adresar/[category]/[slug]/page.tsx");
 const relation=read("lib/service-catalog-notion-relations.ts");
 assert.match(map,/builtinOverridesReady\s*=\s*Boolean/);
 assert.match(map,/sqlite_schema WHERE type='table' AND name='service_catalog_builtin_overrides'/);
 assert.match(map,/serviceStatement\(query, db, builtinOverridesReady\)/);
 assert.match(map,/canonicalPublicServiceWhere\([\s\S]*?"d",\s*builtinOverridesReady/);
 assert.match(listing,/canonicalPublicServiceWhere\([\s\S]*?"directory_profiles",\s*builtinOverridesReady/);
 assert.match(listing,/canonicalPublicProfileServices\(/);
 assert.match(listing,/loadResolvedServiceDefinitions\(database\)/);
 assert.match(listing,/SELECT option_id,choice FROM service_profile_option_choices WHERE profile_id=\?1/);
 assert.match(detail,/getPublishedDirectoryProfile\(category, resolvedSlug\)/);
 assert.match(detail,/buildDirectoryProfileJsonLd\(\{ profile, presentation/);
 assert.match(relation,/importNotionServiceIds\(db,profileId,category,plan.target\)/);
 assert.doesNotMatch(relation,/projectServiceChoiceToDirectoryNotion|ensureCanonicalServiceChoicesInLegacy|reflectPublicServiceText/);
});

test("legacy editorial service changes are independent from V3 Notion relation choices",async()=>{
 const f=fixture();
 try{
  await saveAdminServiceChoice(f.db,{profileId:1,optionId:builtin,choice:"yes",expectedVersion:0},actor);
  const editorial=["Ručne doplnená služba","Informácie pre klientov"];
  f.sqlite.prepare("UPDATE directory_profiles SET services_json=? WHERE id=?")
   .run(JSON.stringify(editorial),1);
  assert.deepEqual(legacy(f.sqlite),editorial);
  assert.deepEqual(chosen(f.sqlite).map(x=>x.option_id),[builtin],
   "editing old text must not change canonical V3 selections");
  assert.deepEqual(await importNotionServiceIds(f.db,1,"veterinari",[]),{added:0,removed:1});
  assert.deepEqual(legacy(f.sqlite),editorial,"Notion V3 removal must not edit old text");
  assert.deepEqual(await importNotionServiceIds(f.db,1,"veterinari",[builtin]),{added:1,removed:0});
  assert.deepEqual(legacy(f.sqlite),editorial,"Notion V3 addition must not edit old text");
 }finally{f.close();}
});

test("the two Notion service properties have isolated write paths",()=>{
 const route=read("app/api/admin/directory/[id]/service-options/route.ts");
 const directory=read("lib/notion-directory-sync.ts");
 const relation=read("lib/service-catalog-notion-relations.ts");
 const bridge=read("lib/service-profile-notion-bridge.ts");
 assert.match(directory,/"Služby": richText\(snapshot\.services\.join/);
 assert.match(directory,/path === "services" \|\| path === "qualifications"/);
 assert.doesNotMatch(directory,/importNotionServiceChoices/);
 assert.match(relation,/const PROPERTY="Služby z katalógu"/);
 assert.match(relation,/importNotionServiceIds\(db,profileId,category,plan.target\)/);
 assert.doesNotMatch(relation,/reflectPublicServiceText|ensureCanonicalServiceChoicesInLegacy|projectServiceChoiceToDirectoryNotion/);
 assert.doesNotMatch(route,/projectServiceChoiceToDirectoryNotion|notionProjection/);
 assert.doesNotMatch(bridge,/UPDATE directory_profiles|services_json\s*=|projectServiceChoiceToDirectoryNotion/);
});
