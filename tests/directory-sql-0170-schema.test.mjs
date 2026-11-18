import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration=readFileSync(fileURLToPath(new URL(
  "../drizzle/0170_directory_canonical_sql_slots.sql",import.meta.url,
)),"utf8");

function fixture() {
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, status TEXT, source_data_json TEXT)");
  db.exec("INSERT INTO directory_profiles VALUES (1,'veterinari','published','{\"Telefon\":\"historic\"}')");
  db.exec("INSERT INTO directory_profiles VALUES (2,'treneri','published','{}')");
  return db;
}

test("0170 is strictly additive and has exactly the four approved nullable contacts and three relations",()=>{
  assert.match(migration,/0170: Add canonical SQL slots/);
  assert.equal((migration.match(/ALTER TABLE directory_profiles ADD COLUMN/g)||[]).length,4);
  assert.equal((migration.match(/CREATE TABLE directory_profile_/g)||[]).length,3);
  assert.equal((migration.match(/CREATE INDEX directory_profile_/g)||[]).length,3);
  assert.doesNotMatch(migration,/^\s*(?:DELETE|DROP|UPDATE|INSERT|REPLACE|CREATE TRIGGER|ALTER TABLE managed_events|ALTER TABLE help_cases|ALTER TABLE help_organizations|ALTER TABLE adoption_dogs|ALTER TABLE lost_found_dog_reports)\b/im);
  assert.doesNotMatch(migration,/ALTER TABLE directory_profiles (?:RENAME|DROP)/i);
  assert.doesNotMatch(migration,/INSERT INTO d1_migrations/i);
  assert.match(migration,/DO NOT use generic Wrangler migrations apply/);
});

test("0170 on populated Directory is schema-only; existing contacts, legacy source, IDs and rows survive",()=>{
  const db=fixture();
  try{
    const before=db.prepare("SELECT id,category,status,source_data_json FROM directory_profiles ORDER BY id").all();
    db.exec(migration);
    const after=db.prepare("SELECT id,category,status,source_data_json FROM directory_profiles ORDER BY id").all();
    assert.deepEqual(after,before);
    const cols=db.prepare("PRAGMA table_info(directory_profiles)").all();
    for(const field of ["public_phone","public_email","facebook_url","instagram_url"]){
      const col=cols.find(x=>x.name===field);
      assert.ok(col,field);
      assert.equal(col.notnull,0);
      assert.equal(db.prepare("SELECT "+field+" AS value FROM directory_profiles WHERE id=1").get().value,null);
    }
    for(const table of ["directory_profile_additional_categories","directory_profile_public_facts","directory_profile_filter_values"])
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n,0);
  } finally { db.close(); }
});

test("secondary categories preserve a single profile, enforce uniqueness and cascade only on targeted profile delete",()=>{
  const db=fixture();
  try{
    db.exec(migration);
    const insert=db.prepare("INSERT INTO directory_profile_additional_categories VALUES (?,?,?,?)");
    insert.run(1,"treneri","2026-11-18","admin");
    assert.throws(()=>insert.run(1,"treneri","2026-11-18","admin"),/UNIQUE|PRIMARY KEY/);
    assert.throws(()=>insert.run(1,"not-a-category","2026-11-18","admin"),/CHECK/);
    assert.throws(()=>insert.run(12345,"treneri","2026-11-18","admin"),/FOREIGN KEY/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n,2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_additional_categories").get().n,1);
  }finally{db.close()}
});

test("explicitly cleared fact is different from missing row; select unknown differs from absent filter",()=>{
  const db=fixture();
  try{
    db.exec(migration);
    db.prepare("INSERT INTO directory_profile_public_facts VALUES (?,?,?,?,?)").run(1,"Ordinačné hodiny","","2026-11-18","admin");
    assert.equal(db.prepare("SELECT value_text FROM directory_profile_public_facts WHERE profile_id=1").get().value_text,"");
    assert.equal(db.prepare("SELECT value_text FROM directory_profile_public_facts WHERE profile_id=2").get(),undefined);
    const insert=db.prepare("INSERT INTO directory_profile_filter_values VALUES (?,?,?,?,?,?)");
    insert.run(1,"veterinari","veterinari.emergency","unknown","2026-11-18","admin");
    assert.throws(()=>insert.run(1,"veterinari","veterinari.emergency","yes","2026-11-18","admin"),/UNIQUE|PRIMARY KEY/);
    assert.throws(()=>insert.run(1,"veterinari","veterinari.other","","2026-11-18","admin"),/CHECK/);
  }finally{db.close()}
});
