import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateGovernanceForActivation } from "../lib/data-automation-governance.ts";
import { listDueAutomationDiscoveryRoots } from "../lib/data-automation-discovery-store.ts";

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
  assert.match(sql, /automation_governance_reviews_history_insert/);
  assert.match(sql, /automation_governance_reviews_history_update/);
  assert.match(sql, /automation_governance_review_history_no_update/);
  assert.match(sql, /automation_governance_review_history_no_delete/);
  assert.doesNotMatch(sql, /INSERT INTO automation_governance_reviews|UPDATE automation_sources|UPDATE automation_discovery_roots|DELETE FROM|DROP TABLE/i);
});

test("new source activation is governance-gated without changing candidate provisioning semantics", async () => {
  const [store, activation] = await Promise.all([
    readFile(path.join(repoRoot, "lib/data-automation-source-store.ts"), "utf8"),
    readFile(path.join(repoRoot, "lib/data-automation-source-activation.ts"), "utf8"),
  ]);
  assert.match(activation, /source\.reviewStatus !== "APPROVED"/);
  assert.match(activation, /getGovernanceState\(\{ type: "AUTOMATION_SOURCE", id: source\.id \}/);
  assert.match(activation, /evaluateGovernanceForActivation/);
  assert.match(store, /automation_source_governance_blocked/);
  assert.match(store, /VALUES \(\?,\?,\?,\?,\?,\?,0,/);
});

test("governance updates are optimistic-concurrency protected and audit history is DB-enforced", async () => {
  const governance = await readFile(path.join(repoRoot, "lib/data-automation-governance.ts"), "utf8");
  const sql = await readFile(path.join(repoRoot, "drizzle/0084_automation_governance_registry.sql"), "utf8");
  assert.match(governance, /expectedUpdatedAt/);
  assert.match(governance, /automation_governance_stale_update/);
  assert.match(sql, /before_json/);
  assert.match(sql, /after_json/);
  assert.match(sql, /NEW\.reviewed_by/);
  assert.match(sql, /NEW\.rationale/);
});

test("admin makes dimensions and blocking reasons visible", async () => {
  const ui = await readFile(path.join(repoRoot, "components/admin-automation-source-detail.tsx"), "utf8");
  for (const label of ["Access", "Robots", "Terms / legal", "Recurring use", "Evidence retention", "Posledná kontrola", "Ďalšia kontrola"]) {
    assert.ok(ui.includes(label), label);
  }
  assert.match(ui, /governanceEvaluation\.blockingReasons/);
  assert.match(ui, /História bezpečnostných pravidiel/);
});


function governanceRow() {
  return {
    id: 9,
    subject_type: "DISCOVERY_ROOT",
    subject_id: 1,
    access_status: "ALLOWED",
    robots_status: "NOT_APPLICABLE",
    terms_status: "ALLOWED",
    recurring_status: "APPROVED",
    retention_status: "APPROVED",
    retain_url: 1,
    retain_title: 1,
    retain_snippet: 1,
    retain_metadata: 1,
    retention_days: null,
    min_cadence_minutes: null,
    max_requests_per_day: null,
    manual_only: 0,
    path_scope: null,
    restrictions_note: null,
    terms_url: null,
    privacy_url: null,
    robots_url: null,
    evidence_url: null,
    reviewed_at: "2026-09-26T18:00:00.000Z",
    reviewed_by: "operator@example.com",
    rationale: "manual review",
    expires_at: null,
    review_due_at: null,
    created_at: "2026-09-26T18:00:00.000Z",
    updated_at: "2026-09-26T18:00:00.000Z",
  };
}

function discoveryGovernanceDb({ discoveryType, governance }) {
  const root = {
    id: 1,
    root_key: "test-root",
    label: "Test root",
    discovery_type: discoveryType,
    source_url: discoveryType === "SEARCH_PROVIDER" ? null : "https://example.sk/feed.xml",
    entity_type: "EVENT",
    suggested_connector_type: "CONTROLLED_HTML",
    config_json: "{}",
    enabled: 1,
    review_status: "APPROVED",
    cadence_minutes: 2880,
    next_check_at: null,
    last_checked_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error_code: null,
  };
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() {
              if (sql.includes("FROM automation_discovery_roots")) return { results: [root] };
              throw new Error("unexpected all query");
            },
            async first() {
              if (!sql.includes("automation_governance_reviews")) throw new Error("unexpected first query");
              if (governance === "schema-unavailable") throw new Error("no such table: automation_governance_reviews");
              if (governance === "missing") return null;
              return governanceRow();
            },
          };
        },
      };
    },
    async batch() { return []; },
  };
}

test("DISCOVERY-2C-E SEARCH_PROVIDER runtime fails closed when governance is missing or unavailable", async () => {
  for (const governance of ["missing", "schema-unavailable"]) {
    const roots = await listDueAutomationDiscoveryRoots(discoveryGovernanceDb({
      discoveryType: "SEARCH_PROVIDER",
      governance,
    }), new Date("2026-09-26T20:00:00.000Z"));
    assert.deepEqual(roots, []);
  }
});

test("DISCOVERY-2C-E SEARCH_PROVIDER with valid governance remains eligible for normal evaluator", async () => {
  const roots = await listDueAutomationDiscoveryRoots(discoveryGovernanceDb({
    discoveryType: "SEARCH_PROVIDER",
    governance: "valid",
  }), new Date("2026-09-26T20:00:00.000Z"));
  assert.equal(roots.length, 1);
  assert.equal(roots[0].discoveryType, "SEARCH_PROVIDER");
});

test("DISCOVERY-2C-E legacy non-SEARCH_PROVIDER transition remains compatible", async () => {
  const roots = await listDueAutomationDiscoveryRoots(discoveryGovernanceDb({
    discoveryType: "RSS",
    governance: "missing",
  }), new Date("2026-09-26T20:00:00.000Z"));
  assert.equal(roots.length, 1);
  assert.equal(roots[0].discoveryType, "RSS");
});

test("runtime enforces explicit governance decisions while preserving legacy enabled rows without a registry record", async () => {
  const sourceStore = await readFile(path.join(repoRoot, "lib/data-automation-store.ts"), "utf8");
  const discoveryStore = await readFile(path.join(repoRoot, "lib/data-automation-discovery-store.ts"), "utf8");
  assert.match(sourceStore, /Legacy transition: pre-4B enabled sources without a registry row continue/);
  assert.match(sourceStore, /evaluateGovernanceForActivation/);
  assert.match(discoveryStore, /Legacy transition remains for non-search roots only/);
  assert.match(discoveryStore, /root\.discoveryType === "SEARCH_PROVIDER"/);
  assert.match(discoveryStore, /"snippet"/);
});


test("source-only approval keeps operator governance while production internet transport is provider-managed", async () => {
  const activation = await readFile(path.join(repoRoot, "lib/data-automation-source-activation.ts"), "utf8");
  assert.match(activation, /providerManagedAccess/);
  assert.match(activation, /termsStatus: "ALLOWED"/);
  assert.match(activation, /recurringStatus: "APPROVED"/);
  assert.match(activation, /retentionStatus: "RESTRICTED"/);
  assert.match(activation, /retainUrl: true/);
  assert.match(activation, /retainMetadata: true/);
  assert.match(activation, /retainTitle: false/);
  assert.match(activation, /retainSnippet: false/);
  assert.match(activation, /Public internet transport is delegated to Tavily/);
  assert.match(activation, /robotsStatus: "NOT_APPLICABLE"/);

  const prepareStart = activation.indexOf("export async function prepareAutomationSourceGovernanceForApproval");
  assert.ok(prepareStart >= 0);
  const prepare = activation.slice(prepareStart);
  assert.doesNotMatch(prepare, /probeAutomationSourceAccess\(|probeAutomationSourceRobots\(|refreshAutomationSourceTechnicalGovernance\(/);
  assert.doesNotMatch(activation, /tavilySearchGovernancePresetForRoot|TAVILY_SEARCH_GOVERNANCE/);
});

test("governance probes and controlled HTML connector share the source HTTP policy", async () => {
  const [activation, connectors, policy] = await Promise.all([
    readFile(path.join(repoRoot, "lib/data-automation-source-activation.ts"), "utf8"),
    readFile(path.join(repoRoot, "lib/data-automation-connectors.ts"), "utf8"),
    readFile(path.join(repoRoot, "lib/data-automation-http-policy.ts"), "utf8"),
  ]);

  for (const source of [activation, connectors]) {
    assert.match(source, /AUTOMATION_SOURCE_HTTP_USER_AGENT/);
    assert.match(source, /AUTOMATION_SOURCE_MAX_REDIRECT_HOPS/);
    assert.match(source, /automationSourceRequestTimeoutMs/);
    assert.match(source, /redirect: "manual"/);
    assert.match(source, /isSafeAutomationSourceUrl/);
  }
  assert.match(policy, /PsipediaDataResearch\/1\.0 \(\+https:\/\/psipedia\.sk\)/);
  assert.match(policy, /AUTOMATION_SOURCE_MAX_REDIRECT_HOPS = 5/);
  assert.match(policy, /30_000/);
  assert.doesNotMatch(activation, /15_000/);
  assert.match(activation, /HTTP 400-499 means robots\.txt is unavailable/);
  assert.match(activation, /status >= 400 && status < 500/);
  assert.match(activation, /status >= 500 && status < 600/);
  assert.match(activation, /source_governance_probe_redirect_loop/);
});



test("technical verification observability is structured and excludes page payload fields", async () => {
  const activation = await readFile(path.join(repoRoot, "lib/data-automation-source-activation.ts"), "utf8");
  assert.match(activation, /event: "automation_source_technical_verification"/);
  for (const field of [
    "sourceId",
    "entityType",
    "hostname",
    "accessStatus",
    "accessDetail",
    "robotsStatus",
    "robotsDetail",
    "activationResult",
  ]) {
    assert.match(activation, new RegExp(field));
  }
  const logStart = activation.indexOf("function logAutomationSourceTechnicalVerification");
  const nextFunction = activation.indexOf("function stripGeneratedTechnicalRestrictionsNote", logStart);
  const logger = activation.slice(logStart, nextFunction);
  assert.doesNotMatch(logger, /responseBody:|cookies?:|authorization:|headers:|sourceUrl:|query:/i);
  assert.match(activation, /technicalProbeFailureDetail/);
  assert.match(activation, /request_timeout|dns_unreachable|tls_error|network_unreachable|request_failed/);
});

test("technical source governance refresh uses audited upsert history and never deletes governance", async () => {
  const [activation, migration] = await Promise.all([
    readFile(path.join(repoRoot, "lib/data-automation-source-activation.ts"), "utf8"),
    readFile(path.join(repoRoot, "drizzle/0084_automation_governance_registry.sql"), "utf8"),
  ]);
  const refreshStart = activation.indexOf("export async function refreshAutomationSourceTechnicalGovernance");
  const prepareStart = activation.indexOf("export async function prepareAutomationSourceGovernanceForApproval");
  assert.ok(refreshStart >= 0 && prepareStart > refreshStart);
  const refresh = activation.slice(refreshStart, prepareStart);
  assert.match(refresh, /upsertGovernanceReview/);
  assert.match(refresh, /expectedUpdatedAt: current\.updatedAt/);
  assert.doesNotMatch(refresh, /DELETE|delete/i);
  assert.match(migration, /CREATE TRIGGER `automation_governance_reviews_history_update`/);
  assert.match(migration, /automation_governance_review_history_no_delete/);
});
