import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  DIRECTORY_0173_DETAIL_READ_SQL,
  parseDirectory0173SqlProjection,
  readDirectory0173EditorialSql,
} from "../lib/directory-0173-editorial-sql-read.ts";

function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec([
    "CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,source_data_json TEXT NOT NULL)",
    "CREATE TABLE directory_profile_additional_categories(profile_id INTEGER,category TEXT)",
    "CREATE TABLE directory_profile_review_state(profile_id INTEGER,reviewed_at TEXT,reviewed_by TEXT,unlock_pending INTEGER)",
    "CREATE TABLE directory_profile_qualifications(profile_id INTEGER,item_order INTEGER,qualification_text TEXT)",
    "CREATE TABLE directory_profile_seo(profile_id INTEGER,title TEXT,description TEXT,focus_keyword TEXT,canonical_url TEXT,og_title TEXT,og_description TEXT,og_image_url TEXT,noindex INTEGER)",
    "CREATE TABLE directory_profile_opening_hours(profile_id INTEGER,day_of_week INTEGER,hours_text TEXT)",
    "CREATE TABLE directory_profile_quality_resolutions(profile_id INTEGER,quality_field TEXT,resolution_status TEXT,checked_at TEXT)",
    "CREATE TABLE directory_profile_media(profile_id INTEGER,item_order INTEGER,image_url TEXT,image_key TEXT)",
  ].join(";")+";");
  const d1={
    prepare(sql){
      return {bind(id){return {first(){return sqlite.prepare(sql).get(id)}}}};
    },
  };
  return {sqlite,d1};
}
test("read model is SELECT-only and indexes every sidecar by bound profile ID",()=>{
  assert.match(DIRECTORY_0173_DETAIL_READ_SQL,/^SELECT /);
  assert.doesNotMatch(DIRECTORY_0173_DETAIL_READ_SQL,/\b(?:INSERT|UPDATE|DELETE|DROP)\b/i);
  for(const table of ["directory_profile_seo","directory_profile_qualifications",
    "directory_profile_opening_hours","directory_profile_quality_resolutions",
    "directory_profile_media"]){
    assert(DIRECTORY_0173_DETAIL_READ_SQL.includes(table),table);
  }
  assert.match(DIRECTORY_0173_DETAIL_READ_SQL,/profile_id=\?1/g);
});
test("SQL qualifications are ordered and SEO preserves explicit noindex true",async()=>{
  const {sqlite,d1}=fixture();
  sqlite.exec("INSERT INTO directory_profile_qualifications VALUES(7,1,'Druhá kvalifikácia'),(7,0,'Prvá kvalifikácia'),(11,0,'Cudzí profil')");
  sqlite.exec("INSERT INTO directory_profile_seo VALUES(7,'Nový názov','Popis','pes','https://example.sk/','OG','OG popis','https://example.sk/og.jpg',1)");
  sqlite.exec("INSERT INTO directory_profile_opening_hours VALUES(7,0,'Po – Pi: 08:00–16:00'),(7,1,'08:00-12:00')");
  sqlite.exec("INSERT INTO directory_profile_quality_resolutions VALUES(7,'phone','NOT_PUBLIC','2026-11-20')");
  sqlite.exec("INSERT INTO directory_profile_media VALUES(7,1,'https://example.sk/b.jpg',NULL),(7,0,'https://example.sk/a.jpg',NULL)");
  const p=await readDirectory0173EditorialSql(d1,7);
  assert.deepEqual(p.qualifications,["Prvá kvalifikácia","Druhá kvalifikácia"]);
  assert.equal(p.seo.title,"Nový názov");
  assert.equal(p.seo.noindex,true);
  assert.equal(p.hoursText,"Po – Pi: 08:00–16:00");
  assert.deepEqual(p.quality,[{field:"phone",status:"NOT_PUBLIC",checkedAt:"2026-11-20"}]);
  assert.deepEqual(p.galleryUrls,["https://example.sk/a.jpg","https://example.sk/b.jpg"]);
  assert.equal((await readDirectory0173EditorialSql(d1,11)).seo,null);
});
test("explicit noindex false is read from SQL, not an old seo_json",async()=>{
  const {sqlite,d1}=fixture();
  sqlite.exec("INSERT INTO directory_profile_seo VALUES(9,'','', '', '', '', '', '',0)");
  const p=await readDirectory0173EditorialSql(d1,9);
  assert.equal(p.seo.noindex,false);
  assert.equal(p.seo.title,"");
  assert.equal(p.qualifications,null);
  assert.equal(p.hoursText,null);
  assert.deepEqual(p.quality,[]);
  assert.equal(p.galleryUrls,null);
});
test("key-only SQL gallery never erases a legacy R2 image presentation",async()=>{
  const {sqlite,d1}=fixture();
  sqlite.exec("INSERT INTO directory_profile_media VALUES(1,0,NULL,'r2/key.webp')");
  const p=await readDirectory0173EditorialSql(d1,1);
  assert.equal(p.galleryUrls,null);
});
test("corrupt SQL projection fails closed instead of inventing values",()=>{
  const row={qualifications_json:'["ok"]',seo_json:null,hours_text:null,
    quality_json:"[]",media_json:"[]"};
  assert.throws(()=>parseDirectory0173SqlProjection({...row,
    qualifications_json:"[broken]"}),/INVALID_QUALIFICATIONS/);
  assert.throws(()=>parseDirectory0173SqlProjection({...row,
    seo_json:'{"title":"hello","noindex":0}'}),/INVALID_SEO/);
  assert.throws(()=>parseDirectory0173SqlProjection({...row,
    quality_json:'[{"field":"unknown","status":"NOT_PUBLIC","checkedAt":"2026"}]'}),/INVALID_QUALITY/);
});
test("invalid profile IDs are rejected before any D1 query",async()=>{
  const {d1}=fixture();
  await assert.rejects(readDirectory0173EditorialSql(d1,0),/INVALID_ID/);
  await assert.rejects(readDirectory0173EditorialSql(d1,-1),/INVALID_ID/);
});

test("explicit Notion-confirmed SQL categories override old JSON, including []",async()=>{
  const {sqlite,d1}=fixture();
  try{
    const marker=JSON.stringify({_psipedia_additional_categories_sql_confirmed:"1"});
    sqlite.prepare("INSERT INTO directory_profiles VALUES(?,?)").run(10,marker);
    sqlite.prepare("INSERT INTO directory_profiles VALUES(?,?)").run(11,marker);
    sqlite.prepare("INSERT INTO directory_profiles VALUES(?,?)").run(12,"{}");
    sqlite.exec("INSERT INTO directory_profile_additional_categories VALUES(10,'treneri'),(10,'vencenie'),(12,'fyzioterapia')");
    const full=await readDirectory0173EditorialSql(d1,10);
    assert.equal(full.sqlCategoriesConfirmed,true);
    assert.deepEqual(full.additionalCategories,["treneri","vencenie"]);
    const empty=await readDirectory0173EditorialSql(d1,11);
    assert.equal(empty.sqlCategoriesConfirmed,true);
    assert.deepEqual(empty.additionalCategories,[],"confirmed Notion [] is authoritative");
    const unconfirmed=await readDirectory0173EditorialSql(d1,12);
    assert.equal(unconfirmed.sqlCategoriesConfirmed,true,
      "SQL rows remain authoritative without a historical JSON marker");
    assert.deepEqual(unconfirmed.additionalCategories,["fyzioterapia"]);
  }finally{sqlite.close()}
});
test("SQL review state is independently available to Admin",async()=>{
  const {sqlite,d1}=fixture();
  try{
    sqlite.prepare("INSERT INTO directory_profiles VALUES(?,?)").run(17,"{}");
    sqlite.prepare("INSERT INTO directory_profile_review_state VALUES(?,?,?,?)").run(
      17,"2026-11-20T12:00:00Z","owner",0);
    assert.deepEqual((await readDirectory0173EditorialSql(d1,17)).review,{
      reviewedAt:"2026-11-20T12:00:00Z",reviewedBy:"owner",unlockPending:false,
    });
    assert.equal((await readDirectory0173EditorialSql(d1,18)).review,null);
  }finally{sqlite.close()}
});
test("corrupt SQL review/category projections fail closed",()=>{
  const row={categories_confirmed:1,secondary_categories_json:'["treneri"]',
    review_json:JSON.stringify({reviewedAt:"2026",reviewedBy:"owner",unlockPending:0}),
    qualifications_json:"[]",seo_json:null,hours_text:null,quality_json:"[]",media_json:"[]"};
  assert.throws(()=>parseDirectory0173SqlProjection({
    ...row,review_json:'{"reviewedAt":"2026","unlockPending":2}',
  }),/INVALID_REVIEW/);
  assert.throws(()=>parseDirectory0173SqlProjection({
    ...row,secondary_categories_json:'["fake-category"]',
  }),/INVALID_SECONDARY/);
  assert.throws(()=>parseDirectory0173SqlProjection({
    ...row,categories_confirmed:4,
  }),/INVALID_CATEGORY_MARKER/);
});
