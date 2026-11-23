import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {serviceCatalog,attributeCatalog} from "../lib/service-catalog-contract.ts";
import {loadServiceProfileMembership} from "../lib/service-catalog-profile-membership.ts";
import {saveAdminServiceChoice,resetAdminServiceChoice,ServiceCatalogConflictError,ServiceCatalogInputError} from "../lib/service-catalog-admin-store.ts";
import {catalogEditorItems,eligibleProfileServiceItems} from "../lib/service-catalog-admin-editor-view.ts";
import {loadResolvedServiceDefinitions} from "../lib/service-catalog-resolved.ts";
import {canonicalPublicProfileServices} from "../lib/service-catalog-public-profile-services.ts";
import {importNotionServiceIds} from "../lib/service-profile-notion-bridge.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const vet=serviceCatalog.find(x=>x.categories.includes("veterinari")&&!x.categories.includes("treneri"));
const trainer=serviceCatalog.find(x=>x.categories.includes("treneri")&&!x.categories.includes("veterinari"));
const vetAttribute=attributeCatalog.find(x=>x.valueKind==="tri_state"&&x.categories.includes("veterinari")&&!x.categories.includes("treneri"));
assert.ok(vet&&trainer&&vetAttribute,"Require distinct real canonical service and tri-state IDs");

class Statement {
 constructor(sqlite,sql) {
  this.sql=sql;
  this.positions=[...sql.matchAll(/\?(\d+)/g)].map(m=>Number(m[1])-1);
  this.stmt=sqlite.prepare(sql.replace(/\?\d+/g,"?"));
  this.values=[];
 }
 bind(...values){this.values=values;return this;}
 args(){return this.positions.map(i=>this.values[i]);}
 async first(){return this.stmt.get(...this.args())??null;}
 async all(){return {results:this.stmt.all(...this.args())};}
 async run(){return {meta:this.stmt.run(...this.args())};}
}
function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("PRAGMA foreign_keys=ON");
 sqlite.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY,category TEXT NOT NULL,status TEXT NOT NULL)");
 sqlite.exec("CREATE TABLE directory_profile_additional_categories (profile_id INTEGER NOT NULL REFERENCES directory_profiles(id) ON DELETE CASCADE,category TEXT NOT NULL,PRIMARY KEY(profile_id,category))");
 sqlite.exec(read("drizzle/0133_services_canonical_admin_foundation.sql"));
 sqlite.exec(read("drizzle/0134_services_admin_change_audit.sql"));
 sqlite.exec(read("drizzle/0149_services_builtin_admin_overrides.sql"));
 sqlite.exec("INSERT INTO directory_profiles (id,category,status) VALUES (1,'treneri','published'),(2,'treneri','archived')");
 sqlite.exec("INSERT INTO directory_profile_additional_categories (profile_id,category) VALUES (1,'veterinari'),(2,'veterinari')");
 const db={
  prepare(sql){return new Statement(sqlite,sql);},
  async batch(statements){
   sqlite.exec("BEGIN");
   try{
    const results=[];
    for(const statement of statements) results.push(/^DELETE\s/i.test(statement.sql)
      ?await statement.all():await statement.run());
    sqlite.exec("COMMIT");return results;
   }catch(error){sqlite.exec("ROLLBACK");throw error;}
  }
 };
 return {sqlite,db,close:()=>sqlite.close()};
}
const actor="admin@example.com";

test("V5-08: secondary SQL category grants Admin and public service/attribute choices without duplicating a profile",async()=>{
 const f=fixture();
 try{
  const membership=await loadServiceProfileMembership(f.db,1);
  assert.deepEqual(membership.categories,["treneri","veterinari"]);
  const options=eligibleProfileServiceItems(catalogEditorItems([]),membership.categories);
  for(const id of [vet.id,trainer.id,vetAttribute.id])
   assert.ok(options.some(x=>x.id===id),"eligible category option "+id);
  const yes=await saveAdminServiceChoice(f.db,{profileId:1,optionId:vet.id,choice:"yes",expectedVersion:0},actor);
  const no=await saveAdminServiceChoice(f.db,{profileId:1,optionId:trainer.id,choice:"no",expectedVersion:0},actor);
  const attribute=await saveAdminServiceChoice(f.db,{profileId:1,optionId:vetAttribute.id,choice:"no",expectedVersion:0},actor);
  assert.equal(no.choice,"no");
  assert.equal(attribute.choice,"no");
  const resolved=await loadResolvedServiceDefinitions(f.db);
  const chosen=f.sqlite.prepare("SELECT option_id,choice FROM service_profile_option_choices WHERE profile_id=1").all();
  assert.deepEqual(canonicalPublicProfileServices(["Historický text"],membership.categories,chosen,resolved),
    ["Historický text",vet.label]);
  const reset=await resetAdminServiceChoice(f.db,{profileId:1,optionId:vet.id,expectedVersion:yes.version},actor);
  assert.equal(reset.choice,"unknown");
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM service_profile_option_choices WHERE option_id=?").get(vet.id).n,0);
  const again=await saveAdminServiceChoice(f.db,{profileId:1,optionId:vet.id,choice:"yes",expectedVersion:0},actor);
  assert.ok(again.version>yes.version,"UNKNOWN never reuses a version");
  await assert.rejects(()=>saveAdminServiceChoice(f.db,
    {profileId:1,optionId:vet.id,choice:"no",expectedVersion:yes.version},actor),ServiceCatalogConflictError);
 }finally{f.close();}
});

test("V5-08: removing secondary membership blocks stale writes and keeps prior YES for explicit review",async()=>{
 const f=fixture();
 try{
  const first=await saveAdminServiceChoice(f.db,{profileId:1,optionId:vet.id,choice:"yes",expectedVersion:0},actor);
  f.sqlite.exec("DELETE FROM directory_profile_additional_categories WHERE profile_id=1 AND category='veterinari'");
  const membership=await loadServiceProfileMembership(f.db,1);
  assert.deepEqual(membership.categories,["treneri"]);
  await assert.rejects(()=>saveAdminServiceChoice(f.db,{profileId:1,optionId:vet.id,choice:"no",expectedVersion:first.version},actor),
    ServiceCatalogInputError);
  assert.deepEqual(f.sqlite.prepare("SELECT choice,version FROM service_profile_option_choices WHERE option_id=?").get(vet.id),
    {choice:"yes",version:first.version});
  await assert.rejects(()=>importNotionServiceIds(f.db,1,"treneri",[vet.id]),/SERVICES_RELATION_UNKNOWN_OR_WRONG_CATEGORY/);
  assert.equal(f.sqlite.prepare("SELECT choice FROM service_profile_option_choices WHERE option_id=?").get(vet.id).choice,"yes");
  await assert.rejects(()=>saveAdminServiceChoice(f.db,{profileId:2,optionId:vet.id,choice:"yes",expectedVersion:0},actor),
    ServiceCatalogConflictError);
 }finally{f.close();}
});

test("V5-08: SQL-time membership guard prevents a category race after initial validation",async()=>{
 const f=fixture();
 try{
  const normal=f.db.prepare.bind(f.db);
  let removed=false;
  f.db.prepare=sql=>{
   const statement=normal(sql);
   if(!removed&&sql.startsWith("INSERT INTO service_profile_option_choices")){
    const first=statement.first.bind(statement);
    statement.first=async()=>{
     removed=true;
     f.sqlite.exec("DELETE FROM directory_profile_additional_categories WHERE profile_id=1 AND category='veterinari'");
     return first();
    };
   }
   return statement;
  };
  await assert.rejects(()=>saveAdminServiceChoice(f.db,
    {profileId:1,optionId:vet.id,choice:"yes",expectedVersion:0},actor),ServiceCatalogConflictError);
  assert.equal(removed,true);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM service_profile_option_choices").get().n,0);
 }finally{f.close();}
});

test("V5-08: Notion ID imports respect secondary categories but never replace independent NO/unknown",async()=>{
 const f=fixture();
 try{
  const selected=await importNotionServiceIds(f.db,1,"treneri",[vet.id]);
  assert.deepEqual(selected,{added:1,removed:0});
  const unrelated=await saveAdminServiceChoice(f.db,
    {profileId:1,optionId:trainer.id,choice:"no",expectedVersion:0},actor);
  assert.equal(unrelated.choice,"no");
  const empty=await importNotionServiceIds(f.db,1,"treneri",[]);
  assert.deepEqual(empty,{added:0,removed:1});
  assert.equal(f.sqlite.prepare("SELECT choice FROM service_profile_option_choices WHERE option_id=?").get(trainer.id).choice,"no");
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM service_profile_option_choices WHERE option_id=?").get(vet.id).n,0);
 }finally{f.close();}
});
