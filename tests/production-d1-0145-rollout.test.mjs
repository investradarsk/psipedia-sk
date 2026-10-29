import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  SUPPORTED_PRODUCTION_TARGETS,
  targetSchemaObjects,
  assertPendingTargetSchemaClean,
  assertNotionWebhookInbox0145Schema,
} from "../scripts/production-d1-migrate.mjs";

const target = "0145_notion_webhook_inbox.sql";
const migration = readFileSync(new URL("../drizzle/" + target, import.meta.url), "utf8");
const snapshot = db => ({
  objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all(),
});

test("0145 is a protected, additive-only production D1 target", () => {
  assert.ok(SUPPORTED_PRODUCTION_TARGETS.includes(target));
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|UPDATE|ALTER)\s+(?:TABLE|INDEX|FROM|notion_webhook_inbox)\b/i);
  const db = new DatabaseSync(":memory:");
  try {
    assert.deepEqual(targetSchemaObjects(snapshot(db), target), { partial: false });
    assert.doesNotThrow(() =>
      assertPendingTargetSchemaClean(target, targetSchemaObjects(snapshot(db), target)));
    db.exec(migration);
    assert.deepEqual(targetSchemaObjects(snapshot(db), target), { partial: true });
    assert.equal(assertNotionWebhookInbox0145Schema(snapshot(db)), true);
  } finally { db.close(); }
});

test("0145 deduplicates event receipts, checks state and preserves work", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration);
    const insert = db.prepare(
      "INSERT INTO notion_webhook_inbox(event_key,page_id,event_type,changed_properties_json) VALUES (?,?,?,?)",
    );
    insert.run("event1", "11111111-2222-4333-8444-555555555555",
      "page.properties_updated", "[]");
    assert.throws(() => insert.run("event1", "11111111-2222-4333-8444-555555555555",
      "page.properties_updated", "[]"), /UNIQUE constraint/);
    assert.throws(() => insert.run("event2", "11111111-2222-4333-8444-555555555555",
      "invalid-event", "[]"), /CHECK constraint/);
    assert.throws(() => db.exec(
      "UPDATE notion_webhook_inbox SET status='UNKNOWN' WHERE event_key='event1'"), /CHECK constraint/);
    assert.equal(db.prepare("SELECT status FROM notion_webhook_inbox WHERE event_key='event1'").get().status,
      "PENDING");
    db.exec("UPDATE notion_webhook_inbox SET status='REVIEW' WHERE event_key='event1'");
    assert.equal(db.prepare("SELECT status FROM notion_webhook_inbox WHERE event_key='event1'").get().status,
      "REVIEW");
  } finally { db.close(); }
});

test("0145 postflight rejects a damaged D1 index or weakened constraints", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration);
    const state = snapshot(db);
    assert.throws(() => assertNotionWebhookInbox0145Schema({
      ...state, objects: state.objects.filter(row => row.name !== "notion_webhook_inbox_pending"),
    }), /pending inbox index missing/);
    assert.throws(() => assertNotionWebhookInbox0145Schema({
      ...state, objects: state.objects.map(row => row.name === "notion_webhook_inbox"
        ? { ...row, sql: row.sql.replace("PRIMARY KEY NOT NULL", "NOT NULL") } : row),
    }), /event identity must be unique/);
  } finally { db.close(); }
});
