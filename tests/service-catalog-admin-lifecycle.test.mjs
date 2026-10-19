import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createAdminCatalogOption,saveAdminServiceChoice,resetAdminServiceChoice,ServiceCatalogConflictError,ServiceCatalogInputError} from "../lib/service-catalog-admin-store.ts";
import {mutateAdminCatalogOption,recordCatalogMirrorOutcome} from "../lib/service-catalog-admin-lifecycle.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const migration=read("drizzle/0133_services_canonical_admin_foundation.sql");
const auditMigration=read("drizzle/0134_services_admin_change_audit.sql");
class Statement{
  constructor(sqlite,sql){
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
  sqlite.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL)");
  sqlite.exec(migration);
  sqlite.exec(auditMigration);
  sqlite.exec("INSERT INTO directory_profiles (id,category,status) VALUES (1,'veterinari','published'),(2,'treneri','published'),(3,'veterinari','archived')");
  return {sqlite,db:{
    prepare(sql){return new Statement(sqlite,sql);},
    async batch(statements){
      const results=[];
      sqlite.exec("BEGIN");
      try{
        for(const statement of statements){
          if(/^DELETE\s/i.test(statement.sql))results.push(await statement.all());
          else{await statement.run();results.push({results:[]});}
        }
        sqlite.exec("COMMIT");
        return results;
      }catch(err){sqlite.exec("ROLLBACK");throw err;}
    }
  }};
}
const actor="admin@example.com";
const option=()=>({name:"Nová veterinárna metóda",category:"veterinari",kind:"service",group:"Diagnostika",meaning:"Presne vymedzená diagnostická metóda."});
const edit=o=>({action:"edit",expectedVersion:o.version,name:o.label,category:o.categories[0],group:o.group,meaning:o.meaning});
const result=(id,expectedVersion,outcome)=>({id,expectedVersion,outcome,evidence:{origin:"verified_notion_reconciliation",externalId:"notion-page-123"}});
test("DRAFT edits preserve immutable identity, require strict payload and CAS, and invalidate mirror",async()=>{
  const {sqlite,db}=fixture();
  try{
    const created=await createAdminCatalogOption(db,option(),actor);
    const changed=await mutateAdminCatalogOption(db,created.id,{...edit(created),name:"Nová upravená veterinárna metóda"},actor);
    assert.equal(changed.id,created.id);
    assert.equal(changed.version,2);
    assert.equal(changed.notionMirrorStatus,"PENDING");
    assert.equal(changed.label,"Nová upravená veterinárna metóda");
    await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{...edit(created),name:"Starý stav"},actor),ServiceCatalogConflictError);
    await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{...edit(changed),id:"svc.admin.fake"},actor),ServiceCatalogInputError);
    await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{...edit(changed),name:"RTG vyšetrenie"},actor),ServiceCatalogInputError);
    await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,edit(changed),actor),ServiceCatalogInputError);
    assert.equal(sqlite.prepare("SELECT updated_by FROM service_catalog_admin_options WHERE id=?").get(created.id).updated_by,actor);
  }finally{sqlite.close();}
});
test("approve needs real synced mirror outcome, conflicts need explicit retry, retirement terminal",async()=>{
 const {sqlite,db}=fixture();
 try{
  const created=await createAdminCatalogOption(db,option(),actor);
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action:"approve",expectedVersion:1},actor),ServiceCatalogConflictError);
  const conflict=await recordCatalogMirrorOutcome(db,result(created.id,1,"CONFLICT"),actor);
  await assert.rejects(()=>recordCatalogMirrorOutcome(db,result(created.id,conflict.version,"SYNCED"),actor),ServiceCatalogConflictError);
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action:"approve",expectedVersion:conflict.version},actor),ServiceCatalogConflictError);
  const retry=await mutateAdminCatalogOption(db,created.id,{action:"retryMirror",expectedVersion:conflict.version},actor);
  assert.equal(retry.notionMirrorStatus,"PENDING");
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action:"retryMirror",expectedVersion:retry.version},actor),ServiceCatalogConflictError);
  const synced=await recordCatalogMirrorOutcome(db,result(created.id,retry.version,"SYNCED"),actor);
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action:"approve",expectedVersion:retry.version},actor),ServiceCatalogConflictError);
  const approved=await mutateAdminCatalogOption(db,created.id,{action:"approve",expectedVersion:synced.version},actor);
  assert.equal(approved.status,"ACTIVE");
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{...edit(approved),name:"Zakázané"},actor),ServiceCatalogConflictError);
  const retired=await mutateAdminCatalogOption(db,created.id,{action:"retire",expectedVersion:approved.version},actor);
  assert.equal(retired.status,"RETIRED");
  for(const action of ["approve","retire","retryMirror"]){
   await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action,expectedVersion:retired.version},actor),ServiceCatalogConflictError);
  }
  await assert.rejects(()=>recordCatalogMirrorOutcome(db,result(created.id,retired.version,"CONFLICT"),actor),ServiceCatalogConflictError);
  assert.equal(sqlite.prepare("SELECT version FROM service_catalog_admin_options WHERE id=?").get(created.id).version,retired.version);
 }finally{sqlite.close();}
});
test("mirror outcome needs trusted reconciliation evidence; cannot be forged via admin lifecycle HTTP",async()=>{
 const {sqlite,db}=fixture();
 try{
  const created=await createAdminCatalogOption(db,option(),actor);
  await assert.rejects(()=>recordCatalogMirrorOutcome(db,{...result(created.id,1,"SYNCED"),evidence:{origin:"browser",externalId:"123"}},actor),ServiceCatalogInputError);
  const route=read("app/api/admin/service-catalog/options/[id]/route.ts");
  assert.match(route,/requireAdminMutation\(request\)/);
  assert.match(route,/SERVICE_CATALOG_ADMIN_WRITES_ENABLED/);
  assert.match(route,/SERVICE_CATALOG_NOTION_MIRROR_READY/);
  assert.match(route,/SyntaxError\?400/);
  assert.doesNotMatch(route,/recordCatalogMirrorOutcome/);
 }finally{sqlite.close();}
});
test("explicit tri-state attribute and YES/NO reset-to-UNKNOWN do not synthesize NO",async()=>{
 const {sqlite,db}=fixture();
 try{
  const attr={profileId:1,optionId:"attr.vet.home_visits",choice:"yes",expectedVersion:0};
  const choice=await saveAdminServiceChoice(db,attr,actor);
  assert.equal(choice.choice,"yes");
  await assert.rejects(()=>resetAdminServiceChoice(db,{profileId:1,optionId:attr.optionId,expectedVersion:2},actor),ServiceCatalogConflictError);
  const reset=await resetAdminServiceChoice(db,{profileId:1,optionId:attr.optionId,expectedVersion:1},actor);
  assert.deepEqual(reset,{profileId:1,optionId:attr.optionId,choice:"unknown",version:0});
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM service_profile_option_choices").get().n,0);
  const audit=sqlite.prepare("SELECT operation,actor,prior_json FROM service_catalog_admin_change_audit WHERE entity_type='choice' ORDER BY id DESC LIMIT 1").get();
  assert.equal(audit.operation,"RESET");
  assert.equal(audit.actor,actor);
  assert.equal(JSON.parse(audit.prior_json).choice,"yes");
  await assert.rejects(()=>resetAdminServiceChoice(db,{profileId:1,optionId:attr.optionId,expectedVersion:1},actor),ServiceCatalogConflictError);
  await assert.rejects(()=>resetAdminServiceChoice(db,{profileId:3,optionId:attr.optionId,expectedVersion:1},actor),ServiceCatalogConflictError);
  await assert.rejects(()=>saveAdminServiceChoice(db,{...attr,choice:"unknown"},actor),ServiceCatalogInputError);
  await assert.rejects(()=>saveAdminServiceChoice(db,{...attr,optionId:"attr.vet.focus_areas"},actor),ServiceCatalogInputError);
 }finally{sqlite.close();}
});
test("no migration 0133 replay, live Notion writer or public feature-flag activation",()=>{
 for(const p of ["lib/service-catalog-admin-lifecycle.ts","app/api/admin/service-catalog/options/[id]/route.ts"]){
  const source=read(p);
  assert.doesNotMatch(source,/wrangler d1 migrations apply|notionRequest\(|writeProfileToNotion\(/);
 }
 const wrangler=read("wrangler.jsonc");
 assert.doesNotMatch(wrangler,/"SERVICE_CATALOG_ADMIN_WRITES_ENABLED"/);
 assert.doesNotMatch(wrangler,/"SERVICE_CATALOG_NOTION_MIRROR_READY"/);
});
