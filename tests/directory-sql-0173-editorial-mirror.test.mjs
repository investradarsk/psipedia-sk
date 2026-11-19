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

test("Explicit breeder gallery is an ordered 0173 SQL mirror, with clear and absent-value semantics",()=>{
 const db=fixture();
 try{
  const who={kind:"id",profileId:1,updatedAt:"T1",actor:"admin"};
  apply(db,{identity:who,galleryUrls:["/media/breeder-1.webp","https://example.com/breeder-2.jpg"]});
  let rows=db.prepare("SELECT profile_id,item_order,image_url,image_key,alt_text,attribution_text FROM directory_profile_media ORDER BY item_order").all();
  assert.deepEqual(rows.map(x=>x.image_url),["/media/breeder-1.webp","https://example.com/breeder-2.jpg"]);
  assert.deepEqual(rows.map(x=>x.item_order),[0,1]);
  assert.deepEqual(rows.map(x=>x.alt_text),["",""]);
  assert.deepEqual(rows.map(x=>x.attribution_text),["",""]);
  assert.deepEqual(rows.map(x=>x.image_key),[null,null]);
  apply(db,{identity:who,seo:{title:"Independent SEO edit"}});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_media WHERE profile_id=1").get().n,2);
  apply(db,{identity:who,galleryUrls:[]});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_media WHERE profile_id=1").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_media WHERE profile_id=2").get().n,0);
 }finally{db.close()}
});
test("Gallery mirror rejects malformed, duplicate and oversized batches",()=>{
 const who={kind:"id",profileId:1,updatedAt:"T1",actor:"admin"};
 for (const urls of [
  ["a","a"],Array.from({length:7},(_,i)=>"/media/"+i+".webp"),[""],[null]
 ]) assert.throws(()=>planDirectory0173EditorialSqlMirror({identity:who,galleryUrls:urls}),/DIRECTORY_0173_INVALID_GALLERY/);
});
test("Stale edit cannot delete a newer breeder gallery; creation uses unique slug identity",()=>{
 const db=fixture();
 try{
  apply(db,{identity:{kind:"category-slug",category:"veterinari",slug:"druhy",updatedAt:"T1",actor:"admin"},
    galleryUrls:["/media/a.webp"]});
  apply(db,{identity:{kind:"id",profileId:2,updatedAt:"T0",actor:"admin"},galleryUrls:[]});
  apply(db,{identity:{kind:"id",profileId:2,updatedAt:"T1",actor:"notion"},galleryUrls:[]});
  assert.equal(db.prepare("SELECT image_url FROM directory_profile_media WHERE profile_id=2").get().image_url,"/media/a.webp");
 }finally{db.close()}
});

test("Opening hours 0173 sidecar preserves complete free-form schedules and intentional clears",()=>{
 const db=fixture();
 try{
  const who={kind:"id",profileId:1,updatedAt:"T1",actor:"admin"};
  const hours="Po–Pi 09:00–12:00; 13:00–18:00\nSviatky: podľa dohody";
  apply(db,{identity:who,openingHoursText:hours});
  let rows=db.prepare("SELECT * FROM directory_profile_opening_hours WHERE profile_id=1").all();
  assert.equal(rows.length,1);
  assert.equal(rows[0].day_of_week,0);
  assert.equal(rows[0].hours_text,hours);
  assert.equal(rows[0].updated_at,"T1");
  assert.equal(rows[0].updated_by,"admin");
  // An unrelated SEO save never clears hours, nor does a stale actor.
  apply(db,{identity:who,seo:{title:"Only SEO"}});
  apply(db,{identity:{...who,actor:"notion"},openingHoursText:"Overwritten"});
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=1").get().hours_text,hours);
  apply(db,{identity:who,openingHoursText:""});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_opening_hours WHERE profile_id=1").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_opening_hours WHERE profile_id=2").get().n,0);
 }finally{db.close()}
});
test("Opening hours SQL mirror honors category-slug inserts, missing fields and invalid values",()=>{
 const db=fixture();
 try{
  const who={kind:"category-slug",category:"veterinari",slug:"druhy",updatedAt:"T1",actor:"admin"};
  apply(db,{identity:who,openingHoursText:"Na objednávku"});
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=2").get().hours_text,"Na objednávku");
  apply(db,{identity:who,qualifications:["No hours edit"]});
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=2").get().hours_text,"Na objednávku");
  apply(db,{identity:{...who,updatedAt:"stale"},openingHoursText:""});
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=2").get().hours_text,"Na objednávku");
  for(const value of [null,42,"x".repeat(2001)]) assert.throws(
    ()=>planDirectory0173EditorialSqlMirror({identity:who,openingHoursText:value}),
    /DIRECTORY_0173_INVALID_OPENING_HOURS/
  );
 }finally{db.close()}
});
test("Admin, Notion and moderated partner hours all use 0173 SQL without switching readers",()=>{
 const notion=readFileSync(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
 const partner=readFileSync(new URL("../lib/partner-profile-changes-admin.ts",import.meta.url),"utf8");
 assert.match(notion,/planDirectory0173EditorialSqlMirror/);
 assert.match(notion,/openingHoursText: trimmed/);
 assert.match(notion,/canonical, \.\.\.guard,[\s\S]*\.\.\.factMirror[\s\S]*\.\.\.hoursMirror/);
 assert.match(partner,/Object\.hasOwn\(effectivePatch, "openingHours"\)/);
 assert.match(partner,/planDirectory0173EditorialSqlMirror/);
 assert.match(partner,/\.\.\.canonicalStatements/);
});

test("Admin breeder editor only sends explicit normalized gallery to the canonical 0173 batch",()=>{
 const source=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
 assert.match(source,/payload\.galleryUrls !== undefined && input\.category === "chovatelske-stanice"/);
 assert.match(source,/payload\.galleryUrls !== undefined &&[\s\S]*"chovatelske-stanice"/);
 assert.match(source,/readDirectoryBreederGallery\(/);
 assert.match(source,/mergeDirectoryBreederGallery\(/);
 assert.match(source,/\.\.\.editorialMirror\.map\(item => database\.prepare\(item\.sql\)\.bind\(\.\.\.item\.bindings\)\)/);
});
