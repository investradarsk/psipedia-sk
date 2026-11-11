import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  LIFECYCLE_0164_FILE, LIFECYCLE_0164_SQL_BLOB, LIFECYCLE_0164_SOURCES,
  LIFECYCLE_0164_OBJECTS, LIFECYCLE_0164_TRIGGERS,
  classifyLifecycle0164, assertLifecycle0164ApplyReady,
  assertLifecycle0164Postflight,
} from "../lib/production-d1-0164-guard.mjs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const sql = read("drizzle/" + LIFECYCLE_0164_FILE);
const runner = read("scripts/production-d1-0164-lifecycle.mjs");
const workflow = read(".github/workflows/production-d1-0164-lifecycle.yml");
const generic = read("scripts/production-d1-migrate.mjs");

function fixture() {
  const db = new DatabaseSync(":memory:");
  for (const [kind, source] of Object.entries(LIFECYCLE_0164_SOURCES)) {
    const extra = kind === "directory" || kind === "organizations"
      ? ", import_key TEXT" : kind === "breeds" ? ", fci_number INTEGER" : "";
    db.exec("CREATE TABLE " + source.table +
      " (id INTEGER PRIMARY KEY,slug TEXT NOT NULL,status TEXT NOT NULL" + extra + ")");
    const status = ["adoptions", "lost-found", "organizations"].includes(kind)
      ? "ACTIVE" : "published";
    db.prepare("INSERT INTO " + source.table + " (id,slug,status) VALUES (1,?,?)")
      .run(kind + "-one", status);
  }
  db.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT)");
  db.exec("INSERT INTO d1_migrations(id,name) VALUES(157,'0157_facebook_weekly_plan_marks.sql')");
  return db;
}
function inspect(db) {
  const objects = db.prepare("SELECT name,type,tbl_name,sql FROM sqlite_master").all();
  const tables = objects.filter(x => x.type === "table").map(x => x.name);
  const columns = {};
  const counts = {};
  for (const table of [...Object.values(LIFECYCLE_0164_SOURCES).map(x => x.table),
    "admin_record_tombstones", "admin_record_publication_guards"]) {
    if (tables.includes(table)) {
      columns[table] = db.prepare("SELECT name,pk,type FROM pragma_table_info('" + table + "')").all();
    }
  }
  for (const source of Object.values(LIFECYCLE_0164_SOURCES)) {
    if (tables.includes(source.table)) {
      counts[source.table] = db.prepare("SELECT COUNT(*) AS n FROM " + source.table).get().n;
    }
  }
  return classifyLifecycle0164({
    objects, columns, counts, ledgerCount: db.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n,
  });
}

test("0164 SQL is immutable and contains 29 schema objects, no data backfill", () => {
  const bytes = Buffer.from(sql);
  const blob = createHash("sha1").update(Buffer.concat([
    Buffer.from("blob " + bytes.length + "\0"), bytes,
  ])).digest("hex");
  assert.equal(blob, LIFECYCLE_0164_SQL_BLOB);
  assert.equal(LIFECYCLE_0164_OBJECTS.length, 29);
  assert.equal(LIFECYCLE_0164_TRIGGERS.length, 24);
  const clean = sql.replace(/--[^\n]*/g, "");
  assert.equal((clean.match(/\bCREATE\s+(?:TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\b/gi) ?? []).length, 29);
  assert.doesNotMatch(clean, /^\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|REPLACE)\s+/im);
});

test("0164 classifies clean prerequisites, applies without changing rows, and verifies all objects", () => {
  const db = fixture();
  try {
    const before = inspect(db);
    assert.equal(before.readyToApply, true);
    assert.equal(before.installed, false);
    assert.equal(before.presentObjects, 0);
    assert.equal(assertLifecycle0164ApplyReady(before), true);
    const oldRows = Object.values(LIFECYCLE_0164_SOURCES).map(x =>
      db.prepare("SELECT * FROM " + x.table).all());
    db.exec(sql);
    const after = inspect(db);
    assert.equal(after.installed, true);
    assert.equal(after.readyToApply, false);
    assert.equal(after.presentObjects, 29);
    assert.equal(assertLifecycle0164Postflight(before, after), true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_record_tombstones").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_record_publication_guards").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n, 1);
    assert.deepEqual(Object.values(LIFECYCLE_0164_SOURCES).map(x =>
      db.prepare("SELECT * FROM " + x.table).all()), oldRows);
    db.exec(sql);
    assert.equal(inspect(db).installed, true);
  } finally { db.close(); }
});

test("0164 rejects a partially installed schema rather than silently ignoring it", () => {
  const db = fixture();
  try {
    db.exec("CREATE TABLE admin_record_tombstones(kind TEXT)");
    const state = inspect(db);
    assert.equal(state.installed, false);
    assert.equal(state.readyToApply, false);
    assert.match(state.blockers.join(" "), /PARTIAL_LIFECYCLE_SCHEMA/);
    assert.throws(() => assertLifecycle0164ApplyReady(state), /PREREQUISITES_NOT_READY/);
  } finally { db.close(); }
});

test("0164 rejects a mismatched source schema before installing any trigger", () => {
  const db = fixture();
  try {
    db.exec("ALTER TABLE directory_profiles RENAME TO directory_profiles_backup");
    db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY,slug TEXT,status TEXT)");
    const state = inspect(db);
    assert.ok(state.blockers.some(x => x.includes("MISSING_COLUMN:directory_profiles.import_key")));
    assert.equal(state.readyToApply, false);
  } finally { db.close(); }
});

test("0164 protects deleted identity and blocks legacy hard delete / pending republish", () => {
  const db = fixture();
  try {
    db.exec(sql);
    db.exec("INSERT INTO admin_record_tombstones " +
      "(kind,record_id,record_slug,record_name,record_category,state,created_by,created_at,updated_at) " +
      "VALUES ('directory',1,'directory-one','Fixture','Test','PENDING_NOTION','test','now','now')");
    assert.throws(() => db.exec(
      "INSERT INTO directory_profiles(id,slug,status,import_key) " +
      "VALUES(2,'directory-one','published','external')"), /RECORD_TOMBSTONED/);
    // The lifecycle itself may hide the published record while pending.
    db.exec("UPDATE directory_profiles SET status='draft' WHERE id=1");
    assert.throws(() => db.exec(
      "UPDATE directory_profiles SET status='published' WHERE id=1"),
      /RECORD_REMOVAL_PENDING/);
    assert.throws(() => db.exec(
      "DELETE FROM directory_profiles WHERE id=1"),
      /USE_VERIFIED_LIFECYCLE_DELETE/);
    db.exec("UPDATE admin_record_tombstones SET state='READY_LOCAL' WHERE kind='directory' AND record_id=1");
    db.exec("DELETE FROM directory_profiles WHERE id=1");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n, 0);
  } finally { db.close(); }
});

test("0164 manual workflow is protected; generic sequential runner still excludes it", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(push|pull_request|schedule):/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /default: audit/);
  assert.match(workflow, /AUDIT-0164-psipedia-sk-db/);
  assert.match(workflow, /APPLY-0164-psipedia-sk-db/);
  assert.match(runner, /LIFECYCLE_0164_RECOVERY_BOOKMARK_MISSING/);
  assert.match(runner, /assertLifecycle0164Postflight/);
  assert.match(runner, /migrationHistoryRecorded: false/);
  assert.match(generic, /UNACTIVATED_PRODUCTION_TARGETS/);
  assert.match(generic, /"0164_admin_record_lifecycle.sql"/);
});
