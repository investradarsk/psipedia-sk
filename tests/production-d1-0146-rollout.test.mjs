import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS,
  HELP_SOURCE_0146_OBJECTS, targetSchemaObjects, assertPendingTargetSchemaClean,
  assertHelpSource0146Schema, validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const target = "0146_help_source_daily_checks.sql";
const sql = readFileSync(new URL("../drizzle/" + target, import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml", import.meta.url), "utf8");
const schema = db => ({ objects: db.prepare(
  "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all() });

test("0146 is a protected, owner-dispatched target and never starts on PR merge", () => {
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-3), target);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-4), "0145_notion_webhook_inbox.sql");
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  assert.equal(HELP_SOURCE_0146_OBJECTS.length, 5);
  assert.match(workflow, /- 0146_help_source_daily_checks\.sql/);
  assert.match(workflow, /0146_help_source_daily_checks\.sql\) expected_confirmation="APPLY-0146-psipedia-sk-db"/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
  assert.doesNotMatch(sql.replace(/^--[^\n]*/gm,""), /\b(?:DROP|ALTER|DELETE|UPDATE)\s+(?:TABLE|INDEX|FROM|SET)\b/i);
});

test("0146 history permits exactly 0145 as predecessor and detects unexpected gaps", () => {
  const expected = [
    ...Array.from({length: 62}, (_,i) => String(i).padStart(4,"0") + "_fixture.sql"),
    ...SUPPORTED_PRODUCTION_TARGETS.filter(item => Number(item.slice(0,4)) <= 146),
  ];
  assert.deepEqual(validateProductionTargetHistory(expected.slice(0,-1), expected, target),
    {latestIndex:145,targetApplied:false});
  assert.deepEqual(validateProductionTargetHistory(expected, expected, target),
    {latestIndex:146,targetApplied:true});
  assert.throws(() => validateProductionTargetHistory(expected.slice(0,-2), expected, target),
    /expected exactly 0145/);
});

test("0146 preflight blocks partial DDL, postflight verifies every required index and constraint", () => {
  const db = new DatabaseSync(":memory:");
  try {
    assert.deepEqual(targetSchemaObjects(schema(db),target),{partial:false});
    assert.doesNotThrow(() => assertPendingTargetSchemaClean(target,targetSchemaObjects(schema(db),target)));
    db.exec("CREATE TABLE help_source_checks(entity_type TEXT, entity_id INTEGER)");
    assert.deepEqual(targetSchemaObjects(schema(db),target),{partial:true});
    assert.throws(() => assertPendingTargetSchemaClean(target,targetSchemaObjects(schema(db),target)),
      /partial\/manual drift/);
    db.exec("DROP TABLE help_source_checks");
    db.exec(sql);
    assert.deepEqual(targetSchemaObjects(schema(db),target),{partial:true});
    assert.equal(assertHelpSource0146Schema(schema(db)),true);
    const damaged=schema(db);
    assert.throws(() => assertHelpSource0146Schema({
      objects: damaged.objects.filter(x=>x.name!=="idx_help_source_checks_review"),
    }), /missing\/modified index/);
    assert.throws(() => assertHelpSource0146Schema({
      objects: damaged.objects.map(x=>x.name==="help_source_checks"
        ? {...x,sql:x.sql.replace("'UNCHECKED','ACTIVE_SIGNAL'","'UNCHECKED','CHANGED'")} : x),
    }), /state constraints drift/);
    assert.throws(() => assertHelpSource0146Schema({
      objects: damaged.objects.map(x=>x.name==="admin_attention_ack"
        ? {...x,sql:x.sql.replace("PRIMARY KEY (source_type, source_id)","")} : x),
    }), /composite identity drift/);
  } finally {db.close();}
});

test("0146 preserves separate lifecycle statuses, rejects duplicate acknowledgements and invalid states", () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE adoption_dogs (id INTEGER PRIMARY KEY, status TEXT NOT NULL);"+
      "INSERT INTO adoption_dogs VALUES(1,'ACTIVE')");
    db.exec("CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY, status TEXT NOT NULL);"+
      "INSERT INTO lost_found_dog_reports VALUES(1,'ACTIVE')");
    db.exec(sql);
    db.exec("INSERT INTO help_source_checks(entity_type,entity_id) VALUES('ADOPTION',1)");
    assert.equal(db.prepare("SELECT source_state FROM help_source_checks").get().source_state,"UNCHECKED");
    assert.throws(()=>db.exec("INSERT INTO help_source_checks(entity_type,entity_id) VALUES('ADOPTION',1)"),
      /UNIQUE constraint/);
    assert.throws(()=>db.exec("INSERT INTO help_source_checks(entity_type,entity_id) VALUES('LOST_FOUND',0)"),
      /CHECK constraint/);
    assert.throws(()=>db.exec("UPDATE help_source_checks SET source_state='RESOLVED'"),
      /CHECK constraint/);
    db.exec("INSERT INTO admin_attention_ack(source_type,source_id,relevant_at,updated_at) "+
      "VALUES('help_source','ADOPTION:1','2026-10-30','2026-10-30')");
    assert.throws(()=>db.exec("INSERT INTO admin_attention_ack(source_type,source_id,relevant_at,updated_at) "+
      "VALUES('help_source','ADOPTION:1','2026-10-30','2026-10-30')"), /UNIQUE constraint/);
    assert.equal(db.prepare("SELECT status FROM adoption_dogs").get().status,"ACTIVE");
    assert.equal(db.prepare("SELECT status FROM lost_found_dog_reports").get().status,"ACTIVE");
  } finally {db.close();}
});
