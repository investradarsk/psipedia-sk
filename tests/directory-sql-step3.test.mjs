import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { directoryStep3Readiness } from "../lib/directory-sql-step3-readiness.mjs";
import { step3RepairGate } from "../scripts/production-directory-onetime-notion-import.mjs";

const page = (id, revision = "2026-11-20T10:00:00Z") => ({
  id: "00000000-0000-4000-8000-" + String(id).padStart(12, "0"),
  last_edited_time: revision,
  properties: { "Psipedia ID": { type: "rich_text", rich_text: [{ plain_text: String(id) }] } },
});
const row = (id, extra = {}) => ({
  id, status: "published", tombstone: 0,
  updated_at: "2026-11-20T10:00:00Z", notion_page_id: page(id).id, ...extra,
});

test("readiness only flags active missing and detects revisions without changing data", () => {
  const rows = [
    row(75, { status: "archived" }),
    row(118, { updated_at: "2026-11-20T11:00:00Z" }),
    row(231, { updated_at: "2026-11-20T11:00:00Z" }),
    row(565, { tombstone: 1 }),
    row(568, { tombstone: 1 }),
    row(1723),
    row(2000),
  ];
  const receipts = [118, 231, 2000].map(id => ({
    profile_id: id, state: "STAGED",
    source_revision: "2026-11-20T10:00:00Z",
    notion_revision: "2026-11-20T10:00:00Z",
  }));
  const report = directoryStep3Readiness(rows, receipts, [
    page(118), page(231, "2026-11-20T12:00:00Z"), page(1723), page(2000),
  ]);
  assert.equal(report.profiles, 7);
  assert.deepEqual(report.states, { STAGED: 3, VERIFIED: 0, SQL_ONLY: 0 });
  assert.deepEqual(report.samples.missingActive, [1723]);
  assert.deepEqual(report.samples.protectedUnstaged, [75, 565, 568]);
  assert.deepEqual(report.samples.changedInD1, [118, 231]);
  assert.deepEqual(report.samples.changedInNotion, [231]);
  assert.equal(report.safeToSwitchRuntime, false);
});

test("readiness rejects duplicate, orphan or unknown receipts rather than asserting cutover", () => {
  const profiles = [row(10)];
  const receipt = { profile_id: 10, state: "STAGED", source_revision: "r" };
  assert.throws(() => directoryStep3Readiness(profiles, [receipt, receipt], []),
    /DUPLICATE_RECEIPT/);
  assert.throws(() => directoryStep3Readiness(profiles, [{ ...receipt, profile_id: 99 }], []),
    /ORPHAN_RECEIPT/);
  assert.throws(() => directoryStep3Readiness(profiles, [{ ...receipt, state: "ACTIVE" }], []),
    /INVALID_STATE/);
});

function sqlFixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, updated_at TEXT, status TEXT,
      slug TEXT, source_data_json TEXT
    );
    CREATE TABLE directory_notion_sync (directory_profile_id INTEGER, notion_page_id TEXT);
    CREATE TABLE directory_profile_sql_cutover_state (profile_id INTEGER PRIMARY KEY);
    CREATE TABLE admin_record_tombstones (kind TEXT, record_id INTEGER, record_slug TEXT);
    CREATE TABLE directory_profile_review_state (
      profile_id INTEGER, reviewed_at TEXT, unlock_pending INTEGER
    );
    CREATE TABLE partner_resources (id INTEGER, entity_type TEXT, directory_profile_id INTEGER);
    CREATE TABLE partner_memberships (resource_id INTEGER, revoked_at TEXT);
  `);
  db.prepare("INSERT INTO directory_profiles VALUES (10,?,'published','profile-10','{}')")
    .run("2026-11-20T10:00:00Z");
  db.prepare("INSERT INTO directory_notion_sync VALUES (10,?)").run(page(10).id);
  return db;
}

test("repair SQL gate accepts only a live unprotected, unstaged Notion mapping", () => {
  const db = sqlFixture();
  const plan = { id: 10, sourceRevision: "2026-11-20T10:00:00Z", pageId: page(10).id };
  const query = step3RepairGate(plan);
  assert.equal(db.prepare(query.sql).get(...query.params).allowed, 1);
  db.exec("INSERT INTO directory_profile_sql_cutover_state VALUES (10)");
  assert.throws(() => db.prepare(query.sql).get(...query.params), /malformed JSON/);
  db.close();
});

test("repair gate refuses stale D1 timestamps and reviewed records", () => {
  const db = sqlFixture();
  const plan = { id: 10, sourceRevision: "2026-11-20T10:00:00Z", pageId: page(10).id };
  db.exec("INSERT INTO directory_profile_review_state VALUES (10,'2026-11-20',0)");
  assert.throws(() => {
    const q = step3RepairGate(plan);
    db.prepare(q.sql).get(...q.params);
  }, /malformed JSON/);
  db.exec("DELETE FROM directory_profile_review_state");
  db.exec("UPDATE directory_profiles SET updated_at='new' WHERE id=10");
  assert.throws(() => {
    const q = step3RepairGate(plan);
    db.prepare(q.sql).get(...q.params);
  }, /malformed JSON/);
  db.close();
});
