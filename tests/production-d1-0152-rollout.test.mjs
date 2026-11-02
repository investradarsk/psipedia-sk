import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS, UNACTIVATED_PRODUCTION_TARGETS, prepareScopedMigration,
  targetSchemaObjects, assertVisualLibrary0152Schema,
} from "../scripts/production-d1-migrate.mjs";

const migration = "0152_visual_library_banner_edits.sql";
const sql = readFileSync(new URL("../drizzle/" + migration, import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml", import.meta.url), "utf8");

function objects(db) {
  return { objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all() };
}

test("0152 is UNACTIVATED until prerequisite 0151 is authorized", async () => {
  assert.ok(UNACTIVATED_PRODUCTION_TARGETS.includes(migration));
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.includes(migration), false);
  assert.equal(PREPARED_PRODUCTION_TARGETS.includes(migration), false);
  await assert.rejects(prepareScopedMigration({ targetMigration: migration }), /Unsupported production migration target/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /- 0152_visual_library_banner_edits\.sql/);
  assert.match(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
  assert.doesNotMatch(sql.replace(/^--[^\n]*/gm, ""), /\b(?:DROP|ALTER|DELETE|UPDATE)\s+(?:TABLE|INDEX|FROM|SET)\b/i);
});

test("0152 creates isolated versioned draft and publication storage; existing data stays intact", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_articles(id INTEGER PRIMARY KEY, title TEXT); INSERT INTO managed_articles VALUES(1,'Published')");
    assert.deepEqual(targetSchemaObjects(objects(db),migration),{partial:false});
    db.exec(sql);
    assert.deepEqual(targetSchemaObjects(objects(db),migration),{partial:true});
    assert.equal(assertVisualLibrary0152Schema(objects(db)),true);
    assert.equal(db.prepare("SELECT title FROM managed_articles WHERE id=1").get().title,"Published");
    assert.throws(()=>db.exec("INSERT INTO visual_library_banner_edits (banner_id,variant_index,draft_json,updated_at,updated_by) VALUES('a',3,'{}','now','owner')"),/CHECK constraint/);
    db.exec("INSERT INTO visual_library_banner_edits (banner_id,variant_index,draft_json,updated_at,updated_by) VALUES('a',0,'{}','now','owner')");
    assert.throws(()=>db.exec("INSERT INTO visual_library_banner_edits (banner_id,variant_index,draft_json,updated_at,updated_by) VALUES('a',0,'{}','now','owner')"),/UNIQUE constraint/);
  } finally { db.close(); }
});

test("0152 schema guard detects missing audit fields or relaxed revision guard", () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE visual_library_banner_edits (banner_id TEXT, variant_index INTEGER, draft_json TEXT)");
    assert.throws(()=>assertVisualLibrary0152Schema(objects(db)),/0152/);
  } finally { db.close(); }
});
