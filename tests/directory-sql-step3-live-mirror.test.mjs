import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { planDirectoryStep3PresentationSqlMirror } from "../lib/directory-sql-step3-live-mirror.ts";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles ("+
    "id INTEGER PRIMARY KEY,category TEXT,slug TEXT,status TEXT NOT NULL,"+
    "updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,UNIQUE(category,slug))");
  const script = readFileSync(new URL(
    "../db/isolated/directory_admin_sql_completion.sql",import.meta.url),"utf8");
  for(const chunk of script.split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean))
    db.exec(chunk);
  db.prepare("INSERT INTO directory_profiles VALUES (1,'veterinari','prvy','published','T1','admin')").run();
  db.prepare("INSERT INTO directory_profiles VALUES (2,'veterinari','druhy','published','T1','admin')").run();
  return db;
}
function apply(db,options) {
  const statements=planDirectoryStep3PresentationSqlMirror(options);
  for(const s of statements)db.prepare(s.sql).run(...s.bindings);
  return statements.length;
}
const id=(updatedAt="T1",actor="admin")=>({kind:"id",profileId:1,updatedAt,actor});
const settings={mode:"crop",x:40,y:25,zoom:1.4};

test("SQL sidecars save ordered services, including multiline and quoted text, without touching another profile",()=>{
  const db=setup();
  try{
    const services=["Ošetrenie","Text \"v úvodzovkách\"\nDruhý riadok","Čistenie"];
    apply(db,{identity:id(),services});
    assert.deepEqual(db.prepare("SELECT service_text FROM directory_profile_service_texts WHERE profile_id=1 ORDER BY item_order").all().map(r=>r.service_text),services);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_service_texts WHERE profile_id=2").get().n,0);
  } finally {db.close();}
});

test("Edit saves new services and thumbnail without deleting an untouched detail override",()=>{
 const db=setup();
 try{
  apply(db,{identity:id(),services:["Pôvodná"],thumbnailImageDisplay:settings,
    detailImageDisplay:{mode:"natural",x:50,y:60,zoom:1}});
  db.exec("UPDATE directory_profiles SET updated_at='T2' WHERE id=1");
  apply(db,{identity:id("T2"),services:["Nová"],thumbnailImageDisplay:{mode:"blur",x:15,y:20,zoom:2}});
  assert.deepEqual(db.prepare("SELECT service_text FROM directory_profile_service_texts WHERE profile_id=1 ORDER BY item_order").all().map(r=>r.service_text),["Nová"]);
  assert.equal(db.prepare("SELECT display_mode FROM directory_profile_image_display_settings WHERE profile_id=1 AND display_context='thumbnail'").get().display_mode,"blur");
  assert.equal(db.prepare("SELECT display_mode FROM directory_profile_image_display_settings WHERE profile_id=1 AND display_context='detail'").get().display_mode,"natural");
 }finally{db.close();}
});

test("Explicit empty service list and null image settings delete only requested values",()=>{
 const db=setup();
 try{
  apply(db,{identity:id(),services:["One"],thumbnailImageDisplay:settings});
  apply(db,{identity:id(),services:[]});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_service_texts WHERE profile_id=1").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_image_display_settings WHERE profile_id=1").get().n,1);
  apply(db,{identity:id(),thumbnailImageDisplay:null});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_image_display_settings WHERE profile_id=1").get().n,0);
  assert.equal(apply(db,{identity:id()}),0);
 }finally{db.close();}
});

test("Outdated actor/revision and different profile cannot modify established sidecars",()=>{
 const db=setup();
 try{
  apply(db,{identity:id(),services:["Current"],thumbnailImageDisplay:settings});
  apply(db,{identity:id("T0"),services:[],thumbnailImageDisplay:null});
  apply(db,{identity:id("T1","notion"),services:[],thumbnailImageDisplay:null});
  apply(db,{identity:{kind:"id",profileId:999,updatedAt:"T1",actor:"admin"},
    services:["Orphan"],thumbnailImageDisplay:settings});
  assert.equal(db.prepare("SELECT service_text FROM directory_profile_service_texts WHERE profile_id=1").get().service_text,"Current");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_image_display_settings WHERE profile_id=1").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_service_texts WHERE profile_id=2").get().n,0);
 }finally{db.close();}
});

test("New profile creation uses category + slug and exact timestamp/actor",()=>{
 const db=setup();
 try{
  apply(db,{identity:{kind:"category-slug",category:"veterinari",slug:"druhy",updatedAt:"T1",actor:"admin"},
    services:["Vstupná prehliadka"],detailImageDisplay:{mode:"natural",x:50,y:50,zoom:1}});
  assert.equal(db.prepare("SELECT service_text FROM directory_profile_service_texts WHERE profile_id=2").get().service_text,"Vstupná prehliadka");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_service_texts WHERE profile_id=1").get().n,0);
 } finally{db.close();}
});

test("Invalid image parameters and empty service text fail closed",()=>{
 const identity=id();
 assert.throws(()=>planDirectoryStep3PresentationSqlMirror({identity,services:[""]}),/INVALID_SERVICES/);
 assert.throws(()=>planDirectoryStep3PresentationSqlMirror({
   identity,thumbnailImageDisplay:{mode:"natural",x:50,y:50,zoom:1}}),/INVALID_IMAGE_DISPLAY/);
 assert.throws(()=>planDirectoryStep3PresentationSqlMirror({
   identity,detailImageDisplay:{mode:"crop",x:50,y:50,zoom:3}}),/INVALID_IMAGE_DISPLAY/);
});

test("Canonical Admin + Notion editor writer atomically mirrors only explicit changed fields",()=>{
 const source=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
 assert.match(source,/planDirectoryStep3PresentationSqlMirror/);
 assert.match(source,/services: payload.services !== undefined \? normalizedForMirrors.services : undefined/);
 assert.match(source,/const imageChanged = payload.imageUrl !== undefined/);
 assert.match(source,/if \(payload.additionalCategories !== undefined \|\| editorialMirror.length > 0 \|\| presentationMirror.length > 0\)/);
 const occurrences=(source.match(/\.\.\.presentationMirror\.map\(item => database\.prepare\(item\.sql\)\.bind\(\.\.\.item\.bindings\)\)/g)||[]).length;
 assert.equal(occurrences,3,"both INSERT branches and UPDATE must batch canonical and sidecar writes");
});
