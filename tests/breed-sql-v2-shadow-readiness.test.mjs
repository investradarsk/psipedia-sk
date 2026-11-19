import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  assessBreedSqlV2ShadowReadiness,
  BREED_SQL_V2_SHADOW_AUDIT_QUERY_KEYS,
} from "../lib/breed-sql-v2-shadow-readiness.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
function clean(){
  return {
    base:{breed_count:347,invalid_fci:0,invalid_editorial:0,
      invalid_seo:0,invalid_relations:0},
    links:{active_count:344,unique_breeds:344,unique_pages:344},
    controlled:{sidecar_count:344,invalid_values:0,invalid_notion:0,pending_sync:0},
    orphanControlled:{orphan_count:0},
    destination:{fci_rows:347,editorial_rows:347,fact_rows:344,
      related_rows:6,migrated_seo_rows:300},
    extras:[{id:5},{id:13},{id:14}],
    foreignKeys:{violations:0},
    scalarParity:{linked_mirrors:344,fci_group_conflicts:0,
      fci_section_conflicts:0,size_conflicts:0},
    post:{fci:0,editorial:0,seo:0,facts:0,relations:0,extraRelations:0},
  };
}
test("exact 347/344 and six zero-difference cohorts allow guarded activation only",()=>{
  const result=assessBreedSqlV2ShadowReadiness(clean());
  assert.equal(result.ready,true);
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.publicCutover,false);
  assert.equal(result.liveNotionPageChecked,false);
  assert.equal(result.inspected.breeds,347);
  assert.equal(result.inspected.linkedNotionD1Mirrors,344);
  assert.equal(result.inspected.relatedEdges,6);
});
test("stale Notion revisions, scalar conflicts, or changed JSON hard-block enabling",()=>{
  const v=clean();
  v.controlled.pending_sync=2;
  v.scalarParity.size_conflicts=1;
  v.post.editorial=3;
  v.post.extraRelations=1;
  const result=assessBreedSqlV2ShadowReadiness(v);
  assert.equal(result.ready,false);
  assert(result.blockers.includes("NOTION_PENDING_CHANGES"));
  assert(result.blockers.includes("CONTROLLED_SCALAR_size_conflicts"));
  assert(result.blockers.includes("SQL_PARITY_editorial"));
  assert(result.blockers.includes("SQL_PARITY_extraRelations"));
});
test("missing/null/undefined metrics never masquerade as zero",()=>{
  const v=clean();
  v.base.breed_count=null;
  v.post.fci=undefined;
  v.scalarParity.fci_group_conflicts=null;
  v.foreignKeys.violations=undefined;
  const result=assessBreedSqlV2ShadowReadiness(v);
  assert.equal(result.ready,false);
  for(const code of ["BREED_COUNT","SQL_PARITY_fci",
    "CONTROLLED_SCALAR_fci_group_conflicts","FOREIGN_KEY_VIOLATIONS"])
    assert(result.blockers.includes(code),code);
});
test("mismatched Notion cohort and orphan controlled sidecar are blockers",()=>{
  const v=clean();
  v.links.active_count=343;
  v.orphanControlled.orphan_count=1;
  v.extras=[{id:5},{id:13}];
  const result=assessBreedSqlV2ShadowReadiness(v);
  assert.deepEqual(result.blockers.filter(s=>["ACTIVE_LINKS","ORPHAN_CONTROLLED_SIDECARS",
    "UNLINKED_IDENTITIES"].includes(s)).sort(),
    ["ACTIVE_LINKS","ORPHAN_CONTROLLED_SIDECARS","UNLINKED_IDENTITIES"].sort());
});
test("production workflow is owner-only manual audit without any apply input",()=>{
  const workflow=read(".github/workflows/production-breed-sql-v2-shadow-audit.yml");
  const runner=read("scripts/production-breed-sql-v2-shadow-audit.mjs");
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/AUDIT-BREEDS-V2-SHADOW-347/);
  assert.match(workflow,/refs\/heads\/main/);
  assert.doesNotMatch(workflow,/options:\s*\[audit, apply\]/);
  assert.match(runner,/SELECT-only/);
  assert.match(runner,/SELECT_ONLY/);
  assert.match(runner,/BREED_SQL_V2_WRITE_MODE/);
  assert.match(runner,/sql.includes\(";"\)/);
  assert.match(runner,/assessBreedSqlV2ShadowReadiness/);
  assert.equal(BREED_SQL_V2_SHADOW_AUDIT_QUERY_KEYS.length,14);
});
