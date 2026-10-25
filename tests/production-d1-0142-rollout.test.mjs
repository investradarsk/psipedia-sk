import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS,
  assertPendingTargetSchemaClean, assertQualityMissingScanOutcomes0142Schema,
  targetSchemaObjects,
} from "../scripts/production-d1-migrate.mjs";

const target = "0142_quality_missing_scan_outcomes.sql";
const migration141 = readFileSync(new URL("../drizzle/0141_quality_missing_hourly.sql", import.meta.url), "utf8");
const migration142 = readFileSync(new URL("../drizzle/0142_quality_missing_scan_outcomes.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml", import.meta.url), "utf8");

function snapshot(db) {
  return {
    objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all(),
    qualityMissingScanColumns: db.prepare("PRAGMA table_info('quality_missing_scans')").all(),
  };
}

test("0142 is a protected owner-only production target and follows 0141", () => {
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-2), "0141_quality_missing_hourly.sql");
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-1), target);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  assert.match(workflow, /- 0142_quality_missing_scan_outcomes\.sql/);
  assert.match(workflow, /0142_quality_missing_scan_outcomes\.sql\) expected_confirmation="APPLY-0142-psipedia-sk-db"/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
});

test("0142 is additive; old scans become UNKNOWN while proposals and cursors remain intact", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration141);
    db.exec("INSERT INTO quality_missing_scans(area,hour,scanned_at,entity_type,entity_id) VALUES('services','2026-10-25T10','2026-10-25T10:00:00Z','DIRECTORY',123)");
    db.exec("UPDATE quality_missing_cursors SET entity_id=123 WHERE area='services'");
    db.exec("INSERT INTO quality_missing_proposals(area,entity_type,entity_id,profile_label,field_key,field_label,field_group,value,found_at) VALUES('services','DIRECTORY',123,'Test','websiteUrl','Web','web','https://example.sk','2026-10-25T10:00:00Z')");
    assert.deepEqual(targetSchemaObjects(snapshot(db), target), { partial: false });
    db.exec(migration142);
    assert.deepEqual(targetSchemaObjects(snapshot(db), target), { partial: true });
    assert.doesNotThrow(() => assertQualityMissingScanOutcomes0142Schema(snapshot(db)));
    const row = db.prepare("SELECT status,error_code FROM quality_missing_scans WHERE area='services'").get();
    assert.deepEqual(row, { status: "UNKNOWN", error_code: null });
    assert.equal(db.prepare("SELECT entity_id FROM quality_missing_cursors WHERE area='services'").get().entity_id, 123);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quality_missing_proposals").get().n, 1);
    assert.throws(() => db.exec("UPDATE quality_missing_scans SET status='INVALID'"), /CHECK constraint failed/);
  } finally {
    db.close();
  }
});

test("0142 preflight detects any half-applied status column or index before a protected apply", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration141);
    db.exec("ALTER TABLE quality_missing_scans ADD COLUMN status TEXT NOT NULL DEFAULT 'UNKNOWN'");
    const state = snapshot(db);
    assert.deepEqual(targetSchemaObjects(state, target), { partial: true });
    assert.throws(() => assertPendingTargetSchemaClean(target, targetSchemaObjects(state, target)), /partial\/manual drift/);
    assert.throws(() => assertQualityMissingScanOutcomes0142Schema(state), /index is missing/);
    db.exec("ALTER TABLE quality_missing_scans ADD COLUMN error_code TEXT");
    db.exec("CREATE INDEX quality_missing_scans_status ON quality_missing_scans(area,status,scanned_at)");
    assert.throws(() => assertQualityMissingScanOutcomes0142Schema(snapshot(db)), /CHECK constraint is missing/);
  } finally {
    db.close();
  }
});
