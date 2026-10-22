import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  PINNED_SHA256_0137, OBJECTS_0137, COLUMNS_0137,
} from "../scripts/production-d1-0137-schema.mjs";
import {
  SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS,
  APPROVED_0137_SHA256, assertApproved0137Target,
  assert0137NotAlreadyApplied, assertMediaReview0137Schema,
  targetSchemaObjects, assertPendingTargetSchemaClean,
  validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const target = "0137_media_source_review_decisions.sql";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql = read("drizzle/" + target);
const workflow = read(".github/workflows/production-d1-migrate.yml");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, image_key TEXT);");
  db.exec("CREATE TABLE managed_events (id INTEGER PRIMARY KEY, image_key TEXT);");
  db.exec(read("drizzle/0099_media_source_quality.sql"));
  const shape = () => ({
    objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all(),
    mediaSourceMonitorColumns: db.prepare("PRAGMA table_info('media_source_monitors')").all(),
  });
  return {db,shape};
}

test("0137 SQL is pinned to canonical database and protected owner dispatch", () => {
  assert.equal(createHash("sha256").update(sql).digest("hex"), PINNED_SHA256_0137);
  assert.equal(APPROVED_0137_SHA256, PINNED_SHA256_0137);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-4), "0136_gemini_global_stop.sql");
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-3), target);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  assert.doesNotThrow(()=>assertApproved0137Target("psipedia-sk-db",PINNED_SHA256_0137));
  assert.throws(()=>assertApproved0137Target("wrong-db",PINNED_SHA256_0137), /canonical/);
  assert.throws(()=>assertApproved0137Target("psipedia-sk-db","changed"), /SHA256/);
  assert.throws(()=>assert0137NotAlreadyApplied(target,true), /already applied/);
  assert.match(workflow, /- 0137_media_source_review_decisions\.sql/);
  assert.match(workflow, /0137_media_source_review_decisions\.sql\) expected_confirmation="APPLY-0137-psipedia-sk-db"/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
});

test("0137 requires 0136 as its immediate recorded predecessor", () => {
  const chain = [...Array.from({length:62},(_,i)=>String(i).padStart(4,"0")+"_prior.sql"),
    ...SUPPORTED_PRODUCTION_TARGETS.filter(name => Number(name.slice(0,4)) <= 137)];
  assert.deepEqual(validateProductionTargetHistory(chain.slice(0,-1),chain,target),
    {latestIndex:136,targetApplied:false});
  assert.throws(()=>validateProductionTargetHistory(chain.slice(0,-2),chain,target), /expected exactly 0136/);
});

test("0137 refuses a partially applied schema and verifies exact final DDL", () => {
  const {db,shape}=fixture();
  try {
    assert.deepEqual(targetSchemaObjects(shape(),target), {partial:false});
    db.exec(sql);
    assert.deepEqual(targetSchemaObjects(shape(),target), {partial:true});
    assert.throws(()=>assertPendingTargetSchemaClean(target,targetSchemaObjects(shape(),target)),
      /partial\/manual drift/);
    assert.equal(assertMediaReview0137Schema(shape()),true);
    const missing=shape();
    missing.objects=missing.objects.filter(row=>row.name!=="media_review_decision_finalization_guard");
    assert.throws(()=>assertMediaReview0137Schema(missing),/missing or duplicated/);
    const missingClaim=shape();
    missingClaim.mediaSourceMonitorColumns=missingClaim.mediaSourceMonitorColumns.filter(row=>row.name!=="review_claim_token");
    assert.throws(()=>assertMediaReview0137Schema(missingClaim),/required monitor column/);
    assert.deepEqual(COLUMNS_0137, ["review_claim_token","review_claimed_at"]);
    assert.equal(Object.keys(OBJECTS_0137).length,6);
    assert.throws(()=>assertMediaReview0137Schema({...shape(), objects:[]}),/missing or duplicated/);
  } finally {db.close();}
});

test("0137 rejects unfinalized decisions and makes committed audit history immutable", () => {
  const {db}=fixture();
  try {
    db.exec(sql);
    assert.throws(()=>db.prepare(`INSERT INTO media_source_review_decisions (
      id,monitor_id,entity_type,entity_id,candidate_image_key,candidate_image_url,
      action,actor_ref,decided_at,outcome) VALUES
      ('invalid',17,'DIRECTORY_PROFILE',17,'candidate','https://example.invalid/img.webp',
       'reject','operator','2026-10-21T00:00:00Z','APPLIED')`).run(),
      /MEDIA_REVIEW_INCOMPLETE_DECISION/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM media_source_review_decisions").get().n,0);
    db.exec("INSERT INTO directory_profiles (id,image_key) VALUES (17,'directory/old.webp')");
    db.exec(`INSERT INTO media_source_monitors (id,entity_type,entity_id,status,created_at,updated_at)
      VALUES (17,'DIRECTORY_PROFILE',17,'UNTRACKED','2026-10-21T00:00:00Z','2026-10-21T00:00:00Z')`);
    db.exec(`INSERT INTO media_source_review_decisions (
      id,monitor_id,entity_type,entity_id,candidate_image_key,candidate_image_url,
      action,actor_ref,decided_at,outcome) VALUES
      ('done',17,'DIRECTORY_PROFILE',17,'candidate','https://example.invalid/img.webp',
      'reject','operator','2026-10-21T00:00:00Z','APPLIED')`);
    assert.throws(()=>db.exec("UPDATE media_source_review_decisions SET reason='bad'"),
      /MEDIA_REVIEW_AUDIT_IMMUTABLE/);
    assert.throws(()=>db.exec("DELETE FROM media_source_review_decisions"),
      /MEDIA_REVIEW_AUDIT_IMMUTABLE/);
  } finally {db.close();}
});
