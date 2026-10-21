import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  PINNED_SHA256_0136, OBJECTS_0136, assertGeminiStop0136Schema,
} from "../scripts/production-d1-0136-schema.mjs";
import {
  SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS,
  APPROVED_0136_SHA256, assertApproved0136Target, assert0136NotAlreadyApplied,
  targetSchemaObjects, assertPendingTargetSchemaClean, validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const target = "0136_gemini_global_stop.sql";
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const sql = read("drizzle/" + target);
const workflow = read(".github/workflows/production-d1-migrate.yml");
const runner = read("scripts/production-d1-migrate.mjs");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE gemini_manual_background_jobs (id INTEGER PRIMARY KEY, stable_key TEXT NOT NULL, status TEXT NOT NULL, error_code TEXT);");
  db.exec("CREATE TABLE gemini_automation_runs (id INTEGER PRIMARY KEY, status TEXT NOT NULL);");
  const shape = () => ({
    objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all(),
    geminiManualJobColumns: db.prepare("PRAGMA table_info('gemini_manual_background_jobs')").all(),
  });
  return {db,shape};
}

test("0136 is immutable, follows canonical applied 0135, and can only be owner-dispatched", () => {
  assert.equal(createHash("sha256").update(sql).digest("hex"), PINNED_SHA256_0136);
  assert.equal(APPROVED_0136_SHA256, PINNED_SHA256_0136);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-4), "0135_facebook_image_safe_retry.sql");
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-3), target);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  assert.doesNotThrow(() => assertApproved0136Target("psipedia-sk-db", APPROVED_0136_SHA256));
  assert.throws(() => assertApproved0136Target("other-db", APPROVED_0136_SHA256), /canonical/);
  assert.throws(() => assertApproved0136Target("psipedia-sk-db", "different"), /SHA256/);
  assert.throws(() => assert0136NotAlreadyApplied(target, true), /already applied/);
  assert.match(workflow, /- 0136_gemini_global_stop\.sql/);
  assert.match(workflow, /0136_gemini_global_stop\.sql\) expected_confirmation="APPLY-0136-psipedia-sk-db"/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
  assert.match(runner, /assert0136NotAlreadyApplied\(targetMigration, state\.targetApplied\)/);
  assert.match(runner, /assert0136NotAlreadyApplied\(targetMigration, internal\.targetApplied \|\| liveState\.targetApplied\)/);
  assert.match(runner, /if \(targetIndex >= 136\) assertFacebookRetry0135Schema\(schema\)/);
});

test("0136 does not allow skipped 0135, older history or repeat without intervention", () => {
  const historical = [...Array.from({length:62},(_,i)=>String(i).padStart(4,"0")+"_prior.sql"),...SUPPORTED_PRODUCTION_TARGETS.filter(name=>Number(name.slice(0,4))<=136)];
  assert.deepEqual(validateProductionTargetHistory(historical.slice(0,-1),historical,target),
    {latestIndex:135,targetApplied:false});
  assert.throws(()=>validateProductionTargetHistory(historical.slice(0,-2),historical,target),/expected exactly 0135/);
  assert.throws(()=>validateProductionTargetHistory(
    [...historical.slice(0,-2),"0135_fake.sql"],historical,target),/exactly match/);
});

test("0136 detects any partial schema before apply and validates protected objects after", () => {
  const {db,shape}=fixture();
  try {
    assert.deepEqual(targetSchemaObjects(shape(),target), {partial:false});
    db.exec(sql);
    assert.deepEqual(targetSchemaObjects(shape(),target), {partial:true});
    assert.throws(()=>assertPendingTargetSchemaClean(target,targetSchemaObjects(shape(),target)),/partial\/manual drift/);
    assert.equal(assertGeminiStop0136Schema(shape(),sql),true);
    const altered=shape();altered.objects=altered.objects.filter(row=>row.name!=="gemini_global_stop_job_claim");
    assert.throws(()=>assertGeminiStop0136Schema(altered,sql),/missing or duplicated/);
    const noColumn=shape();noColumn.geminiManualJobColumns=noColumn.geminiManualJobColumns.filter(x=>x.name!=="worker_started_at");
    assert.throws(()=>assertGeminiStop0136Schema(noColumn,sql),/worker_started_at/);
    assert.throws(()=>assertGeminiStop0136Schema(shape(),sql+"\n-- alteration"),/digest mismatch/);
    assert.equal(db.prepare("SELECT state FROM gemini_global_control WHERE id=1").get().state,"RUNNING");
  } finally {db.close();}
});

test("0136 enforces STOP for queue claims and direct runs without stopping existing completions",()=>{
  const {db}=fixture();
  try {
    db.exec(sql);
    db.prepare("INSERT INTO gemini_manual_background_jobs(stable_key,status) VALUES('directory.veterinari','RUNNING')").run();
    db.prepare("INSERT INTO gemini_manual_background_jobs(stable_key,status) VALUES('help.zbierky','FAILED')").run();
    db.exec("UPDATE gemini_global_control SET state='STOPPED', revision=revision+1 WHERE id=1;");
    assert.throws(()=>db.prepare("INSERT INTO gemini_manual_background_jobs(stable_key,status) VALUES('help.utulky','QUEUED')").run(),/GEMINI_GLOBAL_STOP/);
    assert.throws(()=>db.prepare("UPDATE gemini_manual_background_jobs SET status='RUNNING' WHERE stable_key='help.zbierky'").run(),/GEMINI_GLOBAL_STOP/);
    assert.throws(()=>db.prepare("INSERT INTO gemini_automation_runs(status) VALUES('RUNNING')").run(),/GEMINI_GLOBAL_STOP/);
    db.prepare("UPDATE gemini_manual_background_jobs SET status='SUCCESS' WHERE stable_key='directory.veterinari'").run();
    assert.equal(db.prepare("SELECT status FROM gemini_manual_background_jobs WHERE stable_key='directory.veterinari'").get().status,"SUCCESS");
    assert.equal(OBJECTS_0136.length,4);
  } finally{db.close();}
});
