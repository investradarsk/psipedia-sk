import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  RECEIPTS_0158_0162, expectedLedgerPrefix, classifyLedger,
  receiptInsertSql, assertBreedShadow0159,
} from "../lib/production-d1-0158-0162-history-guard.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const src = read("scripts/production-d1-0158-0162-ledger.mjs");
const workflow = read(".github/workflows/production-d1-0158-0162-ledger.yml");
const prior = expectedLedgerPrefix(readdirSync(new URL("../drizzle", import.meta.url)));

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  const insert = db.prepare("INSERT INTO d1_migrations (name) VALUES (?)");
  for(const name of prior)insert.run(name);
  return db;
}
function info(db) {
  const cols=db.prepare("PRAGMA table_info('d1_migrations')").all();
  const rows=db.prepare("SELECT id,name,applied_at FROM d1_migrations ORDER BY id").all();
  const unique=db.prepare("SELECT name FROM pragma_index_list('d1_migrations') WHERE \"unique\"=1").all()
    .some(row=>db.prepare("SELECT name FROM pragma_index_info(?)").all(row.name).map(x=>x.name).join(",")==="name");
  return {rows,columns:cols,uniqueNameIndex:unique,expectedPrior:prior};
}

test("reconciliation targets exactly 0158 through 0162 and a frozen prefix through 0157",()=>{
  assert.equal(prior.length,158);
  assert.equal(prior.at(-1),"0157_facebook_weekly_plan_marks.sql");
  assert.deepEqual(RECEIPTS_0158_0162.map(x=>x.slice(0,4)),["0158","0159","0160","0161","0162"]);
});
test("audit sees five missing receipts and does not insert anything",()=>{
  const db=fixture();
  try {
    const before=db.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n;
    const state=classifyLedger(info(db));
    assert.equal(state.ready,true);
    assert.equal(state.complete,false);
    assert.deepEqual(state.missing,[...RECEIPTS_0158_0162]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n,before);
  } finally {db.close();}
});
test("one atomic INSERT reconciles all five receipts preserving prior history",()=>{
  const db=fixture();
  try {
    const old=db.prepare("SELECT id,name,applied_at FROM d1_migrations ORDER BY id").all();
    const statement=receiptInsertSql(classifyLedger(info(db)).missing);
    assert.equal((statement.match(/INSERT INTO/g)||[]).length,1);
    assert.doesNotMatch(statement,/\b(?:UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|IGNORE)\b/);
    db.exec(statement);
    const after=classifyLedger(info(db));
    assert.equal(after.complete,true);
    assert.equal(after.missing.length,0);
    assert.deepEqual(db.prepare("SELECT id,name,applied_at FROM d1_migrations ORDER BY id LIMIT 158").all(),old);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n,163);
  } finally {db.close();}
});
test("partial contiguous trailing receipts can be resumed without repetition",()=>{
  const db=fixture();
  try {
    db.exec(receiptInsertSql(RECEIPTS_0158_0162));
    db.exec("DELETE FROM d1_migrations WHERE id >= 161"); // local fixture only
    const before=classifyLedger(info(db));
    assert.deepEqual(before.missing,RECEIPTS_0158_0162.slice(2));
    db.exec(receiptInsertSql(before.missing));
    assert.equal(classifyLedger(info(db)).complete,true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n,163);
  } finally {db.close();}
});
test("guard rejects noncontiguous, unexpected or unverified history",()=>{
  const db=fixture();
  try {
    db.exec("INSERT INTO d1_migrations(name) VALUES ('0160_event_contacts_admission.sql')");
    assert.throws(()=>classifyLedger(info(db)),/NONCONTIGUOUS/);
    assert.throws(()=>receiptInsertSql(RECEIPTS_0158_0162.slice(1,3)),/NOT_CONTIGUOUS_SUFFIX/);
    db.exec("DELETE FROM d1_migrations WHERE id=159");
    db.exec("INSERT INTO d1_migrations(name) VALUES ('0163_breed_notion_controlled_values.sql')");
    assert.throws(()=>classifyLedger(info(db)),/UNEXPECTED_OR_NONCONTIGUOUS_TAIL/);
  }finally{db.close();}
});
test("guard requires unique migration names and compatible ledger columns",()=>{
  const db=fixture();
  try {
    assert.throws(()=>classifyLedger({...info(db),uniqueNameIndex:false}),/NAME_NOT_UNIQUE/);
    assert.throws(()=>classifyLedger({...info(db),columns:[]}),/ID_NOT_PRIMARY_KEY/);
    assert.throws(()=>classifyLedger({...info(db),expectedPrior:[...prior.slice(0,-1),"0157_wrong.sql"]}),/PRE_0158_HISTORY_NOT_CANONICAL/);
  }finally{db.close();}
});
test("0159 schema signature verifies column set, index order and constraints",()=>{
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_breeds(id INTEGER PRIMARY KEY)");
    db.exec(read("drizzle/0159_breed_notion_workcopy_links.sql"));
    const columns=db.prepare("PRAGMA table_info('breed_notion_workcopy_links')").all();
    const tableSql=db.prepare("SELECT sql FROM sqlite_master WHERE name='breed_notion_workcopy_links'").get().sql;
    const statusIndexColumns=db.prepare("SELECT name FROM pragma_index_info('idx_breed_notion_workcopy_status')").all().map(x=>x.name);
    assert.equal(assertBreedShadow0159({columns,tableSql,statusIndexColumns}),true);
    assert.throws(()=>assertBreedShadow0159({columns:columns.filter(c=>c.name!=="fci_number"),tableSql,statusIndexColumns}),/SHADOW_COLUMN_MISSING/);
    assert.throws(()=>assertBreedShadow0159({columns,tableSql,statusIndexColumns:["updated_at","status"]}),/STATUS_INDEX_INCOMPATIBLE/);
  }finally{db.close();}
});
test("protected workflow is manual only and requires Time Travel before ledger mutation",()=>{
  assert.match(workflow,/\bon:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\n\s+(?:push|pull_request|schedule):/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/Require current main revision/);
  assert.match(workflow,/RECONCILE-0158-0162-psipedia-sk-db/);
  assert.match(workflow,/AUDIT-0158-0162-psipedia-sk-db/);
  assert.match(src,/LEDGER_MANUAL_ONLY/);
  assert.match(src,/LEDGER_RECOVERY_BOOKMARK_UNAVAILABLE/);
  assert.match(src,/report\("RECOVERY_POINT"/);
  assert.match(src,/receiptInsertSql\(fresh\.ledger\.missing\)/);
  assert.match(src,/originalDDLReexecuted:false/);
  assert.doesNotMatch(src,/\b(?:DROP|DELETE|UPDATE)\s+(?:TABLE|FROM|d1_migrations)\b/i);
});
