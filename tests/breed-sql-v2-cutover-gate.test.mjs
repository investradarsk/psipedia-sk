import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {
  BREED_SQL_V2_CUTOVER_AUDIT_SQL,
  BREED_SQL_V2_READ_PATHS,BREED_SQL_V2_WRITE_PATHS,
  assessBreedSqlV2Cutover,
} from "../lib/breed-sql-v2-cutover-gate.mjs";

test("Notion's 3 scalar selects have visible conflicts; blank select never overwrites D1",()=>{
 const db=new DatabaseSync(":memory:");
 try{
   db.exec(`CREATE TABLE managed_breeds
    (id INTEGER PRIMARY KEY,fci_group INTEGER,fci_section_number TEXT,size TEXT);
    CREATE TABLE breed_notion_workcopy_links
    (breed_id INTEGER,status TEXT);
    CREATE TABLE breed_notion_controlled_values
    (breed_id INTEGER,values_json TEXT)`);
   const b=db.prepare("INSERT INTO managed_breeds VALUES(?,?,?,?)");
   const l=db.prepare("INSERT INTO breed_notion_workcopy_links VALUES(?,'ACTIVE')");
   const v=db.prepare("INSERT INTO breed_notion_controlled_values VALUES(?,?)");
   b.run(1,8,"1","Stredné");l.run(1);
   v.run(1,JSON.stringify({fciGroupSelect:"8",fciSectionSelect:"1",sizeSelect:"Stredné"}));
   b.run(2,3,"2","Veľké");l.run(2);
   v.run(2,JSON.stringify({fciGroupSelect:"4",fciSectionSelect:"1",sizeSelect:"Malé"}));
   b.run(3,1,"1","Obrie");l.run(3);
   v.run(3,JSON.stringify({fciGroupSelect:null,fciSectionSelect:null,sizeSelect:null}));
   const p=db.prepare(BREED_SQL_V2_CUTOVER_AUDIT_SQL.scalarParity).get();
   assert.equal(p.linked_mirrors,3);
   assert.equal(p.fci_group_conflicts,1);
   assert.equal(p.fci_section_conflicts,1);
   assert.equal(p.size_conflicts,1);
   assert.equal(p.fci_group_not_selected,1);
   assert.equal(p.fci_section_not_selected,1);
   assert.equal(p.size_not_selected,1);
   const original=db.prepare("SELECT * FROM managed_breeds WHERE id=2").get();
   assert.deepEqual({...original},{id:2,fci_group:3,fci_section_number:"2",size:"Veľké"});
 }finally{db.close()}
});

const evidence=()=>({
 migration0174Applied:true,backfillPostflightVerified:true,
 liveNotionParityVerified:true,publicIndexParityVerified:true,
 completeRows:{breeds:347,fci:347,editorial:347,facts:344,linked_mirrors:344,related_edges:6},
 scalarParity:{linked_mirrors:344,fci_group_conflicts:0,fci_section_conflicts:0,size_conflicts:0},
 postflightMismatches:{fci:0,editorial:0,seo:0,facts:0,relations:0,extraRelations:0},
 readCoverage:Object.fromEntries(BREED_SQL_V2_READ_PATHS.map(x=>[x,true])),
 writeCoverage:Object.fromEntries(BREED_SQL_V2_WRITE_PATHS.map(x=>[x,true])),
});

test("Cautious 6/6 cutover refuses missing writer or public reader evidence",()=>{
 const empty=assessBreedSqlV2Cutover({});
 assert.equal(empty.ready,false);
 assert.ok(empty.blockers.includes("migration-0174-not-applied"));
 assert.ok(empty.blockers.some(x=>x.startsWith("writer-unverified")));
 const e=evidence();delete e.writeCoverage.notionBreedControlled12Fields;
 const result=assessBreedSqlV2Cutover(e);
 assert.equal(result.ready,false);
 assert.ok(result.blockers.includes("writer-unverified:notionBreedControlled12Fields"));
});

test("Notion scalar conflict, SEO mismatch and absent live Notion proof block cutover",()=>{
 const e=evidence();
 e.scalarParity.size_conflicts=2;
 e.postflightMismatches.seo=1;
 e.liveNotionParityVerified=false;
 const r=assessBreedSqlV2Cutover(e);
 assert.equal(r.ready,false);
 assert.deepEqual(r.blockers,[
   "live-notion-parity-unverified",
   "controlled-3-scalar-parity-not-verified",
   "legacy-to-sql-cell-parity-not-verified",
 ]);
});

test("All 347/344 and every route required; never authorize JSON deletion here",()=>{
 const e=evidence();
 const r=assessBreedSqlV2Cutover(e);
 assert.equal(r.ready,true);
 assert.deepEqual(r.blockers,[]);
 assert.equal(r.deleteLegacyAllowed,false);
 e.completeRows.facts=343;
 assert.equal(assessBreedSqlV2Cutover(e).ready,false);
});
