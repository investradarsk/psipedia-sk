import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";

const migration=readFileSync(new URL("../drizzle/0174_breeds_sql_json_foundation.sql",import.meta.url));
const runner=readFileSync(new URL("../scripts/production-d1-breed-0174.mjs",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/production-d1-breed-0174.yml",import.meta.url),"utf8");
const sql=migration.toString("utf8");
const statements=sql.replace(/^\s*--.*$/gm,"").split(";").map(x=>x.trim()).filter(Boolean);

test("0174 exact-file owner production guard pins one canonical additive schema",()=>{
 const gitBlob=createHash("sha1").update(
   Buffer.concat([Buffer.from("blob "+migration.length+"\0"),migration])
 ).digest("hex");
 assert.match(runner,new RegExp("PINNED_GIT_BLOB_SHA1=\""+gitBlob+"\""));
 assert.equal(statements.length,13);
 assert.equal(statements.filter(x=>/^ALTER TABLE managed_breeds ADD COLUMN/i.test(x)).length,8);
 assert.equal(statements.filter(x=>/^CREATE TABLE/i.test(x)).length,4);
 assert.equal(statements.filter(x=>/^CREATE INDEX/i.test(x)).length,1);
 assert.doesNotMatch(sql,/^\s*(?:DELETE|UPDATE|INSERT|DROP|REPLACE|VACUUM|ATTACH|DETACH)\s/im);
 assert.match(runner,/GITHUB_REF==="refs\/heads\/main"/);
 assert.match(runner,/MAIN_OWNER_DISPATCH_REQUIRED/);
 assert.match(runner,/PINNED_GIT_BLOB_SHA1/);
 assert.match(runner,/RECOVERY_BOOKMARK_REQUIRED/);
 assert.match(runner,/PRIOR_0173_NOT_INSTALLED/);
 assert.match(runner,/PARTIAL_SCHEMA_STOP/);
 assert.match(runner,/POSTFLIGHT_SCHEMA_NOT_EMPTY_OR_ABSENT/);
 assert.match(runner,/--file",SQL,"--yes","--json"/);
 assert.doesNotMatch(runner,/\["d1","migrations"/);
 assert.doesNotMatch(runner,/UPDATE\s+d1_migrations/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/default: audit/);
 assert.match(workflow,/production-d1-migration/);
 assert.match(workflow,/environment: production/);
 assert.match(workflow,/AUDIT-0174-psipedia-sk-db/);
 assert.match(workflow,/APPLY-0174-psipedia-sk-db/);
 assert.match(workflow,/node --check scripts\/production-d1-breed-0174.mjs/);
});

test("0174 schema-only leaves original 347 rows, old JSON and 344 mirrored Notion records intact",()=>{
 const db=new DatabaseSync(":memory:");
 try{
   db.exec("PRAGMA foreign_keys=ON");
   db.exec(`CREATE TABLE managed_breeds (
     id INTEGER PRIMARY KEY, status TEXT, fci_standard_json TEXT,
     editorial_json TEXT,seo_json TEXT,related_breeds_json TEXT
   )`);
   db.exec(`CREATE TABLE breed_notion_workcopy_links(
     breed_id INTEGER PRIMARY KEY REFERENCES managed_breeds(id),
     status TEXT)`);
   db.exec(`CREATE TABLE breed_notion_controlled_values(
     breed_id INTEGER PRIMARY KEY REFERENCES managed_breeds(id),
     values_json TEXT)`);
   const insert=db.prepare("INSERT INTO managed_breeds VALUES (?,?,?,?,?,?)");
   const link=db.prepare("INSERT INTO breed_notion_workcopy_links VALUES (?,'ACTIVE')");
   const mirror=db.prepare("INSERT INTO breed_notion_controlled_values VALUES (?,?)");
   for(let id=1;id<=347;id++){
     insert.run(id,"published",
       id===2?'{"vyuzitie":"Vodiaci pes"}':"{}",
       id===2?'{"exerciseTip":"Starý tip","heroTraits":[{"label":"Pokoj","rating":5}]}':"{}",
       id===2?'{"ogImage":"/dogs/lab.png","noindex":false}':"{}",
       id===1?"[2]":"[]");
     if(![5,13,14].includes(id)){
       link.run(id);mirror.run(id,'{"heightMinCm":null}');
     }
   }
   const existing=db.prepare("SELECT * FROM managed_breeds ORDER BY id").all()
     .map(x=>({...x}));
   db.exec(sql);
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM managed_breeds").get().n,347);
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM breed_notion_controlled_values").get().n,344);
   for(const before of existing){
     const row=db.prepare("SELECT * FROM managed_breeds WHERE id=?").get(before.id);
     for(const [key,value] of Object.entries(before))
       assert.equal(row[key],value,"ID "+before.id+" original field "+key);
   }
   for(const target of [
     "breed_fci_standard","breed_editorial_text",
     "breed_public_facts","breed_related_breeds",
   ])assert.equal(db.prepare("SELECT COUNT(*) AS n FROM "+target).get().n,0);
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_foreign_key_check").get().n,0);
 }finally{db.close()}
});
