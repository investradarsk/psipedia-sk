import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  assertReadOnlySelect, buildTableDiscoverySql, buildScopeCountSql,
  buildOrphanMapSql, buildOrganizationOrphanDetailsSql, validateOrganizationOrphanDetails,
  buildOrganizationOrphanLifecycleSql, validateOrganizationOrphanLifecycle, planAudit,
} from "../scripts/production-editorial-storage-readonly.mjs";

test("all inventory commands are SELECT-only; destructive SQL is refused", () => {
  assert.match(buildTableDiscoverySql(), /^SELECT /);
  for (const attempt of [
    "DELETE FROM help_cases;",
    "UPDATE directory_profiles SET status='published';",
    "SELECT 1; DELETE FROM managed_events;",
    "SELECT 1 /* hidden */;",
    "PRAGMA table_info(help_cases);",
  ]) assert.throws(() => assertReadOnlySelect(attempt), /NON_READONLY/);
});

test("all seven editorial scopes and Services V3 support tables are inventoried", () => {
  const existing=new Set([
    "directory_profiles","managed_eshops","managed_events","help_cases",
    "help_organizations","adoption_dogs","lost_found_dog_reports",
    "directory_notion_sync","eshop_notion_sync","event_notion_sync",
    "notion_agenda_sync","service_catalog_admin_options",
    "service_profile_option_choices","service_profile_property_values",
  ]);
  const plan=planAudit(existing);
  assert.deepEqual(plan.scopes.map(item=>item.spec.scope),[
    "directory","eshops","events","help-cases","organizations","adoptions","lost-found",
  ]);
  assert.equal(plan.scopes.every(item=>item.sql && item.orphanSql),true);
  assert.equal(plan.supporting.includes("service_catalog_admin_options"),true);
  assert.equal(plan.supporting.includes("service_profile_option_choices"),true);
});

test("directory counts preserve legacy JSON and multi-category technical dependencies", () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY,category TEXT,status TEXT,source_data_json TEXT)");
    db.exec("CREATE TABLE directory_notion_sync (notion_page_id TEXT,directory_profile_id INTEGER)");
    db.prepare("INSERT INTO directory_profiles VALUES (1,'veterinari','published',?)")
      .run(JSON.stringify({_psipedia_additional_categories:["treneri"],Okres:"Nitra"}));
    db.prepare("INSERT INTO directory_profiles VALUES (2,'treneri','published',?)").run("{");
    db.exec("INSERT INTO directory_notion_sync VALUES ('page-1',1)");
    db.exec("INSERT INTO directory_notion_sync VALUES ('orphan',999)");
    const plan=planAudit(new Set(["directory_profiles","directory_notion_sync"]));
    const sql=plan.scopes.find(item=>item.spec.scope==="directory").sql;
    const rows=db.prepare(sql).all();
    const vet=rows.find(row=>row.category==="veterinari");
    const trainer=rows.find(row=>row.category==="treneri");
    assert.equal(vet.records,1);
    assert.equal(vet.notion_mapped,1);
    assert.equal(vet.nonempty_source_json,1);
    assert.equal(vet.technical_json_dependencies,1);
    assert.equal(trainer.invalid_source_json,1);
    assert.equal(trainer.notion_mapped,0);
    const orphan=db.prepare(plan.scopes[0].orphanSql).get();
    assert.equal(orphan.orphans,1);
  } finally { db.close(); }
});

test("absent mapping table gives NULL rather than a fabricated zero", () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_events (id INTEGER PRIMARY KEY,event_type TEXT,status TEXT)");
    db.exec("INSERT INTO managed_events VALUES (1,'Výstava','published')");
    const plan=planAudit(new Set(["managed_events"]));
    const event=plan.scopes.find(item=>item.spec.scope==="events");
    assert.equal(event.orphanSql,null);
    const result=db.prepare(event.sql).get();
    assert.equal(result.records,1);
    assert.equal(result.notion_mapped,null);
    assert.equal(result.nonempty_source_json,null);
  } finally { db.close(); }
});

test("help agendas share a mapping table but never cross-match one another", () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE help_cases (id INTEGER PRIMARY KEY,category TEXT,status TEXT)");
    db.exec("CREATE TABLE adoption_dogs (id INTEGER PRIMARY KEY,status TEXT)");
    db.exec("CREATE TABLE notion_agenda_sync (notion_page_id TEXT,agenda TEXT,entity_id INTEGER)");
    db.exec("INSERT INTO help_cases VALUES (3,'zbierky','published')");
    db.exec("INSERT INTO adoption_dogs VALUES (3,'PUBLISHED')");
    db.exec("INSERT INTO notion_agenda_sync VALUES ('page-adoption','adoptions',3)");
    const plan=planAudit(new Set(["help_cases","adoption_dogs","notion_agenda_sync"]));
    const help=plan.scopes.find(item=>item.spec.scope==="help-cases");
    const adoption=plan.scopes.find(item=>item.spec.scope==="adoptions");
    assert.equal(db.prepare(help.sql).get().notion_mapped,0);
    assert.equal(db.prepare(adoption.sql).get().notion_mapped,1);
    assert.equal(db.prepare(help.orphanSql).get().orphans,0);
  } finally { db.close(); }
});

test("query builder refuses to invent an audit for a missing canonical table", () => {
  const spec={scope:"events",table:"managed_events",kind:"events",map:"event_notion_sync",fk:"event_id"};
  assert.equal(buildScopeCountSql(spec,new Set(["event_notion_sync"])),null);
  assert.equal(buildOrphanMapSql(spec,new Set(["event_notion_sync"])),null);
});

test("scoped organization orphan details match aggregate and never include another agenda",()=>{
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE help_organizations (id INTEGER PRIMARY KEY)");
    db.exec("CREATE TABLE notion_agenda_sync (agenda TEXT,entity_id INTEGER,notion_page_id TEXT,last_synced_at TEXT)");
    db.exec("INSERT INTO help_organizations VALUES (10)");
    db.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?,?)")
      .run("organizations",10,"00000000-0000-4000-8000-000000000010","2026-11-18T08:00:00Z");
    db.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?,?)")
      .run("organizations",11,"00000000-0000-4000-8000-000000000011","2026-11-18T08:01:00Z");
    db.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?,?)")
      .run("organizations",12,"00000000-0000-4000-8000-000000000012","2026-11-18T08:02:00Z");
    db.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?,?)")
      .run("adoptions",999,"00000000-0000-4000-8000-000000000999","2026-11-18T08:03:00Z");
    const sql=buildOrganizationOrphanDetailsSql();
    assert.match(sql,/^SELECT /);
    assert.doesNotMatch(sql,/\\b(?:DELETE|DROP|INSERT|UPDATE|ALTER)\\b/i);
    const rows=db.prepare(sql).all();
    const expected=db.prepare(buildOrphanMapSql({
      table:"help_organizations",map:"notion_agenda_sync",fk:"entity_id",agenda:"organizations",
    },new Set(["help_organizations","notion_agenda_sync"]))).get().orphans;
    const results=validateOrganizationOrphanDetails(rows,expected);
    assert.deepEqual(results.map(x=>x.entityId),[11,12]);
    assert.equal(results[0].notionPageId,"00000000-0000-4000-8000-000000000011");
    assert.equal(results.length,expected);
  } finally {db.close();}
});

test("organization mapping diagnostics fail on changed count, invalid IDs and duplicate rows",()=>{
  const valid={entity_id:42,notion_page_id:"00000000-0000-4000-8000-000000000042",last_synced_at:null};
  assert.throws(()=>validateOrganizationOrphanDetails([valid],0),/AGGREGATE_MISMATCH/);
  assert.throws(()=>validateOrganizationOrphanDetails([valid],101),/AGGREGATE_MISMATCH/);
  assert.throws(()=>validateOrganizationOrphanDetails([{...valid,entity_id:-1}],1),/INVALID_MAPPING/);
  assert.throws(()=>validateOrganizationOrphanDetails([{...valid,notion_page_id:"bad"}],1),/INVALID_MAPPING/);
  assert.throws(()=>validateOrganizationOrphanDetails([valid,valid],2),/INVALID_MAPPING/);
  assert.deepEqual(validateOrganizationOrphanDetails([],0),[]);
});


test("organization orphan lifecycle joins the correct kind, retains deletion history and excludes linked organizations",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("CREATE TABLE help_organizations (id INTEGER PRIMARY KEY)");
    db.exec("CREATE TABLE notion_agenda_sync (agenda TEXT,entity_id INTEGER,notion_page_id TEXT)");
    db.exec("CREATE TABLE admin_record_tombstones (kind TEXT,record_id INTEGER,notion_page_id TEXT,record_slug TEXT,state TEXT,error_code TEXT,completed_at TEXT)");
    db.exec("CREATE TABLE admin_record_publication_guards (kind TEXT,record_id INTEGER,remote_state TEXT,error_code TEXT)");
    db.exec("INSERT INTO help_organizations VALUES (10)");
    db.exec("INSERT INTO notion_agenda_sync VALUES ('organizations',10,'00000000-0000-4000-8000-000000000010')");
    db.exec("INSERT INTO notion_agenda_sync VALUES ('organizations',11,'00000000-0000-4000-8000-000000000011')");
    db.exec("INSERT INTO notion_agenda_sync VALUES ('adoptions',12,'00000000-0000-4000-8000-000000000012')");
    db.exec("INSERT INTO admin_record_tombstones VALUES ('organizations',11,'00000000-0000-4000-8000-000000000011','test-org','COMPLETE',NULL,'2026-11-18T01:00:00Z')");
    db.exec("INSERT INTO admin_record_tombstones VALUES ('adoptions',11,'00000000-0000-4000-8000-000000000011','other','COMPLETE',NULL,NULL)");
    db.exec("INSERT INTO admin_record_publication_guards VALUES ('organizations',11,'UNLINKED',NULL)");
    const sql=buildOrganizationOrphanLifecycleSql();
    assert.match(sql,/^SELECT /);
    assert.doesNotMatch(sql,/\b(DELETE|DROP|INSERT|UPDATE|ALTER)\b/i);
    const rows=db.prepare(sql).all();
    const result=validateOrganizationOrphanLifecycle(rows,[{
      entityId:11,notionPageId:"00000000-0000-4000-8000-000000000011",
    }]);
    assert.equal(result.length,1);
    assert.equal(result[0].tombstoneState,"COMPLETE");
    assert.equal(result[0].publicationGuardState,"UNLINKED");
    assert.equal(result[0].tombstoneIdentityConflict,false);
  } finally{db.close()}
});

test("orphan lifecycle rejects aggregate drift and mismatched identity instead of choosing a deletion",()=>{
  const mapping={entityId:11,notionPageId:"00000000-0000-4000-8000-000000000011"};
  const row={entity_id:11,notion_page_id:mapping.notionPageId,
    tombstone_record_id:null,tombstone_page_id:null,tombstone_slug:null,
    tombstone_state:null,tombstone_error:null,tombstone_completed_at:null,
    publication_guard_state:null,publication_guard_error:null};
  assert.equal(validateOrganizationOrphanLifecycle([row],[mapping])[0].tombstonePresent,false);
  assert.throws(()=>validateOrganizationOrphanLifecycle([row],[]),/COUNT_DRIFT/);
  assert.throws(()=>validateOrganizationOrphanLifecycle([row],[{...mapping,entityId:12}]),/IDENTITY_DRIFT/);
  assert.throws(()=>validateOrganizationOrphanLifecycle([{...row,tombstone_state:"COMPLETE"}],[mapping]),/INVALID_TOMBSTONE/);
  assert.throws(()=>validateOrganizationOrphanLifecycle([{...row,publication_guard_state:"maybe"}],[mapping]),/INVALID_GUARD/);
});
