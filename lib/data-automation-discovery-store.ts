import { env } from "cloudflare:workers";
import type { AutomationConnectorType, AutomationEntityType } from "./data-automation.ts";
import { evaluateGovernanceForActivation, getGovernanceState } from "./data-automation-governance.ts";
import type { AutomationDiscoveryType } from "./data-automation-discovery.ts";
import {
  automationScheduleFromStorage,
  automationScheduleStorage,
  automationSchedulesEqual,
  effectiveAutomationCadenceMinutes,
  nextAutomationScheduledAt,
  type AutomationSchedule,
} from "./automation-schedule.ts";
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
  schedule: AutomationSchedule;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  searchSafety?: {
    requestsToday: number;
    rootDailyLimit: number;
    remainingRootRequests: number;
    addressEnrichmentRequestsToday: number;
    addressEnrichmentDailyLimit: number;
    remainingAddressEnrichmentRequests: number;
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
  searchRequestCount: number | null;
  searchResultCount: number | null;
  providerResultCount: number | null;
  localPrefilterCount: number | null;
  exclusionCount: number | null;
  canonicalDuplicateCount: number | null;
  newEntityCount: number | null;
  updateSuggestionCount: number | null;
  possibleDuplicateCount: number | null;
  addressVerifiedExactCount: number | null;
  addressNoExactCount: number | null;
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

function nullableNumberValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapRoot(row: Record<string, unknown>): AutomationDiscoveryRoot {
  const schedule = automationScheduleFromStorage({
    cadenceMinutes: row.cadence_minutes,
    scheduleMode: row.schedule_mode,
    scheduleDaysJson: row.schedule_days_json,
    scheduleLocalTime: row.schedule_local_time,
    scheduleTimezone: row.schedule_timezone,
  });
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
    cadenceMinutes: effectiveAutomationCadenceMinutes(schedule),
    schedule,
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
    searchRequestCount: nullableNumberValue(row.search_request_count),
    searchResultCount: nullableNumberValue(row.search_result_count),
    providerResultCount: nullableNumberValue(row.provider_result_count),
    localPrefilterCount: nullableNumberValue(row.local_prefilter_count),
    exclusionCount: nullableNumberValue(row.exclusion_count),
    canonicalDuplicateCount: nullableNumberValue(row.canonical_duplicate_count),
    newEntityCount: nullableNumberValue(row.new_entity_count),
    updateSuggestionCount: nullableNumberValue(row.update_suggestion_count),
    possibleDuplicateCount: nullableNumberValue(row.possible_duplicate_count),
    addressVerifiedExactCount: nullableNumberValue(row.address_verified_exact_count),
    addressNoExactCount: nullableNumberValue(row.address_no_exact_count),
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
    // Legacy transition remains for non-search roots only. SEARCH_PROVIDER roots fail closed
    // unless the governance schema and an explicit governance record are both available.
    if (!governance.schemaAvailable || !governance.state) {
      if (root.discoveryType !== "SEARCH_PROVIDER") governed.push(root);
      continue;
    }
    const storageFields = root.discoveryType === "SEARCH_PROVIDER"
      ? ["url", "title", "snippet", "metadata"] as const
      : ["url", "title", "metadata"] as const;
    const decision = evaluateGovernanceForActivation(governance, {
      recurring: true,
      cadenceMinutes: root.cadenceMinutes,
      storageFields: [...storageFields],
      providerManagedAccess: root.discoveryType === "SEARCH_PROVIDER",
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
    const aggregate = await db.prepare(`SELECT root_id,
        COALESCE(SUM(CASE WHEN operation_key LIKE 'address-enrichment:%' OR operation_key LIKE 'entity-enrichment:%' THEN 0 ELSE request_count END),0) AS requests_today,
        COALESCE(SUM(CASE WHEN operation_key LIKE 'address-enrichment:%' THEN request_count ELSE 0 END),0) AS address_enrichment_requests_today,
        MAX(CASE WHEN operation_key LIKE 'address-enrichment:%' OR operation_key LIKE 'entity-enrichment:%' THEN NULL ELSE created_at END) AS last_query_at
      FROM automation_search_usage
      WHERE root_id IN (${placeholders}) AND day_bucket=?
      GROUP BY root_id`).bind(...ids, dayBucket).all<Record<string, unknown>>();
    const recent = await db.prepare(`SELECT root_id,provider_key,query_fingerprint,status,result_count,
        new_unique_candidate_count,duplicate_candidate_count,created_at
      FROM automation_search_usage
      WHERE root_id IN (${placeholders}) AND status<>'RESERVED'
        AND operation_key NOT LIKE 'address-enrichment:%'
        AND operation_key NOT LIKE 'entity-enrichment:%'
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
      const policy = automationSearchBudgetPolicy(root, now);
      const summary = aggregateByRoot.get(root.id);
      const requestsToday = numberValue(summary?.requests_today);
      const addressEnrichmentRequestsToday = numberValue(summary?.address_enrichment_requests_today);
      const addressEnrichmentDailyLimit = root.entityType === "DIRECTORY"
        ? policy.addressEnrichmentDailyRequests
        : 0;
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
          addressEnrichmentRequestsToday,
          addressEnrichmentDailyLimit,
          remainingAddressEnrichmentRequests: Math.max(0, addressEnrichmentDailyLimit - addressEnrichmentRequestsToday),
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

export async function getAutomationDiscoveryRoot(
  id: number,
  databaseInput?: AutomationDiscoveryDatabase,
) {
  const db = database(databaseInput);
  const row = await db.prepare("SELECT * FROM automation_discovery_roots WHERE id=? LIMIT 1")
    .bind(id).first<Record<string, unknown>>();
  return row ? mapRoot(row) : null;
}

export async function getDueAutomationDiscoveryRoot(
  id: number,
  databaseInput?: AutomationDiscoveryDatabase,
  now = new Date(),
) {
  const db = database(databaseInput);
  const row = await db.prepare(`SELECT * FROM automation_discovery_roots
    WHERE id=? AND enabled=1 AND review_status='APPROVED'
      AND (next_check_at IS NULL OR next_check_at<=?)
    LIMIT 1`).bind(id, now.toISOString()).first<Record<string, unknown>>();
  if (!row) return null;
  const root = mapRoot(row);
  const governance = await getGovernanceState({ type: "DISCOVERY_ROOT", id: root.id }, db);
  if ((!governance.schemaAvailable || !governance.state) && root.discoveryType === "SEARCH_PROVIDER") return null;
  if (!governance.schemaAvailable || !governance.state) return root;
  const decision = evaluateGovernanceForActivation(governance, discoveryGovernanceUsage(root), now);
  return decision.allowed ? root : null;
}

const AUTOMATION_DISCOVERY_RUN_LEASE_MS = 20 * 60_000;

export type AutomationDiscoveryRunClaim = {
  root: AutomationDiscoveryRoot;
  runId: number;
  startedAt: Date;
};

function automationDiscoveryActiveRunCutoff(now: Date) {
  return new Date(now.getTime() - AUTOMATION_DISCOVERY_RUN_LEASE_MS).toISOString();
}

async function createAutomationDiscoveryRunClaim(input: {
  rootId: number;
  now: Date;
  requireDue: boolean;
}, db: AutomationDiscoveryDatabase) {
  const startedAt = input.now.toISOString();
  const activeSince = automationDiscoveryActiveRunCutoff(input.now);
  const statement = input.requireDue
    ? db.prepare(`INSERT INTO automation_discovery_runs
        (root_id,status,started_at,candidate_count,reviewable_candidate_count,duplicate_candidate_count,error_count)
        SELECT r.id,'SUCCESS',?,0,0,0,0
        FROM automation_discovery_roots r
        WHERE r.id=? AND r.enabled=1 AND r.review_status='APPROVED'
          AND (r.next_check_at IS NULL OR r.next_check_at<=?)
          AND NOT EXISTS (
            SELECT 1 FROM automation_discovery_runs active
            WHERE active.root_id=r.id AND active.completed_at IS NULL AND active.started_at>?
          )
        RETURNING id`).bind(startedAt, input.rootId, startedAt, activeSince)
    : db.prepare(`INSERT INTO automation_discovery_runs
        (root_id,status,started_at,candidate_count,reviewable_candidate_count,duplicate_candidate_count,error_count)
        SELECT r.id,'SUCCESS',?,0,0,0,0
        FROM automation_discovery_roots r
        WHERE r.id=? AND r.enabled=1 AND r.review_status='APPROVED'
          AND NOT EXISTS (
            SELECT 1 FROM automation_discovery_runs active
            WHERE active.root_id=r.id AND active.completed_at IS NULL AND active.started_at>?
          )
        RETURNING id`).bind(startedAt, input.rootId, activeSince);
  const row = await statement.first<{ id: number }>();
  return row ? Number(row.id) : null;
}

export async function claimDueAutomationDiscoveryRoot(
  root: AutomationDiscoveryRoot,
  databaseInput?: AutomationDiscoveryDatabase,
  now = new Date(),
) {
  const db = database(databaseInput);
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + AUTOMATION_DISCOVERY_RUN_LEASE_MS).toISOString();
  const activeSince = automationDiscoveryActiveRunCutoff(now);
  const result = await db.prepare(`UPDATE automation_discovery_roots
    SET next_check_at=?
    WHERE id=? AND enabled=1 AND review_status='APPROVED'
      AND (next_check_at IS NULL OR next_check_at<=?)
      AND NOT EXISTS (
        SELECT 1 FROM automation_discovery_runs active
        WHERE active.root_id=automation_discovery_roots.id
          AND active.completed_at IS NULL
          AND active.started_at>?
      )`)
    .bind(leaseUntil, root.id, nowIso, activeSince).run();
  return result.meta.changes ? { ...root, nextCheckAt: leaseUntil } : null;
}

export async function claimManualAutomationDiscoveryRun(
  rootId: number,
  databaseInput?: AutomationDiscoveryDatabase,
  now = new Date(),
): Promise<AutomationDiscoveryRunClaim | null> {
  const db = database(databaseInput);
  const root = await getAutomationDiscoveryRoot(rootId, db);
  if (!root || !root.enabled || root.reviewStatus !== "APPROVED") return null;
  await assertDiscoveryRootGovernance(root, db, now);
  const runId = await createAutomationDiscoveryRunClaim({ rootId, now, requireDue: false }, db);
  return runId ? { root, runId, startedAt: new Date(now.getTime()) } : null;
}

export async function claimDueAutomationDiscoveryRun(
  root: AutomationDiscoveryRoot,
  databaseInput?: AutomationDiscoveryDatabase,
  now = new Date(),
): Promise<AutomationDiscoveryRunClaim | null> {
  const db = database(databaseInput);
  const dueRoot = await getDueAutomationDiscoveryRoot(root.id, db, now);
  if (!dueRoot) return null;

  const runId = await createAutomationDiscoveryRunClaim({ rootId: dueRoot.id, now, requireDue: true }, db);
  if (!runId) return null;

  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + AUTOMATION_DISCOVERY_RUN_LEASE_MS).toISOString();
  const result = await db.prepare(`UPDATE automation_discovery_roots
    SET next_check_at=?
    WHERE id=? AND enabled=1 AND review_status='APPROVED'
      AND (next_check_at IS NULL OR next_check_at<=?)
      AND EXISTS (
        SELECT 1 FROM automation_discovery_runs active
        WHERE active.id=? AND active.root_id=automation_discovery_roots.id AND active.completed_at IS NULL
      )`)
    .bind(leaseUntil, dueRoot.id, nowIso, runId).run();

  if (!result.meta.changes) {
    await db.prepare(`UPDATE automation_discovery_runs
      SET status='FAILED',completed_at=?,error_count=1,error_summary='automation_discovery_claim_lost'
      WHERE id=? AND completed_at IS NULL`).bind(nowIso, runId).run();
    return null;
  }

  return {
    root: { ...dueRoot, nextCheckAt: leaseUntil },
    runId,
    startedAt: new Date(now.getTime()),
  };
}

function discoveryGovernanceUsage(root: AutomationDiscoveryRoot) {
  return {
    recurring: true,
    cadenceMinutes: root.cadenceMinutes,
    storageFields: root.discoveryType === "SEARCH_PROVIDER"
      ? ["url", "title", "snippet", "metadata"] as Array<"url" | "title" | "snippet" | "metadata">
      : ["url", "title", "metadata"] as Array<"url" | "title" | "snippet" | "metadata">,
    providerManagedAccess: root.discoveryType === "SEARCH_PROVIDER",
  };
}

async function assertDiscoveryRootGovernance(root: AutomationDiscoveryRoot, db: AutomationDiscoveryDatabase, now = new Date()) {
  const governance = await getGovernanceState({ type: "DISCOVERY_ROOT", id: root.id }, db);
  const decision = evaluateGovernanceForActivation(governance, discoveryGovernanceUsage(root), now);
  if (!decision.allowed) {
    throw new Error("automation_discovery_governance_blocked:" + decision.blockingReasons.join(","));
  }
  return decision;
}

export async function reviewAutomationDiscoveryRoot(input: {
  id: number;
  action: "approve" | "reject";
  reviewerEmail: string;
  notes?: string | null;
  now?: Date;
}, databaseInput?: AutomationDiscoveryDatabase) {
  const db = database(databaseInput);
  const root = await getAutomationDiscoveryRoot(input.id, db);
  if (!root) return null;
  if (input.action === "approve") await assertDiscoveryRootGovernance(root, db, input.now ?? new Date());
  const at = (input.now ?? new Date()).toISOString();
  await db.prepare(`UPDATE automation_discovery_roots
    SET review_status=?,reviewed_at=?,reviewed_by=?,review_notes=?,updated_at=?
    WHERE id=?`).bind(
      input.action === "approve" ? "APPROVED" : "REJECTED",
      at,
      input.reviewerEmail.trim().toLowerCase().slice(0, 320),
      input.notes?.trim().slice(0, 2000) || null,
      at,
      input.id,
    ).run();
  return getAutomationDiscoveryRoot(input.id, db);
}

export async function setAutomationDiscoveryRootEnabled(input: {
  id: number;
  enabled: boolean;
  now?: Date;
}, databaseInput?: AutomationDiscoveryDatabase) {
  const db = database(databaseInput);
  const root = await getAutomationDiscoveryRoot(input.id, db);
  if (!root) return null;
  if (input.enabled) {
    if (root.reviewStatus !== "APPROVED") throw new Error("automation_discovery_review_required");
    await assertDiscoveryRootGovernance(root, db, input.now ?? new Date());
  }
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const nextCheckAt = !input.enabled
    ? null
    : root.schedule.mode === "CALENDAR"
      ? root.enabled && root.nextCheckAt
        ? root.nextCheckAt
        : nextAutomationScheduledAt(root.schedule, now)
      : at;
  await db.prepare("UPDATE automation_discovery_roots SET enabled=?,next_check_at=?,updated_at=? WHERE id=?")
    .bind(input.enabled ? 1 : 0, nextCheckAt, at, input.id).run();
  return getAutomationDiscoveryRoot(input.id, db);
}

export async function setAutomationDiscoveryRootSchedule(input: {
  id: number;
  schedule: AutomationSchedule;
  now?: Date;
}, databaseInput?: AutomationDiscoveryDatabase) {
  const db = database(databaseInput);
  const root = await getAutomationDiscoveryRoot(input.id, db);
  if (!root) return null;
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const storage = automationScheduleStorage(input.schedule);
  const nextCheckAt = root.enabled
    ? automationSchedulesEqual(root.schedule, input.schedule) && root.nextCheckAt
      ? root.nextCheckAt
      : nextAutomationScheduledAt(input.schedule, now)
    : null;
  await db.prepare(`UPDATE automation_discovery_roots SET
      cadence_minutes=?,schedule_mode=?,schedule_days_json=?,schedule_local_time=?,schedule_timezone=?,
      next_check_at=?,updated_at=? WHERE id=?`)
    .bind(
      storage.cadenceMinutes,
      storage.scheduleMode,
      storage.scheduleDaysJson,
      storage.scheduleLocalTime,
      storage.scheduleTimezone,
      nextCheckAt,
      at,
      input.id,
    ).run();
  return getAutomationDiscoveryRoot(input.id, db);
}

export async function setAutomationDiscoveryRootCadence(input: {
  id: number;
  cadenceMinutes: number;
  now?: Date;
}, databaseInput?: AutomationDiscoveryDatabase) {
  const cadenceMinutes = Math.floor(input.cadenceMinutes);
  if (!Number.isSafeInteger(cadenceMinutes) || cadenceMinutes < 60 || cadenceMinutes > 43_200) {
    throw new Error("automation_discovery_cadence_invalid");
  }
  return setAutomationDiscoveryRootSchedule({
    id: input.id,
    schedule: { mode: "INTERVAL", intervalMinutes: cadenceMinutes },
    now: input.now,
  }, databaseInput);
}

export async function getAutomationDiscoveryRunSearchMetrics(
  runId: number,
  databaseInput?: AutomationDiscoveryDatabase,
) {
  const db = database(databaseInput);
  try {
    const row = await db.prepare(`SELECT COALESCE(SUM(request_count),0) AS request_count,
      COALESCE(SUM(result_count),0) AS result_count
      FROM automation_search_usage
      WHERE discovery_run_id=? AND operation_key NOT LIKE 'address-enrichment:%'`)
      .bind(runId).first<Record<string, unknown>>();
    return {
      requestCount: numberValue(row?.request_count),
      resultCount: numberValue(row?.result_count),
    };
  } catch (error) {
    if (missingSearchUsageSchema(error)) return { requestCount: 0, resultCount: 0 };
    throw error;
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
  return nextAutomationScheduledAt(root.schedule, completedAt);
}

export type AutomationDiscoveryScheduleFinishPolicy = "ADVANCE_SCHEDULE" | "PRESERVE_SCHEDULE";

export async function finishAutomationDiscoveryRun(input: {
  runId: number;
  root: AutomationDiscoveryRoot;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  candidateCount: number;
  reviewableCandidateCount: number;
  duplicateCandidateCount: number;
  searchRequestCount: number;
  searchResultCount: number;
  providerResultCount: number;
  localPrefilterCount: number;
  exclusionCount: number;
  canonicalDuplicateCount: number;
  newEntityCount: number;
  updateSuggestionCount: number;
  possibleDuplicateCount: number;
  addressVerifiedExactCount: number;
  addressNoExactCount: number;
  errorCount: number;
  errorSummary: string | null;
  startedAt: Date;
  completedAt: Date;
  schedulePolicy?: AutomationDiscoveryScheduleFinishPolicy;
}, databaseInput?: AutomationDiscoveryDatabase) {
  const db = database(databaseInput);
  const completedAt = input.completedAt.toISOString();
  const durationMs = Math.max(0, input.completedAt.getTime() - input.startedAt.getTime());
  const schedulePolicy = input.schedulePolicy ?? "ADVANCE_SCHEDULE";
  const scheduledNextCheckAt = nextAutomationDiscoveryCheckAt(input.root, input.completedAt);
  const rootUpdate = () => schedulePolicy === "ADVANCE_SCHEDULE"
    ? db.prepare(`UPDATE automation_discovery_roots SET
        next_check_at=?,last_checked_at=?,
        last_success_at=CASE WHEN ?='SUCCESS' THEN ? ELSE last_success_at END,
        last_error_at=CASE WHEN ?='SUCCESS' THEN last_error_at ELSE ? END,
        last_error_code=CASE WHEN ?='SUCCESS' THEN NULL ELSE ? END,
        updated_at=?
        WHERE id=?`).bind(
          scheduledNextCheckAt, completedAt,
          input.status, completedAt,
          input.status, completedAt,
          input.status, input.errorSummary,
          completedAt, input.root.id,
        )
    : db.prepare(`UPDATE automation_discovery_roots SET
        last_checked_at=?,
        last_success_at=CASE WHEN ?='SUCCESS' THEN ? ELSE last_success_at END,
        last_error_at=CASE WHEN ?='SUCCESS' THEN last_error_at ELSE ? END,
        last_error_code=CASE WHEN ?='SUCCESS' THEN NULL ELSE ? END,
        updated_at=?
        WHERE id=?`).bind(
          completedAt,
          input.status, completedAt,
          input.status, completedAt,
          input.status, input.errorSummary,
          completedAt, input.root.id,
        );
  try {
    await db.batch([
      db.prepare(`UPDATE automation_discovery_runs SET status=?,completed_at=?,candidate_count=?,
        reviewable_candidate_count=?,duplicate_candidate_count=?,
        search_request_count=?,search_result_count=?,provider_result_count=?,local_prefilter_count=?,exclusion_count=?,
        canonical_duplicate_count=?,new_entity_count=?,update_suggestion_count=?,possible_duplicate_count=?,
        address_verified_exact_count=?,address_no_exact_count=?,
        error_count=?,duration_ms=?,error_summary=?
        WHERE id=?`).bind(
          input.status, completedAt, input.candidateCount, input.reviewableCandidateCount, input.duplicateCandidateCount,
          input.searchRequestCount, input.searchResultCount, input.providerResultCount, input.localPrefilterCount, input.exclusionCount,
          input.canonicalDuplicateCount, input.newEntityCount, input.updateSuggestionCount, input.possibleDuplicateCount,
          input.addressVerifiedExactCount, input.addressNoExactCount,
          input.errorCount, durationMs, input.errorSummary, input.runId,
        ),
      rootUpdate(),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/no such column:|has no column named/i.test(message)) throw error;
    await db.batch([
      db.prepare(`UPDATE automation_discovery_runs SET status=?,completed_at=?,candidate_count=?,
        reviewable_candidate_count=?,duplicate_candidate_count=?,error_count=?,duration_ms=?,error_summary=?
        WHERE id=?`).bind(
          input.status, completedAt, input.candidateCount, input.reviewableCandidateCount,
          input.duplicateCandidateCount, input.errorCount, durationMs, input.errorSummary, input.runId,
        ),
      rootUpdate(),
    ]);
  }
  let nextCheckAt = scheduledNextCheckAt;
  if (schedulePolicy === "PRESERVE_SCHEDULE") {
    const current = await db.prepare("SELECT next_check_at FROM automation_discovery_roots WHERE id=? LIMIT 1")
      .bind(input.root.id).first<{ next_check_at: string | null }>();
    nextCheckAt = current?.next_check_at ? String(current.next_check_at) : null;
  }
  return { nextCheckAt, durationMs };
}


export type AutomationDiscoveryOutcomeInput = {
  outcomeType: "NEW_DRAFT" | "EXISTING_CANONICAL" | "POSSIBLE_DUPLICATE" | "UPDATE_SUGGESTION";
  canonicalEntityId: number | null;
  label: string;
  sourceUrl: string | null;
  matchReasonCode: string;
};

export async function recordAutomationDiscoveryOutcomes(input: {
  runId: number;
  rootId: number;
  categorySlug: string | null;
  entityType: AutomationEntityType;
  outcomes: AutomationDiscoveryOutcomeInput[];
  createdAt: string;
}, databaseInput?: AutomationDiscoveryDatabase) {
  if (!input.outcomes.length) return;
  const db = database(databaseInput);
  try {
    const statements = input.outcomes.slice(0,100).map((outcome)=>db.prepare(`INSERT INTO automation_discovery_outcomes
      (run_id,root_id,category_slug,entity_type,outcome_type,canonical_entity_id,label,source_url,match_reason_code,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
        input.runId,input.rootId,input.categorySlug,input.entityType,outcome.outcomeType,outcome.canonicalEntityId,
        outcome.label.slice(0,240),outcome.sourceUrl?.slice(0,1000)??null,outcome.matchReasonCode.slice(0,80),input.createdAt,
      ));
    statements.push(db.prepare(`DELETE FROM automation_discovery_outcomes
      WHERE root_id=? AND id NOT IN (
        SELECT id FROM automation_discovery_outcomes WHERE root_id=? ORDER BY created_at DESC,id DESC LIMIT 500
      )`).bind(input.rootId,input.rootId));
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table:\s*automation_discovery_outcomes/i.test(message)) return;
    throw error;
  }
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

export async function reserveAutomationAddressEnrichmentRequest(input: {
  operationKey: string;
  discoveryRunId: number | null;
  providerKey: string;
  rootId: number;
  entityType: AutomationEntityType;
  queryFingerprint: string;
  now: Date;
  globalDailyLimit: number;
  entityDailyLimit: number;
  addressEnrichmentDailyLimit: number;
}, databaseInput?: AutomationDiscoveryDatabase): Promise<{
  reserved: boolean;
  reason: AutomationSearchBudgetReservationReason;
}> {
  const db = database(databaseInput);
  const dayBucket = utcSearchDayBucket(input.now);
  const at = input.now.toISOString();
  const enrichmentLimit = Math.max(1, Math.floor(input.addressEnrichmentDailyLimit));
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
        SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage
        WHERE root_id=? AND day_bucket=? AND operation_key LIKE 'address-enrichment:%'
      ) < ?
      RETURNING id`).bind(
        input.operationKey, input.discoveryRunId, input.providerKey, input.rootId, input.entityType,
        input.queryFingerprint, dayBucket, at,
        input.operationKey,
        dayBucket, input.globalDailyLimit,
        input.entityType, dayBucket, input.entityDailyLimit,
        input.rootId, dayBucket, enrichmentLimit,
      ).first<{ id: number }>();
    if (row) return { reserved: true, reason: "RESERVED" };

    const duplicate = await db.prepare("SELECT id FROM automation_search_usage WHERE operation_key=? LIMIT 1")
      .bind(input.operationKey).first<{ id: number }>();
    if (duplicate) return { reserved: false, reason: "DUPLICATE_OPERATION" };

    const usage = await db.prepare(`SELECT
        (SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE day_bucket=?) AS global_used,
        (SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE entity_type=? AND day_bucket=?) AS entity_used,
        (SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage
          WHERE root_id=? AND day_bucket=? AND operation_key LIKE 'address-enrichment:%') AS enrichment_used`)
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

export async function reserveAutomationEntityEnrichmentRequest(input: {
  operationKey: string;
  discoveryRunId: number | null;
  providerKey: string;
  rootId: number;
  entityType: AutomationEntityType;
  queryFingerprint: string;
  now: Date;
  globalDailyLimit: number;
  entityDailyLimit: number;
  entityEnrichmentDailyLimit: number;
}, databaseInput?: AutomationDiscoveryDatabase): Promise<{
  reserved: boolean;
  reason: AutomationSearchBudgetReservationReason;
}> {
  const db = database(databaseInput);
  const dayBucket = utcSearchDayBucket(input.now);
  const at = input.now.toISOString();
  const enrichmentLimit = Math.max(1, Math.floor(input.entityEnrichmentDailyLimit));
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
        SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage
        WHERE root_id=? AND day_bucket=? AND operation_key LIKE 'entity-enrichment:%'
      ) < ?
      RETURNING id`).bind(
        input.operationKey, input.discoveryRunId, input.providerKey, input.rootId, input.entityType,
        input.queryFingerprint, dayBucket, at,
        input.operationKey,
        dayBucket, input.globalDailyLimit,
        input.entityType, dayBucket, input.entityDailyLimit,
        input.rootId, dayBucket, enrichmentLimit,
      ).first<{ id: number }>();
    if (row) return { reserved: true, reason: "RESERVED" };

    const duplicate = await db.prepare("SELECT id FROM automation_search_usage WHERE operation_key=? LIMIT 1")
      .bind(input.operationKey).first<{ id: number }>();
    if (duplicate) return { reserved: false, reason: "DUPLICATE_OPERATION" };

    const usage = await db.prepare(`SELECT
        (SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE day_bucket=?) AS global_used,
        (SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage WHERE entity_type=? AND day_bucket=?) AS entity_used,
        (SELECT COALESCE(SUM(request_count),0) FROM automation_search_usage
          WHERE root_id=? AND day_bucket=? AND operation_key LIKE 'entity-enrichment:%') AS enrichment_used`)
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
