import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  BREED_0159_BLOB_SHA,
  assertBreed0159Preflight, assertBreed0159Postflight,
} from "../lib/production-d1-0159-guard.mjs";
import { createHash } from "node:crypto";

const sql = readFileSync(new URL("../drizzle/0159_breed_notion_workcopy_links.sql", import.meta.url));
const script = readFileSync(new URL("../scripts/production-d1-0159-shadow.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-0159-shadow.yml", import.meta.url), "utf8");
const mainMigrator = readFileSync(new URL("../scripts/production-d1-migrate.mjs", import.meta.url), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, slug TEXT, status TEXT);
    CREATE TABLE breed_notion_sync (breed_id INTEGER PRIMARY KEY, notion_page_id TEXT, content_hash TEXT);
  `);
  const addBreed = db.prepare("INSERT INTO managed_breeds VALUES (?,?,?)");
  const addLink = db.prepare("INSERT INTO breed_notion_sync VALUES (?,?,?)");
  for (let id = 1; id <= 344; id++) {
    addBreed.run(id, "plemeno-" + id, "published");
    addLink.run(id, "old-" + id, id <= 50 ? "legacy-sha" : "breed-field-v1:valid");
  }
  for (const [id,slug] of [
    [345,"madarska-vyzla"],[346,"beagle"],[347,"anglicky-koker-spaniel"],
  ]) addBreed.run(id,slug,"published");
  return db;
}
function inspect(db) {
  const canonicalBreeds = db.prepare("SELECT id,slug,status FROM managed_breeds").all();
  const productionLinks = db.prepare("SELECT breed_id,notion_page_id FROM breed_notion_sync").all();
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='breed_notion_workcopy_links'").get();
  const index = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_breed_notion_workcopy_status'").get();
  const present = Boolean(table);
  const columns = present ? db.prepare("SELECT name,type,pk FROM pragma_table_info('breed_notion_workcopy_links')").all() : [];
  const indexes = present ? db.prepare("SELECT name FROM pragma_index_list('breed_notion_workcopy_links') WHERE \"unique\"=1").all() : [];
  const uniqueKeys = indexes.map(x => db.prepare("SELECT name FROM pragma_index_info(?)").all(x.name).map(z => z.name));
  const statusIndexColumns = index ? db.prepare(
    "SELECT name FROM pragma_index_info('idx_breed_notion_workcopy_status')",
  ).all().map(row => row.name) : [];
  const hasStatus = columns.some(column => column.name === "status");
  const shadowStatuses = present && hasStatus
    ? db.prepare("SELECT status, COUNT(*) AS count FROM breed_notion_workcopy_links GROUP BY status").all()
    : [];
  return { canonicalBreeds, productionLinks, shadowTablePresent:present,
    shadowColumns:columns, shadowUniqueKeys:uniqueKeys, shadowStatuses,
    statusIndexPresent:Boolean(index), statusIndexColumns,
    createSql:table?.sql || "" };
}
test("0159 SQL bytes remain exactly pinned to reviewed Git blob", () => {
  const sha = createHash("sha1").update(
    Buffer.concat([Buffer.from("blob " + sql.length + "\0"), sql]),
  ).digest("hex");
  assert.equal(sha, BREED_0159_BLOB_SHA);
  assert.doesNotMatch(sql.toString().replace(/--[^\n]*/g, ""), /\b(?:DROP|ALTER|INSERT|UPDATE|REPLACE|TRUNCATE)\b/i);
});

test("additive 0159 creates only an empty separate shadow table, preserving all 347 profiles and 344 links", () => {
  const db = fixture();
  try {
    const before = {
      breeds: db.prepare("SELECT * FROM managed_breeds ORDER BY id").all(),
      links: db.prepare("SELECT * FROM breed_notion_sync ORDER BY breed_id").all(),
    };
    const initial = assertBreed0159Preflight(inspect(db));
    assert.equal(initial.alreadyInstalled, false);
    assert.equal(initial.diagnostic.canonicalCount, 347);
    assert.equal(initial.diagnostic.originalLinkCount, 344);
    db.exec(sql.toString("utf8"));
    const after = assertBreed0159Postflight(inspect(db));
    assert.equal(after.schemaReady, true);
    assert.equal(after.diagnostic.totalShadowLinks, 0);
    assert.equal(after.diagnostic.shadowCounts.ACTIVE, 0);
    assert.equal(after.diagnostic.extraCanonicalBreeds.length, 3);
    assert.deepEqual(db.prepare("SELECT * FROM managed_breeds ORDER BY id").all(), before.breeds);
    assert.deepEqual(db.prepare("SELECT * FROM breed_notion_sync ORDER BY breed_id").all(), before.links);
    assert.equal(assertBreed0159Preflight(inspect(db)).alreadyInstalled, true);
  } finally { db.close(); }
});

test("50 original legacy receipts are retained, not a schema rollout blocker", () => {
  const db = fixture();
  try {
    const before = db.prepare("SELECT content_hash FROM breed_notion_sync WHERE breed_id=1").get();
    assert.equal(assertBreed0159Preflight(inspect(db)).alreadyInstalled, false);
    db.exec(sql.toString("utf8"));
    assert.equal(assertBreed0159Postflight(inspect(db)).schemaReady, true);
    assert.deepEqual(db.prepare("SELECT content_hash FROM breed_notion_sync WHERE breed_id=1").get(), before);
  } finally { db.close(); }
});

test("fail closed on a missing production link, repeated Notion page or unlinked ID", () => {
  for (const change of [
    "DELETE FROM breed_notion_sync WHERE breed_id=344",
    "UPDATE breed_notion_sync SET notion_page_id='old-1' WHERE breed_id=2",
    "UPDATE breed_notion_sync SET breed_id=5000 WHERE breed_id=3",
  ]) {
    const db = fixture();
    try {
      db.exec(change);
      assert.throws(() => assertBreed0159Preflight(inspect(db)),
        /ORIGINAL_344_IDENTITIES_NOT_READY/);
    } finally { db.close(); }
  }
});

test("fail closed on partial or in-use 0159 table, including even one row", () => {
  const db = fixture();
  try {
    db.exec("CREATE TABLE breed_notion_workcopy_links (breed_id INTEGER PRIMARY KEY)");
    assert.throws(() => assertBreed0159Preflight(inspect(db)),
      /EXISTING_SCHEMA_INCOMPATIBLE_OR_IN_USE/);
    // A malformed table containing data must also be rejected deterministically.
    db.exec("INSERT INTO breed_notion_workcopy_links (breed_id) VALUES (1)");
    assert.throws(() => assertBreed0159Preflight(inspect(db)),
      /EXISTING_SCHEMA_INCOMPATIBLE_OR_IN_USE/);
  } finally { db.close(); }
  const other = fixture();
  try {
    other.exec(sql.toString("utf8"));
    other.exec("INSERT INTO breed_notion_workcopy_links (breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt) VALUES (1,'old-1','new-1','old-source','work-source','plemeno-1',1,'legacy-sha')");
    assert.throws(() => assertBreed0159Preflight(inspect(other)),
      /EXISTING_SCHEMA_INCOMPATIBLE_OR_IN_USE/);
  } finally { other.close(); }
});

test("0159 is a new manual-only rollout and never enables generic blocked migrations", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(push|pull_request|schedule):/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /AUDIT-0159-psipedia-sk-db/);
  assert.match(workflow, /APPLY-0159-psipedia-sk-db/);
  assert.match(workflow, /\$GITHUB_REF.*refs\/heads\/main/);
  assert.match(script, /BREED_0159_RECOVERY_BOOKMARK_MISSING/);
  assert.match(script, /assertBreed0159Postflight/);
  assert.match(script, /migrationHistoryRecorded:false/);
  assert.match(mainMigrator, /UNACTIVATED_PRODUCTION_TARGETS/);
  assert.match(mainMigrator, /"0159_breed_notion_workcopy_links\.sql"/);
});
