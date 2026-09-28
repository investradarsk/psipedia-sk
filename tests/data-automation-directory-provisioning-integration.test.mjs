import assert from "node:assert/strict";
import test from "node:test";
import { automationSourceReadiness } from "../lib/data-automation-capability-registry.ts";
import { automationSourceOnlyErrorMessage } from "../lib/admin-automation-presentation.ts";
import { searchProviderCandidatesForRoot } from "../lib/data-automation-discovery-runner.ts";
import {
  getAutomationSourceAdmin,
  getAutomationSourceCandidate,
  reviewAutomationSource,
  reviewAutomationSourceCandidate,
  upsertAutomationSourceCandidate,
} from "../lib/data-automation-source-store.ts";
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

    throw new Error("Unhandled run SQL: " + sql);
  }
}

class MemoryD1 {
  constructor() {
    this.candidates = [];
    this.sources = [];
    this.nextCandidateId = 1;
    this.nextSourceId = 1;
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
  const expected = "Tento zdroj zatiaľ nie je pripravený na automatické spracovanie.";
  for (const code of [
    "automation_source_not_ready:MISSING_ADAPTER",
    "automation_source_not_ready:UNSUPPORTED_ADAPTER",
    "automation_source_not_ready:ADAPTER_ENTITY_MISMATCH",
    "automation_source_not_ready:ADAPTER_SHAPE_MISMATCH",
    "automation_source_not_ready:MISSING_PARSER",
    "automation_candidate_source_not_ready:UNSUPPORTED_ADAPTER",
    "automation_candidate_source_provisioning_conflict",
  ]) {
    assert.equal(automationSourceOnlyErrorMessage(code), expected, code);
  }
  assert.equal(
    automationSourceOnlyErrorMessage("automation_source_review_required", "Nastavenie sa nepodarilo uložiť."),
    "Nastavenie sa nepodarilo uložiť.",
  );
});
