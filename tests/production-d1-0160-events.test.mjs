import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  EVENT_0160_SQL_BLOB, classifyEvent0160, assertEvent0160Postflight,
} from "../lib/production-d1-0160-guard.mjs";

const sql = readFileSync(new URL("../drizzle/0160_event_contacts_admission.sql", import.meta.url));
const hash = createHash("sha1").update(Buffer.concat([
  Buffer.from("blob " + sql.length + "\0"), sql,
])).digest("hex");
const mockColumn = (name, notnull = 0, dflt_value = null) =>
  ({ name, type: "TEXT", notnull, dflt_value });

test("0160 SQL matches the pinned reviewed Git blob and only adds three columns", () => {
  assert.equal(hash, EVENT_0160_SQL_BLOB);
  const code = sql.toString("utf8").replace(/--[^\n]*(?:\n|$)/g, "")
    .trim().replace(/\s+/g, " ").replace(/\s*;\s*/g, ";");
  assert.equal(code, "ALTER TABLE managed_events ADD COLUMN contact_phone TEXT;" +
    "ALTER TABLE managed_events ADD COLUMN contact_email TEXT;" +
    "ALTER TABLE managed_events ADD COLUMN admission_fee TEXT NOT NULL DEFAULT '';");
});

test("0160 preserves existing events and backfills admission as an empty string", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_events (id INTEGER PRIMARY KEY, title TEXT NOT NULL);");
    db.exec("INSERT INTO managed_events(id,title) VALUES(11,'Existing event'),(12,'Other event');");
    assert.equal(classifyEvent0160(db.prepare("SELECT name,type,notnull,dflt_value FROM pragma_table_info('managed_events')").all()).alreadyInstalled, false);
    db.exec(sql.toString("utf8"));
    const cols = db.prepare("SELECT name,type,notnull,dflt_value FROM pragma_table_info('managed_events')").all();
    assertEvent0160Postflight(cols);
    assert.deepEqual(db.prepare("SELECT id,title,contact_phone,contact_email,admission_fee FROM managed_events ORDER BY id").all(),
      [
        { id: 11, title: "Existing event", contact_phone: null, contact_email: null, admission_fee: "" },
        { id: 12, title: "Other event", contact_phone: null, contact_email: null, admission_fee: "" },
      ]);
  } finally { db.close(); }
});

test("0160 refuses a partial or incompatible schema", () => {
  const base = [mockColumn("id")];
  assert.throws(() => classifyEvent0160([...base, mockColumn("contact_phone")]), /PARTIAL_SCHEMA/);
  assert.throws(() => classifyEvent0160([...base, mockColumn("contact_phone"),
    mockColumn("contact_email"), mockColumn("admission_fee", 0, "''")]), /ADMISSION_CONSTRAINT/);
  assert.throws(() => assertEvent0160Postflight(base), /COLUMNS_MISSING/);
});
