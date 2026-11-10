import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the production mapping resolver in isolation, not a rewrite.
const source=readFileSync(fileURLToPath(new URL("../lib/admin-record-lifecycle.ts",import.meta.url)),"utf8");
const start=source.indexOf("async function mappedTargets(");
const end=source.indexOf("\nasync function tombstone(",start);
assert.ok(start>=0 && end>start);
const compiled=ts.transpileModule(source.slice(start,end)+"\nexports.mappedTargets=mappedTargets;",{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const exported={};
runInNewContext(compiled,{
  exports:exported, Map, Promise,
  clean:(value)=>value==null?"":String(value).trim(),
  sameId:(a,b)=>a.replaceAll("-","").toLowerCase()===b.replaceAll("-","").toLowerCase(),
},{timeout:1200});
const mappedTargets=exported.mappedTargets;
const plainTargets=(targets)=>Array.from(targets,item=>({pageId:item.pageId,sourceId:item.sourceId}));
const primaryId="1234567890abcdef1234567890abcdef";
const secondaryId="abcdef1234567890abcdef1234567890";
const sourceId="0123456789abcdef0123456789abcdef";
const otherSourceId="fedcba9876543210fedcba9876543210";

function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE event_notion_sync (event_id INTEGER,notion_page_id TEXT)");
  sqlite.exec("CREATE TABLE notion_agenda_sync (agenda TEXT,entity_id INTEGER,notion_page_id TEXT)");
  sqlite.exec("CREATE TABLE notion_agenda_targets (agenda TEXT,data_source_id TEXT)");
  sqlite.prepare("INSERT INTO notion_agenda_targets VALUES ('events',?)").run(sourceId);
  const database={
    prepare(sql){
      let params=[];
      const prepared={
        bind(...values){params=values;return prepared;},
        async first(){return sqlite.prepare(sql).get(...params)??null;},
      };
      return prepared;
    },
  };
  return {sqlite,database,
    legacy:(id)=>sqlite.prepare("INSERT INTO event_notion_sync VALUES (15,?)").run(id),
    agenda:(id)=>sqlite.prepare("INSERT INTO notion_agenda_sync VALUES ('events',15,?)").run(id),
    target:(id)=>sqlite.prepare("UPDATE notion_agenda_targets SET data_source_id=? WHERE agenda='events'").run(id),
    close:()=>sqlite.close(),
  };
}
test("deletion finds legacy event mappings even without a generic agenda mapping",async()=>{
  const f=fixture();
  try{
    f.legacy(primaryId);
    assert.deepEqual(plainTargets(await mappedTargets(f.database,{}, "events",15)),[
      {pageId:primaryId,sourceId},
    ]);
  }finally{f.close();}
});
test("deletion requires BOTH distinct Notion event pages to be safely handled",async()=>{
  const f=fixture();
  try{
    f.legacy(primaryId);f.agenda(secondaryId);
    assert.deepEqual(plainTargets(await mappedTargets(f.database,{}, "events",15)),[
      {pageId:primaryId,sourceId},{pageId:secondaryId,sourceId},
    ]);
  }finally{f.close();}
});
test("duplicate event Notion page identities are deduplicated across mapping versions",async()=>{
  const f=fixture();
  try{
    f.legacy(primaryId);
    f.agenda(primaryId.slice(0,8)+"-"+primaryId.slice(8,12)+"-"+primaryId.slice(12,16)+"-"+primaryId.slice(16,20)+"-"+primaryId.slice(20));
    assert.equal((await mappedTargets(f.database,{}, "events",15)).length,1);
  }finally{f.close();}
});
test("same event Notion identity with conflicting source IDs aborts instead of guessing",async()=>{
  const f=fixture();
  try{
    f.legacy(primaryId);f.agenda(primaryId);f.target(otherSourceId);
    await assert.rejects(()=>mappedTargets(f.database,{NOTION_EVENTS_DATA_SOURCE_ID:sourceId},"events",15),/NOTION_MAPPING_AMBIGUOUS/);
  }finally{f.close();}
});
test("no event map never invents a Notion target from the title or slug",async()=>{
  const f=fixture();
  try{
    assert.equal((await mappedTargets(f.database,{},"events",15)).length,0);
  }finally{f.close();}
});
