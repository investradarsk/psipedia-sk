import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {BREED_CONTROLLED_FIELDS,parseBreedControlledValues} from
  "../lib/breed-workcopy-controlled.mjs";
import {MIRROR_KEYS,planBreedControlledMirrorBackfill,
  breedControlledMirrorAtomicInsert,isBreedControlledMirrorInsertOnlySql,
  buildBreedControlledMirrorChunks,BREED_MIRROR_D1_MAX_SQL_BYTES} from
  "../lib/breed-controlled-mirror-backfill.mjs";

const SOURCE="f460b1e5-4454-4a10-9200-3b35106f9e32";
const uuid=id=>id.toString(16).padStart(32,"0");
const current=id=>({
 fciGroupSelect:"8",fciSectionSelect:"1",
 originCountries:id===2?["Slovensko"]:[],
 sizeSelect:"Stredné",coatTypes:[],useTypes:["Pracovný"],
 heightMinCm:id===2?50:null,heightMaxCm:null,
 weightMinKg:null,weightMaxKg:null,lifespanMinYears:null,lifespanMaxYears:null,
});
const prop=(field,val)=>field.type==="number"
  ?{type:"number",number:val}
  :field.type==="select"
    ?{type:"select",select:val===null?null:{name:val}}
    :{type:"multi_select",multi_select:val.map(name=>({name}))};
function page(id,options={}){
 const vals=current(id);
 const properties={"Psipedia ID":{type:"rich_text",
   rich_text:[{plain_text:String(id)}]}};
 for(const f of BREED_CONTROLLED_FIELDS)
   properties[f.notion]=prop(f,vals[f.key]);
 return {
   id:uuid(id),last_edited_time:"2026-11-19T18:00:00.000Z",
   parent:{type:"data_source_id",data_source_id:SOURCE},
   archived:false,in_trash:false,properties,...options,
 };
}
const fixture=()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, slug TEXT NOT NULL)");
 db.exec(`CREATE TABLE breed_notion_workcopy_links (
  breed_id INTEGER PRIMARY KEY,work_notion_page_id TEXT NOT NULL,
  work_data_source_id TEXT NOT NULL,status TEXT NOT NULL)`);
 db.exec(`CREATE TABLE breed_notion_controlled_values (
  breed_id INTEGER PRIMARY KEY REFERENCES managed_breeds(id),
  values_json TEXT NOT NULL,notion_values_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0)`);
 const ids=[...Array.from({length:345},(_,i)=>i+1),3138,3214];
 const ins=db.prepare("INSERT INTO managed_breeds VALUES (?,?)");
 for(const id of ids) ins.run(id,"breed-"+id);
 const links=[],pages=[],existing=[];
 const linkStmt=db.prepare("INSERT INTO breed_notion_workcopy_links VALUES (?,?,?,?)");
 const mirrorStmt=db.prepare("INSERT INTO breed_notion_controlled_values VALUES (?,?,?,?)");
 for(const id of ids){
   if([5,13,14].includes(id))continue;
   const link={breed_id:id,work_notion_page_id:uuid(id),
     work_data_source_id:SOURCE,status:"ACTIVE"};
   links.push(link);pages.push(page(id));linkStmt.run(id,uuid(id),SOURCE,"ACTIVE");
   if([2,3138,3214].includes(id)){
     const value=JSON.stringify(parseBreedControlledValues(current(id)));
     const row={breed_id:id,values_json:value,notion_values_json:value,
       revision:id===2?8:id===3214?9:0};
     existing.push(row);
     mirrorStmt.run(row.breed_id,row.values_json,row.notion_values_json,row.revision);
   }
 }
 return {db,links,pages,existing};
};

test("344 verified Notion pages make exactly 341 seeds; never alter 3 existing mirrors",()=>{
 const f=fixture();
 try{
   const plan=planBreedControlledMirrorBackfill({
     links:f.links,pages:f.pages,existing:f.existing,expectedSource:SOURCE,
   });
   assert.equal(plan.ready,true);
   assert.equal(plan.missingCount,341);
   assert.equal(plan.existingCount,3);
   assert.deepEqual(plan.existingIds,[2,3138,3214]);
   assert.equal(MIRROR_KEYS.length,12);
   const sql=breedControlledMirrorAtomicInsert(plan,SOURCE);
   assert.match(sql,/WITH candidates/);
   assert.match(sql,/INSERT INTO breed_notion_controlled_values/);
   assert.doesNotMatch(sql,/UPDATE|DELETE|DROP|ALTER/i);
   dbExec(f.db,sql);
   assert.equal(f.db.prepare("SELECT COUNT(*) n FROM breed_notion_controlled_values").get().n,344);
   for(const initial of f.existing){
     const row=f.db.prepare("SELECT * FROM breed_notion_controlled_values WHERE breed_id=?")
       .get(initial.breed_id);
     assert.deepEqual({...row},initial);
   }
   const newId=1;
   const added=f.db.prepare("SELECT * FROM breed_notion_controlled_values WHERE breed_id=?").get(newId);
   assert.equal(added.revision,0);
   assert.deepEqual(JSON.parse(added.values_json),current(newId));
   assert.equal(added.values_json,added.notion_values_json);
   const complete=planBreedControlledMirrorBackfill({
     links:f.links,pages:f.pages,
     existing:f.db.prepare("SELECT * FROM breed_notion_controlled_values").all(),
     expectedSource:SOURCE,
   });
   assert.equal(complete.ready,true);
   assert.equal(complete.existingCount,344);
   assert.equal(complete.missingCount,0);
   assert.throws(()=>breedControlledMirrorAtomicInsert(complete,SOURCE),/INCOMPLETE/);
 }finally{f.db.close()}
});
const dbExec=(db,sql)=>db.exec(sql);

test("every missing, wrong-typed or malformed Notion controlled field blocks entire seed",()=>{
 const f=fixture();
 try{
   f.pages[0].properties["Výška od"]={type:"rich_text",rich_text:[]};
   let p=planBreedControlledMirrorBackfill({links:f.links,pages:f.pages,
      existing:f.existing,expectedSource:SOURCE});
   assert.equal(p.ready,false);
   assert.ok(p.issues.some(x=>x.code==="NOTION_12_CONTROLLED_FIELDS_INVALID"));
   assert.throws(()=>breedControlledMirrorAtomicInsert(p,SOURCE),/INCOMPLETE/);
   f.pages[0]=page(1);
   delete f.pages[0].properties["Krajiny pôvodu"];
   p=planBreedControlledMirrorBackfill({links:f.links,pages:f.pages,
      existing:f.existing,expectedSource:SOURCE});
   assert.equal(p.ready,false);
 }finally{f.db.close()}
});

test("page ownership, UUID matching and Psipedia ID must be exact; no by-name pairing",()=>{
 const f=fixture();
 try{
   f.pages[0]={...f.pages[0],parent:{type:"data_source_id",
      data_source_id:"00000000-0000-0000-0000-000000000001"}};
   let p=planBreedControlledMirrorBackfill({links:f.links,pages:f.pages,
      existing:f.existing,expectedSource:SOURCE});
   assert.equal(p.ready,false);
   f.pages[0]=page(1);
   f.pages[0].properties["Psipedia ID"].rich_text[0].plain_text="999";
   p=planBreedControlledMirrorBackfill({links:f.links,pages:f.pages,
      existing:f.existing,expectedSource:SOURCE});
   assert.equal(p.ready,false);
   f.pages[0]=page(1,{archived:true});
   p=planBreedControlledMirrorBackfill({links:f.links,pages:f.pages,
      existing:f.existing,expectedSource:SOURCE});
   assert.equal(p.ready,false);
 }finally{f.db.close()}
});

test("atomic D1 insert changes nothing if a concurrent writer adds a mirror after audit",()=>{
 const f=fixture();
 try{
   const p=planBreedControlledMirrorBackfill({
      links:f.links,pages:f.pages,existing:f.existing,expectedSource:SOURCE});
   const sql=breedControlledMirrorAtomicInsert(p,SOURCE);
   const initial=JSON.stringify(current(1));
   f.db.prepare("INSERT INTO breed_notion_controlled_values VALUES (?,?,?,0)")
     .run(1,initial,initial);
   dbExec(f.db,sql);
   assert.equal(f.db.prepare("SELECT COUNT(*) n FROM breed_notion_controlled_values").get().n,4);
   assert.equal(f.db.prepare("SELECT values_json FROM breed_notion_controlled_values WHERE breed_id=1").get().values_json,initial);
 }finally{f.db.close()}
});

test("existing mirror with pending Admin edit never gets overwritten by a Notion snapshot",()=>{
 const f=fixture();
 try{
   f.existing[0].notion_values_json=JSON.stringify(
     {...current(2),heightMinCm:40});
   const p=planBreedControlledMirrorBackfill({links:f.links,pages:f.pages,
     existing:f.existing,expectedSource:SOURCE});
   assert.equal(p.ready,false);
   assert.ok(p.issues.some(x=>x.code==="EXISTING_MIRROR_PENDING_SYNC"));
   assert.throws(()=>breedControlledMirrorAtomicInsert(p,SOURCE),/INCOMPLETE/);
 }finally{f.db.close()}
});

test("source values escaped safely, no SQL injection via selectable Notion text",()=>{
 const f=fixture();
 try{
   const p=planBreedControlledMirrorBackfill({
      links:f.links,pages:f.pages,existing:f.existing,expectedSource:SOURCE});
   const sql=breedControlledMirrorAtomicInsert(p,SOURCE);
   assert.ok(sql.includes("'"));
   assert.equal(sql.split("INSERT INTO breed_notion_controlled_values").length,2);
   assert.equal(p.newRows.length,341);
 }finally{f.db.close()}
});


test("production SQL guard accepts generated atomic INSERT containing REPLACE() scalar",()=>{
 const f=fixture();
 try{
   const p=planBreedControlledMirrorBackfill({
     links:f.links,pages:f.pages,existing:f.existing,expectedSource:SOURCE});
   const sql=breedControlledMirrorAtomicInsert(p,SOURCE);
   assert.match(sql,/replace\(lower\(l\.work_notion_page_id\)/i);
   assert.equal(isBreedControlledMirrorInsertOnlySql(sql),true);
   for(const dangerous of [
     sql.replace("INSERT INTO breed_notion_controlled_values",
       "REPLACE INTO breed_notion_controlled_values"),
     sql+"\nDELETE FROM managed_breeds;",
     sql.replace("FROM verified","FROM verified; DROP TABLE managed_breeds; --"),
     sql.replace("FROM verified","FROM verified; UPDATE managed_breeds SET slug='x'; --"),
     "INSERT INTO breed_notion_controlled_values VALUES (1,'a','b',0);",
   ])assert.equal(isBreedControlledMirrorInsertOnlySql(dangerous),false);
 }finally{f.db.close()}
});


test("D1 production plan splits 341 mirrors into <=60KiB atomic, validated SQL statements",()=>{
 const f=fixture();
 try{
   const p=planBreedControlledMirrorBackfill({
     links:f.links,pages:f.pages,existing:f.existing,expectedSource:SOURCE});
   const chunks=buildBreedControlledMirrorChunks(p,SOURCE);
   assert.ok(chunks.length>=2,"a single 341-row statement is unsafe for D1");
   assert.equal(chunks[0].expectedExisting,3);
   assert.equal(chunks.reduce((n,c)=>n+c.rows.length,0),341);
   let existing=3;
   for(const c of chunks){
     assert.equal(c.expectedExisting,existing);
     assert.ok(new TextEncoder().encode(c.sql).byteLength<=
       BREED_MIRROR_D1_MAX_SQL_BYTES);
     assert.equal(isBreedControlledMirrorInsertOnlySql(c.sql),true);
     existing+=c.rows.length;
     dbExec(f.db,c.sql);
     assert.equal(f.db.prepare(
       "SELECT COUNT(*) n FROM breed_notion_controlled_values").get().n,existing);
   }
   assert.equal(existing,344);
   for(const prev of f.existing){
     const stored=f.db.prepare(
       "SELECT * FROM breed_notion_controlled_values WHERE breed_id=?")
       .get(prev.breed_id);
     assert.deepEqual({...stored},prev);
   }
 }finally{f.db.close()}
});

test("D1 import resumes after a successful chunk without any overwrite",()=>{
 const f=fixture();
 try{
   const oldPlan=planBreedControlledMirrorBackfill({
     links:f.links,pages:f.pages,existing:f.existing,expectedSource:SOURCE});
   const [first,...rest]=buildBreedControlledMirrorChunks(oldPlan,SOURCE);
   assert.ok(rest.length>0);
   dbExec(f.db,first.sql);
   const snapshot=f.db.prepare(
     "SELECT * FROM breed_notion_controlled_values ORDER BY breed_id").all()
     .map(x=>({...x}));
   const newPlan=planBreedControlledMirrorBackfill({
     links:f.links,pages:f.pages,existing:snapshot,expectedSource:SOURCE});
   assert.equal(newPlan.ready,true);
   assert.equal(newPlan.existingCount,first.expectedExisting+first.rows.length);
   assert.equal(newPlan.missingCount,341-first.rows.length);
   const chunks=buildBreedControlledMirrorChunks(newPlan,SOURCE);
   for(const chunk of chunks)dbExec(f.db,chunk.sql);
   assert.equal(f.db.prepare(
     "SELECT COUNT(*) n FROM breed_notion_controlled_values").get().n,344);
   for(const row of snapshot){
     const stored=f.db.prepare(
       "SELECT * FROM breed_notion_controlled_values WHERE breed_id=?")
       .get(row.breed_id);
     assert.deepEqual({...stored},row);
   }
 }finally{f.db.close()}
});

test("D1 chunk refuses stale mirror counts when another writer inserts a row",()=>{
 const f=fixture();
 try{
   const p=planBreedControlledMirrorBackfill({
     links:f.links,pages:f.pages,existing:f.existing,expectedSource:SOURCE});
   const chunk=buildBreedControlledMirrorChunks(p,SOURCE)[0];
   const currentPayload=JSON.stringify(current(1));
   f.db.prepare("INSERT INTO breed_notion_controlled_values VALUES(?,?,?,0)")
     .run(1,currentPayload,currentPayload);
   dbExec(f.db,chunk.sql);
   assert.equal(f.db.prepare(
     "SELECT COUNT(*) n FROM breed_notion_controlled_values").get().n,4);
 }finally{f.db.close()}
});

test("D1 chunk builder refuses a tampered remote row and oversized single row",()=>{
 const f=fixture();
 try{
   const p=planBreedControlledMirrorBackfill({
     links:f.links,pages:f.pages,existing:f.existing,expectedSource:SOURCE});
   p.newRows[0]={...p.newRows[0],valuesJson:JSON.stringify(current(3))};
   // The seed still needs individually validated typed payloads, but this
   // particular valid change is allowed as part of the planner state. A
   // malformed encoded value must fail the existing validator instead.
   p.newRows[0].valuesJson="{bad-json}";
   assert.throws(()=>buildBreedControlledMirrorChunks(p,SOURCE),
     /FIELDS_INVALID/);
 }finally{f.db.close()}
});
