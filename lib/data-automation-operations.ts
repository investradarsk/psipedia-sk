import { env } from "cloudflare:workers";
import {
  automationProductCategoryContract,
  automationProductCategoryForEntity,
  type AutomationProductCategorySlug,
} from "./data-automation-product-model.ts";
import {
  automationCadenceRecommendation,
  automationMatchExplanationLabel,
  automationOperationsCutoff,
  type AutomationCadenceRecommendation,
  type AutomationOperationsRange,
  type AutomationRecommendationRun,
} from "./data-automation-operations-model.ts";
import { automationSearchBudgetPolicy, utcSearchDayBucket } from "./data-automation-search-budget.ts";
import {
  getDirectRefreshProgress,
  type AutomationDirectRefreshProgress,
} from "./data-automation-product-store.ts";
import { automationCanonicalAdminHref, type AutomationEntityType } from "./data-automation.ts";

type Database = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

function database(input?: Database) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Automation operations nemajú pripojenú databázu.");
}

function json(value: unknown) {
  if (typeof value !== "string" || !value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function n(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function nullable(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function categoryFor(entityType: unknown, configJson: unknown): AutomationProductCategorySlug | null {
  const config = json(configJson);
  const staticFields = config.staticFields && typeof config.staticFields === "object" && !Array.isArray(config.staticFields)
    ? config.staticFields as Record<string, unknown>
    : {};
  return automationProductCategoryForEntity(
    entityType as AutomationEntityType,
    config.directoryCategory ?? staticFields.category,
  );
}

export type AutomationOperationsRecentRun = {
  id: number;
  kind: "DISCOVERY" | "SOURCE";
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "RUNNING";
  startedAt: string;
  durationMs: number | null;
  requests: number | null;
  results: number | null;
  newCount: number | null;
  updateCount: number | null;
  duplicateCount: number | null;
  errors: number;
};

export type AutomationOperationsOutcome = {
  entityType: AutomationEntityType;
  outcomeType: "NEW_DRAFT" | "EXISTING_CANONICAL" | "POSSIBLE_DUPLICATE" | "UPDATE_SUGGESTION";
  canonicalEntityId: number | null;
  canonicalHref: string | null;
  canonicalExists: boolean;
  label: string;
  sourceUrl: string | null;
  reason: string;
  createdAt: string;
};

export type AutomationOperationsCategory = {
  slug: AutomationProductCategorySlug;
  title: string;
  mode: "DIRECT_ENTITY" | "FEED_SOURCE";
  status: "V poriadku" | "Problém" | "Čiastočne" | "Vypnuté" | "Bez údajov";
  lastErrorCode: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  cadenceMinutes: number | null;
  requestCount: number;
  resultCount: number;
  candidateCount: number | null;
  newCount: number | null;
  updateCount: number | null;
  duplicateCount: number | null;
  possibleDuplicateCount: number | null;
  errorCount: number;
  checkedCount: number;
  newFindingCount: number;
  updatedFindingCount: number;
  addressRequestCount: number;
  addressResultCount: number;
  todayRequestCount: number;
  todayRequestLimit: number | null;
  todayAddressRequestCount: number;
  todayAddressRequestLimit: number | null;
  newSourceCandidateCount: number;
  approvedSourceCandidateCount: number;
  rejectedSourceCandidateCount: number;
  addressVerifiedExactCount: number | null;
  addressNoExactCount: number | null;
  recommendation: AutomationCadenceRecommendation;
  refresh: AutomationDirectRefreshProgress | null;
  recentRuns: AutomationOperationsRecentRun[];
  recentOutcomes: AutomationOperationsOutcome[];
};

export type AutomationOperationsOverview = {
  range: AutomationOperationsRange;
  cutoff: string;
  generatedAt: string;
  extendedMetricsAvailable: boolean;
  global: {
    requestCount: number;
    resultCount: number;
    newEntityCount: number | null;
    updateSuggestionCount: number | null;
    duplicateCount: number | null;
    errorCount: number;
    successfulRuns: number;
    partialRuns: number;
    failedRuns: number;
    addressRequestCount: number;
    addressResultCount: number;
    tavilyTodayUsed: number;
    tavilyTodayLimit: number | null;
    approvedSources: number;
    activeSources: number;
    problemSources: number;
    pendingSources: number;
  };
  categories: AutomationOperationsCategory[];
};

function newer(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function sooner(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

function sumNullable(rows: Record<string, unknown>[], key: string) {
  const known = rows.map((row) => nullable(row[key])).filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function sourceRecommendation(rows: Record<string, unknown>[]): AutomationCadenceRecommendation {
  const healthy = rows.filter((row) => row.status === "SUCCESS" && n(row.error_count) === 0).slice(0, 8);
  if (healthy.length < 4) return "INSUFFICIENT_DATA";
  const recent = healthy.slice(0, 4);
  const useful = recent.map((row) => n(row.new_finding_count) + n(row.updated_finding_count));
  if (useful.every((value) => value === 0)) return "CONSIDER_SLOWER";
  if (useful.filter((value) => value >= 2).length >= 3) return "CONSIDER_FASTER";
  return "KEEP_CURRENT";
}

export async function getAutomationOperationsOverview(
  range: AutomationOperationsRange,
  databaseInput?: Database,
  now = new Date(),
): Promise<AutomationOperationsOverview> {
  const db = database(databaseInput);
  const cutoff = automationOperationsCutoff(range, now);

  const [rootsResult, discoveryResult, sourcesResult, sourceRunsResult, candidateStatusResult] = await Promise.all([
    db.prepare(`SELECT id,root_key,label,entity_type,config_json,enabled,cadence_minutes,next_check_at,
      last_checked_at,last_success_at,last_error_at,last_error_code
      FROM automation_discovery_roots ORDER BY id`).all<Record<string, unknown>>(),
    db.prepare(`SELECT r.*,d.entity_type AS root_entity_type,d.config_json AS root_config_json,
      d.root_key,d.label AS root_label
      FROM automation_discovery_runs r JOIN automation_discovery_roots d ON d.id=r.root_id
      WHERE r.started_at>=? ORDER BY r.started_at DESC,r.id DESC LIMIT 1000`).bind(cutoff).all<Record<string, unknown>>(),
    db.prepare(`SELECT id,entity_type,config_json,enabled,review_status,cadence_minutes,next_check_at,
      last_checked_at,last_success_at,last_error_at,last_error_code
      FROM automation_sources ORDER BY id`).all<Record<string, unknown>>(),
    db.prepare(`SELECT r.*,s.entity_type AS source_entity_type,s.config_json AS source_config_json,
      s.label AS source_label
      FROM automation_runs r JOIN automation_sources s ON s.id=r.source_id
      WHERE r.started_at>=? ORDER BY r.started_at DESC,r.id DESC LIMIT 1000`).bind(cutoff).all<Record<string, unknown>>(),
    db.prepare(`SELECT entity_type,review_status,COUNT(*) AS count
      FROM automation_source_candidates
      WHERE entity_type IN ('EVENT','ADOPTION','FOSTER','LOST_FOUND')
      GROUP BY entity_type,review_status`).all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] })),
  ]);

  const roots = rootsResult.results;
  const discoveryRuns = discoveryResult.results;
  const sources = sourcesResult.results;
  const sourceRuns = sourceRunsResult.results;
  const candidateStatusRows = candidateStatusResult.results;
  let usageRows: Record<string, unknown>[] = [];
  let todayUsageRows: Record<string, unknown>[] = [];
  let todayUsed = 0;
  try {
    const usage = await db.prepare(`SELECT root_id,
      COALESCE(SUM(CASE WHEN operation_key NOT LIKE 'address-enrichment:%' THEN request_count ELSE 0 END),0) AS discovery_requests,
      COALESCE(SUM(CASE WHEN operation_key NOT LIKE 'address-enrichment:%' THEN result_count ELSE 0 END),0) AS discovery_results,
      COALESCE(SUM(CASE WHEN operation_key LIKE 'address-enrichment:%' THEN request_count ELSE 0 END),0) AS address_requests,
      COALESCE(SUM(CASE WHEN operation_key LIKE 'address-enrichment:%' THEN result_count ELSE 0 END),0) AS address_results
      FROM automation_search_usage WHERE created_at>=? AND status<>'RESERVED' GROUP BY root_id`)
      .bind(cutoff).all<Record<string, unknown>>();
    usageRows = usage.results;
    const dayBucket = utcSearchDayBucket(now);
    const todayUsage = await db.prepare(`SELECT root_id,
      COALESCE(SUM(CASE WHEN operation_key NOT LIKE 'address-enrichment:%' THEN request_count ELSE 0 END),0) AS discovery_requests,
      COALESCE(SUM(CASE WHEN operation_key LIKE 'address-enrichment:%' THEN request_count ELSE 0 END),0) AS address_requests
      FROM automation_search_usage WHERE day_bucket=? GROUP BY root_id`)
      .bind(dayBucket).all<Record<string, unknown>>();
    todayUsageRows = todayUsage.results;
    const today = await db.prepare(`SELECT COALESCE(SUM(request_count),0) AS used
      FROM automation_search_usage WHERE day_bucket=?`).bind(dayBucket).first<Record<string, unknown>>();
    todayUsed = n(today?.used);
  } catch (error) {
    if (!/no such table:\s*automation_search_usage/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
  const usageByRoot = new Map(usageRows.map((row) => [n(row.root_id), row]));
  const todayUsageByRoot = new Map(todayUsageRows.map((row) => [n(row.root_id), row]));

  let outcomeRows: Record<string, unknown>[] = [];
  try {
    const result = await db.prepare(`SELECT * FROM automation_discovery_outcomes
      WHERE created_at>=? ORDER BY created_at DESC,id DESC LIMIT 200`).bind(cutoff).all<Record<string, unknown>>();
    outcomeRows = result.results;
  } catch (error) {
    if (!/no such table:\s*automation_discovery_outcomes/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }

  const existingCanonical = new Map<AutomationEntityType, Set<number>>();
  const tableForType: Partial<Record<AutomationEntityType, string>> = {
    EVENT: "managed_events",
    ORGANIZATION: "help_organizations",
    DIRECTORY: "directory_profiles",
    ADOPTION: "adoption_dogs",
    LOST_FOUND: "lost_found_dog_reports",
    HELP_ITEM: "help_cases",
    FOSTER: "help_cases",
  };
  for (const entityType of Object.keys(tableForType) as AutomationEntityType[]) {
    const ids = [...new Set(outcomeRows
      .filter((row) => row.entity_type === entityType)
      .map((row) => nullable(row.canonical_entity_id))
      .filter((value): value is number => value !== null && value > 0))];
    if (!ids.length) continue;
    const placeholders = ids.map(() => "?").join(",");
    const table = tableForType[entityType]!;
    try {
      const result = await db.prepare(`SELECT id FROM ${table} WHERE id IN (${placeholders})`)
        .bind(...ids).all<Record<string, unknown>>();
      existingCanonical.set(entityType, new Set(result.results.map((row) => n(row.id))));
    } catch {
      existingCanonical.set(entityType, new Set());
    }
  }

  const refreshBySlug = new Map<AutomationProductCategorySlug, AutomationDirectRefreshProgress | null>();
  for (const slug of ["veterinari", "psie-sluzby", "utulky-organizacie"] as const) {
    try {
      refreshBySlug.set(slug, await getDirectRefreshProgress(slug, db));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/no such table:|no such column:/i.test(message)) throw error;
      refreshBySlug.set(slug, null);
    }
  }

  const categories: AutomationOperationsCategory[] = automationProductCategoryContract.map((contract) => {
    const slug = contract.slug;
    const rootRows = roots.filter((row) => categoryFor(row.entity_type, row.config_json) === slug);
    const categoryDiscoveryRuns = discoveryRuns.filter((row) =>
      categoryFor(row.root_entity_type, row.root_config_json) === slug);
    const categorySources = sources.filter((row) => categoryFor(row.entity_type, row.config_json) === slug);
    const categorySourceRuns = sourceRuns.filter((row) =>
      categoryFor(row.source_entity_type, row.source_config_json) === slug);
    const categoryUsage = rootRows.map((root) => usageByRoot.get(n(root.id))).filter(Boolean) as Record<string, unknown>[];
    const categoryTodayUsage = rootRows.map((root) => todayUsageByRoot.get(n(root.id))).filter(Boolean) as Record<string, unknown>[];
    const policies = rootRows.map((root) => automationSearchBudgetPolicy({
      entityType: root.entity_type as AutomationEntityType,
      cadenceMinutes: n(root.cadence_minutes),
      config: json(root.config_json),
    }, now));
    const todayRequestCount = categoryTodayUsage.reduce((sum, row) => sum + n(row.discovery_requests), 0);
    const todayAddressRequestCount = categoryTodayUsage.reduce((sum, row) => sum + n(row.address_requests), 0);
    const todayRequestLimit = policies.length
      ? Math.min(
          Math.min(...policies.map((policy) => policy.entityDailyRequests)),
          policies.reduce((sum, policy) => sum + policy.rootDailyRequests, 0),
        )
      : null;
    const todayAddressRequestLimit = policies.length
      ? policies.reduce((sum, policy) => sum + policy.addressEnrichmentDailyRequests, 0)
      : null;
    const candidateStatusForCategory = candidateStatusRows.filter((row) =>
      automationProductCategoryForEntity(row.entity_type as AutomationEntityType) === slug);
    const candidateCountForStatus = (status: string) => candidateStatusForCategory
      .filter((row) => row.review_status === status)
      .reduce((sum, row) => sum + n(row.count), 0);

    const direct = contract.mode === "DIRECT_ENTITY";
    const requestCount = categoryUsage.reduce((sum, row) => sum + n(row.discovery_requests), 0);
    const resultCount = categoryUsage.reduce((sum, row) => sum + n(row.discovery_results), 0);
    const addressRequestCount = categoryUsage.reduce((sum, row) => sum + n(row.address_requests), 0);
    const addressResultCount = categoryUsage.reduce((sum, row) => sum + n(row.address_results), 0);
    const refresh = refreshBySlug.get(slug) ?? null;
    const rootErrors = rootRows.some((row) => Boolean(row.last_error_code));
    const sourceErrors = categorySources.some((row) => Boolean(row.last_error_code));
    const refreshError = Boolean(refresh?.lastErrorCode)
      && (!refresh?.lastSuccessAt || Boolean(refresh?.lastErrorAt && refresh.lastErrorAt >= refresh.lastSuccessAt));
    const enabled = direct ? rootRows.some((row) => Boolean(row.enabled)) : categorySources.some((row) => Boolean(row.enabled));
    const categoryRuns = [...categoryDiscoveryRuns, ...categorySourceRuns]
      .sort((a, b) => Date.parse(String(b.started_at ?? "")) - Date.parse(String(a.started_at ?? "")));
    const hasRuns = categoryRuns.length > 0;
    const latestRunPartial = categoryRuns[0]?.status === "PARTIAL";
    const status = rootErrors || sourceErrors || refreshError
      ? "Problém" as const
      : latestRunPartial
        ? "Čiastočne" as const
        : enabled
          ? "V poriadku" as const
          : rootRows.length || categorySources.length
            ? "Vypnuté" as const
            : hasRuns
              ? "V poriadku" as const
              : "Bez údajov" as const;

    const recentDiscovery: AutomationOperationsRecentRun[] = categoryDiscoveryRuns.slice(0, 10).map((row) => ({
      id: n(row.id),
      kind: "DISCOVERY",
      status: row.status as AutomationOperationsRecentRun["status"],
      startedAt: String(row.started_at ?? ""),
      durationMs: nullable(row.duration_ms),
      requests: nullable(row.search_request_count),
      results: nullable(row.search_result_count),
      newCount: nullable(row.new_entity_count),
      updateCount: nullable(row.update_suggestion_count),
      duplicateCount: nullable(row.canonical_duplicate_count),
      errors: n(row.error_count),
    }));
    const recentSource: AutomationOperationsRecentRun[] = categorySourceRuns.slice(0, 10).map((row) => ({
      id: n(row.id),
      kind: "SOURCE",
      status: row.status as AutomationOperationsRecentRun["status"],
      startedAt: String(row.started_at ?? ""),
      durationMs: nullable(row.duration_ms),
      requests: null,
      results: nullable(row.checked_count),
      newCount: nullable(row.new_finding_count),
      updateCount: nullable(row.updated_finding_count),
      duplicateCount: null,
      errors: n(row.error_count),
    }));
    const recentRuns = [...recentDiscovery, ...recentSource]
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, 10);

    const recommendation = direct
      ? automationCadenceRecommendation(categoryDiscoveryRuns.map((row): AutomationRecommendationRun => ({
          status: row.status as AutomationRecommendationRun["status"],
          canonicalDuplicateCount: nullable(row.canonical_duplicate_count),
          newEntityCount: nullable(row.new_entity_count),
          updateSuggestionCount: nullable(row.update_suggestion_count),
          possibleDuplicateCount: nullable(row.possible_duplicate_count),
          candidateCount: nullable(row.candidate_count),
          errorCount: n(row.error_count),
          providerFailure: /provider|timeout|auth|invalid_response/i.test(String(row.error_summary ?? "")),
          budgetBlocked: /budget_exhausted/i.test(String(row.error_summary ?? "")),
        })))
      : sourceRecommendation(categorySourceRuns);

    const rootErrorCode = rootRows.find((row) => row.last_error_code)?.last_error_code;
    const sourceErrorCode = categorySources.find((row) => row.last_error_code)?.last_error_code;

    return {
      slug,
      title: slug === "podujatia" ? "Podujatia"
        : slug === "veterinari" ? "Veterinári"
        : slug === "utulky-organizacie" ? "Útulky a organizácie"
        : slug === "psie-sluzby" ? "Psie služby"
        : slug === "adopcie" ? "Adopcie"
        : slug === "docasna-opatera" ? "Dočasná opatera"
        : "Stratené / nájdené",
      mode: contract.mode,
      status,
      lastErrorCode: refresh?.lastErrorCode
        ?? (rootErrorCode ? String(rootErrorCode) : null)
        ?? (sourceErrorCode ? String(sourceErrorCode) : null),
      lastRunAt: newer([...rootRows.map((row) => row.last_checked_at ? String(row.last_checked_at) : null),
        ...categorySources.map((row) => row.last_checked_at ? String(row.last_checked_at) : null)]),
      nextRunAt: sooner([...rootRows.map((row) => row.next_check_at ? String(row.next_check_at) : null),
        ...categorySources.map((row) => row.next_check_at ? String(row.next_check_at) : null)]),
      cadenceMinutes: nullable((direct ? rootRows[0] : categorySources[0])?.cadence_minutes),
      requestCount,
      resultCount,
      candidateCount: sumNullable(categoryDiscoveryRuns, "candidate_count"),
      newCount: direct ? sumNullable(categoryDiscoveryRuns, "new_entity_count") : null,
      updateCount: direct ? sumNullable(categoryDiscoveryRuns, "update_suggestion_count") : null,
      duplicateCount: direct ? sumNullable(categoryDiscoveryRuns, "canonical_duplicate_count") : sumNullable(categoryDiscoveryRuns, "duplicate_candidate_count"),
      possibleDuplicateCount: direct ? sumNullable(categoryDiscoveryRuns, "possible_duplicate_count") : null,
      errorCount: categoryDiscoveryRuns.reduce((sum, row) => sum + n(row.error_count), 0)
        + categorySourceRuns.reduce((sum, row) => sum + n(row.error_count), 0),
      checkedCount: categorySourceRuns.reduce((sum, row) => sum + n(row.checked_count), 0),
      newFindingCount: categorySourceRuns.reduce((sum, row) => sum + n(row.new_finding_count), 0),
      updatedFindingCount: categorySourceRuns.reduce((sum, row) => sum + n(row.updated_finding_count), 0),
      addressRequestCount,
      addressResultCount,
      todayRequestCount,
      todayRequestLimit,
      todayAddressRequestCount,
      todayAddressRequestLimit,
      newSourceCandidateCount: candidateCountForStatus("NEW"),
      approvedSourceCandidateCount: candidateCountForStatus("APPROVED"),
      rejectedSourceCandidateCount: candidateCountForStatus("REJECTED"),
      addressVerifiedExactCount: sumNullable(categoryDiscoveryRuns, "address_verified_exact_count"),
      addressNoExactCount: sumNullable(categoryDiscoveryRuns, "address_no_exact_count"),
      recommendation,
      refresh,
      recentRuns,
      recentOutcomes: outcomeRows
        .filter((row) => row.category_slug === slug)
        .slice(0, 20)
        .map((row) => {
          const entityType = row.entity_type as AutomationEntityType;
          const canonicalEntityId = nullable(row.canonical_entity_id);
          const canonicalExists = canonicalEntityId !== null
            && Boolean(existingCanonical.get(entityType)?.has(canonicalEntityId));
          return {
            entityType,
            outcomeType: row.outcome_type as AutomationOperationsOutcome["outcomeType"],
            canonicalEntityId,
            canonicalHref: canonicalExists && canonicalEntityId !== null
              ? automationCanonicalAdminHref(entityType, canonicalEntityId)
              : null,
            canonicalExists,
            label: String(row.label ?? ""),
            sourceUrl: row.source_url ? String(row.source_url) : null,
            reason: automationMatchExplanationLabel(String(row.match_reason_code ?? "")),
            createdAt: String(row.created_at ?? ""),
          };
        }),
    };
  });

  const allRuns = [...discoveryRuns, ...sourceRuns];
  const knownNew = sumNullable(discoveryRuns, "new_entity_count");
  const knownUpdates = sumNullable(discoveryRuns, "update_suggestion_count");
  const knownDuplicates = sumNullable(discoveryRuns, "canonical_duplicate_count");
  const globalLimitRoot = roots.find((row) => row.entity_type && row.config_json);
  const globalLimit = globalLimitRoot
    ? automationSearchBudgetPolicy({
        entityType: globalLimitRoot.entity_type as AutomationEntityType,
        cadenceMinutes: n(globalLimitRoot.cadence_minutes),
        config: json(globalLimitRoot.config_json),
      }, now).globalDailyRequests
    : null;

  return {
    range,
    cutoff,
    generatedAt: now.toISOString(),
    extendedMetricsAvailable: discoveryRuns.length === 0 || discoveryRuns.some((row) =>
      row.new_entity_count !== undefined || row.search_request_count !== undefined),
    global: {
      requestCount: categories.reduce((sum, row) => sum + row.requestCount, 0),
      resultCount: categories.reduce((sum, row) => sum + row.resultCount, 0),
      newEntityCount: knownNew,
      updateSuggestionCount: knownUpdates,
      duplicateCount: knownDuplicates,
      errorCount: allRuns.reduce((sum, row) => sum + n(row.error_count), 0),
      successfulRuns: allRuns.filter((row) => row.status === "SUCCESS").length,
      partialRuns: allRuns.filter((row) => row.status === "PARTIAL").length,
      failedRuns: allRuns.filter((row) => row.status === "FAILED").length,
      addressRequestCount: categories.reduce((sum, row) => sum + row.addressRequestCount, 0),
      addressResultCount: categories.reduce((sum, row) => sum + row.addressResultCount, 0),
      tavilyTodayUsed: todayUsed,
      tavilyTodayLimit: globalLimit,
      approvedSources: sources.filter((row) => row.review_status === "APPROVED").length,
      activeSources: sources.filter((row) => row.review_status === "APPROVED" && Boolean(row.enabled)).length,
      problemSources: sources.filter((row) => Boolean(row.last_error_code)).length,
      pendingSources: sources.filter((row) => row.review_status === "PENDING").length,
    },
    categories,
  };
}
