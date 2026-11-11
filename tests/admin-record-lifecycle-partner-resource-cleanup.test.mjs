import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {DatabaseSync} from "node:sqlite";
import ts from "typescript";

const source=readFileSync(new URL("../lib/admin-record-lifecycle.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../components/admin-record-lifecycle-actions.tsx",import.meta.url),"utf8");
const start=source.indexOf("async function completeLocalRemoval(");
const end=source.indexOf("\nexport async function removeRecord(",start);
assert.ok(start>0&&end>start);
const snippet=source.slice(start,end);
const transpiled=ts.transpileModule(snippet+"\nexports.run=completeLocalRemoval;",{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;

function fixture() {
  const sql=new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec([
    "CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY,slug TEXT NOT NULL,status TEXT NOT NULL);",
    "CREATE TABLE partner_resources (id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,directory_profile_id INTEGER REFERENCES directory_profiles(id) ON DELETE RESTRICT);",
    "CREATE TABLE partner_memberships (id TEXT PRIMARY KEY,resource_id TEXT NOT NULL REFERENCES partner_resources(id) ON DELETE RESTRICT);",
    "CREATE TABLE admin_record_tombstones (kind TEXT NOT NULL,record_id INTEGER NOT NULL,state TEXT NOT NULL,error_code TEXT,completed_at TEXT,updated_at TEXT,PRIMARY KEY(kind,record_id));",
    "CREATE TABLE admin_record_publication_guards (kind TEXT NOT NULL,record_id INTEGER NOT NULL,PRIMARY KEY(kind,record_id));",
    "CREATE TRIGGER admin_guarded_directory_delete BEFORE DELETE ON directory_profiles WHEN NOT EXISTS (SELECT 1 FROM admin_record_tombstones WHERE kind='directory' AND record_id=OLD.id AND state='READY_LOCAL') BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;",
    "INSERT INTO directory_profiles VALUES (2,'miestny-kynologicky-klub-salkova','draft'),(565,'agipaws','published');",
    "INSERT INTO partner_resources VALUES ('directory-profile-2','DIRECTORY_PROFILE',2),('directory-profile-565','DIRECTORY_PROFILE',565);",
    "INSERT INTO admin_record_tombstones VALUES('directory',2,'READY_LOCAL',NULL,NULL,'2026-11-11');",
  ].join("\n"));
  const db={
    prepare(query) {
      const wrapper={
        args:[],
        bind(...args) {this.args=args;return this;},
        async all() {return {results:sql.prepare(query).all(...this.args)};},
        async run() {
          const result=sql.prepare(query).run(...this.args);
          return {meta:{changes:result.changes}};
        },
      };
      return wrapper;
    },
    async batch(statements) {
      sql.exec("BEGIN IMMEDIATE");
      try{
        const out=[];
        for(const stmt of statements)out.push(await stmt.run());
        sql.exec("COMMIT");
        return out;
      }catch(error){
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const exports={};
  runInNewContext(transpiled,{
    exports,Date,JSON,
    specs:{directory:{table:"directory_profiles",draft:"draft",agenda:"directory"}},
    syncMappings:{directory:{table:"directory_notion_sync",entity:"directory_profile_id"}},
  });
  return {sql,run:()=>exports.run(db,"directory",2,[]),close:()=>sql.close()};
}

test("actual lifecycle cleanup removes an unclaimed partner resource before directory #2",async()=>{
  const f=fixture();
  try{
    await f.run();
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM directory_profiles WHERE id=2").get().n,0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM partner_resources WHERE directory_profile_id=2").get().n,0);
    assert.equal(f.sql.prepare("SELECT state FROM admin_record_tombstones WHERE record_id=2").get().state,"COMPLETE");
    assert.equal(f.sql.prepare("SELECT status FROM directory_profiles WHERE id=565").get().status,"published");
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM partner_resources WHERE directory_profile_id=565").get().n,1);
    assert.equal(f.sql.prepare("PRAGMA foreign_key_check").all().length,0);
  }finally{f.close();}
});

test("partner membership blocks deletion atomically; unrelated records stay intact",async()=>{
  const f=fixture();
  try{
    f.sql.exec("INSERT INTO partner_memberships VALUES('member-2','directory-profile-2')");
    await assert.rejects(f.run(),/FOREIGN KEY constraint failed/);
    assert.equal(f.sql.prepare("SELECT status FROM directory_profiles WHERE id=2").get().status,"draft");
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM partner_resources WHERE directory_profile_id=2").get().n,1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM partner_memberships WHERE id='member-2'").get().n,1);
    assert.equal(f.sql.prepare("SELECT state FROM admin_record_tombstones WHERE record_id=2").get().state,"READY_LOCAL");
  }finally{f.close();}
});

test("cleanup scopes three canonical kinds and preserves protected history",()=>{
  assert.match(source,/kind === "directory" \? "directory_profile_id"/);
  assert.match(source,/kind === "events" \? "managed_event_id"/);
  assert.match(source,/kind === "organizations" \? "help_organization_id"/);
  assert.ok(snippet.indexOf("DELETE FROM partner_resources WHERE ") <
    snippet.indexOf('"DELETE FROM "+spec.table+" WHERE id=?"'));
  assert.match(source,/D1_DELETE_BLOCKED_BY_REFERENCES/);
  assert.match(source,/RECORD_LIFECYCLE_LOCAL_DELETE_FAILED/);
  assert.match(ui,/D1_DELETE_BLOCKED_BY_REFERENCES:/);
  assert.doesNotMatch(snippet,/DELETE FROM partner_memberships|DELETE FROM profile_reviews|DELETE FROM partner_audit_events/);
});
