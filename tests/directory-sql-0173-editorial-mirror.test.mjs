import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { planDirectory0173EditorialSqlMirror } from "../lib/directory-0173-editorial-sql-mirror.ts";

const migration = readFileSync(new URL("../drizzle/0173_directory_structured_sql_foundation.sql", import.meta.url), "utf8");
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY, category TEXT, slug TEXT,
    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
    qualifications_json TEXT NOT NULL, seo_json TEXT NOT NULL,
    UNIQUE(category,slug))`);
  const statements = migration.split("--> statement-breakpoint")
    .map(sql => sql.replace(/^\s*(?:--[^\n]*\n\s*)+/g,"").trim()).filter(Boolean);
  for (const sql of statements) db.exec(sql);
  db.prepare("INSERT INTO directory_profiles VALUES (1,'veterinari','prvy','T1','admin','[\"old\"]','{\"title\":\"Old\"}')").run();
  db.prepare("INSERT INTO directory_profiles VALUES (2,'veterinari','druhy','T1','admin','[]','{}')").run();
  return db;
}
function apply(db, input) {
  for (const item of planDirectory0173EditorialSqlMirror(input)) db.prepare(item.sql).run(...item.bindings);
}
test("Admin+Notion sidecar saves qualifications in order and SEO fields without altering legacy JSON",()=>{
  const db=fixture();
  try {
    db.prepare("UPDATE directory_profiles SET updated_at='T2' WHERE id=1").run();
    apply(db,{identity:{kind:"id",profileId:1,updatedAt:"T2",actor:"admin"},
      qualifications:["Licencia","Druhá","Licencia"],
      seo:{title:"Nový titul",description:"",canonicalUrl:"example",ogImage:"/media/dog",noindex:true}});
    assert.deepEqual(db.prepare("SELECT qualification_text FROM directory_profile_qualifications WHERE profile_id=1 ORDER BY item_order").all().map(x=>x.qualification_text),
      ["Licencia","Druhá","Licencia"]);
    const seo=db.prepare("SELECT * FROM directory_profile_seo WHERE profile_id=1").get();
    assert.equal(seo.title,"Nový titul");
    assert.equal(seo.canonical_url,"example");
    assert.equal(seo.noindex,1);
    const legacy=db.prepare("SELECT qualifications_json,seo_json FROM directory_profiles WHERE id=1").get();
    assert.equal(legacy.qualifications_json,'["old"]');
    assert.equal(legacy.seo_json,'{"title":"Old"}');
    apply(db,{identity:{kind:"id",profileId:1,updatedAt:"T2",actor:"admin"},
      qualifications:[],seo:{title:"",noindex:false}});
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_qualifications WHERE profile_id=1").get().n,0);
    assert.equal(db.prepare("SELECT title FROM directory_profile_seo WHERE profile_id=1").get().title,"");
    assert.equal(db.prepare("SELECT noindex FROM directory_profile_seo WHERE profile_id=1").get().noindex,0);
  } finally {db.close()}
});
test("A missing optional field never deletes a saved SQL value",()=>{
  const db=fixture();
  try{
    apply(db,{identity:{kind:"id",profileId:1,updatedAt:"T1",actor:"admin"},qualifications:["Cert"],seo:{title:"SEO"}});
    apply(db,{identity:{kind:"id",profileId:1,updatedAt:"T1",actor:"admin"}});
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_qualifications WHERE profile_id=1").get().n,1);
    assert.equal(db.prepare("SELECT title FROM directory_profile_seo WHERE profile_id=1").get().title,"SEO");
  }finally{db.close()}
});
test("Stale timestamp/actor and missing profile never overwrite another profile",()=>{
  const db=fixture();
  try{
    apply(db,{identity:{kind:"id",profileId:1,updatedAt:"T1",actor:"admin"},qualifications:["Original"],seo:{title:"Original"}});
    apply(db,{identity:{kind:"id",profileId:1,updatedAt:"T0",actor:"admin"},qualifications:[],seo:{title:"Lost"}});
    apply(db,{identity:{kind:"id",profileId:1,updatedAt:"T1",actor:"notion"},qualifications:[],seo:{title:"Lost"}});
    apply(db,{identity:{kind:"id",profileId:999,updatedAt:"T1",actor:"admin"},qualifications:["Stray"],seo:{title:"Bad"}});
    assert.equal(db.prepare("SELECT title FROM directory_profile_seo WHERE profile_id=1").get().title,"Original");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_qualifications WHERE profile_id=1").get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_seo WHERE profile_id=2").get().n,0);
  }finally{db.close()}
});
test("New profile 0173 writes use unique category/slug identity after insert",()=>{
 const db=fixture();
 try{
   apply(db,{identity:{kind:"category-slug",category:"veterinari",slug:"druhy",updatedAt:"T1",actor:"admin"},
     qualifications:["Second"],seo:{title:"Second title",noindex:false}});
   assert.equal(db.prepare("SELECT title FROM directory_profile_seo WHERE profile_id=2").get().title,"Second title");
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_qualifications WHERE profile_id=1").get().n,0);
 }finally{db.close()}
});
test("Canonical Admin/Notion writer uses a single D1 batch to publish 0173 sidecars",()=>{
 const source=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
 assert.match(source,/planDirectory0173EditorialSqlMirror/);
 assert.match(source,/editorialMirror\.map\(item => database\.prepare\(item\.sql\)\.bind\(\.\.\.item\.bindings\)\)/);
 assert.match(source,/canonicalStatement,[\s\S]*\.\.\.editorialMirror/);
 assert.match(source,/canonical,[\s\S]*\.\.\.editorialMirror/);
});
