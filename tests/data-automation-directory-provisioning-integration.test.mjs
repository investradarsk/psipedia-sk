import assert from "node:assert/strict";
import test from "node:test";
import { automationSourceReadiness } from "../lib/data-automation-capability-registry.ts";
import { automationSourceOnlyErrorMessage } from "../lib/admin-automation-presentation.ts";
import { searchProviderCandidatesForRoot } from "../lib/data-automation-discovery-runner.ts";
import {
  configureAutomationSource,
  getAutomationSourceAdmin,
  getAutomationSourceCandidate,
  reviewAutomationSource,
  reviewAutomationSourceCandidate,
  upsertAutomationSourceCandidate,
} from "../lib/data-automation-source-store.ts";
import {
  automationSourceActivationReadiness,
  prepareAutomationSourceGovernanceForApproval,
} from "../lib/data-automation-source-activation.ts";
import { SUPPORTED_DIRECTORY_CATEGORIES } from "../lib/data-automation-source-provisioning.ts";

function normalizedSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function sourceRow(source) {
  return {
    id: source.id,
    source_key: source.sourceKey,
    label: source.label,
    entity_type: source.entityType,
    connector_type: source.connectorType,
    source_url: source.sourceUrl,
    config_json: JSON.stringify(source.config),
    enabled: source.enabled ? 1 : 0,
    cadence_minutes: source.cadenceMinutes,
    throttle_ms: source.throttleMs,
    timeout_ms: source.timeoutMs,
    retry_max_attempts: source.retryMaxAttempts,
    retry_backoff_ms: source.retryBackoffMs,
    max_records_per_run: source.maxRecordsPerRun,
    next_check_at: source.nextCheckAt,
    last_checked_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error_code: null,
    review_status: source.reviewStatus,
    reviewed_at: source.reviewedAt ?? null,
    reviewed_by: source.reviewedBy ?? null,
    review_notes: source.reviewNotes ?? null,
    last_run_status: null,
    checked_count: 0,
    new_finding_count: 0,
    updated_finding_count: 0,
    error_count: 0,
    duration_ms: null,
  };
}

function candidateRow(candidate) {
  return {
    id: candidate.id,
    discovery_type: candidate.discoveryType,
    source_url: candidate.sourceUrl,
    canonical_url: candidate.canonicalUrl,
    label: candidate.label,
    entity_type: candidate.entityType,
    suggested_connector_type: candidate.suggestedConnectorType,
    discovered_from_source_id: candidate.discoveredFromSourceId,
    reason: candidate.reason,
    metadata_json: JSON.stringify(candidate.metadata),
    duplicate_source_id: candidate.duplicateSourceId,
    review_status: candidate.reviewStatus,
    reviewer_notes: candidate.reviewerNotes ?? null,
    reviewed_by: candidate.reviewedBy ?? null,
    reviewed_at: candidate.reviewedAt ?? null,
    suppressed_until: candidate.suppressedUntil ?? null,
    first_detected_at: candidate.firstDetectedAt,
    last_detected_at: candidate.lastDetectedAt,
  };
}

function governanceRow(a, id) {
  return {
    id,
    subject_type: String(a[0]),
    subject_id: Number(a[1]),
    access_status: String(a[2]),
    robots_status: String(a[3]),
    terms_status: String(a[4]),
    recurring_status: String(a[5]),
    retention_status: String(a[6]),
    retain_url: Number(a[7]),
    retain_title: Number(a[8]),
    retain_snippet: Number(a[9]),
    retain_metadata: Number(a[10]),
    retention_days: a[11] ?? null,
    min_cadence_minutes: a[12] ?? null,
    max_requests_per_day: a[13] ?? null,
    manual_only: Number(a[14]),
    path_scope: a[15] ?? null,
    restrictions_note: a[16] ?? null,
    terms_url: a[17] ?? null,
    privacy_url: a[18] ?? null,
    robots_url: a[19] ?? null,
    evidence_url: a[20] ?? null,
    reviewed_at: String(a[21]),
    reviewed_by: String(a[22]),
    rationale: String(a[23]),
    expires_at: a[24] ?? null,
    review_due_at: a[25] ?? null,
    created_at: String(a[26]),
    updated_at: String(a[27]),
  };
}

class MemoryStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = normalizedSql(sql);
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    const sql = this.sql;
    const a = this.args;

    if (sql.startsWith("SELECT id FROM automation_sources WHERE source_url=? AND entity_type=? LIMIT 1")) {
      const source = this.db.sources.find((item) => item.sourceUrl === a[0] && item.entityType === a[1]);
      return source ? { id: source.id } : null;
    }

    if (sql.startsWith("SELECT * FROM automation_source_candidates WHERE canonical_url=? AND entity_type=? LIMIT 1")) {
      const candidate = this.db.candidates.find((item) => item.canonicalUrl === a[0] && item.entityType === a[1]);
      return candidate ? candidateRow(candidate) : null;
    }

    if (sql.startsWith("SELECT * FROM automation_source_candidates WHERE id=? LIMIT 1")) {
      const candidate = this.db.candidates.find((item) => item.id === Number(a[0]));
      return candidate ? candidateRow(candidate) : null;
    }

    if (sql.includes("FROM automation_sources s") && sql.includes("WHERE s.id=? LIMIT 1")) {
      const source = this.db.sources.find((item) => item.id === Number(a[0]));
      return source ? sourceRow(source) : null;
    }

    if (sql.startsWith("SELECT * FROM automation_governance_reviews WHERE subject_type=? AND subject_id=? LIMIT 1")) {
      return this.db.governance.find((item) => item.subject_type === a[0] && item.subject_id === Number(a[1])) ?? null;
    }

    if (sql.startsWith("INSERT INTO automation_sources (")) {
      const source = {
        id: this.db.nextSourceId++,
        sourceKey: String(a[0]),
        label: String(a[1]),
        entityType: String(a[2]),
        connectorType: String(a[3]),
        sourceUrl: a[4] ? String(a[4]) : null,
        config: JSON.parse(String(a[5] ?? "{}")),
        enabled: false,
        cadenceMinutes: 1440,
        throttleMs: 1000,
        timeoutMs: 8000,
        retryMaxAttempts: 2,
        retryBackoffMs: 1000,
        maxRecordsPerRun: 100,
        nextCheckAt: null,
        reviewStatus: "PENDING",
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
      };
      this.db.sources.push(source);
      return { id: source.id };
    }

    throw new Error("Unhandled first SQL: " + sql);
  }

  async all() {
    const sql = this.sql;
    const a = this.args;

    if (sql.includes("FROM automation_source_candidate_evidence")) {
      return { results: [] };
    }

    if (sql.includes("FROM automation_sources s") && sql.includes("WHERE s.entity_type=?")) {
      return {
        results: this.db.sources
          .filter((item) => item.entityType === a[0] && item.sourceUrl)
          .map(sourceRow),
      };
    }

    throw new Error("Unhandled all SQL: " + sql);
  }

  async run() {
    const sql = this.sql;
    const a = this.args;

    if (sql.startsWith("INSERT INTO automation_source_candidates (")) {
      let candidate = this.db.candidates.find((item) => item.canonicalUrl === a[2] && item.entityType === a[4]);
      if (!candidate) {
        candidate = {
          id: this.db.nextCandidateId++,
          discoveryType: String(a[0]),
          sourceUrl: String(a[1]),
          canonicalUrl: String(a[2]),
          label: String(a[3]),
          entityType: String(a[4]),
          suggestedConnectorType: String(a[5]),
          discoveredFromSourceId: a[6] == null ? null : Number(a[6]),
          reason: String(a[7]),
          metadata: JSON.parse(String(a[8] ?? "{}")),
          duplicateSourceId: a[9] == null ? null : Number(a[9]),
          reviewStatus: "NEW",
          reviewerNotes: null,
          reviewedBy: null,
          reviewedAt: null,
          suppressedUntil: null,
          firstDetectedAt: String(a[10]),
          lastDetectedAt: String(a[11]),
        };
        this.db.candidates.push(candidate);
      } else {
        candidate.label = String(a[3]);
        candidate.suggestedConnectorType = String(a[5]);
        candidate.duplicateSourceId = a[9] == null ? null : Number(a[9]);
        candidate.lastDetectedAt = String(a[11]);
      }
      return { success: true };
    }

    if (sql.startsWith("UPDATE automation_source_candidates SET review_status=?")) {
      const candidate = this.db.candidates.find((item) => item.id === Number(a[6]));
      if (!candidate) throw new Error("candidate missing");
      candidate.reviewStatus = String(a[0]);
      candidate.reviewerNotes = a[1] == null ? null : String(a[1]);
      candidate.reviewedBy = a[2] == null ? null : String(a[2]);
      candidate.reviewedAt = String(a[3]);
      candidate.suppressedUntil = a[4] == null ? null : String(a[4]);
      candidate.duplicateSourceId = a[5] == null ? null : Number(a[5]);
      return { success: true };
    }

    if (sql.startsWith("UPDATE automation_sources SET config_json=?")) {
      const source = this.db.sources.find((item) => item.id === Number(a[2]));
      if (!source) throw new Error("source missing");
      source.config = JSON.parse(String(a[0]));
      source.enabled = false;
      source.reviewStatus = "PENDING";
      source.reviewedAt = null;
      source.reviewedBy = null;
      source.reviewNotes = null;
      source.nextCheckAt = null;
      return { success: true };
    }

    if (sql.startsWith("UPDATE automation_sources SET review_status=?")) {
      const source = this.db.sources.find((item) => item.id === Number(a[7]));
      if (!source) throw new Error("source missing");
      source.reviewStatus = String(a[0]);
      source.reviewedAt = String(a[1]);
      source.reviewedBy = String(a[2]);
      source.reviewNotes = a[3] == null ? null : String(a[3]);
      if (a[0] === "REJECTED") {
        source.enabled = false;
        source.nextCheckAt = null;
      }
      return { success: true };
    }

    if (sql.startsWith("INSERT INTO automation_governance_reviews (")) {
      this.db.governance.push(governanceRow(a, this.db.nextGovernanceId++));
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE automation_sources SET cadence_minutes=?,enabled=?,next_check_at=?,updated_at=? WHERE id=?")) {
      const source = this.db.sources.find((item) => item.id === Number(a[4]));
      if (!source) throw new Error("source missing");
      source.cadenceMinutes = Number(a[0]);
      source.enabled = Boolean(a[1]);
      source.nextCheckAt = a[2] == null ? null : String(a[2]);
      return { success: true, meta: { changes: 1 } };
    }

    throw new Error("Unhandled run SQL: " + sql);
  }
}

class MemoryD1 {
  constructor() {
    this.candidates = [];
    this.sources = [];
    this.governance = [];
    this.nextCandidateId = 1;
    this.nextSourceId = 1;
    this.nextGovernanceId = 1;
  }

  prepare(sql) {
    return new MemoryStatement(this, sql);
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  seedSource(overrides = {}) {
    const source = {
      id: this.nextSourceId++,
      sourceKey: "seed-source",
      label: "Seed source",
      entityType: "DIRECTORY",
      connectorType: "CONTROLLED_HTML",
      sourceUrl: "https://seed.example.sk/profile",
      config: {},
      enabled: false,
      cadenceMinutes: 1440,
      throttleMs: 1000,
      timeoutMs: 8000,
      retryMaxAttempts: 2,
      retryBackoffMs: 1000,
      maxRecordsPerRun: 100,
      nextCheckAt: null,
      reviewStatus: "PENDING",
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
      ...overrides,
    };
    this.sources.push(source);
    return source;
  }
}

function tavilyDirectoryRoot(category, rootKey = "tavily-sk-directory-" + category) {
  return {
    id: 1,
    rootKey,
    label: "Tavily " + category,
    discoveryType: "SEARCH_PROVIDER",
    sourceUrl: null,
    entityType: "DIRECTORY",
    suggestedConnectorType: "CONTROLLED_HTML",
    config: {
      provider: "tavily",
      directoryCategory: category,
      queries: ["test query"],
      country: "SK",
      locale: "sk-SK",
      maxResults: 5,
    },
    enabled: true,
    reviewStatus: "APPROVED",
    cadenceMinutes: 10080,
    nextCheckAt: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
  };
}

function sourceGovernanceFetch({ sourceStatus = 200, robots = "allow" } = {}) {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/robots.txt") {
      if (robots === "missing") return new Response("", { status: 404 });
      const body = robots === "block"
        ? "User-agent: *\nDisallow: /"
        : "User-agent: *\nAllow: /";
      return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("<html><body>source</body></html>", {
      status: sourceStatus,
      headers: { "content-type": "text/html" },
    });
  };
}

function mappedCandidate(category, url, rootKey) {
  const root = tavilyDirectoryRoot(category, rootKey);
  const candidates = searchProviderCandidatesForRoot({
    root,
    providerKey: "tavily",
    request: { query: "test query", maxResults: 5, country: "SK", locale: "sk-SK" },
    fingerprint: "fingerprint-" + category,
    results: [{ url, title: "Test " + category, rank: 0, snippet: "Official source" }],
    operationKey: "op-" + category,
  });
  assert.equal(candidates.length, 1);
  return candidates[0];
}

function eventCandidate(url, label = "Known EVENT calendar") {
  return {
    candidateType: "SOURCE_CANDIDATE",
    discoveryType: "SEARCH_PROVIDER",
    sourceUrl: url,
    label,
    entityType: "EVENT",
    suggestedConnectorType: "CONTROLLED_HTML",
    reason: "Known supported EVENT calendar discovered for operator review.",
    metadata: {},
  };
}

const KNOWN_EVENT_SOURCE_CASES = [
  {
    label: "SKJ",
    url: "https://skj.sk/sk/vystavy/kalendar/",
    adapterKey: "skj-exhibition-calendar",
    expectedMinRecords: undefined,
  },
  {
    label: "ASKA",
    url: "https://agility.sk/preteky/",
    adapterKey: "agility-sk-events",
    expectedMinRecords: 1,
  },
  {
    label: "ZŠK SR",
    url: "https://zsksr.sk/kalendar/",
    adapterKey: "zsk-sr-events",
    expectedMinRecords: 1,
  },
  {
    label: "SZPZ",
    url: "https://mushing.sk/preteky/",
    adapterKey: "szpz-mushing-events",
    expectedMinRecords: 1,
  },
];

async function approveCandidateToSource(db, candidateInput, now = new Date("2026-09-28T07:00:00.000Z")) {
  const stored = await upsertAutomationSourceCandidate({ candidate: candidateInput, detectedAt: now }, db);
  const reloaded = await getAutomationSourceCandidate(stored.id, db, now);
  assert.ok(reloaded);

  const reviewedCandidate = await reviewAutomationSourceCandidate({
    id: stored.id,
    action: "approve",
    reviewerEmail: "admin@psipedia.sk",
    now,
  }, db);
  assert.ok(reviewedCandidate?.duplicateSourceId);

  let source = await getAutomationSourceAdmin(reviewedCandidate.duplicateSourceId, db);
  assert.ok(source);
  if (source.reviewStatus !== "APPROVED") {
    source = await reviewAutomationSource({
      id: source.id,
      action: "approve",
      reviewerEmail: "admin@psipedia.sk",
      now,
    }, db);
  }
  assert.ok(source);
  return { stored, reloaded, reviewedCandidate, source };
}

test("HOTFIX EVENT provisioning approval integration maps all known master calendars to READY production adapters", async () => {
  for (const item of KNOWN_EVENT_SOURCE_CASES) {
    const db = new MemoryD1();
    const candidate = eventCandidate(item.url, item.label);
    const { reloaded, source } = await approveCandidateToSource(db, candidate);

    assert.equal(reloaded.entityType, "EVENT", item.label);
    assert.equal(reloaded.canonicalUrl, new URL(item.url.replace("www.", "")).toString().replace(/\/$/, ""), item.label);
    assert.equal(source.entityType, "EVENT", item.label);
    assert.equal(source.connectorType, "CONTROLLED_HTML", item.label);
    assert.equal(source.enabled, false, item.label);
    assert.equal(source.config.htmlAdapterKey, item.adapterKey, item.label);
    assert.equal(source.config.sourceShape, "MULTI_ITEM_LIST", item.label);
    assert.equal(source.config.expectedMinRecords, item.expectedMinRecords, item.label);
    assert.equal(automationSourceReadiness(source).ready, true, item.label);
    assert.equal(automationSourceReadiness(source).reason, "READY", item.label);
  }
});

test("HOTFIX Agility SK candidate persists, reloads and approves with agility production adapter", async () => {
  const db = new MemoryD1();
  const candidate = eventCandidate("https://agility.sk/preteky/", "ASKA");
  const stored = await upsertAutomationSourceCandidate({ candidate }, db);
  const reloaded = await getAutomationSourceCandidate(stored.id, db);
  assert.ok(reloaded);
  assert.equal(reloaded.canonicalUrl, "https://agility.sk/preteky");

  const reviewed = await reviewAutomationSourceCandidate({
    id: stored.id,
    action: "approve",
    reviewerEmail: "admin@psipedia.sk",
  }, db);
  assert.ok(reviewed?.duplicateSourceId);

  const source = await getAutomationSourceAdmin(reviewed.duplicateSourceId, db);
  assert.ok(source);
  assert.equal(source.config.htmlAdapterKey, "agility-sk-events");
  assert.equal(source.config.sourceShape, "MULTI_ITEM_LIST");
  assert.equal(source.config.expectedMinRecords, 1);
  assert.equal(automationSourceReadiness(source).ready, true);
});

test("HOTFIX EVENT reuse repairs a missing known adapter but never activates the source", async () => {
  const db = new MemoryD1();
  const url = "https://agility.sk/preteky";
  const existing = db.seedSource({
    entityType: "EVENT",
    sourceUrl: url,
    config: {},
    reviewStatus: "APPROVED",
    enabled: true,
  });
  const { stored, source } = await approveCandidateToSource(db, eventCandidate(url, "ASKA"));

  assert.equal(stored.duplicateSourceId, existing.id);
  assert.equal(source.id, existing.id);
  assert.equal(source.config.htmlAdapterKey, "agility-sk-events");
  assert.equal(source.config.sourceShape, "MULTI_ITEM_LIST");
  assert.equal(source.config.expectedMinRecords, 1);
  assert.equal(source.enabled, false);
  assert.equal(automationSourceReadiness(source).ready, true);
});

test("HOTFIX conflicting EVENT reuse fails closed without rewriting the existing adapter", async () => {
  const db = new MemoryD1();
  const url = "https://agility.sk/preteky";
  const existing = db.seedSource({
    entityType: "EVENT",
    sourceUrl: url,
    config: {
      htmlAdapterKey: "zsk-sr-events",
      sourceShape: "MULTI_ITEM_LIST",
      expectedMinRecords: 1,
    },
  });
  const before = structuredClone(existing.config);
  const stored = await upsertAutomationSourceCandidate({ candidate: eventCandidate(url, "ASKA") }, db);

  await assert.rejects(
    reviewAutomationSourceCandidate({
      id: stored.id,
      action: "approve",
      reviewerEmail: "admin@psipedia.sk",
    }, db),
    /automation_candidate_source_provisioning_conflict/,
  );
  assert.deepEqual(existing.config, before);
});

test("HOTFIX unknown EVENT page never invents an adapter and remains fail-closed", async () => {
  const db = new MemoryD1();
  const { source } = await approveCandidateToSource(
    db,
    eventCandidate("https://events.example.sk/preteky/", "Unknown calendar"),
  );

  assert.deepEqual(source.config, {});
  assert.equal(source.enabled, false);
  assert.equal(automationSourceReadiness(source).ready, false);
  assert.equal(automationSourceReadiness(source).reason, "MISSING_ADAPTER");
});

test("HOTFIX known EVENT activation still requires governance and uses the unified readiness contract", async () => {
  const db = new MemoryD1();
  const now = new Date("2026-09-28T10:00:00.000Z");
  const { source } = await approveCandidateToSource(
    db,
    eventCandidate("https://agility.sk/preteky/", "ASKA"),
    now,
  );
  assert.equal(source.enabled, false);

  const beforeGovernance = await automationSourceActivationReadiness(source, db, {
    cadenceMinutes: 360,
    now,
  });
  assert.equal(beforeGovernance.ready, false);
  assert.equal(beforeGovernance.reason, "GOVERNANCE_BLOCKED");

  await prepareAutomationSourceGovernanceForApproval({
    source,
    actor: "admin@psipedia.sk",
    database: db,
    fetchImpl: sourceGovernanceFetch(),
    now,
  });
  const ready = await automationSourceActivationReadiness(source, db, {
    cadenceMinutes: 360,
    now,
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.reason, "READY");

  const configured = await configureAutomationSource({
    id: source.id,
    enabled: true,
    cadenceMinutes: 360,
    now,
  }, db);
  assert.equal(configured.enabled, true);
  assert.equal(configured.nextCheckAt, now.toISOString());
});

test("HOTFIX real Veterinary Tavily SEARCH_PROVIDER candidate persists category and approves READY", async () => {
  const db = new MemoryD1();
  const candidate = mappedCandidate(
    "veterinari",
    "https://veterina.example.sk/sluzba",
    "tavily-sk-dog-veterinarians",
  );
  assert.equal(candidate.metadata.directoryCategory, "veterinari");

  const { reloaded, source } = await approveCandidateToSource(db, candidate);
  assert.equal(reloaded.metadata.directoryCategory, "veterinari");
  assert.equal(source.config.htmlAdapterKey, "generic-directory-profile");
  assert.equal(source.config.sourceShape, "SINGLE_ITEM");
  assert.equal(source.config.staticFields.category, "veterinari");
  assert.equal(source.config.staticFields.semanticKind, "FACILITY_OR_SERVICE_PROFILE");

  const readiness = automationSourceReadiness(source);
  assert.equal(readiness.reason, "READY");
  assert.equal(readiness.ready, true);
});

test("HOTFIX Veterinary approve prepares source governance and enables through unified readiness", async () => {
  const db = new MemoryD1();
  const now = new Date("2026-09-28T07:30:00.000Z");
  const candidate = mappedCandidate(
    "veterinari",
    "https://veterina.example.sk/sluzba",
    "tavily-sk-dog-veterinarians",
  );
  const { source } = await approveCandidateToSource(db, candidate, now);

  const preparation = await prepareAutomationSourceGovernanceForApproval({
    source,
    actor: "admin@psipedia.sk",
    database: db,
    fetchImpl: sourceGovernanceFetch(),
    now,
  });
  assert.equal(preparation.prepared, true);
  assert.equal(preparation.governance.state.accessStatus, "ALLOWED");
  assert.equal(preparation.governance.state.robotsStatus, "ALLOWED");
  assert.equal(preparation.governance.state.termsStatus, "ALLOWED");
  assert.equal(preparation.governance.state.recurringStatus, "APPROVED");
  assert.equal(preparation.governance.state.retentionStatus, "RESTRICTED");
  assert.equal(preparation.governance.state.retainUrl, true);
  assert.equal(preparation.governance.state.retainMetadata, true);
  assert.equal(preparation.governance.state.retainTitle, false);
  assert.equal(preparation.governance.state.retainSnippet, false);
  assert.equal(preparation.governance.state.reviewedBy, "admin@psipedia.sk");

  const readiness = await automationSourceActivationReadiness(source, db, {
    cadenceMinutes: 10080,
    now,
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.reason, "READY");

  const wasEnabled = source.enabled;
  const configured = await configureAutomationSource({
    id: source.id,
    enabled: true,
    cadenceMinutes: 10080,
    now,
  }, db);
  assert.equal(configured.enabled, true);
  assert.equal(configured.cadenceMinutes, 10080);
  assert.equal(configured.nextCheckAt, now.toISOString());
  assert.equal(configured.enabled && !wasEnabled, true, "OFF -> ON requires immediate first run");
});

test("HOTFIX missing source governance fails closed without partial configure writes", async () => {
  const db = new MemoryD1();
  const now = new Date("2026-09-28T08:00:00.000Z");
  const candidate = mappedCandidate("veterinari", "https://missing-governance.example.sk/profile");
  const { source } = await approveCandidateToSource(db, candidate, now);
  const before = {
    cadenceMinutes: source.cadenceMinutes,
    enabled: source.enabled,
    nextCheckAt: source.nextCheckAt,
  };

  const readiness = await automationSourceActivationReadiness(source, db, {
    cadenceMinutes: 10080,
    now,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, "GOVERNANCE_BLOCKED");
  assert.ok(readiness.governanceBlockingReasons.includes("GOVERNANCE_MISSING"));

  let message = "";
  await assert.rejects(
    configureAutomationSource({
      id: source.id,
      enabled: true,
      cadenceMinutes: 10080,
      now,
    }, db),
    (error) => {
      message = error.message;
      return /automation_source_governance_blocked:GOVERNANCE_MISSING/.test(error.message);
    },
  );

  const after = await getAutomationSourceAdmin(source.id, db);
  assert.equal(after.cadenceMinutes, before.cadenceMinutes);
  assert.equal(after.enabled, before.enabled);
  assert.equal(after.nextCheckAt, before.nextCheckAt);
  assert.equal(
    automationSourceOnlyErrorMessage(message),
    "Tento zdroj zatiaľ nemožno automaticky kontrolovať.",
  );
});

test("HOTFIX robots or terms blockers cannot activate and approval does not overwrite existing governance", async () => {
  const now = new Date("2026-09-28T08:15:00.000Z");

  const robotsDb = new MemoryD1();
  const { source: robotsSource } = await approveCandidateToSource(
    robotsDb,
    mappedCandidate("veterinari", "https://robots-block.example.sk/profile"),
    now,
  );
  await prepareAutomationSourceGovernanceForApproval({
    source: robotsSource,
    actor: "admin@psipedia.sk",
    database: robotsDb,
    fetchImpl: sourceGovernanceFetch({ robots: "block" }),
    now,
  });
  const robotsReadiness = await automationSourceActivationReadiness(robotsSource, robotsDb, {
    cadenceMinutes: 10080,
    now,
  });
  assert.equal(robotsReadiness.ready, false);
  assert.ok(robotsReadiness.governanceBlockingReasons.includes("ROBOTS_NOT_ALLOWED"));
  await assert.rejects(
    configureAutomationSource({ id: robotsSource.id, enabled: true, cadenceMinutes: 10080, now }, robotsDb),
    /ROBOTS_NOT_ALLOWED/,
  );
  assert.equal((await getAutomationSourceAdmin(robotsSource.id, robotsDb)).enabled, false);

  const termsDb = new MemoryD1();
  const { source: termsSource } = await approveCandidateToSource(
    termsDb,
    mappedCandidate("veterinari", "https://terms-block.example.sk/profile"),
    now,
  );
  await prepareAutomationSourceGovernanceForApproval({
    source: termsSource,
    actor: "admin@psipedia.sk",
    database: termsDb,
    fetchImpl: sourceGovernanceFetch(),
    now,
  });
  termsDb.governance[0].terms_status = "BLOCKED";
  const before = structuredClone(termsDb.governance[0]);

  const repeatPreparation = await prepareAutomationSourceGovernanceForApproval({
    source: termsSource,
    actor: "another-admin@psipedia.sk",
    database: termsDb,
    fetchImpl: sourceGovernanceFetch(),
    now,
  });
  assert.equal(repeatPreparation.prepared, false);
  assert.deepEqual(termsDb.governance[0], before, "existing source governance must never be silently overwritten");

  const termsReadiness = await automationSourceActivationReadiness(termsSource, termsDb, {
    cadenceMinutes: 10080,
    now,
  });
  assert.equal(termsReadiness.ready, false);
  assert.ok(termsReadiness.governanceBlockingReasons.includes("TERMS_NOT_ALLOWED"));
  await assert.rejects(
    configureAutomationSource({ id: termsSource.id, enabled: true, cadenceMinutes: 10080, now }, termsDb),
    /TERMS_NOT_ALLOWED/,
  );
  assert.equal((await getAutomationSourceAdmin(termsSource.id, termsDb)).enabled, false);
});

test("HOTFIX all supported DIRECTORY categories provision the production generic adapter through approval", async () => {
  for (const [index, category] of SUPPORTED_DIRECTORY_CATEGORIES.entries()) {
    const db = new MemoryD1();
    const url = "https://directory-" + index + ".example.sk/profile";
    const candidate = mappedCandidate(category, url);
    const { reloaded, source } = await approveCandidateToSource(db, candidate);

    assert.equal(reloaded.metadata.directoryCategory, category, category);
    assert.equal(source.config.htmlAdapterKey, "generic-directory-profile", category);
    assert.equal(source.config.sourceShape, "SINGLE_ITEM", category);
    assert.equal(source.config.expectedMinRecords, 1, category);
    assert.equal(source.config.staticFields.category, category, category);
    assert.equal(source.config.staticFields.semanticKind, "FACILITY_OR_SERVICE_PROFILE", category);

    const readiness = automationSourceReadiness(source);
    assert.equal(readiness.reason, "READY", category);
    assert.equal(readiness.ready, true, category);
  }
});

test("HOTFIX duplicateSourceId reuse repairs missing DIRECTORY provisioning before source approval", async () => {
  const db = new MemoryD1();
  const url = "https://reuse.example.sk/vet";
  const oldSource = db.seedSource({ sourceUrl: url, config: {}, reviewStatus: "APPROVED", enabled: true });
  const candidate = mappedCandidate("veterinari", url, "tavily-sk-dog-veterinarians");

  const { stored, source } = await approveCandidateToSource(db, candidate);
  assert.equal(stored.duplicateSourceId, oldSource.id);
  assert.equal(source.id, oldSource.id);
  assert.equal(source.config.htmlAdapterKey, "generic-directory-profile");
  assert.equal(source.config.staticFields.category, "veterinari");
  assert.equal(automationSourceReadiness(source).reason, "READY");
});

test("HOTFIX incompatible DIRECTORY reuse fails closed and does not rewrite unrelated config", async () => {
  const db = new MemoryD1();
  const url = "https://conflict.example.sk/profile";
  const existing = db.seedSource({
    sourceUrl: url,
    config: {
      htmlAdapterKey: "generic-directory-profile",
      sourceShape: "SINGLE_ITEM",
      expectedMinRecords: 1,
      staticFields: {
        category: "treneri",
        semanticKind: "FACILITY_OR_SERVICE_PROFILE",
      },
    },
  });
  const before = structuredClone(existing.config);
  const candidate = mappedCandidate("veterinari", url, "tavily-sk-dog-veterinarians");
  const stored = await upsertAutomationSourceCandidate({ candidate }, db);

  await assert.rejects(
    reviewAutomationSourceCandidate({
      id: stored.id,
      action: "approve",
      reviewerEmail: "admin@psipedia.sk",
    }, db),
    /automation_candidate_source_provisioning_conflict/,
  );
  assert.deepEqual(existing.config, before);
});

test("HOTFIX DIRECTORY candidate without a supported adapter remains fail-closed", async () => {
  const db = new MemoryD1();
  const candidate = mappedCandidate("nepodporovana-kategoria", "https://unsupported.example.sk/profile");
  const { source } = await approveCandidateToSource(db, candidate);

  assert.deepEqual(source.config, {});
  const readiness = automationSourceReadiness(source);
  assert.equal(readiness.reason, "MISSING_ADAPTER");
  assert.equal(readiness.ready, false);
});


test("HOTFIX source-only error mapping never exposes readiness backend codes", () => {
  const expected = "Tento zdroj zatiaľ nemožno automaticky kontrolovať.";
  for (const code of [
    "automation_source_not_ready:MISSING_ADAPTER",
    "automation_source_not_ready:UNSUPPORTED_ADAPTER",
    "automation_source_not_ready:ADAPTER_ENTITY_MISMATCH",
    "automation_source_not_ready:ADAPTER_SHAPE_MISMATCH",
    "automation_source_not_ready:MISSING_PARSER",
    "automation_candidate_source_not_ready:UNSUPPORTED_ADAPTER",
    "automation_candidate_source_provisioning_conflict",
    "automation_source_governance_blocked:GOVERNANCE_MISSING",
    "automation_source_governance_blocked:ROBOTS_NOT_ALLOWED,TERMS_NOT_ALLOWED",
  ]) {
    assert.equal(automationSourceOnlyErrorMessage(code), expected, code);
  }
  assert.equal(
    automationSourceOnlyErrorMessage("automation_source_review_required", "Nastavenie sa nepodarilo uložiť."),
    "Nastavenie sa nepodarilo uložiť.",
  );
});
