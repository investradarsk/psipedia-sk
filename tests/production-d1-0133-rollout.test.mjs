import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  APPROVED_0133_SHA256, PREPARED_PRODUCTION_TARGETS, SUPPORTED_PRODUCTION_TARGETS,
  assertApproved0133Target, assert0133NotAlreadyApplied,
  assertServicesCanonicalAdminSchema, targetSchemaObjects, assertPendingTargetSchemaClean,
  validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const target = "0133_services_canonical_admin_foundation.sql";
const previous = "0132_facebook_image_direct_consent.sql";
const sql = readFileSync(new URL("../drizzle/" + target, import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml", import.meta.url), "utf8");
const script = readFileSync(new URL("../scripts/production-d1-migrate.mjs", import.meta.url), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL)");
  db.exec("INSERT INTO directory_profiles (id,category,status) VALUES (1,'veterinari','published'),(2,'treneri','archived')");
  const schema = () => ({objects:db.prepare(
    "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name"
  ).all()});
  return {db,schema};
}

test("0133 manually approved only by pinned SHA256, canonical database, protected Actions confirmation", () => {
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-5), target);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-6), previous);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  assert.equal(createHash("sha256").update(sql).digest("hex"), APPROVED_0133_SHA256);
  assert.doesNotThrow(() => assertApproved0133Target("psipedia-sk-db", APPROVED_0133_SHA256));
  assert.throws(() => assertApproved0133Target("wrong-db", APPROVED_0133_SHA256), /canonical/);
  assert.throws(() => assertApproved0133Target("psipedia-sk-db", "changed-sql"), /SHA256/);
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*(?:push|schedule|pull_request):/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /D1 Time Travel|Production D1 preflight and Time Travel recovery point/);
  assert.match(workflow, /- 0133_services_canonical_admin_foundation\.sql/);
  assert.match(workflow, /0133_services_canonical_admin_foundation\.sql\) expected_confirmation="APPLY-0133-psipedia-sk-db"/);
  assert.match(script, /assert0133NotAlreadyApplied\(targetMigration, state\.targetApplied\)/);
  assert.match(script, /assert0133NotAlreadyApplied\(targetMigration, internal\.targetApplied \|\| liveState\.targetApplied\)/);
});

test("0133 refuses gaps, altered history, already-applied migration and partial drift", () => {
  const chain = [
    ...Array.from({length:62}, (_,i) => String(i).padStart(4,"0") + "_prior.sql"),
    ...SUPPORTED_PRODUCTION_TARGETS.filter(name => Number(name.slice(0,4)) <= 133),
  ];
  const before = chain.slice(0,-1);
  assert.deepEqual(validateProductionTargetHistory(before,chain,target), {latestIndex:132,targetApplied:false});
  assert.deepEqual(validateProductionTargetHistory(chain,chain,target), {latestIndex:133,targetApplied:true});
  assert.throws(() => validateProductionTargetHistory(before.slice(0,-1),chain,target), /expected exactly 0132/);
  assert.throws(() => validateProductionTargetHistory([...before.slice(0,-1),"0132_rogue.sql"],chain,target), /does not exactly match/);
  assert.throws(() => assert0133NotAlreadyApplied(target,true), /already applied/);
  assert.doesNotThrow(() => assert0133NotAlreadyApplied(target,false));
  const f = fixture();
  try {
    assert.deepEqual(targetSchemaObjects(f.schema(),target), {partial:false});
    f.db.exec("CREATE TABLE service_catalog_admin_options (id TEXT PRIMARY KEY)");
    assert.deepEqual(targetSchemaObjects(f.schema(),target), {partial:true});
    assert.throws(() => assertPendingTargetSchemaClean(target,targetSchemaObjects(f.schema(),target)),/partial\/manual drift/);
    assert.throws(() => assertServicesCanonicalAdminSchema(f.schema()),/0133/);
  } finally {f.db.close();}
});

test("0133 creates only three empty tables and matching indexes, preserves all existing profiles", () => {
  assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/im);
  const f=fixture();
  try {
    const profiles=f.db.prepare("SELECT * FROM directory_profiles ORDER BY id").all();
    assert.throws(() => assertServicesCanonicalAdminSchema(f.schema()), /0133/);
    assert.deepEqual(targetSchemaObjects(f.schema(),target), {partial:false});
    f.db.exec(sql);
    assert.deepEqual(targetSchemaObjects(f.schema(),target), {partial:true});
    assert.doesNotThrow(() => assertServicesCanonicalAdminSchema(f.schema()));
    assert.deepEqual(f.db.prepare("SELECT * FROM directory_profiles ORDER BY id").all(),profiles);
    for (const table of ["service_catalog_admin_options","service_profile_option_choices","service_profile_property_values"])
      assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n,0,table);
    assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length,0);
    assert.throws(() => f.db.exec(sql),/already exists/);
  } finally {f.db.close();}
});

test("0133 constraints fail closed for foreign keys, duplicate canonical labels and invalid choices", () => {
  const f=fixture();
  try {
    f.db.exec(sql);
    const optionSql = "INSERT INTO service_catalog_admin_options(id,kind,label,normalized_label,group_name,meaning,primary_category,categories_json,value_kind,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)";
    const option = f.db.prepare(optionSql);
    const insert = (id,label,normalized) => option.run(id,"service",label,normalized,"Vyšetrenia","Konkrétne vyšetrenie","veterinari",'["veterinari"]',"tri_state","2026-10-18","2026-10-18","admin","admin");
    insert("svc.admin.123","Očné vyšetrenie","ocne vysetrenie");
    assert.throws(() => insert("svc.admin.456","Očné vyšetrenie dup","ocne vysetrenie"),/UNIQUE/);
    assert.throws(() => insert("svc.admin.789","OK","ok"),/CHECK/);
    assert.throws(() => f.db.prepare("INSERT INTO service_profile_option_choices(profile_id,option_id,choice,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?)")
      .run(999,"svc.admin.123","yes","2026-10-18","2026-10-18","admin","admin"),/FOREIGN KEY/);
    assert.throws(() => f.db.prepare("INSERT INTO service_profile_option_choices(profile_id,option_id,choice,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?)")
      .run(1,"svc.admin.123","unknown","2026-10-18","2026-10-18","admin","admin"),/CHECK/);
    assert.throws(() => f.db.prepare("INSERT INTO service_profile_property_values(profile_id,property_id,value_json,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?)")
      .run(1,"attr.admin.test","not json","2026-10-18","2026-10-18","admin","admin"),/CHECK|malformed JSON/);
  } finally {f.db.close();}
});

test("0133 schema audit rejects missing/changed indexes and weakened table constraints", () => {
  const f=fixture();
  try {
    f.db.exec(sql);
    f.db.exec("DROP INDEX service_catalog_admin_options_mirror_idx");
    assert.throws(() => assertServicesCanonicalAdminSchema(f.schema()), /index/);
    f.db.exec("CREATE INDEX service_catalog_admin_options_mirror_idx ON service_catalog_admin_options(status,id)");
    assert.throws(() => assertServicesCanonicalAdminSchema(f.schema()), /index/);
  } finally {f.db.close();}
});
