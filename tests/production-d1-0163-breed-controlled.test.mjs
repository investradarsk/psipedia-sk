import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  BREED_0163_TARGET,BREED_0163_BLOB_SHA,
  classifyBreed0163,assertBreed0163ApplyReady,assertBreed0163Postflight,
} from "../lib/production-d1-0163-guard.mjs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const sql=read("drizzle/"+BREED_0163_TARGET);
const workflow=read(".github/workflows/production-d1-0163-breed-controlled.yml");
const script=read("scripts/production-d1-0163-breed-controlled.mjs");
const generic=read("scripts/production-d1-migrate.mjs");

function fixture({indexes=true,shortDescription=true,activeCount=344}={}) {
  const db=new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY,slug TEXT);
    CREATE TABLE breed_notion_workcopy_links (
      breed_id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      FOREIGN KEY(breed_id) REFERENCES managed_breeds(id)
    );
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY,category TEXT,status TEXT,
      name TEXT,city TEXT,updated_at TEXT
    );
    CREATE TABLE lost_found_dog_reports (
      id INTEGER PRIMARY KEY,description TEXT NOT NULL DEFAULT ''
    );
  `);
  const breed=db.prepare("INSERT INTO managed_breeds(id,slug) VALUES(?,?)");
  const link=db.prepare("INSERT INTO breed_notion_workcopy_links(breed_id,status) VALUES(?,?)");
  for(let id=1;id<=344;id++){
    breed.run(id,"breed-"+id);
    link.run(id,id<=activeCount?"ACTIVE":"VERIFIED");
  }
  if(indexes)db.exec(read("drizzle/0158_admin_directory_list_indexes.sql"));
  if(shortDescription)db.exec(read("drizzle/0162_lost_found_short_description.sql"));
  return db;
}
function inspect(db){
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  const present=(name)=>tables.includes(name);
  const row=db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active FROM breed_notion_workcopy_links").get();
  const tablePresent=present("breed_notion_controlled_values");
  return {
    managedBreedsPresent:present("managed_breeds"),
    workcopyLinksPresent:present("breed_notion_workcopy_links"),
    managedBreedCount:db.prepare("SELECT COUNT(*) AS n FROM managed_breeds").get().n,
    totalLinks:row.total,activeLinks:row.active,
    indexNames:db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='directory_profiles'").all().map(x=>x.name),
    shortDescriptionPresent:db.prepare("SELECT name FROM pragma_table_info('lost_found_dog_reports')").all().some(x=>x.name==="short_description"),
    tablePresent,
    columns:tablePresent?db.prepare("SELECT name,type,\"notnull\",dflt_value,pk FROM pragma_table_info('breed_notion_controlled_values')").all():[],
    foreignKeys:tablePresent?db.prepare("SELECT * FROM pragma_foreign_key_list('breed_notion_controlled_values')").all():[],
    rowCount:tablePresent?db.prepare("SELECT COUNT(*) AS n FROM breed_notion_controlled_values").get().n:null,
  };
}
test("0163 SQL is pinned and creates exactly one additive sidecar table",()=>{
  const bytes=Buffer.from(sql,"utf8");
  const hash=createHash("sha1").update(Buffer.concat([
    Buffer.from("blob "+bytes.length+"\0"),bytes,
  ])).digest("hex");
  assert.equal(hash,BREED_0163_BLOB_SHA);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS breed_notion_controlled_values/);
  assert.doesNotMatch(sql.replace(/--[^\n]*(\n|$)/g,""),/\b(?:DROP|ALTER|INSERT|UPDATE|REPLACE|TRUNCATE)\b/);
  const db=fixture();
  try {
    const before=db.prepare("SELECT * FROM managed_breeds ORDER BY id").all();
    const links=db.prepare("SELECT * FROM breed_notion_workcopy_links ORDER BY breed_id").all();
    const initial=classifyBreed0163(inspect(db));
    assert.equal(initial.readyToApply,true);
    assert.equal(assertBreed0163ApplyReady(initial),true);
    db.exec(sql);
    const after=classifyBreed0163(inspect(db));
    assert.equal(assertBreed0163Postflight(initial,after),true);
    assert.equal(after.rowCount,0);
    assert.deepEqual(db.prepare("SELECT * FROM managed_breeds ORDER BY id").all(),before);
    assert.deepEqual(db.prepare("SELECT * FROM breed_notion_workcopy_links ORDER BY breed_id").all(),links);
    db.exec(sql);
    assert.equal(classifyBreed0163(inspect(db)).installed,true);
  }finally{db.close()}
});
test("preflight refuses an incomplete workcopy cohort and unapplied 0158 or 0162",()=>{
  for(const config of [
    {indexes:false},{shortDescription:false},{activeCount:343},
  ]){
    const db=fixture(config);
    try{
      const state=classifyBreed0163(inspect(db));
      assert.equal(state.readyToApply,false);
      assert.ok(state.blockers.length>0);
      assert.throws(()=>assertBreed0163ApplyReady(state),/PREREQUISITES_NOT_READY/);
    }finally{db.close()}
  }
});
test("0163 audit rejects malformed or partially pre-created tables",()=>{
  const db=fixture();
  try{
    db.exec("CREATE TABLE breed_notion_controlled_values(breed_id INTEGER PRIMARY KEY)");
    assert.throws(()=>classifyBreed0163(inspect(db)),/EXISTING_SCHEMA_INCOMPATIBLE/);
  }finally{db.close()}
  const other=fixture();
  try{
    const before=classifyBreed0163(inspect(other));
    other.exec(sql);
    other.exec("INSERT INTO breed_notion_controlled_values(breed_id,values_json,notion_values_json) VALUES(1,'{}','{}')");
    const after=classifyBreed0163(inspect(other));
    assert.equal(after.installed,true);
    assert.equal(after.rowCount,1);
    assert.throws(()=>assertBreed0163Postflight(before,after),/POSTFLIGHT_FAILED/);
  }finally{other.close()}
});
test("protected 0163 workflow is owner-dispatched only and cannot auto-apply SQL",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/^\s*(push|pull_request|schedule):/m);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/AUDIT-0163-psipedia-sk-db/);
  assert.match(workflow,/APPLY-0163-psipedia-sk-db/);
  assert.match(script,/BREED_0163_RECOVERY_BOOKMARK_MISSING/);
  assert.match(script,/assertBreed0163Postflight/);
  assert.match(script,/migrationHistoryRecorded:false/);
  assert.match(generic,/"0163_breed_notion_controlled_values.sql"/);
  assert.match(generic,/UNACTIVATED_PRODUCTION_TARGETS/);
});
