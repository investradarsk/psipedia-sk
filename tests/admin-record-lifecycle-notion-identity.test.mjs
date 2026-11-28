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
  "const NOTION_UUID=/^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i;\n"+source.slice(uuidStart,uuidEnd)+"\n"+source.slice(guardStart,guardEnd),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
).outputText;
const exports={};
runInNewContext(compiled,{exports,Promise,Set,Array,Object,Error},{timeout:1200});
const {notionPageIsTombstoned,notionPageHasAdminUnpublishGuard,notionPageMustSkipInboundSync,notionRemoteDeletionNeedsReview}=exports;

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


test("remote deletion of any mapped page requires review without touching local records",async()=>{
  const f=fixture();
  try{
    for(const table of ["event_notion_sync","breed_notion_sync","article_notion_sync","eshop_notion_sync","notion_agenda_sync"])
      f.sqlite.exec("CREATE TABLE "+table+"(notion_page_id TEXT)");
    for(const table of ["directory_notion_sync","event_notion_sync","breed_notion_sync","article_notion_sync","eshop_notion_sync","notion_agenda_sync"]){
      f.sqlite.prepare("INSERT INTO "+table+"(notion_page_id) VALUES(?)").run(oldId);
      assert.equal(await notionRemoteDeletionNeedsReview(f.db,oldDashed),true,table);
      assert.equal(await notionRemoteDeletionNeedsReview(f.db,unrelated),false,table);
      assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM "+table).get().n,1);
      f.sqlite.exec("DELETE FROM "+table);
    }
    f.sqlite.prepare("INSERT INTO breed_notion_workcopy_links VALUES(9,?,?,?)").run(oldId,workDashed,"ACTIVE");
    assert.equal(await notionRemoteDeletionNeedsReview(f.db,oldDashed),true);
    assert.equal(await notionRemoteDeletionNeedsReview(f.db,workId),true);
    f.sqlite.prepare("INSERT INTO admin_record_tombstones VALUES('breeds',9,?,?)").run(oldId,JSON.stringify([{pageId:workDashed}]));
    assert.equal(await notionRemoteDeletionNeedsReview(f.db,oldDashed),false);
    assert.equal(await notionRemoteDeletionNeedsReview(f.db,workId),false);
    await assert.rejects(notionRemoteDeletionNeedsReview(f.db,"not-a-page"),/NOTION_MAPPING_INVALID/);
    f.sqlite.exec("DROP TABLE eshop_notion_sync");
    await assert.rejects(notionRemoteDeletionNeedsReview(f.db,unrelated),/no such table/);
  }finally{f.close();}
});

test("staged removal refuses a concurrent first-copy fence, changed revision or different mapping",async()=>{
  const start=source.indexOf("export function stagedProfileRemovalGuard("),end=source.indexOf("\nasync function tombstone(",start);
  assert.ok(start>=0&&end>start);
  const specsStart=source.indexOf("const specs: Record"),specsEnd=source.indexOf("\ntype CanonicalRow",specsStart);
  assert.ok(specsStart>=0&&specsEnd>specsStart);
  const compiledGuard=ts.transpileModule(source.slice(specsStart,specsEnd)+"\n"+source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const guardExports={};
  runInNewContext(compiledGuard,{exports:guardExports,Set,Array,Object,JSON},{timeout:1200});
  const {stagedProfileRemovalGuard}=guardExports;
  const f=fixture();
  try{
    f.sqlite.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,updated_at TEXT); CREATE TABLE notion_unified_manual_fence(agenda TEXT,entity_id TEXT); ALTER TABLE directory_notion_sync ADD COLUMN content_hash TEXT DEFAULT '';");
    f.sqlite.prepare("INSERT INTO directory_profiles VALUES(7,'r1')").run();
    f.sqlite.prepare("INSERT INTO directory_notion_sync(directory_profile_id,notion_page_id) VALUES(7,?)").run(oldId);
    const verify=()=>stagedProfileRemovalGuard(f.db,"directory",7,"r1",[{pageId:oldDashed,sourceId:unrelated}]).first();
    assert.equal((await verify()).verified,1);
    f.sqlite.prepare("INSERT INTO notion_unified_manual_fence VALUES('directory','7')").run();
    await assert.rejects(verify);
    f.sqlite.exec("DELETE FROM notion_unified_manual_fence; UPDATE directory_profiles SET updated_at='r2'");
    await assert.rejects(verify);
    f.sqlite.exec("UPDATE directory_profiles SET updated_at='r1'");
    f.sqlite.prepare("UPDATE directory_notion_sync SET content_hash='INBOUND_ID_PENDING'").run();
    await assert.rejects(verify);
    f.sqlite.prepare("UPDATE directory_notion_sync SET content_hash='',notion_page_id=?").run(workId);
    await assert.rejects(verify);
  }finally{f.close();}
});
