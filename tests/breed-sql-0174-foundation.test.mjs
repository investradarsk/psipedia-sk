import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  BREED_ADDITIONAL_CANONICAL_SQL_FIELDS as COLS,
  BREED_CANONICAL_JSON_FIELDS as JSON_COLS,
  BREED_JSON_COLUMN_DECISIONS,
} from "../lib/breed-storage-decision.mjs";
const migration=new URL("../drizzle/0174_breeds_sql_json_foundation.sql",import.meta.url);
const sql=readFileSync(migration,"utf8");
const schema=readFileSync(new URL("../db/breed-storage-schema.ts",import.meta.url),"utf8");
const split=code=>code.replace(/^\s*--.*$/gm,"").split(";").map(x=>x.trim()).filter(Boolean);
const statements=split(sql);

function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec(`CREATE TABLE managed_breeds (
   id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
   status TEXT NOT NULL, fci_number INTEGER, fci_group INTEGER,
   gallery_json TEXT NOT NULL DEFAULT '[]',
   fci_standard_json TEXT NOT NULL DEFAULT '{}',
   editorial_json TEXT NOT NULL DEFAULT '{}',
   sports_json TEXT NOT NULL DEFAULT '[]',
   related_breeds_json TEXT NOT NULL DEFAULT '[]',
   health_risks_json TEXT NOT NULL DEFAULT '[]',
   good_for_json TEXT NOT NULL DEFAULT '[]',
   consider_json TEXT NOT NULL DEFAULT '[]',
   sources_json TEXT NOT NULL DEFAULT '[]',
   seo_json TEXT NOT NULL DEFAULT '{}')`);
 const insert=db.prepare("INSERT INTO managed_breeds (id,slug,name,status,fci_number,fci_group,fci_standard_json,editorial_json,seo_json,related_breeds_json,good_for_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
 for(let id=1;id<=347;id++)insert.run(id,"breed-"+id,"Plemeno "+id,id<=344?"published":"draft",id<=344?id:null,8,
  id===1?'{"celkovy_vzhlad":"Presný text"}':"{}",
  id===2?'{"overview":"Špecifický opis"}':"{}",
  id===1?'{"noindex":true,"canonicalUrl":"/plemena/8/breed-1"}':"{}",
  id===1?"[2,3,4,5]":id===2?"[1,3]":"[]",
  id===1?'["Vhodné pre aktívnych ľudí"]':"[]");
 return db;
}
const shape=db=>Object.fromEntries(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name").all().map(r=>[r.name,r.sql]));
const names=["breed_fci_standard","breed_editorial_text","breed_public_facts","breed_related_breeds"];
const newSql=["seo_title","seo_description","seo_focus_keyword","seo_canonical_url","seo_og_title","seo_og_description","seo_og_image","seo_noindex"];

test("0174 canonical SQL is additive-only: 8 nullable SEO fields, 4 tables, 1 index",()=>{
 assert.equal(statements.length,13);
 assert.equal(statements.filter(x=>/^ALTER TABLE managed_breeds ADD COLUMN/i.test(x)).length,8);
 assert.equal(statements.filter(x=>/^CREATE TABLE/i.test(x)).length,4);
 assert.equal(statements.filter(x=>/^CREATE INDEX/i.test(x)).length,1);
 assert.match(sql,/REGISTERED after 0173/);
 assert.doesNotMatch(sql,/^\s*(?:UPDATE|DELETE|DROP|INSERT|REPLACE|CREATE TRIGGER|VACUUM|ATTACH|DETACH)\b/im);
 assert.doesNotMatch(sql,/ALTER TABLE managed_breeds (?:DROP|RENAME)/i);
 assert.doesNotMatch(sql,/d1_migrations\s*\(/i);
 for(const field of newSql) assert.match(sql,new RegExp("ADD COLUMN "+field+" (TEXT|INTEGER)"));
 for(const [name,decision] of Object.entries(BREED_JSON_COLUMN_DECISIONS)){
   if(decision.action==="retain-json")assert.ok(JSON_COLS.managed_breeds.includes(name));
 }
 assert.match(schema,/export const breedFciStandard/);
 assert.match(schema,/export const breedPublicFacts/);
 assert.match(schema,/export const breedRelatedBreeds/);
});

test("347 populated original breeds and all old JSON survive additive 0174 migration",()=>{
 const db=fixture();
 try{
   const before=db.prepare("SELECT * FROM managed_breeds ORDER BY id").all();
   db.exec(sql);
   const after=db.prepare("SELECT * FROM managed_breeds ORDER BY id").all();
   assert.equal(after.length,347);
   for(let i=0;i<before.length;i++)for(const [key,value] of Object.entries(before[i]))
     assert.equal(after[i][key],value,"id="+before[i].id+" "+key);
   for(const row of after)for(const k of newSql)
     assert.equal(row[k],null,"new field must not mask unknown state");
   for(const name of names)assert.equal(db.prepare("SELECT COUNT(*) as n FROM "+name).get().n,0);
   assert.equal(db.prepare("SELECT COUNT(*) as n FROM managed_breeds").get().n,347);
 }finally{db.close()}
});

test("FCI 33 + all six Notion and five historical editorial values preserved",()=>{
 const db=fixture();
 try{
   db.exec(sql);
   const info=t=>db.prepare("PRAGMA table_info("+t+")").all();
   assert.deepEqual(info("breed_fci_standard").map(r=>r.name),["breed_id",...COLS.breed_fci_standard]);
   assert.deepEqual(info("breed_editorial_text").map(r=>r.name),["breed_id",...COLS.breed_editorial_text]);
   assert.deepEqual(info("breed_public_facts").map(r=>r.name),
     ["breed_id",...COLS.breed_public_facts,...JSON_COLS.breed_public_facts]);
   for(const name of names){
     const fk=db.prepare("PRAGMA foreign_key_list("+name+")").all();
     assert.ok(fk.some(row=>row.table==="managed_breeds"&&row.on_delete==="CASCADE"),name);
   }
   db.prepare("INSERT INTO breed_fci_standard (breed_id,fci_celkovy_vzhlad) VALUES (?,?)").run(1,"New text");
   assert.equal(db.prepare("SELECT fci_celkovy_vzhlad FROM breed_fci_standard WHERE breed_id=1").get().fci_celkovy_vzhlad,"New text");
   assert.equal(db.prepare("SELECT fci_standard_json FROM managed_breeds WHERE id=1").get().fci_standard_json,'{"celkovy_vzhlad":"Presný text"}');
   assert.throws(()=>db.prepare("INSERT INTO breed_fci_standard (breed_id) VALUES (?)").run(1),/UNIQUE|PRIMARY KEY/);
   assert.throws(()=>db.prepare("INSERT INTO breed_fci_standard (breed_id) VALUES (?)").run(998),/FOREIGN KEY/);
 }finally{db.close()}
});

test("numeric and multi-select slots are nullable and reject incorrect JSON type",()=>{
 const db=fixture();
 try{
   db.exec(sql);
   db.prepare("INSERT INTO breed_public_facts (breed_id,origin_countries_json,coat_types_json,weight_min_kg) VALUES (?,?,?,?)")
     .run(1,'["Slovensko","Česko"]',"[]",29.5);
   const v=db.prepare("SELECT * FROM breed_public_facts WHERE breed_id=1").get();
   assert.equal(v.weight_min_kg,29.5);
   assert.equal(v.height_min_cm,null);
   assert.equal(v.origin_countries_json,'["Slovensko","Česko"]');
   assert.equal(v.coat_types_json,"[]");
   assert.throws(()=>db.prepare("UPDATE breed_public_facts SET origin_countries_json=? WHERE breed_id=1").run("{}"),/CHECK/);
   assert.throws(()=>db.prepare("UPDATE breed_public_facts SET origin_countries_json=? WHERE breed_id=1").run("broken"),/CHECK/);
   db.prepare("UPDATE breed_public_facts SET use_types_json=? WHERE breed_id=1").run("[]");
   assert.equal(db.prepare("SELECT use_types_json FROM breed_public_facts WHERE breed_id=1").get().use_types_json,"[]");
 }finally{db.close()}
});

test("related breeds preserve ordering, uniqueness, exclude self-links, and cascade only on explicit parent deletion",()=>{
 const db=fixture();
 try{
   db.exec(sql);
   const i=db.prepare("INSERT INTO breed_related_breeds (breed_id,related_breed_id,position) VALUES (?,?,?)");
   i.run(1,2,0);i.run(1,3,1);i.run(2,1,0);
   assert.deepEqual(db.prepare("SELECT related_breed_id FROM breed_related_breeds WHERE breed_id=1 ORDER BY position").all().map(x=>x.related_breed_id),[2,3]);
   assert.throws(()=>i.run(1,2,2),/UNIQUE|PRIMARY KEY/);
   assert.throws(()=>i.run(1,4,1),/UNIQUE|PRIMARY KEY/);
   assert.throws(()=>i.run(1,1,3),/CHECK/);
   assert.throws(()=>i.run(1,998,3),/FOREIGN KEY/);
   assert.throws(()=>i.run(1,4,-1),/CHECK/);
   const count=db.prepare("SELECT COUNT(*) as n FROM managed_breeds").get().n;
   assert.equal(count,347);
   assert.equal(db.prepare("SELECT related_breeds_json FROM managed_breeds WHERE id=1").get().related_breeds_json,"[2,3,4,5]");
   db.prepare("DELETE FROM managed_breeds WHERE id=3").run();
   assert.equal(db.prepare("SELECT COUNT(*) n FROM breed_related_breeds").get().n,2);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM managed_breeds").get().n,346);
 }finally{db.close()}
});

test("staged SQL and proposed Drizzle shape include every contract field",()=>{
 const db=fixture();
 try{
   db.exec(sql);
   for(const [table,fields] of Object.entries(COLS)){
     if(table==="managed_breeds"){
       const colNames=new Set(db.prepare("PRAGMA table_info(managed_breeds)").all().map(x=>x.name));
       for(const name of fields.filter(x=>x.startsWith("seo_")))assert.ok(colNames.has(name),name);
       continue;
     }
     const actual=db.prepare("PRAGMA table_info("+table+")").all();
     const names=new Set(actual.map(x=>x.name));
     for(const name of fields)assert.ok(names.has(name),table+"."+name);
   }
   for(const name of ["breed_fci_standard","breed_editorial_text","breed_public_facts"])
     assert.equal(db.prepare("SELECT COUNT(*) AS n FROM "+name).get().n,0);
 }finally{db.close()}
});

test("0174 is registered after verified 0173 without altering frozen journal",()=>{
 const dbCheck=readFileSync(new URL("../scripts/check-migration-safety.mjs",import.meta.url),"utf8");
 assert.match(dbCheck,/requireContiguousSequence/);
 assert.match(sql,/0171\/0172 partner/);
 assert.match(sql,/0173 directory/);
 const staged=readFileSync(new URL("../docs/BREEDS-SQL-JSON-STEP3-20261119.md",import.meta.url),"utf8");
 assert.match(staged,/0171/);
 assert.match(staged,/0172/);
 assert.match(staged,/0173/);
});


test("legacy heroTraits array has a dedicated guarded SQL JSON slot",()=>{
  const db=fixture();
  try{
    db.exec(sql);
    db.prepare("INSERT INTO breed_editorial_text (breed_id,exercise_tip,training_tip,health_tip,coat_tip,hero_traits_json) VALUES (?,?,?,?,?,?)")
      .run(1,"cvičenie","tréning","zdravie","srsť",
        '[{"label":"Pokoj","rating":5}]');
    const row=db.prepare("SELECT * FROM breed_editorial_text WHERE breed_id=1").get();
    assert.equal(row.exercise_tip,"cvičenie");
    assert.equal(row.training_tip,"tréning");
    assert.equal(row.health_tip,"zdravie");
    assert.equal(row.coat_tip,"srsť");
    assert.equal(JSON.parse(row.hero_traits_json)[0].rating,5);
    assert.throws(()=>db.prepare("UPDATE breed_editorial_text SET hero_traits_json=? WHERE breed_id=1").run("{}"),/CHECK/);
    assert.throws(()=>db.prepare("UPDATE breed_editorial_text SET hero_traits_json=? WHERE breed_id=1").run("{broken"),/CHECK/);
  }finally{db.close()}
});
