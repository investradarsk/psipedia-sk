import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration=fs.readFileSync("drizzle/0078_automation_possible_match_reviews.sql","utf8");
const review=fs.readFileSync("lib/data-automation-match-review.ts","utf8");
const directory=fs.readFileSync("lib/data-automation-directory-clustering.ts","utf8");
const clustering=fs.readFileSync("lib/data-automation-clustering.ts","utf8");
const api=fs.readFileSync("app/api/admin/automation-match-reviews/[observationId]/[candidateClusterId]/route.ts","utf8");
const queue=fs.readFileSync("app/admin/operations/possible-matches/page.tsx","utf8");
const detail=fs.readFileSync("app/admin/operations/possible-matches/[observationId]/[candidateClusterId]/page.tsx","utf8");

test("G4 decision schema is additive and auditable",()=>{
  assert.match(migration,/automation_entity_match_decisions/);
  for(const decision of ["SAME_ENTITY","DIFFERENT_ENTITY","RELATIONSHIP_ONLY","DEFER"]) assert.match(migration,new RegExp(decision));
  assert.match(migration,/previous_decision_id/);
  assert.match(migration,/evidence_fingerprint/);
  assert.match(migration,/decision_version/);
  assert.match(migration,/WHERE is_active=1/);
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM|UPDATE directory_profiles|UPDATE help_organizations/i);
});

test("G4 semantic guard blocks incompatible SAME_ENTITY",()=>{
  assert.match(review,/input\.decision==="SAME_ENTITY" && !detail\.semanticCompatible/);
  assert.match(review,/AutomationMatchReviewSemanticError/);
  assert.match(review,/RELATIONSHIP_ONLY/);
});

test("G4 keeps history, is idempotent, and rejects stale reviews",()=>{
  assert.match(review,/current\?\.decision===input\.decision/);
  assert.match(review,/previous_decision_id/);
  assert.match(review,/expectedEvidenceFingerprint/);
  assert.match(review,/expectedDecisionId/);
  assert.match(review,/is_active=0/);
});

test("G2 and G3 consult human negative/identity memory while EVENT remains unmodified",()=>{
  assert.match(directory,/shouldSuppressAutomationPossibleCandidate/);
  assert.match(clustering,/entityType: "ORGANIZATION"/);
  const eventCall=clustering.match(/resolveEventAutomationEntityCluster[\s\S]*?recordClusterMatchCandidates\(\{([\s\S]*?)\}, database\)/);
  assert.ok(eventCall);
  assert.doesNotMatch(eventCall[1],/entityType:/);
});

test("review mutation is admin-only and same-origin guarded",()=>{
  assert.match(api,/requireAdminMutation/);
  assert.match(api,/expectedEvidenceFingerprint/);
  assert.match(api,/status:409/);
  assert.match(api,/status:422/);
});

test("Operations owns the queue and detail is side-by-side",()=>{
  assert.match(queue,/title="POSSIBLE identity matches"/);
  assert.match(queue,/\/admin\/operations/);
  assert.match(detail,/Side-by-side/);
  assert.match(detail,/Incoming/);
  assert.match(detail,/Candidate/);
  assert.match(detail,/Audit history/);
});

test("G4 source contains no canonical apply/write path",()=>{
  for(const source of [review,api,queue,detail]){
    assert.doesNotMatch(source,/applyAutomationFinding|UPDATE directory_profiles|UPDATE help_organizations|INSERT INTO directory_profiles|INSERT INTO help_organizations/);
  }
});
