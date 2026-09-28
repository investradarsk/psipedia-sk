import type { AutomationEntityType } from "./data-automation.ts";

export const AUTOMATION_SEARCH_DEFAULT_QUERIES_PER_RUN = 5;
export const AUTOMATION_SEARCH_HARD_QUERIES_PER_RUN = 10;
export const AUTOMATION_SEARCH_DEFAULT_GLOBAL_DAILY_REQUESTS = 100;
export const AUTOMATION_SEARCH_HARD_GLOBAL_DAILY_REQUESTS = 500;
export const AUTOMATION_SEARCH_DEFAULT_ROOT_DAILY_REQUESTS = 20;
export const AUTOMATION_SEARCH_HARD_ROOT_DAILY_REQUESTS = 50;
export const AUTOMATION_SEARCH_DEFAULT_QUERY_COOLDOWN_MINUTES = 24 * 60;
export const AUTOMATION_SEARCH_HARD_PROVIDER_REQUESTS_PER_RUN = 10;
export const AUTOMATION_SEARCH_MAX_PAGES_PER_QUERY = 1;
export const AUTOMATION_SEARCH_DEFAULT_ADDRESS_ENRICHMENT_DAILY_REQUESTS = 3;
export const AUTOMATION_SEARCH_HARD_ADDRESS_ENRICHMENT_DAILY_REQUESTS = 5;
export const AUTOMATION_SEARCH_PLATEAU_WINDOW = 3;
export const AUTOMATION_SEARCH_PLATEAU_COOLDOWN_MULTIPLIER = 4;

export const AUTOMATION_SEARCH_DEFAULT_ENTITY_DAILY_REQUESTS: Record<AutomationEntityType, number> = {
  EVENT: 30,
  DIRECTORY: 20,
  ORGANIZATION: 20,
  ADOPTION: 10,
  FOSTER: 10,
  LOST_FOUND: 10,
  HELP_ITEM: 10,
};

export type AutomationSearchUsageStatus =
  | "RESERVED"
  | "SUCCESS"
  | "EMPTY"
  | "RATE_LIMITED"
  | "AUTH_FAILED"
  | "CONFIG_MISSING"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

export type AutomationSearchBudgetPolicy = {
  queriesPerRun: number;
  providerRequestsPerRun: number;
  globalDailyRequests: number;
  entityDailyRequests: number;
  baseRootDailyRequests: number;
  manualExtraRootRequests: number;
  rootDailyRequests: number;
  addressEnrichmentDailyRequests: number;
  queryCooldownMinutes: number;
  maxPagesPerQuery: 1;
};

function finiteInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : null;
}

function lowerBoundedConfig(value: unknown, fallback: number, hardCap: number, min = 1) {
  const parsed = finiteInt(value);
  if (parsed === null) return fallback;
  return Math.max(min, Math.min(fallback, hardCap, parsed));
}

export function utcSearchDayBucket(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function manualRootBudgetExtra(budget: Record<string, unknown>, now: Date) {
  const rows = Array.isArray(budget.adminOverrides) ? budget.adminOverrides : [];
  const dayBucket = utcSearchDayBucket(now);
  return Math.max(0, rows.reduce((sum, value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return sum;
    const row = value as Record<string, unknown>;
    if (row.dayBucket !== dayBucket || row.reason !== "MANUAL_BUDGET_OVERRIDE") return sum;
    const extra = finiteInt(row.extraRequests);
    return sum + (extra && extra > 0 ? Math.min(extra, AUTOMATION_SEARCH_HARD_PROVIDER_REQUESTS_PER_RUN) : 0);
  }, 0));
}

export function automationSearchBudgetPolicy(input: {
  entityType: AutomationEntityType;
  cadenceMinutes: number;
  config: Record<string, unknown>;
}, now = new Date()): AutomationSearchBudgetPolicy {
  const budget = input.config.searchBudget && typeof input.config.searchBudget === "object" && !Array.isArray(input.config.searchBudget)
    ? input.config.searchBudget as Record<string, unknown>
    : {};
  const entityDefault = AUTOMATION_SEARCH_DEFAULT_ENTITY_DAILY_REQUESTS[input.entityType] ?? 10;
  const baseRootDailyRequests = lowerBoundedConfig(
    budget.rootDailyRequests ?? input.config.dailyRequestCap,
    AUTOMATION_SEARCH_DEFAULT_ROOT_DAILY_REQUESTS,
    AUTOMATION_SEARCH_HARD_ROOT_DAILY_REQUESTS,
  );
  const manualExtraRootRequests = Math.min(
    Math.max(0, AUTOMATION_SEARCH_HARD_ROOT_DAILY_REQUESTS - baseRootDailyRequests),
    manualRootBudgetExtra(budget, now),
  );
  return {
    queriesPerRun: lowerBoundedConfig(
      budget.queriesPerRun ?? input.config.maxQueriesPerRun,
      AUTOMATION_SEARCH_DEFAULT_QUERIES_PER_RUN,
      AUTOMATION_SEARCH_HARD_QUERIES_PER_RUN,
    ),
    providerRequestsPerRun: lowerBoundedConfig(
      budget.providerRequestsPerRun,
      AUTOMATION_SEARCH_HARD_PROVIDER_REQUESTS_PER_RUN,
      AUTOMATION_SEARCH_HARD_PROVIDER_REQUESTS_PER_RUN,
    ),
    globalDailyRequests: AUTOMATION_SEARCH_DEFAULT_GLOBAL_DAILY_REQUESTS,
    entityDailyRequests: lowerBoundedConfig(
      budget.entityDailyRequests,
      entityDefault,
      entityDefault,
    ),
    baseRootDailyRequests,
    manualExtraRootRequests,
    rootDailyRequests: baseRootDailyRequests + manualExtraRootRequests,
    addressEnrichmentDailyRequests: lowerBoundedConfig(
      budget.addressEnrichmentDailyRequests,
      AUTOMATION_SEARCH_DEFAULT_ADDRESS_ENRICHMENT_DAILY_REQUESTS,
      AUTOMATION_SEARCH_HARD_ADDRESS_ENRICHMENT_DAILY_REQUESTS,
    ),
    queryCooldownMinutes: Math.max(
      Math.max(60, Math.floor(input.cadenceMinutes || 0)),
      lowerBoundedConfig(
        budget.queryCooldownMinutes ?? input.config.queryCooldownMinutes,
        AUTOMATION_SEARCH_DEFAULT_QUERY_COOLDOWN_MINUTES,
        AUTOMATION_SEARCH_DEFAULT_QUERY_COOLDOWN_MINUTES,
        60,
      ),
    ),
    maxPagesPerQuery: AUTOMATION_SEARCH_MAX_PAGES_PER_QUERY,
  };
}

export function automationSearchErrorCooldownMinutes(
  status: AutomationSearchUsageStatus,
  baseCooldownMinutes: number,
) {
  if (status === "AUTH_FAILED" || status === "CONFIG_MISSING") return Math.max(baseCooldownMinutes, 24 * 60);
  if (status === "RATE_LIMITED") return Math.max(baseCooldownMinutes, 12 * 60);
  if (status === "TIMEOUT" || status === "PROVIDER_ERROR" || status === "INVALID_RESPONSE") {
    return Math.max(60, Math.min(baseCooldownMinutes, 6 * 60));
  }
  return baseCooldownMinutes;
}

export function automationSearchPlateauSignal(rows: Array<{
  status: string;
  resultCount: number;
  newUniqueCandidateCount: number;
  duplicateCandidateCount: number;
}>) {
  const relevant = rows
    .filter((row) => row.status === "SUCCESS" || row.status === "EMPTY")
    .slice(0, AUTOMATION_SEARCH_PLATEAU_WINDOW);
  if (relevant.length < AUTOMATION_SEARCH_PLATEAU_WINDOW) return false;
  const newUnique = relevant.reduce((sum, row) => sum + Math.max(0, row.newUniqueCandidateCount), 0);
  const results = relevant.reduce((sum, row) => sum + Math.max(0, row.resultCount), 0);
  const duplicates = relevant.reduce((sum, row) => sum + Math.max(0, row.duplicateCandidateCount), 0);
  const duplicateRatio = results > 0 ? duplicates / results : 1;
  return newUnique === 0 && duplicateRatio >= 0.8;
}

export function automationSearchCooldownUntil(input: {
  at: string;
  status: AutomationSearchUsageStatus;
  baseCooldownMinutes: number;
  plateau: boolean;
}) {
  const at = new Date(input.at).getTime();
  if (!Number.isFinite(at)) return null;
  const base = automationSearchErrorCooldownMinutes(input.status, input.baseCooldownMinutes);
  const minutes = input.plateau ? base * AUTOMATION_SEARCH_PLATEAU_COOLDOWN_MULTIPLIER : base;
  return new Date(at + minutes * 60_000).toISOString();
}
