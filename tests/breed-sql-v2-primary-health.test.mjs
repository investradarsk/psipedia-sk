import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessBreedSqlV2PrimaryHealth} from "../lib/breed-sql-v2-primary-health.mjs";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const valid=()=>({
  base:{breed_count:347},
  links:{active_count:344,unique_breeds:344,unique_pages:344},
  extras:[{id:5},{id:13},{id:14}],
  controlled:{sidecar_count:344,invalid_values:0,invalid_notion:0,pending_sync:0},
  orphanControlled:{orphan_count:0},
  destination:{fci_rows:347,editorial_rows:347,fact_rows:344,related_rows:6},
  missing:{missing_fci:0,missing_editorial:0,missing_facts:0},
  foreignKeys:{violations:0},
  scalarParity:{linked_mirrors:344,fci_group_conflicts:1,
    fci_section_conflicts:2,size_conflicts:247},
  controlledFacts:{mismatches:0},
});
test("347 SQL breed rows, 344 Notion mirrors and controlled D1 facts are healthy without legacy parity",()=>{
  const r=assessBreedSqlV2PrimaryHealth(valid());
  assert.equal(r.ready,true);
  assert.equal(r.legacyJsonCompared,false);
  assert.equal(r.writesAttempted,false);
  assert.equal(r.inspected.breeds,347);
  assert.equal(r.inspected.pendingNotionCells,0);
  assert.deepEqual(r.inspected.classificationDifferences,{
    fci_group_conflicts:1,fci_section_conflicts:2,size_conflicts:247});
});
test("invalid SQL joins, missing rows, foreign keys or pending Notion edits block",()=>{
  const v=valid();
  v.missing.missing_fci=1;
  v.missing.missing_facts=1;
  v.foreignKeys.violations=1;
  v.controlled.pending_sync=2;
  v.controlledFacts.mismatches=3;
  const r=assessBreedSqlV2PrimaryHealth(v);
  assert.equal(r.ready,false);
  for(const key of ["MISSING_SQL_missing_fci","MISSING_SQL_missing_facts",
    "FOREIGN_KEYS","NOTION_PENDING_CHANGES","CONTROLLED_FACTS_SQL_PARITY"])
    assert(r.blockers.includes(key),key);
});
test("null, string and missing counts do not silently become valid",()=>{
  const v=valid();
  v.links.active_count="344";
  v.destination.fci_rows=null;
  v.scalarParity.size_conflicts=undefined;
  v.destination.related_rows=-1;
  const r=assessBreedSqlV2PrimaryHealth(v);
  assert.equal(r.ready,false);
  for(const key of ["ACTIVE_NOTION_LINKS","FCI_SQL_ROWS",
    "INVALID_CLASSIFICATION_size_conflicts","RELATION_SQL_ROWS"])
    assert(r.blockers.includes(key),key);
});
test("production audit uses SQL-only mode and retains shadow readiness for rollback",()=>{
  const worker=JSON.parse(read("wrangler.jsonc"));
  assert.equal(worker.vars.BREED_SQL_V2_READ_MODE,"sql");
  assert.equal(worker.vars.BREED_SQL_V2_WRITE_MODE,"sql");
  const audit=read("scripts/production-breed-sql-v2-shadow-audit.mjs");
  assert.match(audit,/if\(writeMode==="sql"\)/);
  assert.match(audit,/assessBreedSqlV2PrimaryHealth/);
  assert.match(audit,/assessBreedSqlV2ShadowReadiness/);
  assert.match(audit,/SQL_ONLY_HEALTHY/);
  assert.match(audit,/SELECT_ONLY/);
  assert.match(audit,/BREED_V2_POSTFLIGHT_SQL\.facts/);
  const sqlBranch=audit.slice(audit.indexOf('if(writeMode==="sql"){',audit.indexOf("function run()")),
    audit.indexOf("  const result={",audit.indexOf("function run()")));
  assert.doesNotMatch(sqlBranch,/BREED_V2_POSTFLIGHT_SQL\.(fci|editorial|seo|relations|extraRelations)/);
  const workflow=read(".github/workflows/production-breed-sql-v2-shadow-audit.yml");
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/AUDIT-BREEDS-V2-SHADOW-347/);
  assert.match(workflow,/refs\/heads\/main/);
  assert.doesNotMatch(workflow,/\bapply\b.*--remote/);
});
