import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  EVENT_0161_GIT_BLOB_SHA, EVENT_0161_TARGET,
  assertEvent0161Schema, assertEvent0161Postflight,
} from "../lib/production-d1-0161-event-metadata-guard.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url));
const sql = read("drizzle/" + EVENT_0161_TARGET).toString("utf8");
const script = read("scripts/production-d1-0161-event-metadata.mjs").toString("utf8");
const workflow = read(".github/workflows/production-d1-0161-event-metadata.yml").toString("utf8");
const mainMigrator = read("scripts/production-d1-migrate.mjs").toString("utf8");

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE managed_events(id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
  db.prepare("INSERT INTO managed_events(id,title) VALUES(?,?)").run(1, "Udalosť 1");
  db.prepare("INSERT INTO managed_events(id,title) VALUES(?,?)").run(2, "Udalosť 2");
  return db;
}
function inspect(db) {
  return {
    tablePresent: db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name='managed_events'").all().length === 1,
    columns: db.prepare("PRAGMA table_info('managed_events')").all(),
    rowCount: db.prepare("SELECT COUNT(*) AS n FROM managed_events").get().n,
  };
}

test("0161 SQL is exact pinned two-column additive migration", () => {
  const bytes = read("drizzle/" + EVENT_0161_TARGET);
  const header = Buffer.from("blob " + bytes.length + "\0");
  const gitBlobSha = createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
  assert.equal(gitBlobSha, EVENT_0161_GIT_BLOB_SHA);
  const statements = sql.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("--"));
  assert.deepEqual(statements, [
    "ALTER TABLE managed_events ADD COLUMN image_alt TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE managed_events ADD COLUMN internal_notes TEXT NOT NULL DEFAULT '';",
  ]);
  assert.doesNotMatch(statements.join("\n"), /\b(DROP|DELETE|UPDATE|INSERT|REPLACE)\b/i);
});

test("0161 preserves existing event rows and all existing column values", () => {
  const db = setup();
  try {
    const old = db.prepare("SELECT * FROM managed_events ORDER BY id").all().map(({id,title}) => ({id,title}));
    const before = inspect(db);
    assert.deepEqual(assertEvent0161Schema(before), { installed: false, rowCount: 2 });
    db.exec(sql);
    const after = inspect(db);
    assert.deepEqual(assertEvent0161Postflight(before, after), { installed: true, rowCount: 2 });
    const rows = db.prepare("SELECT * FROM managed_events ORDER BY id").all();
    assert.deepEqual(rows.map(({id,title}) => ({id,title})), old);
    assert.deepEqual(rows.map(row => [row.image_alt,row.internal_notes]), [["",""],["",""]]);
    assert.equal(assertEvent0161Schema(after).installed, true);
  } finally { db.close(); }
});

test("0161 refuses any half-installed migration", () => {
  const db = setup();
  try {
    db.exec("ALTER TABLE managed_events ADD COLUMN image_alt TEXT NOT NULL DEFAULT ''");
    assert.throws(() => assertEvent0161Schema(inspect(db)), /PARTIAL_SCHEMA/);
  } finally { db.close(); }
});

test("0161 refuses incompatible pre-existing columns or missing event table", () => {
  const db = setup();
  try {
    db.exec("ALTER TABLE managed_events ADD COLUMN image_alt TEXT");
    db.exec("ALTER TABLE managed_events ADD COLUMN internal_notes TEXT NOT NULL DEFAULT ''");
    assert.throws(() => assertEvent0161Schema(inspect(db)), /INCOMPATIBLE_COLUMN_image_alt/);
    assert.throws(() => assertEvent0161Schema({ tablePresent:false, columns:[], rowCount:null }), /TABLE_MISSING/);
  } finally { db.close(); }
});

test("0161 postflight refuses missing columns or a changed event row count", () => {
  const db = setup();
  try {
    const before = inspect(db);
    assert.throws(() => assertEvent0161Postflight(before, before), /POSTFLIGHT_SCHEMA_MISSING/);
    db.exec(sql);
    db.prepare("DELETE FROM managed_events WHERE id=?").run(2);
    assert.throws(() => assertEvent0161Postflight(before, inspect(db)), /ROW_COUNT_CHANGED/);
  } finally { db.close(); }
});

test("0161 is manual-only, pinned to main and protected production D1", () => {
  assert.match(workflow, /\bon:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+(?:push|pull_request|schedule):/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /APPLY-0161-psipedia-sk-db/);
  assert.match(workflow, /AUDIT-0161-psipedia-sk-db/);
  assert.match(workflow, /Require current main revision/);
  assert.match(script, /EVENT_0161_GIT_BLOB_SHA/);
  assert.match(script, /EVENT_0161_PROTECTED_TOKEN_MISSING/);
  assert.match(script, /EVENT_0161_RECOVERY_BOOKMARK_MISSING/);
  assert.match(script, /phase: "RECOVERY_POINT"/);
  assert.match(script, /"--remote"/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?d1_migrations\b/i);
  // Keep all 0158-0161 migrations outside the generic sequential APPLY list.
  assert.match(mainMigrator, /UNACTIVATED_PRODUCTION_TARGETS/);
  assert.match(mainMigrator, /"0161_event_image_alt_private_notes\.sql"/);
});
