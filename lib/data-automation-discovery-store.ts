import { env } from "cloudflare:workers";
import type { AutomationConnectorType, AutomationEntityType } from "./data-automation.ts";
import type { AutomationDiscoveryType } from "./data-automation-discovery.ts";

export type AutomationDiscoveryDatabase = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

export type AutomationDiscoveryRoot = {
  id: number;
  rootKey: string;
  label: string;
  discoveryType: AutomationDiscoveryType;
  sourceUrl: string | null;
  entityType: AutomationEntityType;
  suggestedConnectorType: AutomationConnectorType;
  config: Record<string, unknown>;
  enabled: boolean;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  cadenceMinutes: number;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
};

export type AutomationDiscoveryRunSummaryRow = {
  id: number;
  rootId: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  startedAt: string;
  completedAt: string | null;
  candidateCount: number;
  reviewableCandidateCount: number;
  duplicateCandidateCount: number;
  errorCount: number;
  durationMs: number | null;
  errorSummary: string | null;
};

function database(input?: AutomationDiscoveryDatabase) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Discovery nemá pripojenú databázu.");
}

function parseJson(value: unknown) {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function mapRoot(row: Record<string, unknown>): AutomationDiscoveryRoot {
  return {
    id: numberValue(row.id),
    rootKey: String(row.root_key ?? ""),
    label: String(row.label ?? ""),
    discoveryType: row.discovery_type as AutomationDiscoveryType,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    entityType: row.entity_type as AutomationEntityType,
    suggestedConnectorType: row.suggested_connector_type as AutomationConnectorType,
    config: parseJson(row.config_json),
    enabled: Boolean(row.enabled),
    reviewStatus: String(row.review_status ?? "PENDING") as AutomationDiscoveryRoot["reviewStatus"],
    cadenceMinutes: numberValue(row.cadence_minutes),
    nextCheckAt: row.next_check_at ? String(row.next_check_at) : null,
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    lastErrorAt: row.last_error_at ? String(row.last_error_at) : null,
    lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  };
}

function mapRun(row: Record<string, unknown>): AutomationDiscoveryRunSummaryRow {
  return {
    id: numberValue(row.id),
    rootId: numberValue(row.root_id),
    status: row.status as AutomationDiscoveryRunSummaryRow["status"],
    startedAt: String(row.started_at ?? ""),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    candidateCount: numberValue(row.candidate_count),
    reviewableCandidateCount: numberValue(row.reviewable_candidate_count),
    duplicateCandidateCount: numberValue(row.duplicate_candidate_count),
    errorCount: numberValue(row.error_count),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : numberValue(row.duration_ms),
    errorSummary: row.error_summary ? String(row.error_summary) : null,
  };
}

export async function listDueAutomationDiscoveryRoots(
  databaseInput?: AutomationDiscoveryDatabase,
  now = new Date(),
  limit = 2,
) {
  const db = database(databaseInput);
  const result = await db.prepare(`SELECT * FROM automation_discovery_roots
    WHERE enabled=1 AND review_status='APPROVED' AND (next_check_at IS NULL OR next_check_at<=?)
    ORDER BY COALESCE(next_check_at,'') ASC,id ASC LIMIT ?`)
    .bind(now.toISOString(), Math.max(1, Math.min(8, limit)))
    .all<Record<string, unknown>>();
  return result.results.map(mapRoot);
}

export async function listAutomationDiscoveryRoots(
  databaseInput?: AutomationDiscoveryDatabase,
  limit = 50,
) {
  const db = database(databaseInput);
  const result = await db.prepare(`SELECT * FROM automation_discovery_roots
    ORDER BY label COLLATE NOCASE ASC,id ASC LIMIT ?`)
    .bind(Math.max(1, Math.min(100, limit))).all<Record<string, unknown>>();
  return result.results.map(mapRoot);
}

export async function listAutomationDiscoveryRuns(
  rootId: number,
  databaseInput?: AutomationDiscoveryDatabase,
  limit = 10,
) {
  const db = database(databaseInput);
  const result = await db.prepare(`SELECT * FROM automation_discovery_runs
    WHERE root_id=? ORDER BY started_at DESC,id DESC LIMIT ?`)
    .bind(rootId, Math.max(1, Math.min(50, limit))).all<Record<string, unknown>>();
  return result.results.map(mapRun);
}

export async function beginAutomationDiscoveryRun(
  rootId: number,
  startedAt: string,
  databaseInput?: AutomationDiscoveryDatabase,
) {
  const db = database(databaseInput);
  const row = await db.prepare(`INSERT INTO automation_discovery_runs
    (root_id,status,started_at,candidate_count,reviewable_candidate_count,duplicate_candidate_count,error_count)
    VALUES (?,'SUCCESS',?,0,0,0,0) RETURNING id`)
    .bind(rootId, startedAt).first<{ id: number }>();
  if (!row) throw new Error("automation_discovery_run_create_failed");
  return Number(row.id);
}

export function nextAutomationDiscoveryCheckAt(root: AutomationDiscoveryRoot, completedAt: Date) {
  return new Date(completedAt.getTime() + Math.max(60, root.cadenceMinutes) * 60_000).toISOString();
}

export async function finishAutomationDiscoveryRun(input: {
  runId: number;
  root: AutomationDiscoveryRoot;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  candidateCount: number;
  reviewableCandidateCount: number;
  duplicateCandidateCount: number;
  errorCount: number;
  errorSummary: string | null;
  startedAt: Date;
  completedAt: Date;
}, databaseInput?: AutomationDiscoveryDatabase) {
  const db = database(databaseInput);
  const completedAt = input.completedAt.toISOString();
  const durationMs = Math.max(0, input.completedAt.getTime() - input.startedAt.getTime());
  const nextCheckAt = nextAutomationDiscoveryCheckAt(input.root, input.completedAt);
  await db.batch([
    db.prepare(`UPDATE automation_discovery_runs SET status=?,completed_at=?,candidate_count=?,
      reviewable_candidate_count=?,duplicate_candidate_count=?,error_count=?,duration_ms=?,error_summary=?
      WHERE id=?`).bind(
        input.status, completedAt, input.candidateCount, input.reviewableCandidateCount,
        input.duplicateCandidateCount, input.errorCount, durationMs, input.errorSummary, input.runId,
      ),
    db.prepare(`UPDATE automation_discovery_roots SET
      next_check_at=?,last_checked_at=?,
      last_success_at=CASE WHEN ?='SUCCESS' THEN ? ELSE last_success_at END,
      last_error_at=CASE WHEN ?='SUCCESS' THEN last_error_at ELSE ? END,
      last_error_code=CASE WHEN ?='SUCCESS' THEN NULL ELSE ? END,
      updated_at=?
      WHERE id=?`).bind(
        nextCheckAt, completedAt,
        input.status, completedAt,
        input.status, completedAt,
        input.status, input.errorSummary,
        completedAt, input.root.id,
      ),
  ]);
  return { nextCheckAt, durationMs };
}
