import { env } from "cloudflare:workers";
import type { AutomationConnectorType, AutomationEntityType } from "./data-automation.ts";
import { evaluateGovernanceForActivation, getGovernanceState } from "./data-automation-governance.ts";
import type { AutomationDiscoveryType } from "./data-automation-discovery.ts";
import {
  automationSearchBudgetPolicy,
  automationSearchCooldownUntil,
  automationSearchPlateauSignal,
  utcSearchDayBucket,
  type AutomationSearchUsageStatus,
} from "./data-automation-search-budget.ts";

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
  searchSafety?: {
    requestsToday: number;
    rootDailyLimit: number;
    remainingRootRequests: number;
    lastQueryAt: string | null;
    cooldownUntil: string | null;
    plateau: boolean;
  };
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
  const roots = result.results.map(mapRoot);
  const governed: AutomationDiscoveryRoot[] = [];
  for (const root of roots) {
    const governance = await getGovernanceState({ type: "DISCOVERY_ROOT", id: root.id }, db);
    // Legacy transition: already-enabled roots without a registry row continue until explicit governance rollout.
    if (!governance.schemaAvailable || !governance.state) {
      governed.push(root);
      continue;
    }
    const storageFields = root.discoveryType === "SEARCH_PROVIDER"
      ? ["url", "title", "snippet", "metadata"] as const
      : ["url", "title", "metadata"] as const;
    const decision = evaluateGovernanceForActivation(governance, {
      recurring: true,
      cadenceMinutes: root.cadenceMinutes,
      storageFields: [...storageFields],
    }, now);
    if (decision.allowed) governed.push(root);
  }
  return governed;
}

export async function listAutomationDiscoveryRoots(
  databaseInput?: AutomationDiscoveryDatabase,
  limit = 50,
  now = new Date(),
) {
  const db = database(databaseInput);
  const result = await db.prepare(`SELECT * FROM automation_discovery_roots
    ORDER BY label COLLATE NOCASE ASC,id ASC LIMIT ?`)
    .bind(Math.max(1, Math.min(100, limit))).all<Record<string, unknown>>();
  const roots = result.results.map(mapRoot);
  const searchRoots = roots.filter((root) => root.discoveryType === "SEARCH_PROVIDER");
  if (!searchRoots.length) return roots;

  try {
    const ids = searchRoots.map((root) => root.id);
    const placeholders = ids.map(() => "?").join(",");
    const dayBucket = utcSearchDayBucket(now);
    const aggregate = await db.prepare(`SELECT root_id,COALESCE(SUM(request_count),0) AS requests_today,MAX(created_at) AS last_query_at
      FROM automation_search_usage
      WHERE root_id IN (${placeholders}) AND day_bucket=?
      GROUP BY root_id`).bind(...ids, dayBucket).all<Record<string, unknown>>();
    const recent = await db.prepare(`SELECT root_id,provider_key,query_fingerprint,status,result_count,
        new_unique_candidate_count,duplicate_candidate_count,created_at
      FROM automation_search_usage
      WHERE root_id IN (${placeholders}) AND status<>'RESERVED'
      ORDER BY created_at DESC,id DESC LIMIT 300`).bind(...ids).all<Record<string, unknown>>();

    const aggregateByRoot = new Map(aggregate.results.map((row) => [numberValue(row.root_id), row]));
    const recentByRoot = new Map<number, Record<string, unknown>[]>();
    for (const row of recent.results) {
      const rootId = numberValue(row.root_id);
      const rows = recentByRoot.get(rootId) ?? [];
      rows.push(row);
      recentByRoot.set(rootId, rows);
    }

    return roots.map((root) => {
      if (root.discoveryType !== "SEARCH_PROVIDER") return root;
      const policy = automationSearchBudgetPolicy(root);
      const summary = aggregateByRoot.get(root.id);
      const requestsToday = numberValue(summary?.requests_today);
      const rows = recentByRoot.get(root.id) ?? [];
      const last = rows[0];
      const fingerprint = last?.query_fingerprint ? String(last.query_fingerprint) : null;
      const fingerprintRows = fingerprint
        ? rows.filter((row) => String(row.query_fingerprint ?? "") === fingerprint).slice(0, 3)
        : [];
      const plateau = automationSearchPlateauSignal(fingerprintRows.map((row) => ({
        status: String(row.status ?? ""),
        resultCount: numberValue(row.result_count),
        newUniqueCandidateCount: numberValue(row.new_unique_candidate_count),
        duplicateCandidateCount: numberValue(row.duplicate_candidate_count),
      })));
      const cooldownUntil = last?.created_at && last?.status
        ? automationSearchCooldownUntil({
            at: String(last.created_at),
            status: String(last.status) as AutomationSearchUsageStatus,
            baseCooldownMinutes: policy.queryCooldownMinutes,
            plateau,
          })
        : null;
      return {
        ...root,
        searchSafety: {
          requestsToday,
          rootDailyLimit: policy.rootDailyRequests,
          remainingRootRequests: Math.max(0, policy.rootDailyRequests - requestsToday),
          lastQueryAt: summary?.last_query_at ? String(summary.last_query_at) : (last?.created_at ? String(last.created_at) : null),
          cooldownUntil,
          plateau,
        },
      };
    });
  } catch (error) {
    if (!/no such table:\s*automation_search_usage/i.test(error instanceof Error ? error.message : String(error))) throw error;
    return roots;
  }
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


function missingSearchUsageSchema(error: unknown) {
  return /no such table:\s*automation_search_usage/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

export type AutomationSearchBudgetReservationReason =
  | "RESERVED"
  | "DUPLICATE_OPERATION"
  | "GLOBAL_BUDGET_EXHAUSTED"
  | "CATEGORY_BUDGET_EXHAUSTED"
  | "ROOT_BUDGET_EXHAUSTED";

export async function reserveAutomationSearchRequest(input: {
  operationKey: string;
  discoveryRunId: number;
  providerKey: string;
  rootId: number;
  entityType: AutomationEntityType;
  queryFingerprint: string;
  now: Date;
  globalDailyLimit: number;
  entityDailyLimit: number;
  rootDailyLimit: number;
}, databaseInput?: AutomationDiscoveryDatabase): Promise<{
  reserved: boolean;
  reason: AutomationSearchBudgetReservationReason;
}> {
  const db = database(databaseInput);
  const dayBucket = utcSearchDayBucket(input.now);
  const at = input.now.toISOString();
  try {
    const row = await db.prepare(`INSERT INTO automation_search_usage (
        operation_key,discovery_run_id,provider_key,root_id,entity_type,query_fingerprint,day_bucket,
        request_count,result_count,new_unique_candidate_count,duplicate_candidate_count,status,created_at,finalized_at
      )
      SELECT ?,?,?,?,?,?,?,1,0,0,0,'RESERVED',?,NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM automation_search_usage WHERE operation_key=?
      )
      AND (
        SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE day_bucket=?
      ) < ?
      AND (
        SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE entity_type=? AND day_bucket=?
      ) < ?
      AND (
        SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE root_id=? AND day_bucket=?
      ) < ?
      RETURNING id`).bind(
        input.operationKey, input.discoveryRunId, input.providerKey, input.rootId, input.entityType,
        input.queryFingerprint, dayBucket, at,
        input.operationKey,
        dayBucket, input.globalDailyLimit,
        input.entityType, dayBucket, input.entityDailyLimit,
        input.rootId, dayBucket, input.rootDailyLimit,
      ).first<{ id: number }>();
    if (row) return { reserved: true, reason: "RESERVED" };

    const duplicate = await db.prepare(`SELECT id FROM automation_search_usage WHERE operation_key=? LIMIT 1`)
      .bind(input.operationKey).first<{ id: number }>();
    if (duplicate) return { reserved: false, reason: "DUPLICATE_OPERATION" };

    const usage = await db.prepare(`SELECT
        (SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE day_bucket=?) AS global_used,
        (SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE entity_type=? AND day_bucket=?) AS entity_used,
        (SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE root_id=? AND day_bucket=?) AS root_used`)
      .bind(dayBucket, input.entityType, dayBucket, input.rootId, dayBucket)
      .first<Record<string, unknown>>();
    if (numberValue(usage?.global_used) >= input.globalDailyLimit) return { reserved: false, reason: "GLOBAL_BUDGET_EXHAUSTED" };
    if (numberValue(usage?.entity_used) >= input.entityDailyLimit) return { reserved: false, reason: "CATEGORY_BUDGET_EXHAUSTED" };
    return { reserved: false, reason: "ROOT_BUDGET_EXHAUSTED" };
  } catch (error) {
    if (missingSearchUsageSchema(error)) throw new Error("automation_search_usage_state_unavailable");
    throw error;
  }
}

export async function finalizeAutomationSearchUsage(input: {
  operationKey: string;
  status: AutomationSearchUsageStatus;
  resultCount: number;
  now: Date;
}, databaseInput?: AutomationDiscoveryDatabase) {
  const db = database(databaseInput);
  try {
    await db.prepare(`UPDATE automation_search_usage
      SET status=?,result_count=?,finalized_at=?
      WHERE operation_key=? AND status='RESERVED'`).bind(
        input.status,
        Math.max(0, Math.floor(input.resultCount)),
        input.now.toISOString(),
        input.operationKey,
      ).run();
  } catch (error) {
    if (missingSearchUsageSchema(error)) throw new Error("automation_search_usage_state_unavailable");
    throw error;
  }
}

export async function updateAutomationSearchUsageCandidateMetrics(input: {
  operationKey: string;
  newUniqueCandidateCount: number;
  duplicateCandidateCount: number;
}, databaseInput?: AutomationDiscoveryDatabase) {
  const db = database(databaseInput);
  try {
    await db.prepare(`UPDATE automation_search_usage
      SET new_unique_candidate_count=?,duplicate_candidate_count=?
      WHERE operation_key=?`).bind(
        Math.max(0, Math.floor(input.newUniqueCandidateCount)),
        Math.max(0, Math.floor(input.duplicateCandidateCount)),
        input.operationKey,
      ).run();
  } catch (error) {
    if (missingSearchUsageSchema(error)) throw new Error("automation_search_usage_state_unavailable");
    throw error;
  }
}

export async function getAutomationSearchCooldownState(input: {
  providerKey: string;
  queryFingerprint: string;
  baseCooldownMinutes: number;
  now: Date;
}, databaseInput?: AutomationDiscoveryDatabase) {
  const db = database(databaseInput);
  try {
    const result = await db.prepare(`SELECT status,result_count,new_unique_candidate_count,
        duplicate_candidate_count,created_at
      FROM automation_search_usage
      WHERE provider_key=? AND query_fingerprint=? AND status<>'RESERVED'
      ORDER BY created_at DESC,id DESC LIMIT 3`).bind(
        input.providerKey,
        input.queryFingerprint,
      ).all<Record<string, unknown>>();
    const rows = result.results;
    if (!rows.length) return { blocked: false, cooldownUntil: null as string | null, plateau: false };
    const plateau = automationSearchPlateauSignal(rows.map((row) => ({
      status: String(row.status ?? ""),
      resultCount: numberValue(row.result_count),
      newUniqueCandidateCount: numberValue(row.new_unique_candidate_count),
      duplicateCandidateCount: numberValue(row.duplicate_candidate_count),
    })));
    const last = rows[0];
    const cooldownUntil = automationSearchCooldownUntil({
      at: String(last.created_at ?? ""),
      status: String(last.status ?? "PROVIDER_ERROR") as AutomationSearchUsageStatus,
      baseCooldownMinutes: input.baseCooldownMinutes,
      plateau,
    });
    return {
      blocked: Boolean(cooldownUntil && new Date(cooldownUntil).getTime() > input.now.getTime()),
      cooldownUntil,
      plateau,
    };
  } catch (error) {
    if (missingSearchUsageSchema(error)) throw new Error("automation_search_usage_state_unavailable");
    throw error;
  }
}
