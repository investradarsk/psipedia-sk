import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("DISCOVERY-1B keeps human review status separate from discovery lifecycle", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /AutomationCandidateReviewStatus = "NEW" \| "APPROVED" \| "REJECTED" \| "SUPPRESSED"/);
  assert.match(store, /AutomationCandidateLifecycle = "ACTIVE" \| "STALE" \| "DUPLICATE" \| "PROVISIONED"/);
  assert.match(store, /computeAutomationCandidateLifecycle/);
});

test("stale detection is cadence-aware and requires repeated successful discovery opportunities", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /AUTOMATION_CANDIDATE_MIN_STALE_WINDOW_MINUTES = 72 \* 60/);
  assert.match(store, /AUTOMATION_CANDIDATE_REQUIRED_MISSED_RUNS = 3/);
  assert.match(store, /Math\.max\([\s\S]*AUTOMATION_CANDIDATE_MIN_STALE_WINDOW_MINUTES[\s\S]*AUTOMATION_CANDIDATE_REQUIRED_MISSED_RUNS \* path\.rootCadenceMinutes/);
  assert.match(store, /dr\.status IN \('SUCCESS','PARTIAL'\)/);
  assert.match(store, /dr\.started_at>e\.last_seen_at/);
  assert.match(store, /laterSuccessfulRuns < AUTOMATION_CANDIDATE_REQUIRED_MISSED_RUNS/);
});

test("multi-root freshness uses any fresh valid path and ignores disabled or rejected roots", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /if \(!path\.rootEnabled \|\| path\.rootReviewStatus !== "APPROVED"\) return false/);
  assert.match(store, /evidence\.some\(\(path\) => candidateEvidenceFresh\(path, now\)\) \? "ACTIVE" : "STALE"/);
});

test("duplicate and provisioned lifecycle keeps persisted source linkage while approval can conservatively reuse one same-domain source", () => {
  const store = read("lib/data-automation-source-store.ts");
  const matching = read("lib/data-automation-source-matching.ts");
  assert.match(store, /candidate\.reviewStatus === "APPROVED" \? "PROVISIONED" : "DUPLICATE"/);
  assert.match(store, /findRelevantAutomationSourceForCandidate/);
  assert.match(matching, /sameEntity/);
  assert.match(matching, /sameHost\.length === 1/);
});

test("rediscovery preserves rejected decisions and only reopens expired timed suppression", () => {
  const store = read("lib/data-automation-source-store.ts");
  const upsert = store.split("ON CONFLICT(canonical_url,entity_type) DO UPDATE SET")[1].split("function missingCandidateEvidenceSchema")[0];
  assert.match(upsert, /review_status='SUPPRESSED'/);
  assert.match(upsert, /suppressed_until IS NOT NULL/);
  assert.match(upsert, /suppressed_until<=excluded\.last_detected_at/);
  assert.doesNotMatch(upsert, /review_status='REJECTED'[\s\S]*THEN 'NEW'/);
});

test("candidate lifecycle listing is bounded and avoids per-candidate evidence queries", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /const boundedLimit = Math\.max\(1, Math\.min\(200, limit\)\)/);
  assert.match(store, /FROM automation_source_candidate_evidence e[\s\S]*JOIN automation_discovery_roots r/);
  assert.match(store, /JOIN \([\s\S]*SELECT id FROM automation_source_candidates[\s\S]*LIMIT \?/);
  assert.match(store, /evidenceByCandidate = new Map/);
});

test("admin shows lifecycle, evidence counts, last seen, and lifecycle filters", () => {
  const component = read("components/admin-automation-source-manager.tsx");
  for (const value of ["ACTIVE", "STALE", "DUPLICATE", "PROVISIONED"]) {
    assert.match(component, new RegExp(`value="${value}"`));
  }
  assert.match(component, /Found by \{candidate\.evidencePathCount\} paths/);
  assert.match(component, /fresh \{candidate\.freshEvidencePathCount\}/);
  assert.match(component, /formatDate\(candidate\.lastSeenAt\)/);
});

test("governance boundary and evidence retention remain intact", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /VALUES \(\?,\?,\?,\?,\?,'\{\}',0,1440/);
  assert.match(store, /'PENDING'/);
  assert.doesNotMatch(store, /DELETE FROM automation_source_candidate_evidence/i);
  assert.doesNotMatch(store, /UPDATE automation_sources SET enabled=1[\s\S]*reviewAutomationSourceCandidate/i);
});

test("DISCOVERY-1B requires no new migration", () => {
  const workflow = read(".github/workflows/production-d1-migrate.yml");
  const productionScript = read("scripts/production-d1-migrate.mjs");
  assert.doesNotMatch(workflow, /0083_automation_discovery_candidate_lifecycle/);
  assert.doesNotMatch(productionScript, /0083_automation_discovery_candidate_lifecycle/);
});
