import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const apply=fs.readFileSync("lib/data-automation-canonical-apply.ts","utf8");
const migration=fs.readFileSync("drizzle/0080_automation_canonical_apply.sql","utf8");
const api=fs.readFileSync("app/api/admin/automation-match-reviews/[observationId]/[candidateClusterId]/apply/route.ts","utf8");
const ui=fs.readFileSync("components/admin-canonical-apply-review.tsx","utf8");
const detail=fs.readFileSync("app/admin/operations/possible-matches/[observationId]/[candidateClusterId]/page.tsx","utf8");
const directoryMatcher=fs.readFileSync("lib/data-automation-directory-matching.ts","utf8");
const clustering=fs.readFileSync("lib/data-automation-clustering.ts","utf8");

test("G5 is manual update-existing only and identity decision stays separate",()=>{
  assert.match(apply,/currentDecision\.decision!==\"SAME_ENTITY\"/);
  for(const blocked of ["DIFFERENT_ENTITY","RELATIONSHIP_ONLY","DEFER"]) assert.match(apply,new RegExp("DECISION_\\$\\{review.currentDecision.decision\\}_BLOCKS_APPLY"));
  assert.doesNotMatch(apply,/INSERT INTO directory_profiles|INSERT INTO help_organizations|DELETE FROM directory_profiles|DELETE FROM help_organizations/i);
  assert.doesNotMatch(apply,/published_at\s*=|archived_at\s*=/i);
  assert.match(detail,/currentDecision\?\.decision===\"SAME_ENTITY\"/);
  assert.match(ui,/SAME_ENTITY nič neprepisuje automaticky/);
});

test("G5 eligibility fail-closes semantic, target, schema and lifecycle blockers",()=>{
  assert.match(apply,/FACILITY_OR_SERVICE_PROFILE/);
  assert.match(apply,/ORGANIZATION_SEMANTIC_KIND_BLOCKED/);
  assert.match(apply,/SOURCE_CLUSTER_CANONICAL_CONFLICT/);
  assert.match(apply,/CANONICAL_TARGET_MISSING/);
  assert.match(apply,/APPLY_SCHEMA_NOT_READY/);
  assert.match(apply,/CANONICAL_TARGET_ARCHIVED/);
  assert.match(apply,/LIFECYCLE_FIELD_NOT_SUPPORTED/);
  assert.match(apply,/FACILITY_EVIDENCE_BLOCKED_ON_ORGANIZATION_ROOT/);
});

test("G5 field apply is explicit and conflict-aware",()=>{
  for(const action of ["KEEP_CANONICAL","APPLY_INCOMING","SKIP"]) assert.match(apply,new RegExp(action));
  assert.match(apply,/choice\.action!==\"APPLY_INCOMING\"/);
  assert.match(apply,/choice\.evidenceId!==field\.evidenceId/);
  assert.match(apply,/!choice\.confirmConflict/);
  assert.match(ui,/Potvrdzujem selected evidence/);
  assert.match(ui,/Authority je kontext pre review, nie automatické povolenie overwrite/);
});

test("G5 DIRECTORY allowlist preserves PERSON/facility and service-address safety",()=>{
  for(const field of ["name","category","municipality","street","houseNumber","postalCode","phone","email","domain","ico","registryId"]) {
    assert.match(apply,new RegExp(field));
  }
  assert.match(apply,/SERVICE_ADDRESS_NOT_CONFIRMED/);
  assert.match(apply,/service_address_confirmation/);
  assert.match(directoryMatcher,/PERSON/);
  assert.match(directoryMatcher,/FACILITY_OR_SERVICE_PROFILE/);
  assert.match(directoryMatcher,/shared_ico_requires_branch_identity_review/);
});

test("G5 ORGANIZATION allowlist blocks facility evidence at organization root",()=>{
  for(const field of ["organizationName","municipality","domain","phone","email","ico","registryId","organizationType"]) {
    assert.match(apply,new RegExp(field));
  }
  assert.match(apply,/facilityRegistryId/);
  assert.match(apply,/operatorMeaning/);
  assert.match(apply,/FACILITY_EVIDENCE_BLOCKED_ON_ORGANIZATION_ROOT/);
  assert.match(clustering,/LEGAL_ORGANIZATION/);
  assert.match(clustering,/FACILITY/);
});

test("G5 stale and concurrency protection covers decision, evidence and canonical version",()=>{
  assert.match(apply,/expectedDecisionId/);
  assert.match(apply,/expectedDecisionVersion/);
  assert.match(apply,/expectedEvidenceFingerprint/);
  assert.match(apply,/expectedCanonicalUpdatedAt/);
  assert.match(apply,/WHERE id=\? AND updated_at=\? AND archived_at IS NULL/);
  assert.match(api,/status:409/);
});

test("G5 idempotency and immutable audit carry provenance and rollback snapshots",()=>{
  assert.match(apply,/applyFingerprint/);
  assert.match(apply,/existingOperation/);
  assert.match(apply,/idempotent:true/);
  assert.match(migration,/apply_fingerprint/);
  assert.match(migration,/UNIQUE INDEX automation_canonical_apply_operations_fingerprint_unique/);
  for(const column of ["review_decision_id","evidence_fingerprint","before_json","after_json","provenance_json","applied_by","applied_at","status"]) {
    assert.match(migration,new RegExp(column));
  }
  assert.match(apply,/sourceRole/);
  assert.match(apply,/authorityScore/);
  assert.match(apply,/previousValue/);
  assert.match(apply,/newValue/);
});

test("G5 API is admin-only and preview is read-only",()=>{
  assert.match(api,/getAdminApiUser/);
  assert.match(api,/requireAdminMutation/);
  assert.match(api,/export async function GET/);
  assert.match(api,/getAutomationCanonicalApplyPreview/);
  assert.match(api,/export async function POST/);
  const previewBody=apply.slice(apply.indexOf("export async function getAutomationCanonicalApplyPreview"),apply.indexOf("function normalizedSelections"));
  assert.doesNotMatch(previewBody,/UPDATE directory_profiles|UPDATE help_organizations|INSERT INTO automation_canonical_apply_operations/i);
});

test("G5 does not alter G2/G3/G4/EVENT matchers or unattended source execution",()=>{
  assert.doesNotMatch(apply,/resolveEventAutomationEntityCluster|selectDirectoryClusterCandidate|selectOrganizationClusterCandidate/);
  assert.doesNotMatch(apply,/automation_sources SET enabled|source cadence|backfill/i);
  assert.doesNotMatch(apply,/CREATE_DRAFT|NEW_ENTITY/);
});
