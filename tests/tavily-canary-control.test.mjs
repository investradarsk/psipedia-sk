import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TAVILY_EVENT_GOVERNANCE_PRESET,
  tavilyCanaryReadiness,
  tavilySearchGovernancePresetForRoot,
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

const cadenceCases = [
  ["EVENT", "tavily-sk-dog-events", 2880],
  ["ADOPTION", "tavily-sk-dog-adoptions", 1440],
  ["FOSTER", "tavily-sk-dog-foster", 1440],
  ["LOST_FOUND", "tavily-sk-dog-lost-found", 1440],
  ["ORGANIZATION", "tavily-sk-dog-organizations", 10080],
  ["DIRECTORY", "tavily-sk-dog-veterinarians", 10080],
  ["DIRECTORY", "tavily-sk-dog-grooming", 10080],
  ["DIRECTORY", "tavily-sk-dog-hotels-daycare", 10080],
  ["DIRECTORY", "tavily-sk-dog-trainers", 10080],
  ["DIRECTORY", "tavily-sk-dog-rehabilitation", 10080],
];

test("TAVILY-GOV-1 governance cadence policy is explicit per approved Tavily root", () => {
  for (const [entityType, rootKey, minCadenceMinutes] of cadenceCases) {
    const preset = tavilySearchGovernancePresetForRoot(root({
      entityType,
      rootKey,
      cadenceMinutes: minCadenceMinutes,
    }));
    assert.equal(preset.minCadenceMinutes, minCadenceMinutes, rootKey);
    assert.equal(preset.maxRequestsPerDay, 3, rootKey);
    assert.equal(preset.recurringStatus, "APPROVED", rootKey);
  }
});

test("TAVILY-CANARY-1 EVENT preset remains explicit and bounded", () => {
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.accessStatus, "ALLOWED");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.robotsStatus, "NOT_APPLICABLE");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.termsStatus, "ALLOWED");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.recurringStatus, "APPROVED");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.retentionStatus, "APPROVED");
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.minCadenceMinutes, 2880);
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.maxRequestsPerDay, 3);
  assert.equal(TAVILY_EVENT_GOVERNANCE_PRESET.manualOnly, false);
});

test("TAVILY-GOV-1 ADOPTION governance at 1440 removes cadence blocker but preserves operator gates", () => {
  const adoption = root({
    rootKey: "tavily-sk-dog-adoptions",
    entityType: "ADOPTION",
    cadenceMinutes: 1440,
    reviewStatus: "PENDING",
    enabled: false,
  });
  const readiness = tavilyCanaryReadiness({
    root: adoption,
    governance: governance({ minCadenceMinutes: 1440 }),
    secretConfigured: true,
  });
  assert.equal(readiness.blockers.includes("CADENCE_TOO_FREQUENT"), false);
  assert.deepEqual(readiness.blockers, ["ROOT_NOT_APPROVED", "ROOT_DISABLED"]);
});

test("TAVILY-GOV-1 product policy does not trust a too-frequent current DB cadence", () => {
  const adoption = root({
    rootKey: "tavily-sk-dog-adoptions",
    entityType: "ADOPTION",
    cadenceMinutes: 60,
  });
  const preset = tavilySearchGovernancePresetForRoot(adoption);
  assert.equal(preset.minCadenceMinutes, 1440);
  const readiness = tavilyCanaryReadiness({
    root: adoption,
    governance: governance({ minCadenceMinutes: preset.minCadenceMinutes }),
    secretConfigured: true,
  });
  assert.ok(readiness.blockers.includes("CADENCE_TOO_FREQUENT"));
});

test("TAVILY-GOV-1 unknown or mismatched Tavily roots fail closed", () => {
  assert.throws(
    () => tavilySearchGovernancePresetForRoot(root({ rootKey: "tavily-sk-dog-unknown" })),
    /GOVERNANCE_POLICY_UNSUPPORTED/,
  );
  assert.throws(
    () => tavilySearchGovernancePresetForRoot(root({
      rootKey: "tavily-sk-dog-adoptions",
      entityType: "EVENT",
    })),
    /GOVERNANCE_POLICY_UNSUPPORTED/,
  );
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

test("TAVILY-GOV-1 approval route derives policy from root and keeps optimistic concurrency", () => {
  const route = read("app/api/admin/automation-discovery-roots/[id]/route.ts");
  assert.match(route, /tavilySearchGovernancePresetForRoot\(root\)/);
  assert.match(route, /expectedUpdatedAt:\s*governanceRead\.state\?\.updatedAt \?\? null/);
  assert.doesNotMatch(route, /\.\.\.TAVILY_SEARCH_GOVERNANCE_PRESET/);
});

test("TAVILY-GOV-1 blocked saved ADOPTION governance remains re-approvable in the UI", () => {
  const ui = read("components/admin-tavily-root-detail.tsx");
  assert.match(
    ui,
    /disabled=\{Boolean\(busy\) \|\| governanceAllowed\}[\s\S]*1\. Schváliť governance/,
  );
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
