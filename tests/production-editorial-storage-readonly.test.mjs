import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  assertReadOnlySelect, buildTableDiscoverySql, buildScopeCountSql,
  buildOrphanMapSql, planAudit,
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
