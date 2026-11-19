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
  db.exec("ALTER TABLE directory_profiles ADD COLUMN source_data_json TEXT NOT NULL DEFAULT '{}'");
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


test("0173 quality mirror only updates explicit fields with lossless checked_at",()=>{
 const db=fixture();
 try {
  const who={kind:"id",profileId:1,updatedAt:"T1",actor:"admin"};
  const checked="2026-11-19T17:12:00.000Z";
  db.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=1").run(JSON.stringify({
    _psipedia_quality_phone_status:"NOT_PUBLIC",
    _psipedia_quality_phone_checked_at:checked,
    _psipedia_quality_website_status:"NOT_FOUND",
    _psipedia_quality_website_checked_at:checked,
  }));
  apply(db,{identity:who,qualityFields:["phone","website"]});
  const records=db.prepare("SELECT quality_field,resolution_status,checked_at,updated_by FROM directory_profile_quality_resolutions WHERE profile_id=1 ORDER BY quality_field").all();
  assert.deepEqual(records.map(x=>[x.quality_field,x.resolution_status,x.checked_at,x.updated_by]),
    [["phone","NOT_PUBLIC",checked,"admin"],["website","NOT_FOUND",checked,"admin"]]);
  // A later unrelated edit must not delete or refresh quality records.
  apply(db,{identity:who,seo:{title:"Unrelated"}});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_quality_resolutions WHERE profile_id=1").get().n,2);
  // Removing one JSON status during an explicit contact edit deletes only that SQL resolution.
  db.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=1").run(JSON.stringify({
    _psipedia_quality_website_status:"NOT_FOUND",
    _psipedia_quality_website_checked_at:checked,
  }));
  apply(db,{identity:who,qualityFields:["phone"]});
  assert.deepEqual(db.prepare("SELECT quality_field FROM directory_profile_quality_resolutions WHERE profile_id=1").all().map(x=>x.quality_field),["website"]);
  // Stale actor cannot clear another profile or an updated row.
  apply(db,{identity:{...who,actor:"notion"},qualityFields:["website"]});
  assert.equal(db.prepare("SELECT resolution_status FROM directory_profile_quality_resolutions WHERE profile_id=1").get().resolution_status,"NOT_FOUND");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_quality_resolutions WHERE profile_id=2").get().n,0);
 } finally {db.close()}
});
test("Quality SQL shadow rejects invalid fields, ignores absent values and invalid timestamp",()=>{
 const db=fixture();
 try {
  const who={kind:"category-slug",category:"veterinari",slug:"druhy",updatedAt:"T1",actor:"admin"};
  db.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=2").run(JSON.stringify({
    _psipedia_quality_address_status:"NOT_APPLICABLE",
    _psipedia_quality_address_checked_at:"2026-11-19T10:00:00Z",
  }));
  apply(db,{identity:who,qualityFields:["address"]});
  assert.equal(db.prepare("SELECT resolution_status FROM directory_profile_quality_resolutions WHERE profile_id=2").get().resolution_status,"NOT_APPLICABLE");
  for(const bad of [["phone","phone"],["unapproved"],[42],null]) assert.throws(
    ()=>planDirectory0173EditorialSqlMirror({identity:who,qualityFields:bad}),
    /DIRECTORY_0173_INVALID_QUALITY_FIELDS/
  );
  db.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=2").run(JSON.stringify({
    _psipedia_quality_address_status:"NOT_FOUND",
    _psipedia_quality_address_checked_at:"",
  }));
  apply(db,{identity:who,qualityFields:["address"]});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_quality_resolutions WHERE profile_id=2").get().n,0);
 }finally{db.close()}
});
test("Canonical D1 profile writer atomically mirrors touched quality resolutions in create/update",()=>{
 const source=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
 assert.match(source,/directoryQualityMirrorFields\(payload\)/);
 assert.match(source,/qualityFields: directoryQualityMirrorFields\(payload\)/);
 assert.match(source,/canonicalStatement,[\s\S]*\.\.\.editorialMirror\.map/);
 assert.match(source,/canonical,[\s\S]*\.\.\.editorialMirror\.map/);
});

test("Admin breeder editor only sends explicit normalized gallery to the canonical 0173 batch",()=>{
 const source=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
 assert.match(source,/payload\.galleryUrls !== undefined && input\.category === "chovatelske-stanice"/);
 assert.match(source,/payload\.galleryUrls !== undefined &&[\s\S]*"chovatelske-stanice"/);
 assert.match(source,/readDirectoryBreederGallery\(/);
 assert.match(source,/mergeDirectoryBreederGallery\(/);
 assert.match(source,/\.\.\.editorialMirror\.map\(item => database\.prepare\(item\.sql\)\.bind\(\.\.\.item\.bindings\)\)/);
});

test("Approved partner direct edits also mirror exact 0173 free-text hours under one CAS guard",()=>{
 const source=readFileSync(new URL("../lib/partner-direct-profile.ts",import.meta.url),"utf8");
 assert.match(source,/planDirectory0173EditorialSqlMirror/);
 assert.match(source,/Object\.hasOwn\(effectivePatch,"openingHours"\)/);
 assert.match(source,/Object\.hasOwn\(effectivePatch,"galleryUrls"\)/);
 assert.match(source,/planDirectory0173EditorialSqlMirror/);
 assert.match(source,/if\(plans\.length \|\| editorialMirror\.length\)/);
 assert.match(source,/const guard=plans\.length\?plans\[0\]\[0\]:\{/);
 assert.match(source,/statements\.push\(database\.prepare\(guard\.sql\)\.bind/);
 assert.match(source,/openingHoursText:String\(effectivePatch\.openingHours\?\?""\)/);
 assert.match(source,/galleryUrls:effectivePatch\.galleryUrls as readonly string\[\]/);
 assert.match(source,/for\(const item of editorialMirror\)/);
 const first=source.indexOf("statements.push(database.prepare(guard.sql)");
 const second=source.indexOf("for(const item of editorialMirror)");
 assert.ok(first>0 && second>first,"CAS must precede 0173 mutation");
 const db=fixture();
 try{
  const identity={kind:"id",profileId:1,updatedAt:"T1",actor:"admin"};
  // Populate a previous administrator's confirmed sidecar.
  apply(db,{identity,openingHoursText:"Po–Pi 8:00–16:00"});
  // Partner only edits the free-text schedule; shifts and notes must survive.
  const changed="Po: 08:00–12:00; 13:00–17:00\\nSviatky: dohodou";
  db.prepare("UPDATE directory_profiles SET updated_at=?,updated_by=? WHERE id=1")
    .run("T2","partner:owner-1");
  apply(db,{identity:{...identity,updatedAt:"T2",actor:"partner:owner-1"},openingHoursText:changed});
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=1 AND day_of_week=0").get().hours_text,changed);
  apply(db,{identity:{...identity,updatedAt:"T1",actor:"admin"},openingHoursText:"stale"});
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=1").get().hours_text,changed);
  // Omission is not an instruction to clear hours.
  apply(db,{identity:{...identity,updatedAt:"T2",actor:"partner:owner-1"}});
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=1").get().hours_text,changed);
  // Explicit empty edit is a deletion; never restore old Admin or Notion text.
  apply(db,{identity:{...identity,updatedAt:"T2",actor:"partner:owner-1"},openingHoursText:""});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_opening_hours WHERE profile_id=1").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_opening_hours WHERE profile_id=2").get().n,0);
 }finally{db.close();}
});

test("Partner direct gallery and hours project together, including explicit [] clears",()=>{
 const db=fixture();
 try{
  const identity={kind:"id",profileId:1,updatedAt:"T1",actor:"admin"};
  apply(db,{identity,galleryUrls:["/media/directory/a.webp"],openingHoursText:"Po–Pi 8:00"});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_media WHERE profile_id=1").get().n,1);
  db.prepare("UPDATE directory_profiles SET updated_at=?,updated_by=? WHERE id=1")
    .run("T2","partner:owner-1");
  const partnerIdentity={...identity,updatedAt:"T2",actor:"partner:owner-1"};
  apply(db,{identity:partnerIdentity,galleryUrls:[
    "/media/directory/new.webp","/media/directory/another.webp",
  ],openingHoursText:"Po–Pi na objednávku"});
  assert.deepEqual(db.prepare("SELECT image_url FROM directory_profile_media WHERE profile_id=1 ORDER BY item_order").all().map(x=>x.image_url),[
    "/media/directory/new.webp","/media/directory/another.webp",
  ]);
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=1").get().hours_text,"Po–Pi na objednávku");
  // Partner edits unrelated fields; gallery and hours remain unchanged.
  apply(db,{identity:partnerIdentity,qualifications:["New certificate"]});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_media WHERE profile_id=1").get().n,2);
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=1").get().hours_text,"Po–Pi na objednávku");
  // Explicit gallery clear does not clear hours.
  apply(db,{identity:partnerIdentity,galleryUrls:[]});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_media WHERE profile_id=1").get().n,0);
  assert.equal(db.prepare("SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=1").get().hours_text,"Po–Pi na objednávku");
  // Neither other profile nor a stale write may gain/lose media.
  apply(db,{identity:{...partnerIdentity,updatedAt:"stale"},galleryUrls:["/media/directory/stale.webp"]});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_media").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_opening_hours WHERE profile_id=2").get().n,0);
 }finally{db.close();}
});
