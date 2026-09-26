import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TAVILY_EVENT_GOVERNANCE_PRESET,
  tavilyCanaryReadiness,
} from "../lib/tavily-canary-control.ts";
import { automationSearchBudgetPolicy } from "../lib/data-automation-search-budget.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function root(overrides = {}) {
  return {
    id: 85,
    rootKey: "tavily-sk-dog-events",
    label: "Tavily – slovenské kynologické podujatia",
    discoveryType: "SEARCH_PROVIDER",
    sourceUrl: null,
    entityType: "EVENT",
    suggestedConnectorType: "CONTROLLED_HTML",
    config: {
      provider: "tavily",
      maxResults: 5,
      maxCandidates: 15,
      queries: ["q1", "q2", "q3"],
      searchBudget: {
        queriesPerRun: 3,
        providerRequestsPerRun: 3,
        rootDailyRequests: 3,
        queryCooldownMinutes: 2880,
      },
    },
    enabled: true,
    reviewStatus: "APPROVED",
    cadenceMinutes: 2880,
    nextCheckAt: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
    ...overrides,
  };
}

function governance(overrides = {}) {
  return {
    schemaAvailable: true,
    state: {
      id: 1,
      subjectType: "DISCOVERY_ROOT",
      subjectId: 85,
      accessStatus: "ALLOWED",
      robotsStatus: "NOT_APPLICABLE",
      termsStatus: "ALLOWED",
      recurringStatus: "APPROVED",
      retentionStatus: "APPROVED",
      retainUrl: true,
      retainTitle: true,
      retainSnippet: true,
      retainMetadata: true,
      retentionDays: null,
      minCadenceMinutes: 2880,
      maxRequestsPerDay: 3,
      manualOnly: false,
      pathScope: null,
      restrictionsNote: TAVILY_EVENT_GOVERNANCE_PRESET.restrictionsNote,
      termsUrl: null,
      privacyUrl: null,
      robotsUrl: null,
      evidenceUrl: null,
      reviewedAt: "2026-09-26T21:00:00.000Z",
      reviewedBy: "operator@example.com",
      rationale: TAVILY_EVENT_GOVERNANCE_PRESET.rationale,
      expiresAt: null,
      reviewDueAt: null,
      createdAt: "2026-09-26T21:00:00.000Z",
      updatedAt: "2026-09-26T21:00:00.000Z",
      ...overrides,
    },
  };
}

test("TAVILY-CANARY-1 governance preset is explicit and bounded", () => {
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.accessStatus, "ALLOWED");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.robotsStatus, "NOT_APPLICABLE");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.termsStatus, "ALLOWED");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.recurringStatus, "APPROVED");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.retentionStatus, "APPROVED");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.minCadenceMinutes, 2880);
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.maxRequestsPerDay, 3);
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.manualOnly, false);
});

test("TAVILY-CANARY-1 canary fails closed without secret, approval, enable or governance", () => {
  assert.ok(tavilyCanaryReadiness({ root: root(), governance: governance(), secretConfigured: false }).blockers.includes("SECRET_NOT_CONFIGURED"));
  assert.ok(tavilyCanaryReadiness({ root: root({ reviewStatus: "PENDING" }), governance: governance(), secretConfigured: true }).blockers.includes("ROOT_NOT_APPROVED"));
  assert.ok(tavilyCanaryReadiness({ root: root({ enabled: false }), governance: governance(), secretConfigured: true }).blockers.includes("ROOT_DISABLED"));
  assert.ok(tavilyCanaryReadiness({ root: root(), governance: { schemaAvailable: true, state: null }, secretConfigured: true }).blockers.includes("GOVERNANCE_MISSING"));
  assert.equal(tavilyCanaryReadiness({ root: root(), governance: governance(), secretConfigured: true }).allowed, true);
});

test("TAVILY-CANARY-1 single canary inherits 3-query / 3-request / maxResults=5 budgets", () => {
  const r = root();
  const policy = automationSearchBudgetPolicy(r);
  assert.equal(policy.queriesPerRun, 3);
  assert.equal(policy.providerRequestsPerRun, 3);
  assert.equal(policy.rootDailyRequests, 3);
  assert.equal(r.config.maxResults, 5);
});

test("TAVILY-CANARY-1 operator actions are explicit and secret value is never rendered", () => {
  const ui = read("components/admin-tavily-root-detail.tsx");
  const route = read("app/api/admin/automation-discovery-roots/[id]/route.ts");
  for (const label of ["Schváliť governance", "Schváliť root", "Zapnúť", "Spustiť jednorazový canary"]) {
    assert.ok(ui.includes(label), label);
  }
  assert.match(route, /action === "governance-approve"/);
  assert.match(route, /action === "approve-root"/);
  assert.match(route, /action === "enable"/);
  assert.match(route, /action === "canary"/);
  assert.match(ui, /secretConfigured \? "configured" : "not configured"/);
  assert.doesNotMatch(ui, /TAVILY_API_KEY/);
  assert.doesNotMatch(ui, /apiKey/);
});

test("TAVILY-CANARY-1 approve and enable remain governance-gated", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  assert.match(store, /if \(input\.action === "approve"\) await assertDiscoveryRootGovernance/);
  assert.match(store, /if \(root\.reviewStatus !== "APPROVED"\) throw new Error\("automation_discovery_review_required"\)/);
  assert.match(store, /await assertDiscoveryRootGovernance\(root, db/);
});

test("TAVILY-CANARY-1 canary reuses runner budgets and remains candidate-only", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /runAutomationDiscoveryRootCanary/);
  assert.match(runner, /getDueAutomationDiscoveryRoot/);
  assert.match(runner, /reserveAutomationSearchRequest/);
  assert.match(runner, /upsertAutomationSourceCandidate/);
  assert.match(runner, /upsertAutomationSourceCandidateEvidence/);
  assert.doesNotMatch(runner, /INSERT INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
  assert.doesNotMatch(runner, /publish|publication/i);
});
