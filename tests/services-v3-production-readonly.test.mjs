import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {migrationGate,assertReadonlySql,SQL,WORKFLOW} from "../scripts/services-v3-production-readonly.mjs";

const load=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql138=load("drizzle/0138_article_editorial_outbox.sql");
const sql139=load("drizzle/0139_services_catalog_notion_auto_attempts.sql");
const files=[
  ...Array.from({length:138},(_,i)=>String(i).padStart(4,"0")+"_historic.sql"),
  "0138_article_editorial_outbox.sql","0139_services_catalog_notion_auto_attempts.sql"
];
const metrics={
  dynamicOptions:{total:3,pending:2},
  receipts:{total:1},
  yesChoices:{total:5},
  attempts:{total:0,unresolved:0}
};
const ledger=n=>files.slice(0,n).map((name,i)=>({id:i+1,name}));
function fixture(applied139=false){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec("CREATE TABLE managed_articles (id INTEGER PRIMARY KEY)");
 db.exec("CREATE TABLE article_notion_sync (notion_page_id TEXT PRIMARY KEY, article_id INTEGER)");
 db.exec("CREATE TABLE service_catalog_admin_options(id TEXT PRIMARY KEY)");
 db.exec("CREATE TABLE service_catalog_admin_notion_receipts(id INTEGER PRIMARY KEY)");
 db.exec("CREATE TRIGGER service_catalog_admin_receipt_no_delete BEFORE DELETE ON service_catalog_admin_notion_receipts BEGIN SELECT RAISE(ABORT,'readonly'); END;");
 db.exec(sql138);
 if(applied139)db.exec(sql139);
 function evidence(n=applied139?140:139){
  return {
   ledger:ledger(n),files,sql138,sql139,metrics,
   objects:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master").all(),
   articleColumns:db.prepare("SELECT * FROM pragma_table_info('managed_articles')").all(),
   notionColumns:db.prepare("SELECT * FROM pragma_table_info('article_notion_sync')").all(),
   outboxColumns:db.prepare("SELECT * FROM pragma_table_info('article_notion_editorial_outbox')").all(),
   outboxForeignKeys:db.prepare("SELECT * FROM pragma_foreign_key_list('article_notion_editorial_outbox')").all()
  };
 }
 return {db,evidence,close:()=>db.close()};
}
test("SQL transport is a closed SELECT-only allowlist, without any profile fields or write ability",()=>{
 assert.equal(WORKFLOW,"Services V3 Production Read-only Gate");
 for(const q of Object.values(SQL)){assert.equal(assertReadonlySql(q),q);assert.match(q,/^SELECT /);}
 for(const q of ["PRAGMA table_info('x')","UPDATE directory_profiles SET name='x'",
  "SELECT * FROM directory_profiles","SELECT 1; DELETE FROM d1_migrations","SELECT * FROM service_catalog_admin_options"]){
  assert.throws(()=>assertReadonlySql(q),/UNAPPROVED_D1_SQL/);
 }
 const source=load("scripts/services-v3-production-readonly.mjs");
 assert.doesNotMatch(source,/\bdb\.prepare\(/);
 assert.doesNotMatch(source,/wrangler",\s*"d1",\s*"migrations",\s*"apply"/);
 assert.match(source,/--remote/);
 assert.match(source,/assertReadonlySql\(sql\)/);
 const wf=load(".github/workflows/services-v3-production-readonly.yml");
 assert.match(wf,/^on:\s*\n\s+workflow_dispatch:/m);
 assert.match(wf,/environment: production/);
 assert.match(wf,/group: production-d1-migration/);
 assert.match(wf,/git rev-parse origin\/main/);
 assert.match(wf,/AUDIT-SERVICES-V3-0139-psipedia-sk-db/);
 assert.doesNotMatch(wf,/^\s*(push|schedule|pull_request):/m);
 assert.doesNotMatch(wf,/\b(d1 migrations apply|wrangler deploy)\b/);
});
test("real exact SQLite 0138 schema, without 0139, is READY only for separately approved migration",()=>{
 const f=fixture();
 try{
  const s=migrationGate(f.evidence());
  assert.deepEqual({state:s.state,reason:s.reason,m138:s.migration0138,m139:s.migration0139},{
   state:"READY_TO_REQUEST_0139",reason:"EXACT_0138_PREDECESSOR",m138:"VERIFIED",m139:"NOT_APPLIED"});
  assert.deepEqual(s.coverage,{dynamicOptions:3,pendingDynamicOptions:2,notionReceipts:1,explicitYesSelections:5});
  assert.equal(migrationGate(f.evidence(138)).state,"NO_GO");
  assert.equal(migrationGate({...f.evidence(),metrics:null}).reason,"COVERAGE_AGGREGATE_UNVERIFIED");
 }finally{f.close();}
});
test("applied 0139 exact schema is ALREADY_APPLIED, never requested to rerun",()=>{
 const f=fixture(true);
 try{
  const s=migrationGate(f.evidence());
  assert.equal(s.state,"ALREADY_APPLIED");
  assert.deepEqual(s.coverage,{dynamicOptions:3,pendingDynamicOptions:2,notionReceipts:1,explicitYesSelections:5,attemptJournalRows:0,unresolvedAttempts:0});
  assert.equal(migrationGate({...f.evidence(),ledger:ledger(139)}).reason,"0139_PARTIAL_SCHEMA_WITHOUT_LEDGER");
  f.db.exec("DROP TRIGGER service_catalog_notion_auto_attempt_no_delete");
  assert.equal(migrationGate(f.evidence()).reason,"0139_SCHEMA_DRIFT");
 }finally{f.close();}
});
test("0138 wrong ledger, partial schema, malformed SQL or unknown future ledger blocks read-only",()=>{
 const f=fixture();
 try{
  const base=f.evidence();
  assert.equal(migrationGate({...base,ledger:ledger(137)}).reason,"0138_NOT_APPLIED");
  const badLedger=ledger(139);badLedger[138].name="0138_wrong.sql";
  assert.equal(migrationGate({...base,ledger:badLedger}).reason,"MIGRATION_LEDGER_DRIFT");
  assert.equal(migrationGate({...base,sql138:sql138+" --change"}).reason,"PINNED_SQL_CHANGED");
  assert.equal(migrationGate({...base,sql139:sql139+" --change"}).reason,"PINNED_SQL_CHANGED");
  assert.equal(migrationGate({...base,ledger:[...ledger(140),{id:141,name:"0140_unverified.sql"}]}).state,"NO_GO");
  f.db.exec("DROP INDEX article_notion_editorial_outbox_lease_idx");
  assert.equal(migrationGate(f.evidence()).reason,"0138_SCHEMA_DRIFT");
 }finally{f.close();}
});
