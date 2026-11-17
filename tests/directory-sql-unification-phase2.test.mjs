import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DIRECTORY_ADDITIONAL_CATEGORY_TARGET,
  DIRECTORY_NOTION_COMMON_SQL_SLOTS,
  DIRECTORY_SERVICES_V3_TARGET,
  EDITORIAL_CANONICAL_SQL_SCOPES,
  proposedDirectorySqlFilterTarget,
  proposedDirectorySqlPlacement,
} from "../lib/directory-sql-cutover-contract.ts";
import {
  directoryFilterRegistry, serviceFilterCategories,
} from "../lib/directory-filter-contract.ts";

const sql = readFileSync(fileURLToPath(new URL(
  "../docs/proposals/DIRECTORY-HELP-EVENTS-SQL-UNIFICATION-PHASE-2-DRAFT.sql",
  import.meta.url,
)), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, source_data_json TEXT)");
  db.exec("INSERT INTO directory_profiles (id,category,source_data_json) VALUES (1,'veterinari','{\"Telefon\":\"historic\"}')");
  db.exec("INSERT INTO directory_profiles (id,category,source_data_json) VALUES (2,'treneri','{}')");
  db.exec(sql);
  return db;
}

test("proposal remains offline and additive, never a live destructive migration", () => {
  assert.match(sql, /PHASE 2 \/ 4/);
  assert.match(sql, /PROPOSAL ONLY/);
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|UPDATE|INSERT|REPLACE|CREATE TRIGGER)\b/im);
  assert.doesNotMatch(sql, /ALTER TABLE\s+managed_events/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+(?:help_cases|adoption_dogs|help_organizations|lost_found_dog_reports)/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+directory_profiles\s+DROP/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+directory_profiles\s+RENAME/i);
});

test("new shared Directory contact columns support NULL vs explicit empty without removing legacy JSON", () => {
  const db=fixture();
  try {
    const columns = db.prepare("PRAGMA table_info(directory_profiles)").all().map(row=>row.name);
    for (const column of ["public_phone","public_email","facebook_url","instagram_url"])
      assert.ok(columns.includes(column),column);
    assert.equal(db.prepare("SELECT public_phone FROM directory_profiles WHERE id=1").get().public_phone,null);
    db.prepare("UPDATE directory_profiles SET public_phone='' WHERE id=1").run();
    assert.equal(db.prepare("SELECT public_phone FROM directory_profiles WHERE id=1").get().public_phone,"");
    assert.match(db.prepare("SELECT source_data_json FROM directory_profiles WHERE id=1").get().source_data_json,/historic/);
  } finally { db.close(); }
});

test("secondary category relation preserves the primary profile and rejects duplicates, invalid categories", () => {
  const db=fixture();
  try {
    const insert=db.prepare("INSERT INTO directory_profile_additional_categories VALUES (?,?,?,?)");
    insert.run(1,"treneri","2026-11-17","Admin");
    assert.throws(()=>insert.run(1,"treneri","2026-11-17","Admin"),/UNIQUE|PRIMARY KEY/);
    assert.throws(()=>insert.run(1,"invalid","2026-11-17","Admin"),/CHECK/);
    assert.throws(()=>insert.run(999,"treneri","2026-11-17","Admin"),/FOREIGN KEY/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n,2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_additional_categories").get().n,1);
    db.exec("DELETE FROM directory_profiles WHERE id=1");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_additional_categories").get().n,0);
  } finally { db.close(); }
});

test("text facts distinguish missing row from explicit clear, filters distinguish missing from explicit unknown", () => {
  const db=fixture();
  try {
    assert.equal(db.prepare("SELECT value_text FROM directory_profile_public_facts WHERE profile_id=1 AND field_key='Pokrytie'").get(),undefined);
    db.prepare("INSERT INTO directory_profile_public_facts VALUES (?,?,?,?,?)")
      .run(1,"Pokrytie","","2026-11-17","Admin");
    assert.equal(db.prepare("SELECT value_text FROM directory_profile_public_facts WHERE profile_id=1 AND field_key='Pokrytie'").get().value_text,"");
    const ins=db.prepare("INSERT INTO directory_profile_filter_values VALUES (?,?,?,?,?,?)");
    ins.run(1,"veterinari","veterinari.emergency","unknown","2026-11-17","Admin");
    assert.equal(db.prepare("SELECT value_text FROM directory_profile_filter_values WHERE profile_id=1").get().value_text,"unknown");
    assert.throws(()=>ins.run(2,"treneri","treneri.individual_training","","2026-11-17","Admin"),/CHECK/);
    assert.throws(()=>ins.run(1,"veterinari","veterinari.emergency","yes","2026-11-17","Admin"),/UNIQUE|PRIMARY KEY/);
  } finally { db.close(); }
});

test("all ten categories and 21 Notion filters have unique canonical SQL targets", () => {
  assert.equal(serviceFilterCategories.length,10);
  assert.equal(directoryFilterRegistry.length,21);
  const ids=new Set();
  for (const definition of directoryFilterRegistry) {
    assert.equal(ids.has(definition.id),false,definition.id);
    ids.add(definition.id);
    const slot=proposedDirectorySqlFilterTarget(definition.category,definition.id);
    assert.equal(slot.table,"directory_profile_filter_values");
    assert.equal(slot.notionProperty,definition.notion.property);
    assert.deepEqual(slot.allowedValues,definition.allowedValues);
    const place=proposedDirectorySqlPlacement(definition.category,definition.notion.property);
    assert.ok(["relation","review"].includes(place.state));
    if (place.state==="relation") assert.equal(place.table,slot.table);
  }
  assert.throws(()=>proposedDirectorySqlFilterTarget("veterinari","treneri.individual_training"),/INVALID/);
  assert.throws(()=>proposedDirectorySqlPlacement("no-such-category","Web"),/UNKNOWN_CATEGORY/);
});

test("the same Notion name cannot silently create both fact and select authorities", () => {
  assert.equal(proposedDirectorySqlPlacement("veterinari","Pohotovosť").state,"review");
  assert.equal(proposedDirectorySqlPlacement("treneri","Individuálny výcvik").state,"review");
  assert.equal(proposedDirectorySqlPlacement("chovatelske-stanice","Plemeno").state,"review");
  assert.equal(proposedDirectorySqlPlacement("chovatelske-stanice","Klub").state,"review");
  assert.equal(proposedDirectorySqlPlacement("vencenie","Pokrytie").table,"directory_profile_public_facts");
  assert.equal(proposedDirectorySqlPlacement("veterinari","Ordinačné hodiny").table,"directory_profile_public_facts");
  assert.equal(proposedDirectorySqlPlacement("treneri","Typ služby").table,"directory_profile_public_facts");
  assert.equal(proposedDirectorySqlPlacement("treneri","never-provisioned").state,"review");
});

test("no new database for events, help, e-shops or Services V3", () => {
  assert.deepEqual(EDITORIAL_CANONICAL_SQL_SCOPES.map(x=>x.table),[
    "directory_profiles","managed_eshops","managed_events","help_cases",
    "help_organizations","adoption_dogs","lost_found_dog_reports",
  ]);
  assert.equal(DIRECTORY_ADDITIONAL_CATEGORY_TARGET.table,"directory_profile_additional_categories");
  assert.equal(DIRECTORY_SERVICES_V3_TARGET.table,"service_profile_option_choices");
  assert.equal(DIRECTORY_NOTION_COMMON_SQL_SLOTS["Telefón"].column,"public_phone");
  assert.equal(DIRECTORY_NOTION_COMMON_SQL_SLOTS["Web"].column,"website_url");
  assert.equal(DIRECTORY_NOTION_COMMON_SQL_SLOTS["Kvalifikácie"].state,"structured");
  assert.equal(DIRECTORY_NOTION_COMMON_SQL_SLOTS["Služby"].state,"review");
});
