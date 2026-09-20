import { env } from "cloudflare:workers";
import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  stableJson,
  type AutomationConnectorType,
  type AutomationEntityType,
  type AutomationSource,
  type AutomationSourceConfig,
} from "./data-automation.ts";
import type { AutomationSourceAdminInput } from "./data-automation-source-admin.ts";
import type { AutomationSourceCandidateInput } from "./data-automation-discovery.ts";

export type AutomationSourceAdminDatabase = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

export type AutomationSourceReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AutomationCandidateReviewStatus = "NEW" | "APPROVED" | "REJECTED" | "SUPPRESSED";

export type AutomationSourceAdminRow = {
  id: number;
  sourceKey: string;
  label: string;
  entityType: AutomationEntityType;
  connectorType: AutomationConnectorType;
  sourceUrl: string | null;
  config: AutomationSourceConfig;
  enabled: boolean;
  cadenceMinutes: number;
  throttleMs: number;
  timeoutMs: number;
  retryMaxAttempts: number;
  retryBackoffMs: number;
  maxRecordsPerRun: number;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  reviewStatus: AutomationSourceReviewStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  lastRunStatus: string | null;
  checkedCount: number;
  newFindingCount: number;
  updatedFindingCount: number;
  errorCount: number;
  durationMs: number | null;
};

export type AutomationSourceCandidateRow = {
  id: number;
  candidateType: "SOURCE_CANDIDATE";
  discoveryType: string;
  sourceUrl: string;
  canonicalUrl: string;
  label: string;
  entityType: AutomationEntityType;
  suggestedConnectorType: AutomationConnectorType;
  discoveredFromSourceId: number | null;
  reason: string;
  metadata: Record<string, unknown>;
  duplicateSourceId: number | null;
  reviewStatus: AutomationCandidateReviewStatus;
  reviewerNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  suppressedUntil: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
};

function database(input?: AutomationSourceAdminDatabase) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Data automation nemá pripojenú databázu.");
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function mapSourceAdmin(row: Record<string, unknown>): AutomationSourceAdminRow {
  return {
    id: numberValue(row.id),
    sourceKey: String(row.source_key ?? ""),
    label: String(row.label ?? ""),
    entityType: row.entity_type as AutomationEntityType,
    connectorType: row.connector_type as AutomationConnectorType,
    sourceUrl: canonicalizeSourceUrl(row.source_url),
    config: json<AutomationSourceConfig>(row.config_json, {}),
    enabled: Boolean(row.enabled),
    cadenceMinutes: numberValue(row.cadence_minutes),
    throttleMs: numberValue(row.throttle_ms),
    timeoutMs: numberValue(row.timeout_ms),
    retryMaxAttempts: numberValue(row.retry_max_attempts),
    retryBackoffMs: numberValue(row.retry_backoff_ms),
    maxRecordsPerRun: numberValue(row.max_records_per_run),
    nextCheckAt: row.next_check_at ? String(row.next_check_at) : null,
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    lastErrorAt: row.last_error_at ? String(row.last_error_at) : null,
    lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
    reviewStatus: String(row.review_status ?? "PENDING") as AutomationSourceReviewStatus,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewNotes: row.review_notes ? String(row.review_notes) : null,
    lastRunStatus: row.last_run_status ? String(row.last_run_status) : null,
    checkedCount: numberValue(row.checked_count),
    newFindingCount: numberValue(row.new_finding_count),
    updatedFindingCount: numberValue(row.updated_finding_count),
    errorCount: numberValue(row.error_count),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : numberValue(row.duration_ms),
  };
}

const SOURCE_ADMIN_SELECT = `
  SELECT s.*,
    r.status AS last_run_status,r.checked_count,r.new_finding_count,r.updated_finding_count,r.error_count,r.duration_ms
  FROM automation_sources s
  LEFT JOIN automation_runs r ON r.id=(
    SELECT r2.id FROM automation_runs r2 WHERE r2.source_id=s.id ORDER BY r2.started_at DESC,r2.id DESC LIMIT 1
  )`;

export async function listAutomationSourcesAdmin(
  input?: AutomationSourceAdminDatabase,
  limit = 100,
) {
  const db = database(input);
  const result = await db.prepare(`${SOURCE_ADMIN_SELECT}
    ORDER BY s.label COLLATE NOCASE ASC,s.id ASC LIMIT ?`)
    .bind(Math.max(1, Math.min(200, limit)))
    .all<Record<string, unknown>>();
  return result.results.map(mapSourceAdmin);
}

export async function getAutomationSourceAdmin(id: number, input?: AutomationSourceAdminDatabase) {
  const db = database(input);
  const row = await db.prepare(`${SOURCE_ADMIN_SELECT} WHERE s.id=? LIMIT 1`)
    .bind(id).first<Record<string, unknown>>();
  return row ? mapSourceAdmin(row) : null;
}

export async function createAutomationSourceAdmin(
  source: AutomationSourceAdminInput,
  input?: AutomationSourceAdminDatabase,
  now = new Date(),
) {
  const db = database(input);
  const at = now.toISOString();
  const row = await db.prepare(`INSERT INTO automation_sources (
      source_key,label,entity_type,connector_type,source_url,config_json,enabled,
      cadence_minutes,throttle_ms,timeout_ms,retry_max_attempts,retry_backoff_ms,max_records_per_run,
      next_check_at,created_at,updated_at,review_status
    ) VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,NULL,?,?,'PENDING') RETURNING id`).bind(
      source.sourceKey, source.label, source.entityType, source.connectorType,
      canonicalizeSourceUrl(source.sourceUrl), JSON.stringify(source.config),
      source.cadenceMinutes, source.throttleMs, source.timeoutMs, source.retryMaxAttempts,
      source.retryBackoffMs, source.maxRecordsPerRun, at, at,
    ).first<{ id: number }>();
  if (!row) throw new Error("automation_source_create_failed");
  return getAutomationSourceAdmin(Number(row.id), db);
}

function sourceSafetySignature(source: {
  entityType: AutomationEntityType;
  connectorType: AutomationConnectorType;
  sourceUrl: string | null;
  config: AutomationSourceConfig;
}) {
  return stableJson({
    entityType: source.entityType,
    connectorType: source.connectorType,
    sourceUrl: canonicalizeSourceUrl(source.sourceUrl),
    config: source.config,
  });
}

export async function updateAutomationSourceAdmin(
  id: number,
  source: AutomationSourceAdminInput,
  input?: AutomationSourceAdminDatabase,
  now = new Date(),
) {
  const db = database(input);
  const existing = await getAutomationSourceAdmin(id, db);
  if (!existing) return null;

  const safetyChanged = sourceSafetySignature(existing) !== sourceSafetySignature(source);
  const at = now.toISOString();
  await db.prepare(`UPDATE automation_sources SET
      source_key=?,label=?,entity_type=?,connector_type=?,source_url=?,config_json=?,
      cadence_minutes=?,throttle_ms=?,timeout_ms=?,retry_max_attempts=?,retry_backoff_ms=?,max_records_per_run=?,
      enabled=CASE WHEN ? THEN 0 ELSE enabled END,
      review_status=CASE WHEN ? THEN 'PENDING' ELSE review_status END,
      reviewed_at=CASE WHEN ? THEN NULL ELSE reviewed_at END,
      reviewed_by=CASE WHEN ? THEN NULL ELSE reviewed_by END,
      review_notes=CASE WHEN ? THEN NULL ELSE review_notes END,
      next_check_at=CASE WHEN ? THEN NULL ELSE next_check_at END,
      updated_at=?
    WHERE id=?`).bind(
      source.sourceKey, source.label, source.entityType, source.connectorType,
      canonicalizeSourceUrl(source.sourceUrl), JSON.stringify(source.config),
      source.cadenceMinutes, source.throttleMs, source.timeoutMs, source.retryMaxAttempts,
      source.retryBackoffMs, source.maxRecordsPerRun,
      safetyChanged ? 1 : 0, safetyChanged ? 1 : 0, safetyChanged ? 1 : 0,
      safetyChanged ? 1 : 0, safetyChanged ? 1 : 0, safetyChanged ? 1 : 0,
      at, id,
    ).run();
  return getAutomationSourceAdmin(id, db);
}

export async function reviewAutomationSource(input: {
  id: number;
  action: "approve" | "reject";
  reviewerEmail: string;
  notes?: string | null;
  now?: Date;
}, databaseInput?: AutomationSourceAdminDatabase) {
  const db = database(databaseInput);
  const existing = await getAutomationSourceAdmin(input.id, db);
  if (!existing) return null;
  if (input.action === "approve" && existing.connectorType !== "MANUAL_IMPORT") {
    if (!existing.sourceUrl || !isSafeAutomationSourceUrl(existing.sourceUrl)) {
      throw new Error("automation_source_url_not_safe");
    }
  }
  const at = (input.now ?? new Date()).toISOString();
  const status = input.action === "approve" ? "APPROVED" : "REJECTED";
  await db.prepare(`UPDATE automation_sources SET review_status=?,reviewed_at=?,reviewed_by=?,review_notes=?,
      enabled=CASE WHEN ?='REJECTED' THEN 0 ELSE enabled END,
      next_check_at=CASE WHEN ?='REJECTED' THEN NULL ELSE next_check_at END,
      updated_at=? WHERE id=?`).bind(
        status, at, input.reviewerEmail.trim().toLowerCase(),
        input.notes?.trim().slice(0, 2000) || null,
        status, status, at, input.id,
      ).run();
  return getAutomationSourceAdmin(input.id, db);
}

export async function setAutomationSourceEnabled(input: {
  id: number;
  enabled: boolean;
  now?: Date;
}, databaseInput?: AutomationSourceAdminDatabase) {
  const db = database(databaseInput);
  const existing = await getAutomationSourceAdmin(input.id, db);
  if (!existing) return null;
  if (input.enabled) {
    if (existing.reviewStatus !== "APPROVED") throw new Error("automation_source_review_required");
    if (existing.connectorType !== "MANUAL_IMPORT" && (!existing.sourceUrl || !isSafeAutomationSourceUrl(existing.sourceUrl))) {
      throw new Error("automation_source_url_not_safe");
    }
  }
  const at = (input.now ?? new Date()).toISOString();
  await db.prepare(`UPDATE automation_sources SET enabled=?,next_check_at=?,updated_at=? WHERE id=?`).bind(
    input.enabled ? 1 : 0,
    input.enabled ? at : null,
    at,
    input.id,
  ).run();
  return getAutomationSourceAdmin(input.id, db);
}

export async function listAutomationSourceRuns(
  sourceId: number,
  databaseInput?: AutomationSourceAdminDatabase,
  limit = 12,
) {
  const db = database(databaseInput);
  const result = await db.prepare(`SELECT id,status,started_at,completed_at,checked_count,new_finding_count,
      updated_finding_count,error_count,duration_ms,error_summary
    FROM automation_runs WHERE source_id=? ORDER BY started_at DESC,id DESC LIMIT ?`)
    .bind(sourceId, Math.max(1, Math.min(50, limit)))
    .all<Record<string, unknown>>();
  return result.results;
}

function mapCandidate(row: Record<string, unknown>): AutomationSourceCandidateRow {
  return {
    id: numberValue(row.id),
    candidateType: "SOURCE_CANDIDATE",
    discoveryType: String(row.discovery_type ?? ""),
    sourceUrl: String(row.source_url ?? ""),
    canonicalUrl: String(row.canonical_url ?? ""),
    label: String(row.label ?? ""),
    entityType: row.entity_type as AutomationEntityType,
    suggestedConnectorType: row.suggested_connector_type as AutomationConnectorType,
    discoveredFromSourceId: row.discovered_from_source_id ? numberValue(row.discovered_from_source_id) : null,
    reason: String(row.reason ?? ""),
    metadata: json<Record<string, unknown>>(row.metadata_json, {}),
    duplicateSourceId: row.duplicate_source_id ? numberValue(row.duplicate_source_id) : null,
    reviewStatus: String(row.review_status ?? "NEW") as AutomationCandidateReviewStatus,
    reviewerNotes: row.reviewer_notes ? String(row.reviewer_notes) : null,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    suppressedUntil: row.suppressed_until ? String(row.suppressed_until) : null,
    firstDetectedAt: String(row.first_detected_at ?? ""),
    lastDetectedAt: String(row.last_detected_at ?? ""),
  };
}

export async function listAutomationSourceCandidates(
  databaseInput?: AutomationSourceAdminDatabase,
  limit = 100,
) {
  const db = database(databaseInput);
  const result = await db.prepare(`SELECT * FROM automation_source_candidates
    ORDER BY CASE review_status WHEN 'NEW' THEN 0 ELSE 1 END,last_detected_at DESC,id DESC LIMIT ?`)
    .bind(Math.max(1, Math.min(200, limit))).all<Record<string, unknown>>();
  return result.results.map(mapCandidate);
}

export async function upsertAutomationSourceCandidate(input: {
  candidate: AutomationSourceCandidateInput;
  discoveredFromSourceId?: number | null;
  detectedAt?: Date;
}, databaseInput?: AutomationSourceAdminDatabase) {
  const db = database(databaseInput);
  const canonicalUrl = canonicalizeSourceUrl(input.candidate.sourceUrl);
  if (!canonicalUrl || !isSafeAutomationSourceUrl(canonicalUrl)) {
    throw new Error("automation_candidate_url_not_safe");
  }
  const at = (input.detectedAt ?? new Date()).toISOString();
  const duplicate = await db.prepare(`SELECT id FROM automation_sources
    WHERE source_url=? LIMIT 1`).bind(canonicalUrl).first<{ id: number }>();

  await db.prepare(`INSERT INTO automation_source_candidates (
      discovery_type,source_url,canonical_url,label,entity_type,suggested_connector_type,
      discovered_from_source_id,reason,metadata_json,duplicate_source_id,review_status,first_detected_at,last_detected_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?, 'NEW',?,?)
    ON CONFLICT(canonical_url) DO UPDATE SET
      label=excluded.label,entity_type=excluded.entity_type,suggested_connector_type=excluded.suggested_connector_type,
      discovered_from_source_id=excluded.discovered_from_source_id,reason=excluded.reason,metadata_json=excluded.metadata_json,
      duplicate_source_id=excluded.duplicate_source_id,last_detected_at=excluded.last_detected_at`).bind(
      input.candidate.discoveryType, canonicalUrl, canonicalUrl, input.candidate.label.slice(0, 160),
      input.candidate.entityType, input.candidate.suggestedConnectorType,
      input.discoveredFromSourceId ?? null, input.candidate.reason.slice(0, 1000),
      JSON.stringify(input.candidate.metadata ?? {}), duplicate?.id ?? null, at, at,
    ).run();
  const row = await db.prepare(`SELECT * FROM automation_source_candidates WHERE canonical_url=? LIMIT 1`)
    .bind(canonicalUrl).first<Record<string, unknown>>();
  if (!row) throw new Error("automation_candidate_upsert_failed");
  return mapCandidate(row);
}

function candidateSourceKey(candidate: AutomationSourceCandidateRow) {
  const host = (() => {
    try {
      return new URL(candidate.canonicalUrl).hostname.replace(/^www\./, "");
    } catch {
      return "source";
    }
  })();
  const suffix = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 45) || "source";
  return `candidate-${candidate.id}-${suffix}`.slice(0, 80);
}

export async function reviewAutomationSourceCandidate(input: {
  id: number;
  action: "approve" | "reject" | "suppress";
  reviewerEmail: string;
  notes?: string | null;
  suppressedDays?: number;
  now?: Date;
}, databaseInput?: AutomationSourceAdminDatabase) {
  const db = database(databaseInput);
  const raw = await db.prepare(`SELECT * FROM automation_source_candidates WHERE id=? LIMIT 1`)
    .bind(input.id).first<Record<string, unknown>>();
  if (!raw) return null;
  const candidate = mapCandidate(raw);
  const atDate = input.now ?? new Date();
  const at = atDate.toISOString();

  let duplicateSourceId = candidate.duplicateSourceId;
  if (input.action === "approve" && !duplicateSourceId) {
    const sourceUrl = canonicalizeSourceUrl(candidate.canonicalUrl);
    if (!sourceUrl || !isSafeAutomationSourceUrl(sourceUrl)) throw new Error("automation_candidate_url_not_safe");
    const created = await db.prepare(`INSERT INTO automation_sources (
        source_key,label,entity_type,connector_type,source_url,config_json,enabled,
        cadence_minutes,throttle_ms,timeout_ms,retry_max_attempts,retry_backoff_ms,max_records_per_run,
        next_check_at,created_at,updated_at,review_status
      ) VALUES (?,?,?,?,?,'{}',0,1440,1000,8000,2,1000,100,NULL,?,?,'PENDING')
      RETURNING id`).bind(
        candidateSourceKey(candidate), candidate.label, candidate.entityType,
        candidate.suggestedConnectorType, sourceUrl, at, at,
      ).first<{ id: number }>();
    if (!created) throw new Error("automation_candidate_source_create_failed");
    duplicateSourceId = Number(created.id);
  }

  const reviewStatus: AutomationCandidateReviewStatus =
    input.action === "approve" ? "APPROVED" : input.action === "reject" ? "REJECTED" : "SUPPRESSED";
  const suppressedUntil = input.action === "suppress"
    ? new Date(atDate.getTime() + Math.max(1, Math.min(365, Math.floor(input.suppressedDays ?? 30))) * 86_400_000).toISOString()
    : null;
  await db.prepare(`UPDATE automation_source_candidates SET review_status=?,reviewer_notes=?,reviewed_by=?,reviewed_at=?,
      suppressed_until=?,duplicate_source_id=? WHERE id=?`).bind(
        reviewStatus, input.notes?.trim().slice(0, 2000) || null,
        input.reviewerEmail.trim().toLowerCase(), at, suppressedUntil, duplicateSourceId, input.id,
      ).run();

  const updated = await db.prepare(`SELECT * FROM automation_source_candidates WHERE id=? LIMIT 1`)
    .bind(input.id).first<Record<string, unknown>>();
  return updated ? mapCandidate(updated) : null;
}

export function sourceAdminRowToRuntimeSource(row: AutomationSourceAdminRow): AutomationSource {
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    label: row.label,
    entityType: row.entityType,
    connectorType: row.connectorType,
    sourceUrl: row.sourceUrl,
    config: row.config,
    enabled: row.enabled,
    cadenceMinutes: row.cadenceMinutes,
    throttleMs: row.throttleMs,
    timeoutMs: row.timeoutMs,
    retryMaxAttempts: row.retryMaxAttempts,
    retryBackoffMs: row.retryBackoffMs,
    maxRecordsPerRun: row.maxRecordsPerRun,
    nextCheckAt: row.nextCheckAt,
    reviewStatus: row.reviewStatus,
  };
}
