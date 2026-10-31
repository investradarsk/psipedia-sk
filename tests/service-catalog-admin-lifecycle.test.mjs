import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createAdminCatalogOption,saveAdminServiceChoice,resetAdminServiceChoice,requireServiceCatalogAuditSchema,ServiceCatalogConflictError,ServiceCatalogInputError,ServiceCatalogSchemaError} from "../lib/service-catalog-admin-store.ts";
import {mutateAdminCatalogOption,recordCatalogMirrorOutcome} from "../lib/service-catalog-admin-lifecycle.ts";
import {listBuiltinCatalogOverrides,updateBuiltinCatalogOption} from "../lib/service-catalog-builtin-overrides.ts";
import {serviceCatalog} from "../lib/service-catalog-contract.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const migration=read("drizzle/0133_services_canonical_admin_foundation.sql");
const auditMigration=read("drizzle/0134_services_admin_change_audit.sql");
const builtinMigration=read("drizzle/0149_services_builtin_admin_overrides.sql");
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
  sqlite.exec(builtinMigration);
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
  // Legacy DRAFT approval still requires a Notion receipt; ordinary create is immediately ACTIVE.
  sqlite.prepare("UPDATE service_catalog_admin_options SET status=\'DRAFT\' WHERE id=?").run(created.id);
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action:"approve",expectedVersion:1},actor),ServiceCatalogConflictError);
  const conflict=await recordCatalogMirrorOutcome(db,result(created.id,1,"CONFLICT"),actor);
  await assert.rejects(()=>recordCatalogMirrorOutcome(db,result(created.id,conflict.version,"SYNCED"),actor),ServiceCatalogConflictError);
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action:"approve",expectedVersion:conflict.version},actor),ServiceCatalogConflictError);
  const retry=await mutateAdminCatalogOption(db,created.id,{action:"retryMirror",expectedVersion:conflict.version},actor);
  assert.equal(retry.notionMirrorStatus,"PENDING");
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action:"retryMirror",expectedVersion:retry.version},actor),ServiceCatalogConflictError);
  const synced=await recordCatalogMirrorOutcome(db,result(created.id,retry.version,"SYNCED"),actor);
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action:"approve",expectedVersion:retry.version},actor),ServiceCatalogConflictError);
  // The existing internal hook accepts a string claim; this MUST NOT suffice
  // to approve a public option without separately verified remote evidence.
  await assert.rejects(()=>mutateAdminCatalogOption(db,created.id,{action:"approve",expectedVersion:synced.version},actor),ServiceCatalogConflictError);
  assert.throws(()=>sqlite.prepare("UPDATE service_catalog_admin_options SET status='ACTIVE' WHERE id=?").run(created.id),/Notion receipt required/);
  // Model the future trusted Notion reader by explicitly inserting its unique
  // immutable receipt into the test-only database (no live Notion operation).
  sqlite.prepare("INSERT INTO service_catalog_admin_notion_receipts (option_id,option_version,notion_page_id,notion_last_edited_at,remote_payload_sha256,verified_at,verified_by) VALUES (?,?,?,?,?,?,?)")
    .run(created.id,synced.version,"notion-page-123","2026-10-19T12:00:00Z","a".repeat(64),"2026-10-19T12:01:00Z","trusted-reconciler");
  assert.throws(()=>sqlite.prepare("DELETE FROM service_catalog_admin_notion_receipts").run(),/append-only/);
  assert.throws(()=>sqlite.prepare("UPDATE service_catalog_admin_notion_receipts SET verified_by='attacker'").run(),/append-only/);
  const approved=await mutateAdminCatalogOption(db,created.id,{action:"approve",expectedVersion:synced.version},actor);
  assert.equal(approved.status,"ACTIVE");
  const revised=await mutateAdminCatalogOption(db,created.id,{...edit(approved),name:"Upravená schválená metóda"},actor);
  assert.equal(revised.status,"ACTIVE");
  const retired=await mutateAdminCatalogOption(db,created.id,{action:"retire",expectedVersion:revised.version},actor);
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
  const audit=sqlite.prepare("SELECT operation,actor,prior_json FROM service_catalog_admin_change_audit WHERE entity_type='choice' AND operation='RESET' ORDER BY id DESC LIMIT 1").get();
  assert.equal(audit.operation,"RESET");
  assert.equal(audit.actor,actor);
  assert.equal(JSON.parse(audit.prior_json).choice,"yes");
  await assert.rejects(()=>resetAdminServiceChoice(db,{profileId:1,optionId:attr.optionId,expectedVersion:1},actor),ServiceCatalogConflictError);
  await assert.rejects(()=>resetAdminServiceChoice(db,{profileId:3,optionId:attr.optionId,expectedVersion:1},actor),ServiceCatalogConflictError);
  await assert.rejects(()=>saveAdminServiceChoice(db,{...attr,choice:"unknown"},actor),ServiceCatalogInputError);
  await assert.rejects(()=>saveAdminServiceChoice(db,{...attr,optionId:"attr.vet.focus_areas"},actor),ServiceCatalogInputError);
  // An old browser still holding version 1 must not overwrite a new value
  // after RESET and a reinsert (the classic compare-and-swap ABA problem).
  const reinserted=await saveAdminServiceChoice(db,{...attr,choice:"no",expectedVersion:0},actor);
  assert.equal(reinserted.version,2);
  await assert.rejects(()=>saveAdminServiceChoice(db,{...attr,choice:"yes",expectedVersion:1},actor),ServiceCatalogConflictError);
  const latest=await saveAdminServiceChoice(db,{...attr,choice:"yes",expectedVersion:2},actor);
  assert.equal(latest.version,3);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM service_catalog_admin_change_audit WHERE entity_type='choice' AND option_id=?").get(attr.optionId).n,5);

 }finally{sqlite.close();}
});

test("0134 must exist completely, not just as a table without audit triggers",async()=>{
 const missing=new DatabaseSync(":memory:");
 try{
   const db={prepare(sql){return new Statement(missing,sql);}};
   await assert.rejects(()=>requireServiceCatalogAuditSchema(db),ServiceCatalogSchemaError);
   missing.exec("CREATE TABLE service_catalog_admin_change_audit (id INTEGER PRIMARY KEY)");
   await assert.rejects(()=>requireServiceCatalogAuditSchema(db),ServiceCatalogSchemaError);
 }finally{missing.close();}
 const {sqlite,db}=fixture();
 try{
   await requireServiceCatalogAuditSchema(db);
   sqlite.exec("DROP TRIGGER service_catalog_admin_choice_audit_update");
   await assert.rejects(()=>requireServiceCatalogAuditSchema(db),ServiceCatalogSchemaError);
 }finally{sqlite.close();}
});
test("0134 history is append-only, RESET is attributed, and every physical delete is logged",async()=>{
 const {sqlite,db}=fixture();
 try{
  await saveAdminServiceChoice(db,{profileId:1,optionId:"attr.vet.home_visits",choice:"yes",expectedVersion:0},actor);
  assert.throws(()=>sqlite.exec("UPDATE service_catalog_admin_change_audit SET actor='forged'"),/append-only/);
  assert.throws(()=>sqlite.exec("DELETE FROM service_catalog_admin_change_audit"),/append-only/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM service_catalog_admin_notion_receipts").get().n,0);

  await resetAdminServiceChoice(db,{profileId:1,optionId:"attr.vet.home_visits",expectedVersion:1},actor);
  const changes=sqlite.prepare("SELECT operation,actor FROM service_catalog_admin_change_audit ORDER BY id").all();
  assert.deepEqual(changes.map(x=>x.operation),["INSERT","RESET","DELETE"]);
  assert.equal(changes[1].actor,actor);
  assert.equal(changes[2].actor,"system:db_delete");
  assert.equal(sqlite.prepare("PRAGMA foreign_key_check").all().length,0);
 }finally{sqlite.close();}
});

test("concurrent administrators have only one CAS winner per option and explicit choice",async()=>{
 const {sqlite,db}=fixture();
 try{
  const created=await createAdminCatalogOption(db,option(),actor);
  const a={...edit(created),name:"Nová veterinárna metóda Alfa"};
  const b={...edit(created),name:"Nová veterinárna metóda Beta"};
  const edits=await Promise.allSettled([
    mutateAdminCatalogOption(db,created.id,a,actor),
    mutateAdminCatalogOption(db,created.id,b,actor)
  ]);
  assert.equal(edits.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(edits.filter(x=>x.status==="rejected"&&x.reason instanceof ServiceCatalogConflictError).length,1);
  assert.equal(sqlite.prepare("SELECT version FROM service_catalog_admin_options WHERE id=?").get(created.id).version,2);
  const raw={profileId:1,optionId:"attr.vet.home_visits",choice:"yes",expectedVersion:0};
  await saveAdminServiceChoice(db,raw,actor);
  const choices=await Promise.allSettled([
    saveAdminServiceChoice(db,{...raw,choice:"no",expectedVersion:1},actor),
    resetAdminServiceChoice(db,{profileId:1,optionId:raw.optionId,expectedVersion:1},actor)
  ]);
  assert.equal(choices.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(choices.filter(x=>x.status==="rejected"&&x.reason instanceof ServiceCatalogConflictError).length,1);
  const stored=sqlite.prepare("SELECT choice,version FROM service_profile_option_choices WHERE profile_id=1 AND option_id=?").get(raw.optionId);
  const audit=sqlite.prepare("SELECT operation FROM service_catalog_admin_change_audit WHERE entity_type='choice' AND option_id=? ORDER BY id").all(raw.optionId);
  if(stored){assert.equal(stored.version,2);assert.deepEqual(audit.map(x=>x.operation),["INSERT","UPDATE"]);}
  else assert.deepEqual(audit.map(x=>x.operation),["INSERT","RESET","DELETE"]);
 }finally{sqlite.close();}
});
test("no migration 0133 replay, live Notion writer or public feature-flag activation",()=>{
 for(const p of ["lib/service-catalog-admin-lifecycle.ts","app/api/admin/service-catalog/options/[id]/route.ts"]){
  const source=read(p);
  assert.doesNotMatch(source,/wrangler d1 migrations apply|notionRequest\(|writeProfileToNotion\(/);
 }
 const wrangler=read("wrangler.jsonc");
 assert.match(wrangler,/"SERVICE_CATALOG_ADMIN_WRITES_ENABLED"/);
 assert.match(wrangler,/"SERVICE_CATALOG_NOTION_MIRROR_READY"/);
});

test("original built-in service edits use stable IDs, CAS, audit and expanded categories",async()=>{
  const {sqlite,db}=fixture();
  try{
    const builtin=serviceCatalog.find(item=>item.categories.includes("veterinari")&&!item.categories.includes("treneri"));
    assert.ok(builtin);
    const payload={
      action:"edit",expectedVersion:0,name:builtin.label,
      categories:[...builtin.categories,"treneri"],group:builtin.group,meaning:builtin.meaning,
    };
    const first=await updateBuiltinCatalogOption(db,builtin.id,payload,actor);
    assert.equal(first.id,builtin.id);
    assert.equal(first.version,1);
    const rows=await listBuiltinCatalogOverrides(db);
    const edited=rows.find(item=>item.id===builtin.id);
    assert.equal(edited.label,builtin.label);
    assert.ok(edited.categories.includes("treneri"));
    // A pre-existing built-in ID can now be selected by a profile of a newly eligible category.
    const choice=await saveAdminServiceChoice(db,{
      profileId:2,optionId:builtin.id,choice:"yes",expectedVersion:0,
    },actor);
    assert.equal(choice.optionId,builtin.id);
    await assert.rejects(()=>updateBuiltinCatalogOption(db,builtin.id,payload,actor),ServiceCatalogConflictError);
    const second=await updateBuiltinCatalogOption(db,builtin.id,{
      ...payload,expectedVersion:1,meaning:"Administrátorom upravené odborné vysvetlenie služby.",
    },actor);
    assert.equal(second.version,2);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS total FROM service_catalog_admin_change_audit WHERE option_id=? AND entity_type='option'"
    ).get(builtin.id).total,2);
    await assert.rejects(()=>updateBuiltinCatalogOption(db,builtin.id,{
      ...payload,expectedVersion:2,kind:"attribute",
    },actor),ServiceCatalogInputError);
    await assert.rejects(()=>updateBuiltinCatalogOption(db,builtin.id,{
      ...payload,expectedVersion:2,name:serviceCatalog.find(item=>item.id!==builtin.id).label,
    },actor),ServiceCatalogConflictError);
    assert.throws(()=>sqlite.prepare(
      "UPDATE service_catalog_builtin_overrides SET option_id='svc.vet.forged' WHERE option_id=?"
    ).run(builtin.id),/immutable/);
  }finally{sqlite.close();}
});
