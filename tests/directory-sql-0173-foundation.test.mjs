import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const SQL_URL = new URL("../drizzle/0173_directory_structured_sql_foundation.sql",import.meta.url);
const MIGRATION=readFileSync(SQL_URL,"utf8");
const EXPECTED=[
  "directory_profile_qualifications",
  "directory_profile_opening_hours",
  "directory_profile_media",
  "directory_profile_seo",
  "directory_profile_review_state",
  "directory_profile_quality_resolutions",
];
const TS=readFileSync(new URL("../db/directory-storage-schema.ts",import.meta.url),"utf8");
const INDEX=readFileSync(new URL("../db/index.ts",import.meta.url),"utf8");

function fixture() {
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY,name TEXT,source_data_json TEXT,services_json TEXT,qualifications_json TEXT,seo_json TEXT)");
  db.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?,?,?)").run(1,"First",'{"Popis":"old"}','["old service"]','["old qualification"]','{"title":"old SEO"}');
  db.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?,?,?)").run(2,"Second","{}","[]","[]","{}");
  const before=db.prepare("SELECT * FROM directory_profiles ORDER BY id").all();
  const statements=MIGRATION.split("--> statement-breakpoint")
    .map(x=>x.replace(/^\s*(?:--[^\n]*\n\s*)+/g,"").trim())
    .filter(Boolean);
  for(const statement of statements) db.exec(statement);
  return {db,before};
}
function values(db,table) {
  return db.prepare("SELECT * FROM "+table+" WHERE profile_id=?").all(1);
}
function withFixture(action) {
  const f=fixture();
  try{action(f);}finally{f.db.close();}
}
function insert(db,sql,...params) {
  return db.prepare(sql).run(...params);
}
const T="2026-11-19T17:00:00Z",ACTOR="test";

test("0173 is additive only, reserves 0171-0172 and defines exactly six non-duplicate SQL tables",()=>{
  assert.match(MIGRATION,/Reserved sequence: 0171 and 0172/);
  const statements=MIGRATION.split("--> statement-breakpoint")
    .map(x=>x.replace(/^\s*(?:--[^\n]*\n\s*)+/g,"").trim()).filter(Boolean);
  assert.equal(statements.length,11);
  for(const statement of statements){
    assert.match(statement,/^CREATE\s+(?:TABLE|INDEX)\s/i);
    assert.doesNotMatch(statement,/\b(?:DROP TABLE|DELETE FROM|UPDATE directory_profiles|ALTER TABLE|INSERT INTO|REPLACE INTO)\b/i);
  }
  withFixture(({db,before})=>{
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'directory_profile_%' ORDER BY name")
      .all().map(row=>row.name).sort();
    assert.deepEqual(tables, [...EXPECTED, 'directory_profiles'].sort());
    assert.deepEqual(db.prepare("SELECT * FROM directory_profiles ORDER BY id").all(),before);
    for(const table of EXPECTED) {
      assert.match(TS,new RegExp('"'+table+'"'));
      const fks=db.prepare("PRAGMA foreign_key_list("+table+")").all();
      assert(fks.some(f=>f.table==="directory_profiles"&&f.on_delete==="CASCADE"),table);
    }
    assert.match(INDEX,/directoryStorageSchema/);
  });
});
test("qualifications are ordered SQL rows, not duplicated serialized JSON",()=>{
  withFixture(({db})=>{
    insert(db,"INSERT INTO directory_profile_qualifications VALUES (?,?,?,?,?)",1,0,"FCI trainer",T,ACTOR);
    insert(db,"INSERT INTO directory_profile_qualifications VALUES (?,?,?,?,?)",1,1,"Veterinary certificate",T,ACTOR);
    assert.deepEqual(values(db,"directory_profile_qualifications").map(r=>r.qualification_text),["FCI trainer","Veterinary certificate"]);
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_qualifications VALUES (?,?,?,?,?)",1,0,"duplicate",T,ACTOR));
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_qualifications VALUES (?,?,?,?,?)",1,2,"   ",T,ACTOR));
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_qualifications VALUES (?,?,?,?,?)",1,-1,"invalid",T,ACTOR));
  });
});
test("opening hours preserve weekday, split shifts and general free-form notes",()=>{
  withFixture(({db})=>{
    insert(db,"INSERT INTO directory_profile_opening_hours VALUES (?,?,?,?,?)",1,1,"08:00–12:00; 13:00–17:00",T,ACTOR);
    insert(db,"INSERT INTO directory_profile_opening_hours VALUES (?,?,?,?,?)",1,7,"Na objednávku",T,ACTOR);
    insert(db,"INSERT INTO directory_profile_opening_hours VALUES (?,?,?,?,?)",1,0,"Sviatky: zatvorené",T,ACTOR);
    assert.equal(values(db,"directory_profile_opening_hours").length,3);
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_opening_hours VALUES (?,?,?,?,?)",1,8,"Invalid day",T,ACTOR));
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_opening_hours VALUES (?,?,?,?,?)",1,2," ",T,ACTOR));
  });
});
test("gallery is ordered, requires an image URL or R2 key, preserves ALT and attribution",()=>{
  withFixture(({db})=>{
    insert(db,"INSERT INTO directory_profile_media VALUES (?,?,?,?,?,?,?,?)",1,0,"https://example.com/photo.jpg",null,"Dog","Owner",T,ACTOR);
    insert(db,"INSERT INTO directory_profile_media VALUES (?,?,?,?,?,?,?,?)",1,1,null,"gallery/dog.jpg","Second","",T,ACTOR);
    assert.equal(values(db,"directory_profile_media").length,2);
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_media VALUES (?,?,?,?,?,?,?,?)",1,2,"",null,"","",T,ACTOR));
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_media VALUES (?,?,?,?,?,?,?,?)",1,-1,"https://example.com/a.jpg",null,"","",T,ACTOR));
  });
});
test("SEO gets one row per profile with individual fields and boolean noindex",()=>{
  withFixture(({db})=>{
    insert(db,"INSERT INTO directory_profile_seo (profile_id,title,noindex,updated_at,updated_by) VALUES (?,?,?,?,?)",1,"New title",1,T,ACTOR);
    assert.equal(values(db,"directory_profile_seo")[0].title,"New title");
    assert.equal(values(db,"directory_profile_seo")[0].noindex,1);
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_seo (profile_id,title,noindex,updated_at,updated_by) VALUES (?,?,?,?,?)",2,"Invalid",2,T,ACTOR));
  });
});
test("reviewed lock has independent SQL ownership without changing existing profile status",()=>{
  withFixture(({db,before})=>{
    insert(db,"INSERT INTO directory_profile_review_state (profile_id,reviewed_at,reviewed_by,unlock_pending,updated_at,updated_by) VALUES (?,?,?,?,?,?)",1,T,"Owner",1,T,ACTOR);
    const row=values(db,"directory_profile_review_state")[0];
    assert.equal(row.unlock_pending,1);
    assert.equal(row.reviewed_at,T);
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_review_state (profile_id,unlock_pending,updated_at,updated_by) VALUES (?,?,?,?)",2,2,T,ACTOR));
    assert.deepEqual(db.prepare("SELECT * FROM directory_profiles ORDER BY id").all(),before);
  });
});
test("quality records use one SQL row per approved quality field with controlled statuses",()=>{
  withFixture(({db})=>{
    insert(db,"INSERT INTO directory_profile_quality_resolutions VALUES (?,?,?,?,?,?)",1,"phone","NOT_PUBLIC",T,T,ACTOR);
    insert(db,"INSERT INTO directory_profile_quality_resolutions VALUES (?,?,?,?,?,?)",1,"email","NOT_FOUND",T,T,ACTOR);
    assert.equal(values(db,"directory_profile_quality_resolutions").length,2);
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_quality_resolutions VALUES (?,?,?,?,?,?)",1,"other","NOT_FOUND",T,T,ACTOR));
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_quality_resolutions VALUES (?,?,?,?,?,?)",1,"address","INVALID",T,T,ACTOR));
  });
});
test("foreign keys prevent orphan metadata and cascade profile deletion",()=>{
  withFixture(({db})=>{
    assert.throws(()=>insert(db,"INSERT INTO directory_profile_qualifications VALUES (?,?,?,?,?)",999,0,"orphan",T,ACTOR));
    insert(db,"INSERT INTO directory_profile_qualifications VALUES (?,?,?,?,?)",1,0,"OK",T,ACTOR);
    insert(db,"INSERT INTO directory_profile_opening_hours VALUES (?,?,?,?,?)",1,1,"Nonstop",T,ACTOR);
    insert(db,"INSERT INTO directory_profile_media VALUES (?,?,?,?,?,?,?,?)",1,0,"https://example.com/dog.jpg",null,"","",T,ACTOR);
    insert(db,"INSERT INTO directory_profile_seo (profile_id,updated_at,updated_by) VALUES (?,?,?)",1,T,ACTOR);
    insert(db,"INSERT INTO directory_profile_review_state (profile_id,updated_at,updated_by) VALUES (?,?,?)",1,T,ACTOR);
    insert(db,"INSERT INTO directory_profile_quality_resolutions VALUES (?,?,?,?,?,?)",1,"image","NOT_FOUND",T,T,ACTOR);
    db.exec("DELETE FROM directory_profiles WHERE id=1");
    for(const table of EXPECTED) assert.equal(db.prepare("SELECT COUNT(*) as n FROM "+table).get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) as n FROM directory_profiles").get().n,1);
  });
});

test("0173 is registered as an unactivated production target requiring an isolated owner approval",()=>{
  const runner=readFileSync(new URL("../scripts/production-d1-migrate.mjs",import.meta.url),"utf8");
  assert.match(runner,/UNACTIVATED_PRODUCTION_TARGETS[\s\S]*0173_directory_structured_sql_foundation\.sql/);
});
