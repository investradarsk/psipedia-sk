import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  TARGET_0133, PINNED_SHA256_0133, SERVICE_TABLES_0133, SERVICE_INDEXES_0133,
  SQL_LEDGER_0133, SQL_OBJECTS_0133, SQL_METRICS_0133,
  assertReadonly0133Query, buildReadonly0133Command, expected0133Objects,
  classify0133, audit0133,
} from "../scripts/production-d1-0133-readonly.mjs";
import { createHash } from "node:crypto";

const migration = readFileSync(new URL("../drizzle/0133_services_canonical_admin_foundation.sql", import.meta.url),"utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-0133-readonly.yml", import.meta.url),"utf8");
const verifier = readFileSync(new URL("../scripts/production-d1-0133-readonly.mjs", import.meta.url),"utf8");
const canonical = [...Array.from({length:133},(_,i)=>`${String(i).padStart(4,"0")}_fixture.sql`),TARGET_0133];
const resources = {account_id:"5ff902d3d80376478b9213b2b8ae8d6e",d1:{binding:"DB",database_name:"psipedia-sk-db",database_id:"8f7a0c3e-4d77-4a35-8192-a7bd57147950"}};
const env = {GITHUB_ACTIONS:"true", GITHUB_REF:"refs/heads/main", CLOUDFLARE_API_TOKEN:"fake-offline-token", CLOUDFLARE_ACCOUNT_ID: resources.account_id};
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY)");
  db.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)");
  const insert=db.prepare("INSERT INTO d1_migrations(id,name) VALUES(?,?)");
  canonical.forEach((name,i)=>insert.run(i+1,name));
  db.exec("INSERT INTO directory_profiles(id) VALUES(1)");
  db.exec(migration);
  const query=async (_db,sql)=>db.prepare(assertReadonly0133Query(sql)).all();
  return {db,query};
}

test("0133 is exactly the pinned additive migration with six expected DDL objects",()=>{
  assert.equal(createHash("sha256").update(migration).digest("hex"),PINNED_SHA256_0133);
  assert.deepEqual([...expected0133Objects(migration).keys()].sort(),[...SERVICE_TABLES_0133,...SERVICE_INDEXES_0133].sort());
  assert.equal(expected0133Objects(migration).size,6);
});

test("Actions verifier is dispatch-only, owner-confirmed, protected, isolated from apply/deploy",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/AUDIT-0133-postflight-psipedia-sk-db/);
  assert.match(workflow,/refs\/heads\/main/);
  assert.match(workflow,/git rev-parse origin\/main/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/secrets\.CLOUDFLARE_D1_API_TOKEN/);
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow,/^\s*(push|pull_request|schedule|workflow_run):/m);
  assert.doesNotMatch(workflow,/\bmigrations\s+apply\b|\bwrangler\s+deploy\b|\btime-travel\s+restore\b|\bdeploy:cloudflare\b/i);
  assert.doesNotMatch(verifier,/production-d1-migrate\.mjs|"migrations"\s*,\s*"apply"|"deploy"/);
});

test("remote transport has ONLY three immutable SELECTs; DDL, DML, PRAGMA and stacked SQL are rejected",()=>{
  const allowed=[SQL_LEDGER_0133,SQL_OBJECTS_0133,SQL_METRICS_0133];
  for(const sql of allowed){
    assert.equal(assertReadonly0133Query(sql),sql);
    assert.match(sql,/^SELECT /);
    assert.doesNotMatch(sql,/;|\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|ATTACH|PRAGMA)\b/i);
    assert.deepEqual(buildReadonly0133Command("psipedia-sk-db",sql),["wrangler","d1","execute","psipedia-sk-db","--remote","--json","--command",sql]);
  }
  for(const sql of ["PRAGMA foreign_key_check","DELETE FROM service_catalog_admin_options",
    "SELECT 1; DROP TABLE directory_profiles", "UPDATE service_profile_option_choices SET choice='no'",
    "CREATE INDEX x ON t(id)","SELECT * FROM sqlite_master"])
    assert.throws(()=>assertReadonly0133Query(sql),/UNAUTHORIZED_SQL/);
  assert.throws(()=>buildReadonly0133Command("other-database",SQL_LEDGER_0133),/INVALID_DATABASE/);
});

test("valid postflight verifies history, exact tables/indexes, constraints and no orphaned rows",async()=>{
  const {db,query}=fixture();
  try {
    const result=await audit0133({resources,migration,canonicalNames:canonical,env,query});
    assert.equal(result.result,"APPLIED_AND_VERIFIED");
    assert.equal(result.referentialIntegrity,"PASS");
    assert.equal(result.counts.choice_orphans,0);
    assert.equal(result.counts.property_orphans,0);
    assert.equal(result.inspectedTables.length,3);
    assert.equal(result.inspectedIndexes.length,7);
    assert.deepEqual(result.counts,{options_count:0,choices_count:0,properties_count:0,choice_orphans:0,property_orphans:0});
  } finally {db.close();}
});

test("rejects wrong cloud account/database, missing protected Actions, and changed 0133 bytes without a query",async()=>{
  let reads=0;
  const query=async()=>{reads++;return [];};
  const base={resources,migration,canonicalNames:canonical,env,query};
  for(const options of [
    {...base,resources:{...resources,account_id:"other"}},
    {...base,resources:{...resources,d1:{...resources.d1,database_id:"other"}}},
    {...base,env:{...env,GITHUB_REF:"refs/heads/feature"}},
    {...base,env:{...env,GITHUB_ACTIONS:"false"}},
    {...base,env:{...env,CLOUDFLARE_API_TOKEN:""}},
    {...base,migration:migration+"\n-- changed\n"},
  ]) await assert.rejects(()=>audit0133(options),/GUARD|BYTES_CHANGED/);
  assert.equal(reads,0);
});

test("rejects missing/duplicated/reordered ledger and previously applied migration without schema",()=>{
  const {db}=fixture();
  try {
    const ledger=db.prepare(SQL_LEDGER_0133).all();
    const objects=db.prepare(SQL_OBJECTS_0133).all();
    const metrics=db.prepare(SQL_METRICS_0133).all();
    for(const altered of [ledger.slice(0,-1),[...ledger,ledger.at(-1)],
      [...ledger.slice(0,-2),ledger.at(-1),ledger.at(-2)],
      ledger.map((row,i)=>i===133?{...row,name:"0133_other.sql"}:row)])
      assert.throws(()=>classify0133(altered,objects,metrics,canonical,migration),/HISTORY_MISMATCH/);
    assert.throws(()=>classify0133(ledger,[],metrics,canonical,migration),/OBJECT_SET_DRIFT/);
  } finally {db.close();}
});

test("rejects missing index, changed index, weakened CHECK, missing foreign key or cascade",()=>{
  const {db}=fixture();
  try {
    const ledger=db.prepare(SQL_LEDGER_0133).all();
    const objects=db.prepare(SQL_OBJECTS_0133).all();
    const metrics=db.prepare(SQL_METRICS_0133).all();
    const check=xs=>()=>classify0133(ledger,xs,metrics,canonical,migration);
    assert.throws(check(objects.filter(x=>x.name!=="service_catalog_admin_options_mirror_idx")) ,/OBJECT_SET_DRIFT/);
    assert.throws(check(objects.map(x=>x.name==="service_catalog_admin_options_status_idx"?{...x,sql:x.sql.replace("primary_category","status")}:x)),/SCHEMA_OR_CONSTRAINT_DRIFT/);
    assert.throws(check(objects.map(x=>x.name==="service_profile_option_choices"?{...x,sql:x.sql.replace("('yes','no')","('yes','no','unknown')")}:x)),/SCHEMA_OR_CONSTRAINT_DRIFT/);
    assert.throws(check(objects.map(x=>x.name==="service_profile_property_values"?{...x,sql:x.sql.replace("ON DELETE CASCADE","ON DELETE SET NULL")}:x)),/SCHEMA_OR_CONSTRAINT_DRIFT/);
    assert.throws(check(objects.map(x=>x.name==="sqlite_autoindex_service_profile_property_values_1"?{...x,sql:"CREATE INDEX fake"}:x)),/AUTO_INDEX_DRIFT/);
  } finally {db.close();}
});

test("orphan reference detected without exposing profile IDs",()=>{
  const {db}=fixture();
  try{
    db.exec("PRAGMA foreign_keys=OFF");
    db.exec("INSERT INTO service_profile_option_choices (profile_id,option_id,choice,created_at,updated_at,created_by,updated_by) VALUES (123,'test','yes','now','now','test','test')");
    const ledger=db.prepare(SQL_LEDGER_0133).all();
    const objects=db.prepare(SQL_OBJECTS_0133).all();
    const metrics=db.prepare(SQL_METRICS_0133).all();
    assert.equal(metrics[0].choice_orphans,1);
    assert.throws(()=>classify0133(ledger,objects,metrics,canonical,migration),/REFERENTIAL_INTEGRITY_FAILED/);
  }finally{db.close();}
});
