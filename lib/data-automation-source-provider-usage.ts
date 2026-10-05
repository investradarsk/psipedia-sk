export type AutomationSourceProviderOperation = "CRAWL" | "EXTRACT";

export type AutomationSourceProviderUsageStatus =
  | "RESERVED"
  | "SUCCESS"
  | "EMPTY"
  | "RATE_LIMITED"
  | "AUTH_FAILED"
  | "CONFIG_MISSING"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE"
  | "SCOPE_VIOLATION"
  | "BUDGET_EXHAUSTED";

export type AutomationSourceProviderUsageDatabase = Pick<D1Database, "prepare">;

export const AUTOMATION_SOURCE_PROVIDER_GLOBAL_DAILY_LIMIT = 200;

function cooldownMs(status: string) {
  if (status === "AUTH_FAILED" || status === "CONFIG_MISSING") return 24 * 60 * 60_000;
  if (status === "RATE_LIMITED") return 12 * 60 * 60_000;
  if (status === "TIMEOUT" || status === "PROVIDER_ERROR" || status === "INVALID_RESPONSE") return 60 * 60_000;
  return 0;
}

export async function automationSourceProviderUsageSchemaReady(
  database: AutomationSourceProviderUsageDatabase,
) {
  try {
    const row = await database.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='automation_source_provider_usage' LIMIT 1",
    ).first<{ name: string }>();
    return row?.name === "automation_source_provider_usage";
  } catch {
    return false;
  }
}

export function utcAutomationSourceProviderDayBucket(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function boundedPositiveInt(value: number, fallback: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

export async function reserveAutomationSourceProviderRequest(input: {
  database: AutomationSourceProviderUsageDatabase;
  operationKey: string;
  sourceId: number;
  runId: number;
  providerKey: string;
  operation: AutomationSourceProviderOperation;
  maxRequestsPerDay: number;
  maxRequestsPerRun: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const dayBucket = utcAutomationSourceProviderDayBucket(now);
  const maxDay = boundedPositiveInt(input.maxRequestsPerDay, 1, 50);
  const maxRun = boundedPositiveInt(input.maxRequestsPerRun, 1, 10);

  try {
    const latest = await input.database.prepare(`
      SELECT status,created_at FROM automation_source_provider_usage
      WHERE source_id=? AND status<>'RESERVED'
      ORDER BY created_at DESC,id DESC LIMIT 1
    `).bind(input.sourceId).first<{ status: string; created_at: string }>();
    if (latest) {
      const delay = cooldownMs(String(latest.status ?? ""));
      const created = Date.parse(String(latest.created_at ?? ""));
      if (delay > 0 && Number.isFinite(created) && created + delay > now.getTime()) {
        return {
          reserved: false as const,
          reason: "COOLDOWN" as const,
          cooldownUntil: new Date(created + delay).toISOString(),
          operationKey: input.operationKey,
          dayBucket,
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table:\s*automation_source_provider_usage/i.test(message)) {
      throw new Error("automation_source_provider_usage_unavailable");
    }
    throw error;
  }

  let result;
  try {
    result = await input.database.prepare(`
      INSERT INTO automation_source_provider_usage (
        operation_key,source_id,run_id,provider_key,operation,day_bucket,
        request_count,result_count,accepted_count,scope_rejected_count,status,created_at
      )
      SELECT ?,?,?,?,?,?,1,0,0,0,'RESERVED',?
      WHERE (
        SELECT COALESCE(SUM(request_count),0)
        FROM automation_source_provider_usage
        WHERE source_id=? AND day_bucket=?
      ) < ?
      AND (
        SELECT COALESCE(SUM(request_count),0)
        FROM automation_source_provider_usage
        WHERE run_id=?
      ) < ?
      AND (
        SELECT COALESCE(SUM(request_count),0)
        FROM automation_source_provider_usage
        WHERE day_bucket=?
      ) < ?
      ON CONFLICT(operation_key) DO NOTHING
    `).bind(
      input.operationKey,
      input.sourceId,
      input.runId,
      input.providerKey,
      input.operation,
      dayBucket,
      at,
      input.sourceId,
      dayBucket,
      maxDay,
      input.runId,
      maxRun,
      dayBucket,
      AUTOMATION_SOURCE_PROVIDER_GLOBAL_DAILY_LIMIT,
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table:\s*automation_source_provider_usage/i.test(message)) {
      throw new Error("automation_source_provider_usage_unavailable");
    }
    throw error;
  }

  if (Number(result.meta?.changes ?? 0) === 1) {
    return { reserved: true as const, operationKey: input.operationKey, dayBucket };
  }

  return {
    reserved: false as const,
    reason: "BUDGET" as const,
    cooldownUntil: null,
    operationKey: input.operationKey,
    dayBucket,
  };
}

export async function finalizeAutomationSourceProviderRequest(input: {
  database: AutomationSourceProviderUsageDatabase;
  operationKey: string;
  status: Exclude<AutomationSourceProviderUsageStatus, "RESERVED">;
  resultCount?: number;
  acceptedCount?: number;
  scopeRejectedCount?: number;
  now?: Date;
}) {
  const at = (input.now ?? new Date()).toISOString();
  await input.database.prepare(`
    UPDATE automation_source_provider_usage
    SET status=?,result_count=?,accepted_count=?,scope_rejected_count=?,finalized_at=?
    WHERE operation_key=? AND status='RESERVED'
  `).bind(
    input.status,
    Math.max(0, Math.floor(input.resultCount ?? 0)),
    Math.max(0, Math.floor(input.acceptedCount ?? 0)),
    Math.max(0, Math.floor(input.scopeRejectedCount ?? 0)),
    at,
    input.operationKey,
  ).run();
}

export async function automationSourceProviderUsageCounts(input: {
  database: AutomationSourceProviderUsageDatabase;
  sourceId: number;
  runId: number;
  now?: Date;
}) {
  const dayBucket = utcAutomationSourceProviderDayBucket(input.now ?? new Date());
  const row = await input.database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN source_id=? AND day_bucket=? THEN request_count ELSE 0 END),0) AS daily_requests,
      COALESCE(SUM(CASE WHEN run_id=? THEN request_count ELSE 0 END),0) AS run_requests,
      COALESCE(SUM(CASE WHEN run_id=? AND operation='CRAWL' THEN request_count ELSE 0 END),0) AS crawl_requests,
      COALESCE(SUM(CASE WHEN run_id=? AND operation='EXTRACT' THEN request_count ELSE 0 END),0) AS extract_requests
    FROM automation_source_provider_usage
    WHERE source_id=? OR run_id=?
  `).bind(
    input.sourceId,
    dayBucket,
    input.runId,
    input.runId,
    input.runId,
    input.sourceId,
    input.runId,
  ).first<Record<string, unknown>>();
  return {
    dailyRequests: Number(row?.daily_requests ?? 0),
    runRequests: Number(row?.run_requests ?? 0),
    crawlRequests: Number(row?.crawl_requests ?? 0),
    extractRequests: Number(row?.extract_requests ?? 0),
  };
}
