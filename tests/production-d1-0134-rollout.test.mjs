import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  APPROVED_0134_SHA256, PREPARED_PRODUCTION_TARGETS, SUPPORTED_PRODUCTION_TARGETS,
  assertApproved0134Target, assert0134NotAlreadyApplied,
  assertServicesAdminAudit0134Schema, targetSchemaObjects,
  assertPendingTargetSchemaClean, validateProductionTargetHistory
} from "../scripts/production-d1-migrate.mjs";

const target = "0134_services_admin_change_audit.sql";
const m133 = readFileSync(new URL("../drizzle/0133_services_canonical_admin_foundation.sql", import.meta.url), "utf8");
const m134 = readFileSync(new URL("../drizzle/" + target, import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml", import.meta.url), "utf8");
const runner = readFileSync(new URL("../scripts/production-d1-migrate.mjs", import.meta.url), "utf8");
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY)");
  db.exec("INSERT INTO directory_profiles(id) VALUES(1)");
  db.exec(m133);
  const schema = () => ({objects:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name").all()});
  return {db,schema};
}
test("0134 is independently approved, 0135 has separate gated approval", () => {
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-8), target);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, ["0142_quality_missing_scan_outcomes.sql"]);
  assert.equal(createHash("sha256").update(m134).digest("hex"), APPROVED_0134_SHA256);
  assert.doesNotThrow(() => assertApproved0134Target("psipedia-sk-db", APPROVED_0134_SHA256));
  assert.throws(() => assertApproved0134Target("other-db", APPROVED_0134_SHA256), /canonical/);
  assert.throws(() => assertApproved0134Target("psipedia-sk-db", "changed"), /SHA256/);
  assert.throws(() => assert0134NotAlreadyApplied(target, true), /already applied/);
  assert.doesNotThrow(() => assert0134NotAlreadyApplied(target, false));
});
test("existing protected workflow requires manual main, production environment and unique confirmation", () => {
  assert.match(workflow, /- 0134_services_admin_change_audit\.sql/);
  assert.match(workflow, /0134_services_admin_change_audit\.sql\) expected_confirmation="APPLY-0134-psipedia-sk-db"/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.doesNotMatch(workflow, /^\s*(?:push|schedule|pull_request|workflow_run):/m);
  assert.match(runner, /assert0134NotAlreadyApplied\(targetMigration, state\.targetApplied\)/);
  assert.match(runner, /assert0134NotAlreadyApplied\(targetMigration, internal\.targetApplied \|\| liveState\.targetApplied\)/);
});
test("0134 requires exact 0133 predecessor; older target 0133 stays supported", () => {
  const chain = [...Array.from({length:62},(_,i)=>String(i).padStart(4,"0")+"_prior.sql"),...SUPPORTED_PRODUCTION_TARGETS.filter(name=>Number(name.slice(0,4))<=134)];
  const before=chain.slice(0,-1);
  assert.deepEqual(validateProductionTargetHistory(before,chain,target),{latestIndex:133,targetApplied:false});
  assert.deepEqual(validateProductionTargetHistory(chain,chain,target),{latestIndex:134,targetApplied:true});
  assert.throws(()=>validateProductionTargetHistory(before.slice(0,-1),chain,target),/expected exactly 0133/);
});
test("partial 0134 schema, including an unexpected option trigger, refuses pending apply", () => {
  const f=fixture();
  try {
    assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:false});
    f.db.exec("CREATE TABLE service_catalog_admin_change_audit(id INTEGER PRIMARY KEY)");
    assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:true});
    assert.throws(()=>assertPendingTargetSchemaClean(target,targetSchemaObjects(f.schema(),target)),/partial\/manual drift/);
    f.db.exec("DROP TABLE service_catalog_admin_change_audit");
    f.db.exec("CREATE TRIGGER rogue_services AFTER UPDATE ON service_catalog_admin_options BEGIN SELECT 1; END");
    assert.deepEqual(targetSchemaObjects(f.schema(),target),{partial:true});
  } finally {f.db.close();}
});
test("0134 postflight checks complete schema and prevents silent SQL drift", () => {
  const f=fixture();
  try {
    f.db.exec(m134); // Synthetic, offline in-memory SQLite only.
    assert.equal(assertServicesAdminAudit0134Schema(f.schema()),true);
    const rows=f.schema().objects;
    assert.equal(rows.filter(x=>x.type==="trigger").length,10);
    assert.ok(rows.some(x=>x.name==="sqlite_autoindex_service_catalog_admin_notion_receipts_1"));
    for(const [name,from,to] of [
      ["service_catalog_admin_option_approval_receipt","NOT EXISTS","EXISTS"],
      ["service_catalog_admin_notion_receipts","UNIQUE(option_id,option_version)","UNIQUE(option_id)"],
      ["service_catalog_admin_change_audit","('INSERT','UPDATE','RESET','DELETE')","('INSERT')"],
      ["service_catalog_admin_change_audit_entity_idx","profile_id","actor"]
    ]) {
      const changed=rows.map(x=>x.name===name?{...x,sql:x.sql.replace(from,to)}:x);
      assert.throws(()=>assertServicesAdminAudit0134Schema({objects:changed}),/0134 canonical DDL mismatch/);
    }
    assert.throws(()=>assertServicesAdminAudit0134Schema({objects:rows.filter(x=>x.name!=="service_catalog_admin_audit_no_delete")}),/missing\/duplicated/);
    assert.throws(()=>assertServicesAdminAudit0134Schema({objects:[...rows,{type:"trigger",name:"rogue",tbl_name:"service_catalog_admin_options",sql:"CREATE TRIGGER rogue AFTER UPDATE ON service_catalog_admin_options BEGIN SELECT 1; END"}]}),/unexpected related/);
  } finally {f.db.close();}
});
