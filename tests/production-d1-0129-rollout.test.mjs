import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  APPROVED_0129_SHA256, PREPARED_PRODUCTION_TARGETS, SUPPORTED_PRODUCTION_TARGETS,
  assertApproved0129Target, assert0129NotAlreadyApplied,
  assertGeminiManualQueueSchema, targetSchemaObjects, validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const migration = readFileSync(new URL("../drizzle/0129_gemini_external_manual_queue.sql", import.meta.url), "utf8");
const previous = readFileSync(new URL("../drizzle/0119_gemini_manual_background_jobs.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml", import.meta.url), "utf8");
const target = "0129_gemini_external_manual_queue.sql";
const predecessor = "0128_facebook_image_posts.sql";

test("0129 remains approved and pinned while 0130 is a later separate target", () => {
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-2), target);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-3), predecessor);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-1), "0130_facebook_image_publisher.sql");
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, ["0131_facebook_image_trash.sql"]);
  assert.equal(createHash("sha256").update(migration).digest("hex"), APPROVED_0129_SHA256);
  assert.doesNotThrow(() => assertApproved0129Target("psipedia-sk-db", APPROVED_0129_SHA256));
  assert.throws(() => assertApproved0129Target("wrong", APPROVED_0129_SHA256), /canonical psipedia-sk-db/);
  assert.throws(() => assertApproved0129Target("psipedia-sk-db", "wrong"), /SHA256 differs/);
  assert.throws(() => assert0129NotAlreadyApplied(target, true), /already applied/);
  assert.doesNotThrow(() => assert0129NotAlreadyApplied(target, false));
});

test("0129 workflow is manually protected and requires target-specific consent on main", () => {
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /0129_gemini_external_manual_queue\.sql\) expected_confirmation="APPLY-0129-psipedia-sk-db"/);
  assert.match(workflow, /- 0129_gemini_external_manual_queue\.sql/);
  assert.doesNotMatch(workflow, /^\s*(push|schedule|pull_request):/m);
  const source = readFileSync(new URL("../scripts/production-d1-migrate.mjs", import.meta.url), "utf8");
  assert.match(source, /0129 requires an empty active Gemini queue before index migration/);
  assert.match(source, /0129 active queue changed after preflight; refusing APPLY/);
});

test("0129 requires exact 0128 ledger predecessor without skipped migrations", () => {
  const history = [
    ...Array.from({ length: 62 }, (_, index) => String(index).padStart(4, "0") + "_fixture.sql"),
    ...SUPPORTED_PRODUCTION_TARGETS.filter(name => name !== "0130_facebook_image_publisher.sql"),
  ];
  const old = history.slice(0,-1);
  assert.deepEqual(validateProductionTargetHistory(old, history, target),
    { latestIndex: 128, targetApplied: false });
  assert.throws(() => validateProductionTargetHistory(old.slice(0,-1), history, target),
    /expected exactly 0128/);
  assert.deepEqual(validateProductionTargetHistory(history, history, target),
    { latestIndex: 129, targetApplied: true });
});

test("0129 replaces only global QUEUED/RUNNING index, preserves category exclusivity", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys=ON");
    sqlite.exec("CREATE TABLE gemini_automation_settings(id INTEGER PRIMARY KEY);");
    sqlite.exec("CREATE TABLE gemini_automation_runs(id INTEGER PRIMARY KEY);");
    sqlite.exec("INSERT INTO gemini_automation_settings(id) VALUES (1),(2),(3)");
    sqlite.exec(previous);
    const objects = () => ({ objects: sqlite.prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger')"
    ).all() });
    assert.equal(targetSchemaObjects(objects(),target).partial, false);
    assert.doesNotThrow(() => assertGeminiManualQueueSchema(objects(), false));
    const insert = sqlite.prepare("INSERT INTO gemini_manual_background_jobs(setting_id,stable_key,status,error_code) VALUES (?,?,?,?)");
    insert.run(1,"directory.veterinari","QUEUED","EXT_MANUAL_PENDING");
    assert.throws(() => insert.run(2,"help.adopcia","QUEUED","EXT_MANUAL_PENDING"), /UNIQUE constraint failed/);
    // Simulate the operator draining the active queue before approved APPLY.
    sqlite.exec("UPDATE gemini_manual_background_jobs SET status='SUCCESS' WHERE status='QUEUED'");
    sqlite.exec(migration);
    assert.equal(targetSchemaObjects(objects(),target).partial, true);
    assert.doesNotThrow(() => assertGeminiManualQueueSchema(objects(), true));
    assert.throws(() => assertGeminiManualQueueSchema(objects(), false), /Missing Gemini queue index/);
    insert.run(1,"directory.veterinari","QUEUED","EXT_MANUAL_PENDING");
    insert.run(2,"help.adopcia","QUEUED","EXT_MANUAL_PENDING");
    assert.throws(() => insert.run(1,"directory.veterinari","QUEUED","EXT_MANUAL_PENDING"), /UNIQUE constraint failed/);
    sqlite.prepare("UPDATE gemini_manual_background_jobs SET status='RUNNING' WHERE stable_key='directory.veterinari' AND status='QUEUED'").run();
    assert.throws(() => sqlite.prepare("UPDATE gemini_manual_background_jobs SET status='RUNNING' WHERE stable_key='help.adopcia'").run(), /UNIQUE constraint failed/);
    sqlite.prepare("UPDATE gemini_manual_background_jobs SET status='SUCCESS' WHERE stable_key='directory.veterinari' AND status='RUNNING'").run();
    sqlite.prepare("UPDATE gemini_manual_background_jobs SET status='RUNNING' WHERE stable_key='help.adopcia'").run();
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM gemini_manual_background_jobs WHERE status='RUNNING'").get().count, 1);
  } finally {
    sqlite.close();
  }
});
