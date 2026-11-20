import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { helpApprovedShelterRemovalsQuery, HELP_INTENTIONALLY_REMOVED_SHELTERS } from "../lib/help-sql-reviewed-backfill.mjs";
import {
  HELP_SQL_CUTOVER_SCHEMA,
  HELP_SQL_CUTOVER_AGENDAS,
  assessHelpSqlCutover,
} from "../lib/help-sql-cutover-readiness.mjs";
import {
  assertHelpSqlManualContext,assertHelpSqlReadOnly,
  unwrapWranglerRows,checkpointFingerprint,
} from "../scripts/production-help-sql-cutover.mjs";

const SHA="a".repeat(40);
const NOW="2026-11-19T22:00:00.000Z";
const categories=["adopcia","utulky"];
const candidates=[
  ["adoptions","main_image"],["adoptions","short_description"],
  ["adoptions","description"],["organizations","image_url"],
  ["organizations","short_description"],["organizations","description"],
];
function fixture() {
  const inventory={
    database:"psipedia-sk-db",readOnly:true,
    gitRevision:SHA,executedAt:NOW,
    missingTables:[],byCategory:[],
    orphanMappings:HELP_SQL_CUTOVER_AGENDAS.map(scope=>({scope,count:0})),
    helpLegacyCoverage:categories.map(category=>({
      category,status:"aggregate_only",legacyTotal:0,matched:0,unmatched:0,
    })),
    helpLegacyApprovedRemovals:{
      status:"exact_slug_audit",approvedUnmatched:0,
      approvedDistinct:0,unexpectedUnmatched:0,
    },
    helpLegacyLostFoundCoverage:{
      status:"requires_manual_type_review",legacyTotal:0,
      noSlugMatch:0,needsTypeReview:0,ambiguousTypeMatch:0,
    },
    helpLegacyFieldCandidates:candidates.map(([agenda,field])=>({
      agenda,field,status:"candidate_counts_only",
      joinedPairs:0,potentialMissing:0,differentNonempty:0,
    })),
  };
  const schema={
    ready:true,
    tables:Object.entries(HELP_SQL_CUTOVER_SCHEMA).map(([table])=>({
      table,exists:true,missingColumns:[],
    })),
  };
  return {inventory,schema,recoveryCheckpoint:true,now:NOW,expectedSha:SHA};
}
test("Help D1 structural zero-risk fixture passes ONLY as aggregate readiness",()=>{
  const result=assessHelpSqlCutover(fixture());
  assert.equal(result.status,"structural_check_passed");
  assert.equal(result.productionDataModified,false);
  assert.equal(result.canApplyBackfill,false);
  assert.equal(result.canDeleteLegacy,false);
  assert.equal(result.fieldLevelNotionParityVerified,false);
  assert.equal(result.publicUrlParityVerified,false);
  assert.deepEqual(result.blockers,[]);
});
test("refuse a missing table, absent recovery checkpoint, malformed or stale evidence",()=>{
  const examples=[
    x=>{x.schema.tables.find(t=>t.table==="adoption_dogs").missingColumns.push("gallery_json");},
    x=>{x.schema.ready=false;},
    x=>{x.inventory.missingTables.push("help_cases");},
    x=>{x.recoveryCheckpoint=false;},
    x=>{x.expectedSha="b".repeat(40);},
    x=>{x.inventory.executedAt="2026-11-01T00:00:00Z";},
    x=>{x.inventory.readOnly=false;},
    x=>{x.inventory.helpLegacyCoverage=[];},
    x=>{x.inventory.orphanMappings=[];},
  ];
  for(const modify of examples) {
    const x=fixture();modify(x);
    assert.equal(assessHelpSqlCutover(x).status,"blocked",modify.toString());
  }
});
test("historic missing adoption/shelter links and missing public content are blocking",()=>{
  for(const modify of [
    x=>{x.inventory.helpLegacyCoverage[0].legacyTotal=2;
      x.inventory.helpLegacyCoverage[0].matched=1;
      x.inventory.helpLegacyCoverage[0].unmatched=1;},
    x=>{x.inventory.helpLegacyCoverage[1].status="missing_table";},
    x=>{x.inventory.helpLegacyFieldCandidates[0].joinedPairs=1;
      x.inventory.helpLegacyFieldCandidates[0].potentialMissing=1;},
    x=>{x.inventory.helpLegacyFieldCandidates[0].joinedPairs=1;
      x.inventory.helpLegacyFieldCandidates[0].differentNonempty=2;},
  ]) {
    const x=fixture();modify(x);
    assert.equal(assessHelpSqlCutover(x).status,"blocked");
  }
});
test("only exact owner-approved shelter removals bypass the old unmatched aggregate blocker",()=>{
  const x=fixture();
  Object.assign(x.inventory.helpLegacyCoverage[1],{
    legacyTotal:104,matched:94,unmatched:10,
  });
  Object.assign(x.inventory.helpLegacyApprovedRemovals,{
    approvedUnmatched:10,approvedDistinct:10,unexpectedUnmatched:0,
  });
  const approved=assessHelpSqlCutover(x);
  assert.equal(approved.status,"structural_check_passed");
  assert.equal(approved.canApplyBackfill,false);
  assert.equal(approved.canDeleteLegacy,false);
  assert.equal(approved.summary.intentionallyRemovedShelters,10);
  assert.ok(approved.warnings.some(w=>w.includes("reimport")));
  for(const modify of [
    y=>{y.inventory.helpLegacyApprovedRemovals.unexpectedUnmatched=1;
      y.inventory.helpLegacyApprovedRemovals.approvedUnmatched=9;
      y.inventory.helpLegacyApprovedRemovals.approvedDistinct=9;},
    y=>{y.inventory.helpLegacyApprovedRemovals.approvedDistinct=9;},
    y=>{y.inventory.helpLegacyApprovedRemovals.approvedUnmatched=11;},
    y=>{y.inventory.helpLegacyApprovedRemovals.status="missing_table";},
    y=>{delete y.inventory.helpLegacyApprovedRemovals;},
  ]) {
    const copy=fixture();
    Object.assign(copy.inventory.helpLegacyCoverage[1],{
      legacyTotal:104,matched:94,unmatched:10,
    });
    Object.assign(copy.inventory.helpLegacyApprovedRemovals,{
      approvedUnmatched:10,approvedDistinct:10,unexpectedUnmatched:0,
    });
    modify(copy);
    assert.equal(assessHelpSqlCutover(copy).status,"blocked");
  }
});
test("exact-slug read-only audit rejects unknown, changed-state or duplicate shelters",()=>{
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE help_cases (slug TEXT,category TEXT,status TEXT);"+
      "CREATE TABLE help_organizations (slug TEXT);");
    const insert=db.prepare("INSERT INTO help_cases (slug,category,status) VALUES (?,?,?)");
    for(const slug of HELP_INTENTIONALLY_REMOVED_SHELTERS)
      insert.run(slug,"utulky","published");
    const sql=helpApprovedShelterRemovalsQuery();
    assert.match(sql,/^SELECT /);
    const audit=()=>db.prepare(sql).get();
    assert.deepEqual({...audit()},{
      approved_unmatched:10,approved_distinct:10,unexpected_unmatched:0,
    });
    insert.run("unknown-rescue","utulky","published");
    assert.equal(audit().unexpected_unmatched,1);
    db.prepare("UPDATE help_cases SET status='draft' WHERE slug=?")
      .run(HELP_INTENTIONALLY_REMOVED_SHELTERS[0]);
    assert.equal(audit().unexpected_unmatched,2);
    insert.run(HELP_INTENTIONALLY_REMOVED_SHELTERS[1],"utulky","published");
    assert.equal(audit().approved_unmatched,10);
    assert.equal(audit().approved_distinct,9);
  } finally { db.close(); }
});
test("lost-found legacy records are never treated as safe from matching a slug",()=>{
  for(const patch of [
    {legacyTotal:1,noSlugMatch:1},
    {legacyTotal:1,needsTypeReview:1},
    {legacyTotal:2,ambiguousTypeMatch:2},
  ]) {
    const x=fixture();
    Object.assign(x.inventory.helpLegacyLostFoundCoverage,patch);
    const assessed=assessHelpSqlCutover(x);
    assert.equal(assessed.status,"blocked");
    assert.ok(assessed.blockers.includes("HISTORICAL_LOST_FOUND_REQUIRES_TYPE_AND_URL_REVIEW"));
  }
});
test("unknown Notion mapping coverage must never count as zero linked",()=>{
  const x=fixture();
  x.inventory.byCategory.push({
    scope:"adoptions",category:"adoptions",state:"ACTIVE",
    records:3,notionMapped:null,
  });
  const output=assessHelpSqlCutover(x);
  assert.equal(output.status,"blocked");
  assert.ok(output.blockers.includes("NOTION_MAPPING_COVERAGE_UNKNOWN"));
});

test("Notion orphan mappings block even when all public SQL values exist",()=>{
  const x=fixture();
  x.inventory.orphanMappings.find(r=>r.scope==="lost-found").count=2;
  assert.ok(assessHelpSqlCutover(x).blockers.includes("NOTION_ORPHANS_REQUIRE_REVIEW"));
});
test("different nonempty historical values are warnings, not authorization to overwrite",()=>{
  const x=fixture();
  Object.assign(x.inventory.helpLegacyFieldCandidates[0],{
    joinedPairs:1,potentialMissing:0,differentNonempty:1,
  });
  const a=assessHelpSqlCutover(x);
  assert.equal(a.status,"structural_check_passed");
  assert.equal(a.canApplyBackfill,false);
  assert.ok(a.warnings.some(v=>v.includes("disagree")));
});
test("guarded remote SQL allowlist rejects every attempt to write, even PRAGMA commands",()=>{
  for(const table of Object.keys(HELP_SQL_CUTOVER_SCHEMA)) {
    assert.equal(assertHelpSqlReadOnly("SELECT name FROM pragma_table_info('"+table+"')"),
      "SELECT name FROM pragma_table_info('"+table+"')");
  }
  for(const value of [
    "SELECT * FROM help_cases",
    "SELECT 1; DELETE FROM adoption_dogs",
    "PRAGMA table_info('help_cases')",
    "INSERT INTO help_cases VALUES(1)",
    "SELECT name FROM pragma_table_info('help_cases');",
    "SELECT name FROM pragma_table_info('unknown_table')",
  ]) assert.throws(()=>assertHelpSqlReadOnly(value),/UNAPPROVED_SQL/);
});
test("manual protected workflow must run only on exact main/canonical account",()=>{
  const resources={
    account_id:"5ff902d3d80376478b9213b2b8ae8d6e",
    d1:{
      binding:"DB",database_name:"psipedia-sk-db",
      database_id:"8f7a0c3e-4d77-4a35-8192-a7bd57147950",
    },
  };
  const context={
    GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_REF:"refs/heads/main",
    GITHUB_REPOSITORY:"investradarsk/psipedia-sk",GITHUB_SHA:SHA,
    CLOUDFLARE_API_TOKEN:"test-only-token",
    CLOUDFLARE_ACCOUNT_ID:resources.account_id,
    HELP_SQL_CONFIRMATION:"AUDIT-HELP-SQL-psipedia-sk-db",
  };
  assert.doesNotThrow(()=>assertHelpSqlManualContext(context,"audit",resources));
  for(const bad of [
    {GITHUB_EVENT_NAME:"pull_request"},
    {GITHUB_REF:"refs/heads/feat/help-sql-final-cutover"},
    {GITHUB_REPOSITORY:"attacker/psipedia-sk"},
    {CLOUDFLARE_API_TOKEN:""},
    {CLOUDFLARE_ACCOUNT_ID:"another"},
    {HELP_SQL_CONFIRMATION:"APPLY-HELP-SQL-psipedia-sk-db"},
  ]) assert.throws(()=>assertHelpSqlManualContext({...context,...bad},"audit",resources),
    /PRODUCTION_CONTEXT_INVALID/);
  assert.throws(()=>assertHelpSqlManualContext(context,"postflight",resources),/INVALID/);
  assert.doesNotThrow(()=>assertHelpSqlManualContext({
    ...context,HELP_SQL_CONFIRMATION:"POSTFLIGHT-HELP-SQL-psipedia-sk-db",
    HELP_SQL_BACKUP_CONFIRMATION:"INDEPENDENT-BACKUP-VERIFIED",
    HELP_SQL_PARITY_CONFIRMATION:"ADMIN-NOTION-PUBLIC-PARITY-REVIEWED",
  },"postflight",resources));
});
test("Wrangler JSON parsing is fail-closed; recovery bookmark never exported as raw value",()=>{
  assert.deepEqual(unwrapWranglerRows(JSON.stringify([{
    success:true,results:[{name:"table"}],
  }])),[{name:"table"}]);
  for(const payload of ["", "{}",'[{"success":false,"results":[]}]'])
    assert.throws(()=>unwrapWranglerRows(payload));
  const raw=JSON.stringify({data:{bookmarks:[{bookmark:"1234567890abcdefghijklmnop"}]}});
  const fingerprint=checkpointFingerprint(raw);
  assert.match(fingerprint,/^[a-f0-9]{16}$/);
  assert.notEqual(fingerprint,"1234567890abcdefghijklmnop");
  assert.throws(()=>checkpointFingerprint("{}"),/RECOVERY_POINT_MISSING/);
});
test("workflow never migrates, deploys, backfills, deletes or exports production rows",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/production-help-sql-cutover.yml",import.meta.url),"utf8");
  const script=readFileSync(new URL("../scripts/production-help-sql-cutover.mjs",import.meta.url),"utf8");
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: .*production-d1-migration/);
  assert.match(workflow,/refs\/heads\/main/);
  assert.match(workflow,/run: node scripts\/production-editorial-storage-readonly\.mjs/);
  assert.match(workflow,/run: node scripts\/production-help-sql-cutover\.mjs/);
  assert.doesNotMatch(workflow,/d1 migrations apply|wrangler deploy|d1 export|time-travel restore/);
  assert.doesNotMatch(script,/["']d1["'],["'](?:export|restore|migrations)["']/);
  assert.doesNotMatch(script, /\.run\(|\.batch\(/);
});
