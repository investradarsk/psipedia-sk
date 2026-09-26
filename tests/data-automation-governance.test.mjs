import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateGovernanceForActivation } from "../lib/data-automation-governance.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function state(overrides = {}) {
  return {
    id: 1,
    subjectType: "AUTOMATION_SOURCE",
    subjectId: 42,
    accessStatus: "ALLOWED",
    robotsStatus: "ALLOWED",
    termsStatus: "ALLOWED",
    recurringStatus: "APPROVED",
    retentionStatus: "APPROVED",
    retainUrl: true,
    retainTitle: true,
    retainSnippet: true,
    retainMetadata: true,
    retentionDays: null,
    minCadenceMinutes: null,
    maxRequestsPerDay: null,
    manualOnly: false,
    pathScope: null,
    restrictionsNote: null,
    termsUrl: null,
    privacyUrl: null,
    robotsUrl: null,
    evidenceUrl: null,
    reviewedAt: "2026-09-26T18:00:00.000Z",
    reviewedBy: "operator@example.com",
    rationale: "manual review",
    expiresAt: null,
    reviewDueAt: null,
    createdAt: "2026-09-26T18:00:00.000Z",
    updatedAt: "2026-09-26T18:00:00.000Z",
    ...overrides,
  };
}

const usage = { recurring: true, cadenceMinutes: 1440, storageFields: ["url", "metadata"] };

test("governance missing or unavailable fails closed", () => {
  assert.deepEqual(
    evaluateGovernanceForActivation({ schemaAvailable: true, state: null }, usage).blockingReasons,
    ["GOVERNANCE_MISSING"],
  );
  assert.deepEqual(
    evaluateGovernanceForActivation({ schemaAvailable: false, state: null }, usage).blockingReasons,
    ["GOVERNANCE_SCHEMA_UNAVAILABLE", "GOVERNANCE_MISSING"],
  );
});

test("approved recurring governance allows activation to continue but never enables anything", () => {
  const result = evaluateGovernanceForActivation({ schemaAvailable: true, state: state() }, usage);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.blockingReasons, []);
});

test("denied recurring, robots disallowed and terms blocked are independent blockers", () => {
  assert.ok(evaluateGovernanceForActivation({ schemaAvailable: true, state: state({ recurringStatus: "DENIED" }) }, usage)
    .blockingReasons.includes("RECURRING_USE_NOT_APPROVED"));
  assert.ok(evaluateGovernanceForActivation({ schemaAvailable: true, state: state({ robotsStatus: "DISALLOWED" }) }, usage)
    .blockingReasons.includes("ROBOTS_NOT_ALLOWED"));
  assert.ok(evaluateGovernanceForActivation({ schemaAvailable: true, state: state({ termsStatus: "BLOCKED" }) }, usage)
    .blockingReasons.includes("TERMS_NOT_ALLOWED"));
});

test("restricted retention can be compatible only with explicitly allowed storage fields", () => {
  const allowed = evaluateGovernanceForActivation({
    schemaAvailable: true,
    state: state({ retentionStatus: "RESTRICTED", retainSnippet: false }),
  }, usage);
  assert.equal(allowed.allowed, true);

  const blocked = evaluateGovernanceForActivation({
    schemaAvailable: true,
    state: state({ retentionStatus: "RESTRICTED", retainSnippet: false }),
  }, { ...usage, storageFields: ["url", "snippet"] });
  assert.ok(blocked.blockingReasons.includes("RETENTION_SNIPPET_NOT_ALLOWED"));
});

test("expired governance fails closed", () => {
  const result = evaluateGovernanceForActivation(
    { schemaAvailable: true, state: state({ expiresAt: "2026-09-25T00:00:00.000Z" }) },
    usage,
    new Date("2026-09-26T00:00:00.000Z"),
  );
  assert.ok(result.blockingReasons.includes("GOVERNANCE_EXPIRED"));
});

test("cadence and manual-only restrictions are deterministic", () => {
  assert.ok(evaluateGovernanceForActivation({
    schemaAvailable: true,
    state: state({ minCadenceMinutes: 10080 }),
  }, usage).blockingReasons.includes("CADENCE_TOO_FREQUENT"));
  assert.ok(evaluateGovernanceForActivation({
    schemaAvailable: true,
    state: state({ manualOnly: true }),
  }, usage).blockingReasons.includes("MANUAL_ONLY"));
});

test("0084 is additive, shared-subject, immutable-history and has no implicit approvals", async () => {
  const sql = await readFile(path.join(repoRoot, "drizzle/0084_automation_governance_registry.sql"), "utf8");
  assert.match(sql, /DISCOVERY_ROOT/);
  assert.match(sql, /AUTOMATION_SOURCE/);
  assert.match(sql, /access_status/);
  assert.match(sql, /robots_status/);
  assert.match(sql, /terms_status/);
  assert.match(sql, /recurring_status/);
  assert.match(sql, /retention_status/);
  assert.match(sql, /DEFAULT 'UNKNOWN'/);
  assert.match(sql, /automation_governance_review_history_no_update/);
  assert.match(sql, /automation_governance_review_history_no_delete/);
  assert.doesNotMatch(sql, /INSERT INTO automation_governance_reviews|UPDATE automation_sources|UPDATE automation_discovery_roots|DELETE FROM|DROP TABLE/i);
});

test("new source activation is governance-gated without changing candidate provisioning semantics", async () => {
  const store = await readFile(path.join(repoRoot, "lib/data-automation-source-store.ts"), "utf8");
  assert.match(store, /existing\.reviewStatus !== "APPROVED"/);
  assert.match(store, /getGovernanceState\(\{ type: "AUTOMATION_SOURCE", id \}/);
  assert.match(store, /evaluateGovernanceForActivation/);
  assert.match(store, /automation_source_governance_blocked/);
  assert.match(store, /VALUES \(\?,\?,\?,\?,\?,\?,0,/);
});

test("governance updates are optimistic-concurrency protected and history records actor/rationale", async () => {
  const governance = await readFile(path.join(repoRoot, "lib/data-automation-governance.ts"), "utf8");
  assert.match(governance, /expectedUpdatedAt/);
  assert.match(governance, /automation_governance_stale_update/);
  assert.match(governance, /before_json,after_json,actor,rationale,changed_at/);
});

test("admin makes dimensions and blocking reasons visible", async () => {
  const ui = await readFile(path.join(repoRoot, "components/admin-automation-source-detail.tsx"), "utf8");
  for (const label of ["Access", "Robots", "Terms / legal", "Recurring use", "Evidence retention", "Last reviewed", "Review due"]) {
    assert.ok(ui.includes(label), label);
  }
  assert.match(ui, /governanceEvaluation\.blockingReasons/);
  assert.match(ui, /Governance history/);
});
