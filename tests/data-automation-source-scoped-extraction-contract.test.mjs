import assert from "node:assert/strict";
import test from "node:test";
import {
  automationExtractionCapabilities,
  automationSourceReadiness,
  resolveAutomationCapability,
} from "../lib/data-automation-capability-registry.ts";
import { automationSourceActivationReadiness } from "../lib/data-automation-source-activation.ts";
import {
  automationCoverageCanInferAbsence,
  automationUrlWithinApprovedSourceScope,
  buildSourceScopedExtractionContract,
} from "../lib/data-automation-source-scoped-extraction.ts";
import { selectRelevantExistingSourceForCandidate } from "../lib/data-automation-source-matching.ts";

function source(overrides = {}) {
  return {
    id: 10,
    sourceKey: "source-10",
    label: "Source",
    entityType: "ADOPTION",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://utulok.example/psy",
    config: {},
    enabled: false,
    cadenceMinutes: 1440,
    throttleMs: 250,
    timeoutMs: 8000,
    retryMaxAttempts: 1,
    retryBackoffMs: 1000,
    maxRecordsPerRun: 100,
    nextCheckAt: null,
    reviewStatus: "APPROVED",
    ...overrides,
  };
}

function approvedGovernance(overrides = {}) {
  return {
    id: 1,
    subjectType: "AUTOMATION_SOURCE",
    subjectId: 10,
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
    maxRequestsPerDay: 12,
    manualOnly: false,
    pathScope: "/psy/**",
    restrictionsNote: null,
    termsUrl: null,
    privacyUrl: null,
    robotsUrl: null,
    evidenceUrl: null,
    reviewedAt: "2026-10-04T10:00:00.000Z",
    reviewedBy: "admin@example.com",
    rationale: "approved",
    expiresAt: null,
    reviewDueAt: null,
    createdAt: "2026-10-04T10:00:00.000Z",
    updatedAt: "2026-10-04T10:00:00.000Z",
    ...overrides,
  };
}

function governanceDb(row) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (!sql.includes("automation_governance_reviews")) throw new Error("unexpected query");
              return row;
            },
          };
        },
      };
    },
    async batch() { return []; },
  };
}

test("same domain EVENT and ADOPTION remain independent source identities", () => {
  const adoption = buildSourceScopedExtractionContract(source(), approvedGovernance());
  const event = buildSourceScopedExtractionContract(source({
    id: 11,
    entityType: "EVENT",
    sourceUrl: "https://utulok.example/akcie",
  }), approvedGovernance({ subjectId: 11, pathScope: "/akcie/**" }));

  assert.equal(adoption.ready, true);
  assert.equal(event.ready, true);
  assert.notEqual(adoption.contract.identity.identityKey, event.contract.identity.identityKey);

  const reused = selectRelevantExistingSourceForCandidate({
    entityType: "EVENT",
    canonicalUrl: "https://utulok.example/akcie",
    sourceUrl: "https://utulok.example/akcie",
  }, [{
    id: 10,
    entityType: "ADOPTION",
    sourceUrl: "https://utulok.example/psy",
    config: {},
  }]);
  assert.equal(reused, null);
});

test("same domain two ADOPTION roots are never merged by hostname", () => {
  const existing = {
    id: 20,
    entityType: "ADOPTION",
    sourceUrl: "https://utulok.example/psy",
    config: {},
  };
  assert.equal(selectRelevantExistingSourceForCandidate({
    entityType: "ADOPTION",
    canonicalUrl: "https://utulok.example/urgentne-adopcie",
    sourceUrl: "https://utulok.example/urgentne-adopcie",
  }, [existing]), null);

  assert.equal(selectRelevantExistingSourceForCandidate({
    entityType: "ADOPTION",
    canonicalUrl: "https://utulok.example/psy/",
    sourceUrl: "https://utulok.example/psy/",
  }, [existing])?.id, 20);
});

test("source root derives a bounded path scope instead of silently widening to the domain", () => {
  const built = buildSourceScopedExtractionContract(source(), null);
  assert.equal(built.ready, true);
  assert.deepEqual(built.contract.identity.approvedPathScope.includes, ["/psy/**"]);
  assert.equal(automationUrlWithinApprovedSourceScope(
    built.contract.identity,
    "https://utulok.example/psy/falco",
  ), true);
  assert.equal(automationUrlWithinApprovedSourceScope(
    built.contract.identity,
    "https://utulok.example/akcie",
  ), false);
  assert.equal(automationUrlWithinApprovedSourceScope(
    built.contract.identity,
    "https://other.example/psy/falco",
  ), false);
});

test("governance path scope supports includes and excludes and fails closed", () => {
  const built = buildSourceScopedExtractionContract(
    source(),
    approvedGovernance({ pathScope: "include:/psy/**;exclude:/psy/archiv/**" }),
  );
  assert.equal(built.ready, true);
  assert.equal(automationUrlWithinApprovedSourceScope(
    built.contract.identity,
    "https://utulok.example/psy/falco",
  ), true);
  assert.equal(automationUrlWithinApprovedSourceScope(
    built.contract.identity,
    "https://utulok.example/psy/archiv/falco",
  ), false);

  const invalid = buildSourceScopedExtractionContract(
    source(),
    approvedGovernance({ pathScope: "exclude:/psy/archiv/**" }),
  );
  assert.deepEqual(invalid, { ready: false, contract: null, reason: "INVALID_PATH_SCOPE" });
});

test("dedicated adapter is one supported extraction strategy and legacy behavior remains ready", () => {
  const adapterSource = source({
    sourceUrl: "https://trnava.utulok.sk/psy/triny",
    config: {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: "trnava-adoption-detail",
      expectedMinRecords: 1,
    },
  });
  const readiness = automationSourceReadiness(adapterSource);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.strategy, "DEDICATED_ADAPTER");
  assert.equal(readiness.adapterKey, "trnava-adoption-detail");
  assert.equal(resolveAutomationCapability(adapterSource)?.adapterKey, "trnava-adoption-detail");
});

test("source without a supported strategy remains fail closed", () => {
  const readiness = automationSourceReadiness(source({ config: { sourceShape: "MULTI_ITEM_LIST" } }));
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, "NO_RELIABLE_EXTRACTION_STRATEGY");
  assert.equal(readiness.strategy, null);
  assert.equal(readiness.capabilities.some((item) => item.status === "SUPPORTED"), false);
});

test("ranked search coverage never claims complete source inventory", () => {
  assert.equal(automationCoverageCanInferAbsence({
    classification: "RANKED_SEARCH",
    complete: false,
  }), false);
  assert.equal(automationCoverageCanInferAbsence({
    classification: "BOUNDED_PARTIAL",
    complete: false,
  }), false);
  assert.equal(automationCoverageCanInferAbsence({
    classification: "DETAIL_ONLY",
    complete: false,
  }), false);
  assert.equal(automationCoverageCanInferAbsence({
    classification: "COMPLETE_ENUMERATION",
    complete: true,
  }), true);
});

test("strategy capability registry distinguishes supported unavailable unsupported and blocked", () => {
  const supportedSource = source({
    sourceUrl: "https://trnava.utulok.sk/psy/triny",
    config: { sourceShape: "SINGLE_ITEM", htmlAdapterKey: "trnava-adoption-detail" },
  });
  const supported = automationExtractionCapabilities(supportedSource);
  assert.equal(supported.find((item) => item.strategy === "DEDICATED_ADAPTER")?.status, "SUPPORTED");

  const unavailable = automationExtractionCapabilities(source({ config: { sourceShape: "MULTI_ITEM_LIST" } }));
  assert.equal(unavailable.find((item) => item.strategy === "DEDICATED_ADAPTER")?.status, "UNAVAILABLE");
  assert.equal(unavailable.find((item) => item.strategy === "GENERIC_FIRST_PARTY")?.status, "UNAVAILABLE");

  const unsupported = automationExtractionCapabilities(source({
    config: { sourceShape: "SINGLE_ITEM", htmlAdapterKey: "not-a-production-adapter" },
  }));
  assert.equal(unsupported.find((item) => item.strategy === "DEDICATED_ADAPTER")?.status, "UNSUPPORTED");

  const blocked = automationExtractionCapabilities(supportedSource, undefined, { governanceAllowed: false });
  assert.ok(blocked.length > 0);
  assert.ok(blocked.every((item) => item.status === "BLOCKED"));
});

test("governance blockers take precedence over extraction capability", async () => {
  const noAdapterSource = source({ config: { sourceShape: "MULTI_ITEM_LIST" } });
  const blocked = await automationSourceActivationReadiness(
    noAdapterSource,
    governanceDb({
      ...approvedGovernance(),
      recurring_status: "DENIED",
      access_status: "ALLOWED",
      robots_status: "ALLOWED",
      terms_status: "ALLOWED",
      retention_status: "APPROVED",
      retain_url: 1,
      retain_title: 1,
      retain_snippet: 1,
      retain_metadata: 1,
      min_cadence_minutes: null,
      max_requests_per_day: 12,
      manual_only: 0,
      path_scope: "/psy/**",
      restrictions_note: null,
      terms_url: null,
      privacy_url: null,
      robots_url: null,
      evidence_url: null,
      reviewed_at: "2026-10-04T10:00:00.000Z",
      reviewed_by: "admin@example.com",
      rationale: "blocked",
      expires_at: null,
      review_due_at: null,
      created_at: "2026-10-04T10:00:00.000Z",
      updated_at: "2026-10-04T10:00:00.000Z",
      subject_type: "AUTOMATION_SOURCE",
      subject_id: 10,
    }),
  );
  assert.equal(blocked.reason, "GOVERNANCE_BLOCKED");
  assert.ok(blocked.governanceBlockingReasons.includes("RECURRING_USE_NOT_APPROVED"));
  assert.equal(blocked.technicalReason, null);
});
