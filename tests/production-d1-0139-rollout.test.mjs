import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {
  PINNED_SHA256_0139,OBJECTS_0139,
  assertServicesV3Auto0139Prerequisites,assertServicesV3Auto0139Schema
} from "../scripts/production-d1-0139-schema.mjs";
import {
  SUPPORTED_PRODUCTION_TARGETS,PREPARED_PRODUCTION_TARGETS,
  APPROVED_0139_SHA256,assertApproved0139Target,assert0139NotAlreadyApplied,
  targetSchemaObjects,validateProductionTargetHistory
} from "../scripts/production-d1-migrate.mjs";

const target="0139_services_catalog_notion_auto_attempts.sql";
const sql=readFileSync(new URL("../drizzle/"+target,import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/production-d1-migrate.yml",import.meta.url),"utf8");
const obj=db=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger')").all();
function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE service_catalog_admin_options(id TEXT PRIMARY KEY);"+
  "CREATE TABLE service_catalog_admin_notion_receipts(id INTEGER PRIMARY KEY);"+
  "CREATE TABLE article_notion_editorial_outbox(id INTEGER PRIMARY KEY);"+
  "CREATE TRIGGER service_catalog_admin_receipt_no_delete BEFORE DELETE ON service_catalog_admin_notion_receipts BEGIN SELECT RAISE(ABORT,'readonly'); END;");
  return db;
}
test("0139 approved immutable bytes, exact canonical owner-only workflow and explicit confirmation",()=>{
  assert.equal(createHash("sha256").update(sql).digest("hex"),PINNED_SHA256_0139);
  assert.equal(APPROVED_0139_SHA256,PINNED_SHA256_0139);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-3),target);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS,["0142_quality_missing_scan_outcomes.sql"]);
  assert.doesNotThrow(()=>assertApproved0139Target("psipedia-sk-db",PINNED_SHA256_0139));
  assert.throws(()=>assertApproved0139Target("wrong-db",PINNED_SHA256_0139),/canonical/);
  assert.throws(()=>assertApproved0139Target("psipedia-sk-db","f".repeat(64)),/SHA256/);
  assert.doesNotThrow(()=>assert0139NotAlreadyApplied(target,false));
  assert.throws(()=>assert0139NotAlreadyApplied(target,true),/already applied/);
  assert.match(workflow,/^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/git rev-parse origin\/main/);
  assert.match(workflow,/target_applied/);
  assert.match(workflow,/test:migration-safety/);
  assert.ok(workflow.includes("          - "+target));
  assert.ok(workflow.includes('0139_services_catalog_notion_auto_attempts.sql) expected_confirmation="APPLY-0139-psipedia-sk-db"'));
  assert.doesNotMatch(workflow,/^\s*(push|schedule|pull_request):/m);
  assert.doesNotMatch(workflow,/wrangler deploy|time-travel restore/);
});
test("0139 strictly follows 0138 without changing historical production migration chain",()=>{
  const selected=SUPPORTED_PRODUCTION_TARGETS.filter(name=>Number(name.slice(0,4))<=139);
  assert.equal(selected.at(-2),"0138_article_editorial_outbox.sql");
  const before=selected.slice(0,-1);
  assert.deepEqual(validateProductionTargetHistory(before,selected,target),{latestIndex:138,targetApplied:false});
  assert.deepEqual(validateProductionTargetHistory([...before,target],selected,target),{latestIndex:139,targetApplied:true});
  assert.throws(()=>validateProductionTargetHistory(before.slice(0,-1),selected,target),/expected exactly 0138/);
});
test("0139 exact schema, immutable attempts, no silent duplicate or partial DDL",()=>{
  const db=fixture();
  try{
    const schema=()=>({objects:obj(db)});
    assert.equal(assertServicesV3Auto0139Prerequisites(schema()),true);
    assert.equal(targetSchemaObjects(schema(),target).partial,false);
    assert.throws(()=>assertServicesV3Auto0139Schema(schema(),sql),/0139_MISSING_OR_WRONG_OBJECT/);
    db.exec(sql);
    assert.equal(targetSchemaObjects(schema(),target).partial,true);
    assert.equal(assertServicesV3Auto0139Schema(schema(),sql),true);
    assert.throws(()=>assertServicesV3Auto0139Schema(schema(),sql+" --tampered"),/IMMUTABLE_SQL_HASH_MISMATCH/);
    db.prepare("INSERT INTO service_catalog_notion_auto_attempts(option_id,option_version,action,claimed_at) VALUES(?,?,?,?)")
      .run("svc.admin."+"a".repeat(32),1,"MIRROR_ONE","2026-10-22T09:00:00.000Z");
    assert.throws(()=>db.prepare("INSERT INTO service_catalog_notion_auto_attempts(option_id,option_version,action,claimed_at) VALUES(?,?,?,?)")
      .run("svc.admin."+"a".repeat(32),1,"MIRROR_ONE","2026-10-22T09:01:00.000Z"),/UNIQUE constraint/);
    db.exec("UPDATE service_catalog_notion_auto_attempts SET outcome='RETRY',finished_at='2026-10-22T09:01:00.000Z'");
    assert.throws(()=>db.exec("UPDATE service_catalog_notion_auto_attempts SET outcome='VERIFIED'"),/cannot be rewritten/);
    assert.throws(()=>db.exec("DELETE FROM service_catalog_notion_auto_attempts"),/history is durable/);
  }finally{db.close();}
});
test("0139 rejects missing 0138 predecessor, mutated PK and missing update/delete triggers",()=>{
  const db=fixture();
  try{
    db.exec(sql);
    const snapshot=()=>({objects:obj(db)});
    db.exec("DROP TRIGGER service_catalog_notion_auto_attempt_no_delete");
    assert.throws(()=>assertServicesV3Auto0139Schema(snapshot(),sql),/MISSING_OR_WRONG_OBJECT/);
  }finally{db.close();}
  const missing=new DatabaseSync(":memory:");
  try{
    assert.throws(()=>assertServicesV3Auto0139Prerequisites({objects:obj(missing)}),/MISSING_OR_WRONG_OBJECT/);
  }finally{missing.close();}
});
