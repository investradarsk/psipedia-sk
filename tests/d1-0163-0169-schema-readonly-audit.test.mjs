import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const audit = readFileSync("scripts/d1-0163-0169-schema-readonly-audit.sql", "utf8");

function db() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE d1_migrations (name TEXT PRIMARY KEY, applied_at TEXT);
    CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY);
  `);
  return sqlite;
}

test("D1 backlog audit detects every expected migration without any mutation", () => {
  const sqlite=db();
  try {
    const rows=sqlite.prepare(audit).all();
    assert.deepEqual(rows.map(row=>row.migration), [
      "0163","0164","0165","0166","0167","0168","0169",
    ]);
    assert.equal(rows.every(row=>row.history_recorded===0),true);
    assert.equal(rows.every(row=>row.present_objects===0),true);
    assert.equal(rows.every(row=>row.status==="NOT_APPLIED"),true);
    assert.equal(rows.find(row=>row.migration==="0164").expected_objects,29);
    assert.equal(rows.find(row=>row.migration==="0169").expected_objects,3);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n,0);
  } finally { sqlite.close(); }
});

test("a missing migration ledger with physical objects is flagged; no fake history is inserted", () => {
  const sqlite=db();
  try {
    sqlite.exec("CREATE TABLE breed_notion_controlled_values (breed_id INTEGER PRIMARY KEY)");
    const row=sqlite.prepare(audit).all().find(item=>item.migration==="0163");
    assert.equal(row.history_recorded,0);
    assert.equal(row.present_objects,1);
    assert.equal(row.status,"PRESENT_WITHOUT_LEDGER_CHECK_ISOLATED");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n,0);
  } finally { sqlite.close(); }
});

test("audit treats partially applied 0165 columns as a STOP condition", () => {
  const sqlite=db();
  try {
    sqlite.exec("ALTER TABLE lost_found_dog_reports ADD COLUMN public_phone TEXT");
    const row=sqlite.prepare(audit).all().find(item=>item.migration==="0165");
    assert.equal(row.expected_objects,5);
    assert.equal(row.present_objects,1);
    assert.equal(row.missing_objects,4);
    assert.equal(row.status,"PARTIAL_OR_INCONSISTENT_STOP");
    assert.match(row.missing_names,/public_email/);
  } finally { sqlite.close(); }
});

test("a physically complete and recorded 0169 reports readiness", () => {
  const sqlite=db();
  try {
    const schema=readFileSync("drizzle/0169_directory_breeder_club_relations.sql","utf8")
      .replaceAll("--> statement-breakpoint","");
    sqlite.exec(schema);
    sqlite.prepare("INSERT INTO d1_migrations (name,applied_at) VALUES (?,?)")
      .run("0169_directory_breeder_club_relations.sql","2026-11-17");
    const row=sqlite.prepare(audit).all().find(item=>item.migration==="0169");
    assert.equal(row.expected_objects,3);
    assert.equal(row.present_objects,3);
    assert.equal(row.missing_objects,0);
    assert.equal(row.history_recorded,1);
    assert.equal(row.status,"RECORDED_AND_PHYSICALLY_PRESENT");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_breeder_club_relations").get().n,0);
  } finally { sqlite.close(); }
});
