import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { FREEZE_TRIGGERS,inspectFreeze,SNAPSHOT,OUTSIDE,GUARDED_RESET_SQL } from "../lib/production-d1-breeder-cutover.mjs";
function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, category TEXT, source_data_json TEXT, description TEXT);
    CREATE TABLE breed_directory_relations(breed_id INTEGER,profile_id INTEGER,relation_type TEXT,source TEXT,created_at TEXT,created_by TEXT,UNIQUE(breed_id,profile_id));
    CREATE TABLE directory_breeder_club_relations(station_profile_id INTEGER,club_profile_id INTEGER,created_at TEXT,created_by TEXT);
    INSERT INTO directory_profiles VALUES(1,'chovatelske-stanice','{}','a'),(2,'chovatelske-kluby','{}','b'),(3,'treneri','{}','c');
    INSERT INTO breed_directory_relations VALUES(10,1,'station','manual','date','actor'),(11,1,'station','manual','date','actor'),(10,2,'club','manual','date','actor'),(12,3,'trainer','manual','date','actor');
  `);
  for(const t of FREEZE_TRIGGERS)db.exec(t.sql);
  return db;
}
const rows=db=>db.prepare("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='trigger'").all();
const state=(db,sql)=>Object.values(db.prepare(sql).get())[0];
test("freeze blocks scoped inserts, updates and legacy link changes, not unrelated fields",()=>{
  const db=fixture();
  assert.equal(inspectFreeze(rows(db)).length,0);
  assert.throws(()=>db.exec("INSERT INTO breed_directory_relations VALUES(20,1,'station','manual','date','actor')"),/FROZEN/);
  assert.throws(()=>db.exec("UPDATE breed_directory_relations SET breed_id=20 WHERE profile_id=2"),/FROZEN/);
  assert.throws(()=>db.exec("UPDATE breed_directory_relations SET profile_id=1 WHERE profile_id=3"),/FROZEN/);
  assert.throws(()=>db.exec("INSERT INTO directory_breeder_club_relations VALUES(1,2,'date','actor')"),/FROZEN/);
  assert.throws(()=>db.exec("UPDATE directory_profiles SET source_data_json=json_set(source_data_json,'$._psipedia_breeder_club_profile_ids','[2]') WHERE id=1"),/FROZEN/);
  db.exec("UPDATE directory_profiles SET description='updated',source_data_json=json_set(source_data_json,'$.other','value') WHERE id=1");
  db.exec("INSERT INTO breed_directory_relations VALUES(13,3,'trainer','manual','date','actor')");
  assert.equal(db.prepare("SELECT description FROM directory_profiles WHERE id=1").get().description,"updated");
  db.close();
});
test("single guarded delete resets only the exact reviewed rows and is blocked by drift",()=>{
  const db=fixture(), old=state(db,SNAPSHOT), outside=state(db,OUTSIDE);
  assert.equal(db.prepare(GUARDED_RESET_SQL).run("[]",outside).changes,0);
  assert.equal(db.prepare(GUARDED_RESET_SQL).run(old,"[]").changes,0);
  assert.equal(db.prepare(GUARDED_RESET_SQL).run(old,outside).changes,3);
  assert.equal(state(db,SNAPSHOT),"[]");
  assert.equal(state(db,OUTSIDE),outside);
  assert.equal(db.prepare(GUARDED_RESET_SQL).run(old,outside).changes,0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM directory_profiles").get().n,3);
  db.close();
});
test("unexpected or modified trigger cannot be accepted",()=>{
  const db=fixture();
  assert.throws(()=>inspectFreeze([...rows(db),{name:"other",tbl_name:"breed_directory_relations",sql:"unexpected"}]),/UNEXPECTED/);
  assert.equal(inspectFreeze([]).length,FREEZE_TRIGGERS.length);
  db.close();
});
