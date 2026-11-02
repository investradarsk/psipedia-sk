import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS, UNACTIVATED_PRODUCTION_TARGETS,
  APPROVED_0152_SHA256, assertApproved0152Target, assertRevisionHistory0151Prerequisite,
  validateProductionTargetHistory, targetSchemaObjects, assertVisualLibrary0152Schema,
} from "../scripts/production-d1-migrate.mjs";

const migration = "0152_visual_library_banner_edits.sql";
const sql = readFileSync(new URL("../drizzle/" + migration, import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml", import.meta.url), "utf8");

function objects(db) {
  return { objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all() };
}

test("0152 is an owner-dispatched protected migration, only after completed 0151", () => {
  assert.ok(SUPPORTED_PRODUCTION_TARGETS.includes(migration));
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.includes("0151_admin_content_revision_history.sql"), false);
  assert.equal(UNACTIVATED_PRODUCTION_TARGETS.includes("0151_admin_content_revision_history.sql"), true);
  assert.equal(UNACTIVATED_PRODUCTION_TARGETS.includes(migration), false);
  assert.equal(PREPARED_PRODUCTION_TARGETS.includes(migration), false);
  assert.equal(createHash("sha256").update(sql).digest("hex"), APPROVED_0152_SHA256);
  assert.doesNotThrow(() => assertApproved0152Target("psipedia-sk-db", APPROVED_0152_SHA256));
  assert.throws(() => assertApproved0152Target("other", APPROVED_0152_SHA256), /canonical/);
  assert.throws(() => assertApproved0152Target("psipedia-sk-db", "changed"), /SHA256/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /- 0152_visual_library_banner_edits\.sql/);
  assert.match(workflow, /APPLY-0152-psipedia-sk-db/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
  assert.doesNotMatch(sql.replace(/^--[^\n]*/gm, ""), /\b(?:DROP|ALTER|DELETE|UPDATE)\s+(?:TABLE|INDEX|FROM|SET)\b/i);

  const history = ["0150_gemini_import_review_notes.sql",
    "0151_admin_content_revision_history.sql", migration];
  assert.throws(() => validateProductionTargetHistory(history.slice(0, 1), history, migration),
    /expected exactly 0151/);
  assert.deepEqual(validateProductionTargetHistory(history.slice(0, 2), history, migration),
    { latestIndex: 151, targetApplied: false });
});

test("0152 requires the actual 0151 table, index and triggers, not just a migration history row", () => {
  const signatures = [
    ["admin_content_revision_history", "table"],
    ["admin_content_revision_entity_idx", "index"],
    ["admin_section_revision_update", "trigger"],
    ["admin_visual_revision_insert", "trigger"],
    ["admin_visual_revision_update", "trigger"],
    ["admin_visual_revision_delete", "trigger"],
    ["admin_content_revision_no_update", "trigger"],
    ["admin_content_revision_no_delete", "trigger"],
  ];
  const schema = { objects: signatures.map(([name,type]) => ({ name,type })) };
  assert.equal(assertRevisionHistory0151Prerequisite(schema), true);
  for (const [missing] of signatures) {
    const incomplete = { objects: schema.objects.filter(row => row.name !== missing) };
    assert.throws(() => assertRevisionHistory0151Prerequisite(incomplete), new RegExp(missing));
  }
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
