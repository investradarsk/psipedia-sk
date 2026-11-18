import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
 FILE_0170,BLOB_0170,CONTACTS_0170,TABLES_0170,INDEXES_0170,
 DEPENDENCIES_0170,statements0170,inspect0170,
} from "../lib/production-d1-directory-0170-guard.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const sql=read("drizzle/"+FILE_0170);
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY,name TEXT)");
 db.exec("INSERT INTO d1_migrations VALUES (163,'0162_lost_found_short_description.sql')");
 db.exec("CREATE TABLE directory_profiles ("+
  "id INTEGER PRIMARY KEY,category TEXT,source_data_json TEXT,services_json TEXT,"+
  "qualifications_json TEXT,seo_json TEXT)");
 db.exec("INSERT INTO directory_profiles VALUES (10,'veterinari','{\"Telefon\":\"0944\"}','[]','[]','{}')");
 db.exec("INSERT INTO directory_profiles VALUES (20,'treneri','{\"Facebook\":\"example\"}','[]','[]','{}')");
 for(const table of DEPENDENCIES_0170.filter(x=>!["d1_migrations","directory_profiles"].includes(x)))
  db.exec("CREATE TABLE "+table+" (id INTEGER PRIMARY KEY)");
 return db;
}
function inspect(db){
 const names=[...DEPENDENCIES_0170,...TABLES_0170,...INDEXES_0170];
 const objects=db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY name").all()
  .filter(row=>names.includes(row.name));
 const history=db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map(x=>x.name);
 const baseColumns=db.prepare("PRAGMA table_info(directory_profiles)").all();
 const tableColumns={},foreignKeys={},indexColumns={},newCounts={};
 for(const t of TABLES_0170){
  if(!objects.some(x=>x.name===t&&x.type==="table"))continue;
  tableColumns[t]=db.prepare("PRAGMA table_info('"+t+"')").all();
  foreignKeys[t]=db.prepare("PRAGMA foreign_key_list('"+t+"')").all();
  newCounts[t]=Number(db.prepare("SELECT COUNT(*) n FROM "+t).get().n);
 }
 for(const x of INDEXES_0170)
  if(objects.some(o=>o.name===x))
   indexColumns[x]=db.prepare("SELECT name FROM pragma_index_info('"+x+"') ORDER BY seqno")
    .all().map(y=>y.name);
 const baseCounts=Object.fromEntries(DEPENDENCIES_0170.filter(x=>x!=="d1_migrations")
  .map(t=>[t,Number(db.prepare("SELECT COUNT(*) n FROM "+t).get().n)]));
 return {sql,objects,history,baseColumns,tableColumns,foreignKeys,indexColumns,
  newCounts,baseCounts};
}
test("SQL is exact pinned blob, ten statements only and additive",()=>{
 const bytes=readFileSync(new URL("../drizzle/"+FILE_0170,import.meta.url));
 const blob=createHash("sha1")
  .update(Buffer.concat([Buffer.from("blob "+bytes.length+"\0"),bytes])).digest("hex");
 assert.equal(blob,BLOB_0170);
 const statements=statements0170(sql);
 assert.equal(statements.length,10);
 assert.equal(statements.filter(x=>/^ALTER/.test(x)).length,4);
 assert.equal(statements.filter(x=>/^CREATE TABLE/.test(x)).length,3);
 assert.equal(statements.filter(x=>/^CREATE INDEX/.test(x)).length,3);
 assert.throws(()=>statements0170(sql+"\nDROP TABLE directory_profiles;"),/STATEMENT_COUNT/);
 assert.throws(()=>statements0170(sql.replace("public_phone TEXT","public_phone TEXT NOT NULL")) ,/UNEXPECTED_SQL/);
});
test("empty canonical 0170 slots are ready; additive apply preserves all legacy profile data",()=>{
 const db=fixture();
 try{
  const before=db.prepare("SELECT * FROM directory_profiles ORDER BY id").all();
  assert.deepEqual(inspect0170(inspect(db)),{installed:false,readyToApply:true,profiles:2});
  db.exec(sql);
  const result=inspect0170(inspect(db));
  assert.deepEqual(result,{installed:true,readyToApply:false,profiles:2});
  const after=db.prepare("SELECT id,category,source_data_json,services_json,qualifications_json,seo_json FROM directory_profiles ORDER BY id").all();
  assert.deepEqual(after,before);
  for(const contact of CONTACTS_0170)
   assert.equal(db.prepare("SELECT "+contact+" AS x FROM directory_profiles WHERE id=10").get().x,null);
  for(const table of TABLES_0170)
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n,0);
  db.prepare("UPDATE directory_profiles SET public_phone='' WHERE id=10").run();
  assert.equal(db.prepare("SELECT public_phone FROM directory_profiles WHERE id=10").get().public_phone,"");
 }finally{db.close()}
});
test("0170 relation constraints protect category uniqueness, foreign keys, explicit clear and filters",()=>{
 const db=fixture();
 try{
  db.exec(sql);
  const add=db.prepare("INSERT INTO directory_profile_additional_categories VALUES (?,?,?,?)");
  add.run(10,"treneri","2026-11-18","admin");
  assert.throws(()=>add.run(10,"treneri","2026-11-18","admin"),/UNIQUE|PRIMARY KEY/);
  assert.throws(()=>add.run(999,"treneri","2026-11-18","admin"),/FOREIGN KEY/);
  assert.throws(()=>add.run(20,"invalid","2026-11-18","admin"),/CHECK/);
  db.prepare("INSERT INTO directory_profile_public_facts VALUES (?,?,?,?,?)")
   .run(10,"Pokrytie","","2026-11-18","admin");
  assert.equal(db.prepare("SELECT value_text FROM directory_profile_public_facts").get().value_text,"");
  const insert=db.prepare("INSERT INTO directory_profile_filter_values VALUES (?,?,?,?,?,?)");
  insert.run(10,"veterinari","veterinari.emergency","unknown","2026-11-18","admin");
  assert.throws(()=>insert.run(10,"veterinari","veterinari.emergency","yes","2026-11-18","admin"),/UNIQUE|PRIMARY KEY/);
  assert.throws(()=>insert.run(10,"veterinari","veterinari.emergency","","2026-11-18","admin"),/CHECK/);
 }finally{db.close()}
});
test("refuse partial 0170 schema, incompatible index and unexpected migration ledger",()=>{
 const db=fixture();
 try{
  db.exec("ALTER TABLE directory_profiles ADD COLUMN public_phone TEXT");
  assert.throws(()=>inspect0170(inspect(db)),/PARTIAL_SCHEMA_STOP/);
 }finally{db.close()}
 const db2=fixture();
 try{
  db2.exec(sql);
  const state=inspect(db2);
  state.indexColumns[INDEXES_0170[0]]=["profile_id","category"];
  assert.throws(()=>inspect0170(state),/BAD_INDEX/);
  const drift=inspect(db2);
  drift.history.push(FILE_0170);
  assert.throws(()=>inspect0170(drift),/UNEXPECTED_LEDGER/);
  const drift2=inspect(db2);
  drift2.history=["0163_other.sql"];
  assert.throws(()=>inspect0170(drift2),/UNEXPECTED_LEDGER/);
 }finally{db2.close()}
});
test("owner workflow is manual-only and generic 0170 migration replay is disabled",()=>{
 const workflow=read(".github/workflows/production-d1-directory-0170.yml");
 const script=read("scripts/production-d1-directory-0170.mjs");
 const registry=read("scripts/production-d1-migrate.mjs");
 assert.match(workflow,/workflow_dispatch/);
 assert.match(workflow,/environment: production/);
 assert.match(workflow,/refs\/heads\/main/);
 assert.match(workflow,/AUDIT-0170-psipedia-sk-db/);
 assert.match(workflow,/APPLY-0170-psipedia-sk-db/);
 assert.match(workflow,/git rev-parse origin\/main/);
 assert.doesNotMatch(workflow,/^\s+(?:push|schedule|pull_request):/m);
 assert.match(script,/--file",SQL/);
 assert.match(script,/time-travel","info"/);
 assert.match(script,/migrationLedgerWritten:false/);
 assert.doesNotMatch(script,/migrations","apply"/);
 assert.match(registry,/UNACTIVATED_PRODUCTION_TARGETS[\s\S]*0170_directory_canonical_sql_slots.sql/);
});
