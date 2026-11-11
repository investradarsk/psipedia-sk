import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the real production tombstone and unpublished-guard SQL against
// isolated SQLite. No production Notion or D1 calls are performed.
const source=readFileSync(fileURLToPath(new URL("../lib/admin-record-lifecycle.ts",import.meta.url)),"utf8");
const uuidStart=source.indexOf("function notionPageIdVariants(");
const uuidEnd=source.indexOf("\nfunction requireDataSource(",uuidStart);
const guardStart=source.indexOf("export async function notionPageHasAdminUnpublishGuard(");
const guardEnd=source.indexOf("\nasync function setRemovalError(",guardStart);
assert.ok(uuidStart>=0&&uuidEnd>uuidStart&&guardStart>0&&guardEnd>guardStart);
const compiled=ts.transpileModule(
  source.slice(uuidStart,uuidEnd)+"\n"+source.slice(guardStart,guardEnd),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
).outputText;
const exports={};
runInNewContext(compiled,{exports,Promise,Set,Array,Object,Error},{timeout:1200});
const {notionPageIsTombstoned,notionPageHasAdminUnpublishGuard,notionPageMustSkipInboundSync}=exports;

const oldId="1234567890abcdef1234567890abcdef";
const oldDashed="12345678-90ab-cdef-1234-567890abcdef";
const workId="abcdef1234567890abcdef1234567890";
const workDashed="abcdef12-3456-7890-abcd-ef1234567890";
const unrelated="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fixture({noLifecycleTables=false}={}) {
  const sqlite=new DatabaseSync(":memory:");
  if(!noLifecycleTables)sqlite.exec(`
    CREATE TABLE admin_record_tombstones
      (kind TEXT,record_id INTEGER,notion_page_id TEXT,notion_targets_json TEXT);
    CREATE TABLE admin_record_publication_guards
      (kind TEXT,record_id INTEGER);
  `);
  sqlite.exec(`
    CREATE TABLE directory_notion_sync
      (directory_profile_id INTEGER,notion_page_id TEXT);
    CREATE TABLE breed_notion_workcopy_links
      (breed_id INTEGER, original_notion_page_id TEXT,work_notion_page_id TEXT,status TEXT);
  `);
  const database={
    prepare(sql) {
      let values=[];
      return {
        bind(...args){values=args;return this;},
        async first(){return sqlite.prepare(sql).get(...values)??null;},
        async all(){return {results:sqlite.prepare(sql).all(...values)};},
      };
    },
  };
  return {sqlite,db:database,close:()=>sqlite.close()};
}

test("tombstone lookup recognizes compact stored ID from dashed Notion webhook",async()=>{
  const f=fixture();
  try{
    f.sqlite.prepare("INSERT INTO admin_record_tombstones VALUES ('events',1,?,?)")
      .run(oldId,"[]");
    assert.equal(await notionPageIsTombstoned(f.db,oldDashed),true);
    assert.equal(await notionPageMustSkipInboundSync(f.db,oldDashed),true);
  }finally{f.close();}
});

test("tombstone lookup recognizes all JSON work-copy targets across UUID spellings",async()=>{
  const f=fixture();
  try{
    f.sqlite.prepare("INSERT INTO admin_record_tombstones VALUES ('breeds',2,?,?)")
      .run(null,JSON.stringify([{pageId:oldDashed},{pageId:workId}]));
    assert.equal(await notionPageIsTombstoned(f.db,oldId),true);
    assert.equal(await notionPageIsTombstoned(f.db,workDashed),true);
    assert.equal(await notionPageIsTombstoned(f.db,unrelated),false);
  }finally{f.close();}
});

test("unpublish guard prevents dashed UUID replay of compact Directory page",async()=>{
  const f=fixture();
  try{
    f.sqlite.prepare("INSERT INTO admin_record_publication_guards VALUES ('directory',7)").run();
    f.sqlite.prepare("INSERT INTO directory_notion_sync VALUES (7,?)").run(oldId);
    assert.equal(await notionPageHasAdminUnpublishGuard(f.db,oldDashed),true);
    assert.equal(await notionPageMustSkipInboundSync(f.db,oldDashed),true);
    assert.equal(await notionPageMustSkipInboundSync(f.db,unrelated),false);
  }finally{f.close();}
});

for(const status of ["SHADOW","VERIFIED","ACTIVE","ROLLED_BACK"]) {
  test("breed work-copy "+status+" guard protects original and work page UUID variants",async()=>{
    const f=fixture();
    try{
      f.sqlite.prepare("INSERT INTO admin_record_publication_guards VALUES ('breeds',9)").run();
      f.sqlite.prepare("INSERT INTO breed_notion_workcopy_links VALUES (9,?,?,?)")
        .run(oldId,workDashed,status);
      assert.equal(await notionPageHasAdminUnpublishGuard(f.db,oldDashed),true);
      assert.equal(await notionPageHasAdminUnpublishGuard(f.db,workId),true);
    }finally{f.close();}
  });
}

test("unmigrated lifecycle tables do not interrupt existing Notion sync",async()=>{
  const f=fixture({noLifecycleTables:true});
  try{
    assert.equal(await notionPageIsTombstoned(f.db,oldDashed),false);
    assert.equal(await notionPageHasAdminUnpublishGuard(f.db,oldDashed),false);
    assert.equal(await notionPageMustSkipInboundSync(f.db,oldDashed),false);
  }finally{f.close();}
});
