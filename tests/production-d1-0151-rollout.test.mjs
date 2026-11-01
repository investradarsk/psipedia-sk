import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS,
  targetSchemaObjects, assertVisualLibrary0151Schema,
} from "../scripts/production-d1-migrate.mjs";

const migration = "0151_visual_library_banner_edits.sql";
const sql = readFileSync(new URL("../drizzle/" + migration, import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml", import.meta.url), "utf8");

function objects(db) {
  return { objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all() };
}

test("0151 remains protected and never runs on PR merge", () => {
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-1), migration);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /- 0151_visual_library_banner_edits\.sql/);
  assert.match(workflow, /0151_visual_library_banner_edits\.sql\) expected_confirmation="APPLY-0151-psipedia-sk-db"/);
  assert.match(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
  assert.doesNotMatch(sql.replace(/^--[^\n]*/gm, ""), /\b(?:DROP|ALTER|DELETE|UPDATE)\s+(?:TABLE|INDEX|FROM|SET)\b/i);
});

test("0151 creates isolated versioned draft and publication storage; existing data stays intact", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_articles(id INTEGER PRIMARY KEY, title TEXT); INSERT INTO managed_articles VALUES(1,'Published')");
    assert.deepEqual(targetSchemaObjects(objects(db),migration),{partial:false});
    db.exec(sql);
    assert.deepEqual(targetSchemaObjects(objects(db),migration),{partial:true});
    assert.equal(assertVisualLibrary0151Schema(objects(db)),true);
    assert.equal(db.prepare("SELECT title FROM managed_articles WHERE id=1").get().title,"Published");
    assert.throws(()=>db.exec("INSERT INTO visual_library_banner_edits (banner_id,variant_index,draft_json,updated_at,updated_by) VALUES('a',3,'{}','now','owner')"),/CHECK constraint/);
    db.exec("INSERT INTO visual_library_banner_edits (banner_id,variant_index,draft_json,updated_at,updated_by) VALUES('a',0,'{}','now','owner')");
    assert.throws(()=>db.exec("INSERT INTO visual_library_banner_edits (banner_id,variant_index,draft_json,updated_at,updated_by) VALUES('a',0,'{}','now','owner')"),/UNIQUE constraint/);
  } finally { db.close(); }
});

test("0151 schema guard detects missing audit fields or relaxed revision guard", () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE visual_library_banner_edits (banner_id TEXT, variant_index INTEGER, draft_json TEXT)");
    assert.throws(()=>assertVisualLibrary0151Schema(objects(db)),/0151/);
  } finally { db.close(); }
});
