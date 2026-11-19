import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  planDirectory0170FactSqlMirror, planDirectory0170FilterSqlMirror,
} from "../lib/directory-0170-editorial-sql-mirror.ts";
import { planDirectorySecondaryCategorySqlMirror } from "../lib/directory-secondary-category-sql.ts";
import { planDirectory0173EditorialSqlMirror } from "../lib/directory-0173-editorial-sql-mirror.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url),"utf8");
const T1="2026-11-19T20:00:00.000Z",T2="2026-11-19T20:01:00.000Z",T3="2026-11-19T20:02:00.000Z";
const GUARD={
  sql:"SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('CAS_CONFLICT', char(36)) END AS cas_ok",
  bindings:[],
};
function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY, category TEXT NOT NULL, slug TEXT NOT NULL,
    status TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
    source_data_json TEXT NOT NULL, qualifications_json TEXT NOT NULL,
    seo_json TEXT NOT NULL
  )`);
  for (const name of [
    "drizzle/0170_directory_canonical_sql_slots.sql",
    "drizzle/0173_directory_structured_sql_foundation.sql",
  ]) for (const statement of read(name).split("--> statement-breakpoint")) {
    const sql=statement.replace(/^\s*(?:--[^\n]*\n\s*)+/g,"").trim();
    if(sql)db.exec(sql);
  }
  db.prepare("INSERT INTO directory_profiles (id,category,slug,status,updated_at,updated_by,source_data_json,qualifications_json,seo_json) VALUES (1,'veterinari','vet','published',?,'admin','{}','[]','{}')").run(T1);
  db.prepare("INSERT INTO directory_profiles (id,category,slug,status,updated_at,updated_by,source_data_json,qualifications_json,seo_json) VALUES (2,'veterinari','vet2','published',?,'admin','{}','[]','{}')").run(T1);
  return db;
}
function simulatePartnerSave(db,{previous,next,source,actor="partner:owner",extra=[],filters=null,additionalCategories,openingHours,galleryUrls}){
  const p={profileId:1,category:"veterinari",updatedAt:next,actor};
  const mirror=[];
  if(filters)mirror.push(planDirectory0170FilterSqlMirror({...p,values:filters}));
  if(additionalCategories!==undefined)mirror.push(planDirectorySecondaryCategorySqlMirror({
    profileId:1,primaryCategory:"veterinari",
    submitted:additionalCategories,updatedAt:next,actor,
  }));
  if(openingHours!==undefined)mirror.push(planDirectory0170FactSqlMirror({
    ...p,field:"Ordinačné hodiny",value:openingHours,
  }));
  const editorial=planDirectory0173EditorialSqlMirror({
    identity:{kind:"id",profileId:1,updatedAt:next,actor},
    ...(openingHours!==undefined?{openingHoursText:openingHours}:{}),
    ...(galleryUrls!==undefined?{galleryUrls}:{}),
  });
  const statements=[
    GUARD,
    ...mirror.flatMap(plan=>plan.slice(1)),
    ...editorial,
  ];
  db.exec("BEGIN");
  try{
    const statement=db.prepare("UPDATE directory_profiles SET source_data_json=?,updated_at=?,updated_by=? WHERE id=1 AND updated_at=? RETURNING id");
    statement.get(JSON.stringify(source),next,actor,previous);
    for(const item of statements){
      if(item.sql.startsWith("SELECT"))db.prepare(item.sql).get(...item.bindings);
      else db.prepare(item.sql).run(...item.bindings);
    }
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
}
const values=(db,table,column)=>db.prepare("SELECT "+column+" FROM "+table+" WHERE profile_id=1 ORDER BY "+column).all().map(row=>row[column]);

test("partner SQL 0170+0173 follows exactly one canonical CAS, then keeps all projections aligned",()=>{
  const db=fixture();
  try {
    const source={
      Ordinačné_hodiny:"ignored",
      _psipedia_additional_categories:JSON.stringify(["treneri"]),
      _psipedia_additional_categories_sql_confirmed:"1",
      _psipedia_filter_v1_veterinari_emergency:"yes",
      "Ordinačné hodiny":"Po–Pi: podľa dohody",
    };
    simulatePartnerSave(db,{previous:T1,next:T2,source,
      filters:{"veterinari.emergency":"yes"},
      additionalCategories:["treneri"],
      openingHours:"Po–Pi: podľa dohody",
      galleryUrls:["/media/directory/gallery.webp"]});
    assert.deepEqual(values(db,"directory_profile_additional_categories","category"),["treneri"]);
    assert.deepEqual(values(db,"directory_profile_filter_values","value_text"),["yes"]);
    assert.deepEqual(values(db,"directory_profile_public_facts","value_text"),["Po–Pi: podľa dohody"]);
    assert.deepEqual(values(db,"directory_profile_opening_hours","hours_text"),["Po–Pi: podľa dohody"]);
    assert.deepEqual(values(db,"directory_profile_media","image_url"),["/media/directory/gallery.webp"]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_media WHERE profile_id=2").get().n,0);
  }finally{db.close();}
});
test("explicit clears remove only selected partner facets, gallery, hours and membership",()=>{
  const db=fixture();
  try{
    const prior={
      _psipedia_additional_categories:JSON.stringify(["treneri"]),
      _psipedia_additional_categories_sql_confirmed:"1",
      "Ordinačné hodiny":"Pôvodné hodiny",
    };
    simulatePartnerSave(db,{previous:T1,next:T2,source:prior,
      filters:{"veterinari.emergency":"yes","veterinari.home_visits":"no"},
      additionalCategories:["treneri"],openingHours:"Pôvodné hodiny",
      galleryUrls:["/media/directory/first.webp"]});
    const cleared={
      _psipedia_additional_categories:JSON.stringify([]),
      _psipedia_additional_categories_sql_confirmed:"1",
      "Ordinačné hodiny":"",
    };
    simulatePartnerSave(db,{previous:T2,next:T3,source:cleared,
      filters:{"veterinari.emergency":null},additionalCategories:[],
      openingHours:"",galleryUrls:[]});
    assert.deepEqual(values(db,"directory_profile_additional_categories","category"),[]);
    assert.deepEqual(values(db,"directory_profile_filter_values","value_text"),["no"]);
    assert.deepEqual(values(db,"directory_profile_public_facts","value_text"),[""]);
    assert.deepEqual(values(db,"directory_profile_opening_hours","hours_text"),[]);
    assert.deepEqual(values(db,"directory_profile_media","image_url"),[]);
    assert.equal(db.prepare("SELECT source_data_json FROM directory_profiles WHERE id=1").get().source_data_json,JSON.stringify(cleared));
  }finally{db.close();}
});
test("stale partner CAS rolls back every 0170 and 0173 SQL mutation",()=>{
  const db=fixture();
  try{
    const source={_psipedia_additional_categories:JSON.stringify(["treneri"])};
    assert.throws(()=>simulatePartnerSave(db,{
      previous:"2026-11-17T00:00:00Z",next:T2,source,
      filters:{"veterinari.emergency":"yes"},
      additionalCategories:["treneri"],openingHours:"bad",galleryUrls:["/media/directory/stale.webp"],
    }),/malformed JSON/);
    for (const table of [
      "directory_profile_additional_categories","directory_profile_filter_values",
      "directory_profile_public_facts","directory_profile_opening_hours","directory_profile_media",
    ]) assert.equal(db.prepare("SELECT COUNT(*) n FROM "+table).get().n,0,table);
    assert.equal(db.prepare("SELECT updated_at FROM directory_profiles WHERE id=1").get().updated_at,T1);
  }finally{db.close();}
});
test("both owner and moderated partner writers use same SQL projections, not a separate JSON owner",()=>{
  const owner=read("lib/partner-direct-profile.ts");
  const moderated=read("lib/partner-profile-changes-admin.ts");
  const canonical=read("lib/partner-profile-changes.ts");
  for(const src of [owner,moderated]) {
    for(const functionName of [
      "planDirectory0170FilterSqlMirror","planDirectorySecondaryCategorySqlMirror",
      "planDirectory0170FactSqlMirror","planDirectory0173EditorialSqlMirror",
    ])assert(src.includes(functionName),functionName);
    assert.match(src,/galleryUrls:effectivePatch\.galleryUrls as readonly string\[\]/);
    assert.match(src,/openingHoursText:String\(effectivePatch\.openingHours\?\?""\)/);
    assert.match(src,/const guard=plans\.length\?plans\[0\]\[0\]:\{/);
    assert.match(src,/plan\.slice\(1\)/);
  }
  assert.match(canonical,/source\[DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY\] = "1"/);
  assert.match(owner,/database\.batch\(\[/);
  assert.match(moderated,/applyAtomicModerationTransition/);
});
