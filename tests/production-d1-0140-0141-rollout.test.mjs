import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  SUPPORTED_PRODUCTION_TARGETS,
  PREPARED_PRODUCTION_TARGETS,
  targetSchemaObjects,
  assertPendingTargetSchemaClean,
  assertDirectoryServiceNotionRelations0140Schema,
  assertQualityMissingHourly0141Schema,
  selectMigrationsThrough,
} from "../scripts/production-d1-migrate.mjs";

const migration140 = "0140_directory_service_notion_relations.sql";
const migration141 = "0141_quality_missing_hourly.sql";

function schema(db) {
  return { objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all() };
}

test("0140 and 0141 retain separate protected production targets in correct order", () => {
  assert.deepEqual(SUPPORTED_PRODUCTION_TARGETS.slice(-3,-1), [migration140, migration141]);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  const fixture = Array.from({ length: 62 }, (_, n) => String(n).padStart(4, "0") + "_fixture.sql");
  const selected140 = selectMigrationsThrough([...fixture, ...SUPPORTED_PRODUCTION_TARGETS], migration140);
  assert.equal(selected140.selected.at(-1), migration140);
  assert.deepEqual(selected140.excludedFuture, [migration141, "0142_quality_missing_scan_outcomes.sql"]);
  const selected141 = selectMigrationsThrough([...fixture, ...SUPPORTED_PRODUCTION_TARGETS], migration141);
  assert.equal(selected141.selected.at(-1), migration141);
  assert.deepEqual(selected141.excludedFuture, ["0142_quality_missing_scan_outcomes.sql"]);
});

test("0140 preflight detects partial schema; postflight verifies canonical FK and index", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON; CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY)");
    assert.deepEqual(targetSchemaObjects(schema(db), migration140), {partial:false});
    db.exec(readFileSync(new URL("../drizzle/0140_directory_service_notion_relations.sql", import.meta.url), "utf8"));
    assert.deepEqual(targetSchemaObjects(schema(db), migration140), {partial:true});
    assert.throws(() => assertPendingTargetSchemaClean(migration140, targetSchemaObjects(schema(db), migration140)), /partial\/manual drift/);
    assert.doesNotThrow(() => assertDirectoryServiceNotionRelations0140Schema(schema(db)));
    const damaged = schema(db);
    damaged.objects = damaged.objects.filter(x=>x.name !== "idx_directory_service_notion_relation_page");
    assert.throws(() => assertDirectoryServiceNotionRelations0140Schema(damaged), /index is missing/);
  } finally { db.close(); }
});

test("0141 is additive; preflight refuses partial data-quality schema and postflight checks all objects", () => {
  const db = new DatabaseSync(":memory:");
  try {
    assert.deepEqual(targetSchemaObjects(schema(db), migration141), {partial:false});
    db.exec(readFileSync(new URL("../drizzle/0141_quality_missing_hourly.sql", import.meta.url), "utf8"));
    assert.deepEqual(targetSchemaObjects(schema(db), migration141), {partial:true});
    assert.throws(() => assertPendingTargetSchemaClean(migration141, targetSchemaObjects(schema(db), migration141)), /partial\/manual drift/);
    assert.doesNotThrow(() => assertQualityMissingHourly0141Schema(schema(db)));
    assert.deepEqual(db.prepare("SELECT area FROM quality_missing_cursors ORDER BY area").all().map(x=>x.area),
      ["events","help","services"]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quality_missing_proposals").get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quality_missing_scans").get().n,0);
    assert.throws(() => {
      db.exec("INSERT INTO quality_missing_scans(area,hour,scanned_at) VALUES('services','2026-10-23T09','2026-10-23')");
      db.exec("INSERT INTO quality_missing_scans(area,hour,scanned_at) VALUES('services','2026-10-23T09','2026-10-23')");
    }, /UNIQUE constraint failed/);
    const missingIndex = schema(db);
    missingIndex.objects = missingIndex.objects.filter(x=>x.name !== "quality_missing_proposals_pending");
    assert.throws(()=>assertQualityMissingHourly0141Schema(missingIndex), /missing index/);
  } finally { db.close(); }
});
