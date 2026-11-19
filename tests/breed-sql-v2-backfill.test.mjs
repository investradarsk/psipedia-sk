import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  BREED_V2_COUNTS,BREED_V2_BACKFILL_STATEMENTS,BREED_V2_PREFLIGHT_SQL,
  BREED_V2_REQUIRED_COLUMNS,BREED_V2_EXPECTED_MIGRATED_COLUMNS,
  assertBreedSqlV2BackfillPreflight,
} from "../lib/breed-sql-v2-backfill.mjs";

const migration=readFileSync(
  new URL("../pending-migrations/0174_breeds_sql_json_foundation.sql",import.meta.url),"utf8");
const extraIds=[5,13,14];

function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`CREATE TABLE managed_breeds (
    id INTEGER PRIMARY KEY,slug TEXT UNIQUE NOT NULL,status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    fci_standard_json TEXT, editorial_json TEXT,seo_json TEXT,related_breeds_json TEXT
  )`);
  db.exec(`CREATE TABLE breed_notion_workcopy_links (
    breed_id INTEGER PRIMARY KEY NOT NULL REFERENCES managed_breeds(id),
    status TEXT NOT NULL,work_notion_page_id TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE breed_notion_controlled_values (
    breed_id INTEGER PRIMARY KEY NOT NULL REFERENCES managed_breeds(id),
    values_json TEXT NOT NULL,notion_values_json TEXT NOT NULL,revision INTEGER NOT NULL
  )`);
  const ins=db.prepare("INSERT INTO managed_breeds VALUES (?,?,?,?,?,?,?,?)");
  for(let id=1;id<=347;id++){
    const fci=id===1?JSON.stringify({
      celkovy_vzhlad:"Detailný odborný opis",
      fci_standard_pdf:"https://example.invalid/standard.pdf",
    }):"{}";
    const ed=id===2?JSON.stringify({
      overview:"Podrobný opis plemena",
      coatCare:"",heroTraits:[{label:"Ostražitosť",rating:5}],
      exerciseTip:"Starý tip, nesmie sa vymazať",
    }):"{}";
    const seo=id===1?JSON.stringify({
      title:"O plemene",ogImage:"/media/breeds/profile.webp",noindex:false,
      canonicalUrl:"https://psipedia.sk/plemena/8/breed-1",
    }):id===2?'{"noindex":true}':"{}";
    const related=id===1?"[2,3,4,6]":id===2?"[1,3]":"[]";
    ins.run(id,"breed-"+id,id<=344?"published":"draft",
      "2026-11-19T10:00:00.000Z",fci,ed,seo,related);
  }
  const insLink=db.prepare("INSERT INTO breed_notion_workcopy_links VALUES (?,?,?)");
  const insControl=db.prepare("INSERT INTO breed_notion_controlled_values VALUES (?,?,?,?)");
  for(let id=1;id<=347;id++) {
    if(extraIds.includes(id))continue;
    insLink.run(id,"ACTIVE","notion-page-"+id);
    const values=id===1?{
      originCountries:["Slovensko","Česko"],heightMinCm:54.5,heightMaxCm:61,
      weightMinKg:25,weightMaxKg:33,
      coatTypes:["Krátka"],useTypes:["Pracovný"],
      lifespanMinYears:10,lifespanMaxYears:14,
    }:{originCountries:[],heightMinCm:null,heightMaxCm:null,
      coatTypes:[],useTypes:[],weightMinKg:null,weightMaxKg:null,
      lifespanMinYears:null,lifespanMaxYears:null};
    const json=JSON.stringify(values);
    insControl.run(id,json,json,0);
  }
  db.exec(migration);
  return db;
}

function report(db){
 const schema=Object.fromEntries(Object.keys(BREED_V2_REQUIRED_COLUMNS).map(table=>[
   table,db.prepare("SELECT name FROM pragma_table_info('"+table+"')").all().map(x=>x.name)
 ]));
 const query=name=>db.prepare(BREED_V2_PREFLIGHT_SQL[name]).all();
 const report={schema};
 for(const key of ["base","links","extras","controlled","orphanControlled","destination","invalidEdges","duplicateEdges","invalidFieldTypes"])
   report[key]=key==="extras"?query(key):query(key)[0];
 return report;
}

test("fail closed unless 347 exact D1 rows, 344 matching ACTIVE links and all 344 clean Notion sidecars",()=>{
 const db=fixture();
 try{
   const pre=report(db);
   assert.deepEqual(assertBreedSqlV2BackfillPreflight(pre),{
     ready:true,breedRows:347,activeNotionLinks:344,
     untouchedUnlinkedBreedIds:[5,13,14],statementCount:5,
   });
   assert.equal(BREED_V2_COUNTS.breeds,347);
   assert.equal(BREED_V2_COUNTS.activeNotionLinks,344);
   assert.deepEqual(BREED_V2_EXPECTED_MIGRATED_COLUMNS,
     {fci:33,editorial:6,seo:8,controlled:9,related:3});
   const altered=structuredClone(pre);
   altered.links.active_count=343;
   assert.throws(()=>assertBreedSqlV2BackfillPreflight(altered),/NOTION_ACTIVE_LINKS/);
   const altered2=structuredClone(pre);
   altered2.extras=[{id:13},{id:14},{id:222}];
   assert.throws(()=>assertBreedSqlV2BackfillPreflight(altered2),/UNLINKED_IDENTITIES/);
   const altered3=structuredClone(pre);
   altered3.controlled.sidecar_count=343;
   assert.throws(()=>assertBreedSqlV2BackfillPreflight(altered3),/CONTROLLED_VALUES_INCOMPLETE/);
   const altered4=structuredClone(pre);
   altered4.controlled.pending_sync=1;
   assert.throws(()=>assertBreedSqlV2BackfillPreflight(altered4),/NOTION_PENDING_SYNC/);
 }finally{db.close()}
});

test("five additive backfill statements copy ALL live JSON and controlled facts without losing old fields",()=>{
 const db=fixture();
 try{
   const before=db.prepare("SELECT * FROM managed_breeds ORDER BY id").all();
   for(const statement of BREED_V2_BACKFILL_STATEMENTS)db.exec(statement);
   const after=db.prepare("SELECT * FROM managed_breeds ORDER BY id").all();
   assert.equal(after.length,347);
   const legacyKeys=[
     "id","slug","status","updated_at","fci_standard_json",
     "editorial_json","seo_json","related_breeds_json",
   ];
   for(let i=0;i<before.length;i++){
     for(const key of legacyKeys)
       assert.equal(after[i][key],before[i][key],
         "Original value changed for breed "+before[i].id+":"+key);
   }
   assert.equal(db.prepare("SELECT COUNT(*) n FROM breed_fci_standard").get().n,347);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM breed_editorial_text").get().n,347);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM breed_public_facts").get().n,344);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM breed_related_breeds").get().n,6);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM managed_breeds").get().n,347);
   const seo=db.prepare("SELECT seo_title,seo_noindex,seo_og_image,seo_canonical_url FROM managed_breeds WHERE id=1").get();
   assert.deepEqual(seo,{
     seo_title:"O plemene",seo_noindex:0,seo_og_image:"/media/breeds/profile.webp",
     seo_canonical_url:"https://psipedia.sk/plemena/8/breed-1",
   });
   assert.equal(db.prepare("SELECT seo_noindex FROM managed_breeds WHERE id=2").get().seo_noindex,1);
   assert.equal(db.prepare("SELECT seo_noindex FROM managed_breeds WHERE id=3").get().seo_noindex,null);
   const fci=db.prepare("SELECT fci_celkovy_vzhlad,fci_fci_standard_pdf FROM breed_fci_standard WHERE breed_id=1").get();
   assert.deepEqual(fci,{
     fci_celkovy_vzhlad:"Detailný odborný opis",
     fci_fci_standard_pdf:"https://example.invalid/standard.pdf",
   });
   const facts=db.prepare("SELECT * FROM breed_public_facts WHERE breed_id=1").get();
   assert.equal(facts.height_min_cm,54.5);
   assert.equal(facts.height_max_cm,61);
   assert.deepEqual(JSON.parse(facts.origin_countries_json),["Slovensko","Česko"]);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM breed_public_facts WHERE breed_id IN (5,13,14)").get().n,0);
   const editorial=db.prepare("SELECT overview,coat_care FROM breed_editorial_text WHERE breed_id=2").get();
   assert.deepEqual(editorial,{overview:"Podrobný opis plemena",coat_care:""});
   assert.deepEqual(db.prepare("SELECT related_breed_id FROM breed_related_breeds WHERE breed_id=1 ORDER BY position").all().map(x=>x.related_breed_id),
     [2,3,4,6]);
   assert.equal(db.prepare("SELECT updated_at FROM managed_breeds WHERE id=1").get().updated_at,
     "2026-11-19T10:00:00.000Z");
   assert.equal(db.prepare("SELECT json_extract(editorial_json,'$.exerciseTip') AS tip FROM managed_breeds WHERE id=2").get().tip,
     "Starý tip, nesmie sa vymazať");
   assert.equal(db.prepare("SELECT COUNT(*) n FROM breed_notion_workcopy_links").get().n,344);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM breed_notion_controlled_values").get().n,344);
   assert.throws(()=>assertBreedSqlV2BackfillPreflight(report(db)),/DESTINATION_NONEMPTY/);
   for(const statement of BREED_V2_BACKFILL_STATEMENTS)db.exec(statement);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM breed_related_breeds").get().n,6);
   assert.equal(db.prepare("SELECT seo_og_image FROM managed_breeds WHERE id=1").get().seo_og_image,"/media/breeds/profile.webp");
 }finally{db.close()}
});

test("original Notion revision, identity and old JSON are never updated by backfill SQL",()=>{
 const all=BREED_V2_BACKFILL_STATEMENTS.join("\n");
 assert.equal(BREED_V2_BACKFILL_STATEMENTS.length,5);
 assert.match(all,/INSERT OR IGNORE INTO breed_public_facts/);
 assert.match(all,/INSERT OR IGNORE INTO breed_related_breeds/);
 assert.match(all,/UPDATE managed_breeds SET/);
 assert.doesNotMatch(all,/\b(?:DELETE|DROP|ALTER|REPLACE|CREATE TRIGGER)\b/i);
 assert.doesNotMatch(all,/UPDATE\s+breed_notion_/i);
 assert.doesNotMatch(all,/SET\s+updated_at/i);
 assert.doesNotMatch(all,/SET\s+(?:fci_standard_json|editorial_json|seo_json|related_breeds_json)\b/i);
 assert.match(all,/seo_og_image/);
 for(const name of ["breed_fci_standard","breed_editorial_text","breed_public_facts","breed_related_breeds"])
   assert.ok(all.includes(name));
});

test("preflight denies invalid, self, duplicate relations and old wrong types before ANY copy",()=>{
 const db=fixture();
 try{
   db.prepare("UPDATE managed_breeds SET related_breeds_json=? WHERE id=1").run("[1,2,2]");
   const state=report(db);
   assert.ok(state.invalidEdges.invalid_edges>0);
   assert.ok(state.duplicateEdges.duplicate_edges>0);
   assert.throws(()=>assertBreedSqlV2BackfillPreflight(state),/BROKEN_RELATIONS/);
   db.prepare("UPDATE managed_breeds SET related_breeds_json=? WHERE id=1").run("[2,3]");
   db.prepare("UPDATE managed_breeds SET seo_json=? WHERE id=1").run('{"noindex":"yes"}');
   const state2=report(db);
   assert.ok(state2.invalidFieldTypes.invalid_types>0);
   assert.throws(()=>assertBreedSqlV2BackfillPreflight(state2),/BAD_TYPES/);
 }finally{db.close()}
});
