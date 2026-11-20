import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  DIRECTORY_ADMIN_SQL_OWNERS,
  DIRECTORY_EDITORIAL_SQL_OWNERS,
  DIRECTORY_EXTRA_LIST_KEYS,
  directoryRemainingFieldOwner,
} from "../lib/directory-admin-sql-field-owners.mjs";

const migration=readFileSync(new URL("../drizzle/0176_directory_admin_sql_complete.sql",import.meta.url),"utf8");
const sqlBlocks=migration.split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean);

function setup(){
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,source_data_json TEXT NOT NULL DEFAULT '{}',name TEXT NOT NULL DEFAULT '')");
  for(const block of sqlBlocks)db.exec(block);
  db.exec("INSERT INTO directory_profiles(id,source_data_json,name) VALUES(1,'{\"Pohotovosť\":\"Áno\"}','Example'),(2,'{}','Other')");
  return db;
}

test("0176 migration is schema-only and never edits, drops or copies existing profiles",()=>{
  assert.equal(sqlBlocks.length,sqlBlocks.filter(x=>/^--|^CREATE (TABLE|INDEX)/m.test(x)).length);
  assert.doesNotMatch(migration,/^\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE)\s/im);
  for(const name of [
    "directory_profile_extra_fields","directory_profile_extra_list_state","directory_profile_extra_list_items",
    "directory_profile_service_texts","directory_profile_image_display_settings",
    "directory_profile_sql_cutover_state",
  ])assert.match(migration,new RegExp("CREATE TABLE "+name+"\\b"));
  const db=setup();
  try{
    assert.equal(db.prepare("SELECT name FROM directory_profiles WHERE id=1").get().name,"Example");
    assert.equal(db.prepare("SELECT source_data_json FROM directory_profiles WHERE id=1").get().source_data_json,
      '{"Pohotovosť":"Áno"}');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_extra_fields").get().n,0);
  }finally{db.close()}
});

test("every ManagedDirectoryProfileInput field has exactly one declared SQL owner",()=>{
  const file=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
  const declaration=file.match(/export type ManagedDirectoryProfileInput = \{([\s\S]*?)\n\};/);
  assert(declaration,"ManagedDirectoryProfileInput must be available");
  const members=[...declaration[1].matchAll(/^\s*([a-zA-Z]\w*)\??:\s/gm)].map(x=>x[1]);
  assert(members.length>=30);
  assert.deepEqual(members.filter(key=>!Object.hasOwn(DIRECTORY_ADMIN_SQL_OWNERS,key)),[],
    "new Admin input fields must have explicit SQL ownership");
  for(const [key,value] of Object.entries(DIRECTORY_ADMIN_SQL_OWNERS)){
    assert(key.trim()&&value.trim());
    assert(!value.includes("_json"),"do not map Admin fields back to JSON columns");
  }
  assert(DIRECTORY_EXTRA_LIST_KEYS.length>=4);
  for(const field of ["Ordinačné hodiny","Zdroj dát","Zdroj obrázka","Alt text obrázka","Organizácia","Zameranie"])
    assert(Object.hasOwn(DIRECTORY_EDITORIAL_SQL_OWNERS,field),field);
});

test("scalar fields distinguish null, blank text and numeric zero; reject invalid value kinds",()=>{
  const db=setup();
  const statement=db.prepare("INSERT INTO directory_profile_extra_fields VALUES(?,?,?,?,?,?,?)");
  try{
    statement.run(1,"Zdroj dát","text","",null,"2026-11-20","admin");
    statement.run(1,"Počet","number",null,0,"2026-11-20","admin");
    statement.run(1,"Poznámka","null",null,null,"2026-11-20","admin");
    assert.deepEqual(db.prepare("SELECT value_kind FROM directory_profile_extra_fields ORDER BY field_key")
      .all().map(x=>x.value_kind),["number","null","text"]);
    assert.throws(()=>statement.run(1,"Zlé","text",null,null,"2026-11-20","admin"));
    assert.throws(()=>statement.run(1,"Zlé","number","9",9,"2026-11-20","admin"));
    assert.throws(()=>statement.run(1,"Zlé","boolean","true",null,"2026-11-20","admin"));
    assert.throws(()=>statement.run(123,"Zlé","text","ok",null,"2026-11-20","admin"),/FOREIGN KEY/);
    assert.equal(directoryRemainingFieldOwner("_psipedia_profile_note"),"directory_profile_extra_fields");
    assert.equal(directoryRemainingFieldOwner("_psipedia_gallery",{isList:true}),"directory_profile_extra_list_items");
  }finally{db.close()}
});

test("array metadata and service text are relational and preserve item order",()=>{
  const db=setup();
  try{
    const add=db.prepare("INSERT INTO directory_profile_extra_list_items VALUES(?,?,?,?,?,?)");
    db.exec("INSERT INTO directory_profile_extra_list_state VALUES(1,'_psipedia_trainer_breed_ids','2026-11-20','admin')");
    db.exec("INSERT INTO directory_profile_extra_list_state VALUES(1,'_psipedia_empty_selection','2026-11-20','admin')");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_extra_list_items WHERE field_key='_psipedia_empty_selection'").get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_extra_list_state WHERE field_key='_psipedia_empty_selection'").get().n,1);
    add.run(1,"_psipedia_trainer_breed_ids",0,"100","2026-11-20","admin");
    add.run(1,"_psipedia_trainer_breed_ids",1,"200","2026-11-20","admin");
    assert.deepEqual(db.prepare("SELECT item_text FROM directory_profile_extra_list_items ORDER BY item_order")
      .all().map(x=>x.item_text),["100","200"]);
    assert.throws(()=>add.run(1,"_psipedia_trainer_breed_ids",1,"duplicate","2026-11-20","admin"));
    assert.throws(()=>add.run(1,"field",-1,"negative","2026-11-20","admin"));
    db.exec("INSERT INTO directory_profile_service_texts VALUES(1,0,'Stráženie','2026-11-20','admin')");
    assert.throws(()=>db.exec("INSERT INTO directory_profile_service_texts VALUES(1,1,' ','2026-11-20','admin')"));
  }finally{db.close()}
});

test("typed image display settings validate crop range and per-context mode",()=>{
  const db=setup();
  const add=db.prepare("INSERT INTO directory_profile_image_display_settings VALUES(?,?,?,?,?,?,?,?)");
  try{
    add.run(1,"thumbnail","auto",50,28,1,"2026-11-20","admin");
    add.run(1,"detail","natural",40,50,1.5,"2026-11-20","admin");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_image_display_settings").get().n,2);
    assert.throws(()=>add.run(2,"thumbnail","natural",50,50,1,"2026-11-20","admin"));
    assert.throws(()=>add.run(2,"detail","crop",101,50,1,"2026-11-20","admin"));
    assert.throws(()=>add.run(2,"detail","blur",0,50,3,"2026-11-20","admin"));
  }finally{db.close()}
});

test("SQL_ONLY receipt cannot be written without a verified snapshot",()=>{
  const db=setup();
  const insert=db.prepare("INSERT INTO directory_profile_sql_cutover_state VALUES(?,?,?,?,?,?,?,?,?)");
  try{
    insert.run(1,"STAGED","2026-11-20T00:00Z",null,3,2,null,null,"2026-11-20");
    assert.throws(()=>insert.run(2,"SQL_ONLY","2026-11-20T00:00Z",null,3,2,null,null,"2026-11-20"));
    db.exec("UPDATE directory_profile_sql_cutover_state SET state='VERIFIED',verified_at='2026-11-20T01:00Z' WHERE profile_id=1");
    db.exec("UPDATE directory_profile_sql_cutover_state SET state='SQL_ONLY',cutover_at='2026-11-20T02:00Z' WHERE profile_id=1");
    assert.equal(db.prepare("SELECT state FROM directory_profile_sql_cutover_state WHERE profile_id=1").get().state,"SQL_ONLY");
    assert.throws(()=>db.exec("UPDATE directory_profile_sql_cutover_state SET verified_at=NULL WHERE profile_id=1"));
  }finally{db.close()}
});

test("all new SQL rows are cleaned by their parent FK, leaving existing schema unaffected",()=>{
  const db=setup();
  try{
    db.exec("INSERT INTO directory_profile_extra_fields VALUES(1,'x','text','y',NULL,'date','actor')");
    db.exec("INSERT INTO directory_profile_extra_list_state VALUES(1,'x','date','actor')");
    db.exec("INSERT INTO directory_profile_extra_list_items VALUES(1,'x',0,'value','date','actor')");
    db.exec("INSERT INTO directory_profile_service_texts VALUES(1,0,'service','date','actor')");
    db.exec("INSERT INTO directory_profile_image_display_settings VALUES(1,'detail','crop',50,50,1,'date','actor')");
    db.exec("INSERT INTO directory_profile_sql_cutover_state VALUES(1,'STAGED','date',NULL,0,0,NULL,NULL,'date')");
    db.exec("DELETE FROM directory_profiles WHERE id=1");
    for(const table of ["directory_profile_extra_fields","directory_profile_extra_list_state","directory_profile_extra_list_items",
      "directory_profile_service_texts","directory_profile_image_display_settings",
      "directory_profile_sql_cutover_state"])
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n,0,table);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n,1);
  }finally{db.close()}
});
