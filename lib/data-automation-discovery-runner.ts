import {
  automationSearchQueryFingerprint,
  automationSearchResultsToCandidates,
  AutomationSearchProviderError,
  normalizeAutomationSearchRequest,
  parseStructuredDirectoryConfig,
  requireConfiguredSearchProvider,
  rssDiscoveryCandidates,
  parseSitemapDocument,
  structuredDirectoryDiscovery,
  structuredDirectoryNextPageUrl,
  type StructuredDirectoryConfig,
  type AutomationSearchProvider,
  type AutomationSearchRequest,
  type AutomationSearchResult,
  type AutomationSourceCandidateInput,
} from "./data-automation-discovery.ts";
import {
  beginAutomationDiscoveryRun,
  claimDueAutomationDiscoveryRoot,
  finalizeAutomationSearchUsage,
  finishAutomationDiscoveryRun,
  getAutomationDiscoveryRoot,
  getAutomationDiscoveryRunSearchMetrics,
  getDueAutomationDiscoveryRoot,
  getAutomationSearchCooldownState,
  listAutomationDiscoveryRoots,
  listDueAutomationDiscoveryRoots,
  reserveAutomationAddressEnrichmentRequest,
  reserveAutomationEntityEnrichmentRequest,
  reserveAutomationSearchRequest,
  updateAutomationSearchUsageCandidateMetrics,
  recordAutomationDiscoveryOutcomes,
  type AutomationDiscoveryOutcomeInput,
  type AutomationDiscoveryDatabase,
  type AutomationDiscoveryRoot,
} from "./data-automation-discovery-store.ts";
import {
  automationSearchBudgetPolicy,
  type AutomationSearchUsageStatus,
} from "./data-automation-search-budget.ts";
import { canonicalizeSourceUrl, isSafeAutomationSourceUrl } from "./data-automation.ts";
import {
  upsertAutomationSourceCandidate,
  upsertAutomationSourceCandidateEvidence,
} from "./data-automation-source-store.ts";
import {
  automationDiscoveryCandidateExcluded,
  claimDueDirectEntityRefreshSetting,
  finishDirectEntityRefreshSetting,
  listDirectRefreshCandidates,
  listDueDirectEntityRefreshSettings,
  loadAutomationDiscoveryExclusions,
  type AutomationDiscoveryExclusionContext,
} from "./data-automation-product-store.ts";
import {
  automationProductCategoryForRoot,
  automationProductModeForRoot,
} from "./data-automation-product-model.ts";
import { ingestDirectEntityUrl } from "./data-automation-direct-entity.ts";
import type { EntityEnrichmentSearch } from "./data-automation-entity-enrichment.ts";
import type { AutomationEnrichmentSearchPlan } from "./data-automation-enrichment-evidence.ts";
import { evaluateGovernanceForActivation, getGovernanceState } from "./data-automation-governance.ts";
import type { DirectoryAddressSearch } from "./data-automation-directory-address-enrichment.ts";

export const DATA_AUTOMATION_MAX_DISCOVERY_ROOTS_PER_SWEEP = 2;
const MAX_DISCOVERY_BYTES = 1_000_000;
const MAX_REDIRECT_HOPS = 3;
const SITEMAP_MAX_DEPTH = 2;
const SITEMAP_MAX_CHILDREN_PER_INDEX = 50;
const SITEMAP_MAX_DOCUMENTS = 50;
const SITEMAP_HARD_MAX_URLS = 2000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type AutomationDiscoveryFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type DataAutomationDiscoverySweepOptions = {
  database: D1Database;
  now?: Date;
  /**
   * Transport injection used for Tavily API calls in production and for
   * deterministic provider mocks in tests. TAVILY_ONLY prevents legacy roots
   * from using it against arbitrary third-party origins.
   */
  fetchImpl?: AutomationDiscoveryFetch;
  searchProvider?: AutomationSearchProvider;
  tavilyApiKey?: string;
  internetTransport?: "TAVILY_ONLY" | "LEGACY_DIRECT";
  sleep?: (ms: number) => Promise<void>;
};

type DiscoveryCandidatesResult = {
  candidates: AutomationSourceCandidateInput[];
  warnings: string[];
  metrics?: {
    category: string | null;
    discoveryMode: "DIRECT_ENTITY" | "FEED_SOURCE" | null;
    exclusionEntityType: string;
    exclusionCategory: string | null;
    exclusionCount: number;
    localPrefilterCount: number;
    providerResultCount: number;
  };
};

export type DiscoveryRunSummary = {
  runId: number;
  rootId: number;
  rootKey: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  candidates: number;
  reviewableCandidates: number;
  duplicateCandidates: number;
  requestCount: number;
  resultCount: number;
  providerResultCount: number;
  localPrefilterCount: number;
  exclusionCount: number;
  canonicalDuplicateCount: number;
  newEntityCount: number;
  updateSuggestionCount: number;
  possibleDuplicateCount: number;
  addressVerifiedExactCount: number;
  addressNoExactCount: number;
  category: string | null;
  discoveryMode: "DIRECT_ENTITY" | "FEED_SOURCE" | null;
  errors: number;
  errorSummary: string | null;
  nextCheckAt: string | null;
};

class DiscoveryFetchError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = "DiscoveryFetchError";
    this.code = code;
    this.retryable = retryable;
  }
}

function safeErrorCode(error: unknown) {
  if (error instanceof DiscoveryFetchError) return error.code;
  if (error instanceof AutomationSearchProviderError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 180) || "automation_discovery_unknown_error";
}

function configNumber(root: AutomationDiscoveryRoot, key: string, fallback: number, min: number, max: number) {
  const value = Number(root.config[key]);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
}

function configStrings(root: AutomationDiscoveryRoot, key: string) {
  const value = root.config[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function responseText(response: Response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_DISCOVERY_BYTES) {
    throw new DiscoveryFetchError("discovery_response_too_large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_DISCOVERY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new DiscoveryFetchError("discovery_response_too_large");
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}

function validateContentType(root: AutomationDiscoveryRoot, contentType: string | null) {
  if (!contentType) return;
  const value = contentType.toLowerCase();
  if (root.discoveryType === "SITEMAP" || root.discoveryType === "RSS") {
    if (!value.includes("xml") && !value.includes("text/plain")) {
      throw new DiscoveryFetchError("discovery_invalid_content_type");
    }
    return;
  }
  if (root.discoveryType === "STRUCTURED_DIRECTORY") {
    const format = String(root.config.format ?? "");
    if (format === "HTML") {
      if (!value.includes("text/html") && !value.includes("application/xhtml+xml")) {
        throw new DiscoveryFetchError("invalid_directory_response");
      }
    } else if (format === "JSON") {
      if (!value.includes("application/json") && !value.includes("+json")) {
        throw new DiscoveryFetchError("invalid_directory_response");
      }
    }
  }
}

async function fetchDiscoveryPayload(
  root: AutomationDiscoveryRoot,
  fetchImpl: AutomationDiscoveryFetch,
  sourceUrl = root.sourceUrl,
  urlAllowed?: (url: string) => boolean,
) {
  if (!sourceUrl || !isSafeAutomationSourceUrl(sourceUrl) || (urlAllowed && !urlAllowed(sourceUrl))) {
    throw new DiscoveryFetchError("discovery_unsafe_or_missing_url");
  }

  let currentUrl = sourceUrl;
  const seen = new Set<string>();
  let redirects = 0;
  const timeoutMs = configNumber(root, "timeoutMs", 8000, 1000, 30_000);

  while (true) {
    const key = canonicalizeSourceUrl(currentUrl) ?? currentUrl;
    if (seen.has(key)) throw new DiscoveryFetchError("discovery_redirect_loop");
    seen.add(key);

    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: root.discoveryType === "STRUCTURED_DIRECTORY" && String(root.config.format ?? "") === "JSON"
            ? "application/json"
            : "text/html,application/xhtml+xml,application/xml,text/xml,text/plain",
          "user-agent": "PsipediaSourceDiscovery/1.0 (+https://psipedia.sk)",
        },
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") throw new DiscoveryFetchError("discovery_timeout", true);
      throw new DiscoveryFetchError("discovery_request_failed", true);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new DiscoveryFetchError("discovery_redirect_invalid");
      if (redirects >= MAX_REDIRECT_HOPS) throw new DiscoveryFetchError("discovery_redirect_too_many");
      let target: URL;
      try {
        target = new URL(location, currentUrl);
      } catch {
        throw new DiscoveryFetchError("discovery_redirect_invalid");
      }
      if (!isSafeAutomationSourceUrl(target.toString()) || (urlAllowed && !urlAllowed(target.toString()))) {
        throw new DiscoveryFetchError("discovery_redirect_blocked");
      }
      await response.body?.cancel().catch(() => undefined);
      currentUrl = target.toString();
      redirects += 1;
      continue;
    }

    if (!response.ok) throw new DiscoveryFetchError(`discovery_http_${response.status}`, RETRYABLE_STATUSES.has(response.status));
    validateContentType(root, response.headers.get("content-type"));
    const payload = await responseText(response);
    return { payload, finalUrl: currentUrl };
  }
}

async function fetchWithRetry(
  root: AutomationDiscoveryRoot,
  fetchImpl: AutomationDiscoveryFetch,
  sleep: (ms: number) => Promise<void>,
  sourceUrl = root.sourceUrl,
  urlAllowed?: (url: string) => boolean,
) {
  const retries = configNumber(root, "retryMaxAttempts", 1, 0, 3);
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchDiscoveryPayload(root, fetchImpl, sourceUrl, urlAllowed);
    } catch (error) {
      lastError = error;
      if (!(error instanceof DiscoveryFetchError) || !error.retryable || attempt >= retries) throw error;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}


function normalizedDiscoveryHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function normalizedConfiguredHosts(root: AutomationDiscoveryRoot) {
  return new Set(configStrings(root, "allowedHosts")
    .map((value) => value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, ""))
    .filter((value) => value && /^[a-z0-9.-]+$/.test(value) && !value.includes("..")));
}

function sitemapHostPolicy(root: AutomationDiscoveryRoot) {
  const rootHost = root.sourceUrl ? normalizedDiscoveryHost(root.sourceUrl) : "";
  const allowed = normalizedConfiguredHosts(root);
  return (url: string) => {
    const host = normalizedDiscoveryHost(url);
    return Boolean(host && (host === rootHost || allowed.has(host)));
  };
}

function pathMatchesSitemapFilters(root: AutomationDiscoveryRoot, url: string) {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  const includes = configStrings(root, "pathIncludes").filter((value) => value.startsWith("/"));
  const excludes = configStrings(root, "pathExcludes").filter((value) => value.startsWith("/"));
  if (includes.length && !includes.some((prefix) => path.startsWith(prefix))) return false;
  if (excludes.some((prefix) => path.startsWith(prefix))) return false;
  return true;
}

type RobotsPolicy = {
  state: "MISSING" | "AVAILABLE" | "FETCH_FAILED" | "MALFORMED";
  disallow: string[];
  sitemapUrls: string[];
};

function parseRobotsPolicy(payload: string, baseUrl: string): RobotsPolicy {
  const disallow: string[] = [];
  const sitemapUrls: string[] = [];
  let applies = false;
  let sawDirective = false;
  for (const rawLine of payload.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      sawDirective = true;
      applies = value === "*";
      continue;
    }
    if (key === "disallow" && applies) {
      sawDirective = true;
      if (value.startsWith("/")) disallow.push(value);
      continue;
    }
    if (key === "allow" && applies) {
      sawDirective = true;
      continue;
    }
    if (key === "sitemap") {
      sawDirective = true;
      try {
        sitemapUrls.push(new URL(value, baseUrl).toString());
      } catch {
        // Ignore malformed Sitemap directives.
      }
    }
  }
  return {
    state: sawDirective || payload.trim() === "" ? "AVAILABLE" : "MALFORMED",
    disallow: [...new Set(disallow)],
    sitemapUrls: [...new Set(sitemapUrls)],
  };
}

function robotsAllows(policy: RobotsPolicy, url: string) {
  if (policy.state !== "AVAILABLE") return true;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return !policy.disallow.some((prefix) => prefix === "/" || path.startsWith(prefix));
}

async function fetchRobotsPolicy(
  root: AutomationDiscoveryRoot,
  fetchImpl: AutomationDiscoveryFetch,
  sleep: (ms: number) => Promise<void>,
  urlAllowed: (url: string) => boolean,
): Promise<RobotsPolicy> {
  if (!root.sourceUrl) return { state: "MISSING", disallow: [], sitemapUrls: [] };
  const source = new URL(root.sourceUrl);
  const robotsUrl = `${source.protocol}//${source.host}/robots.txt`;
  try {
    const fetched = await fetchWithRetry(root, fetchImpl, sleep, robotsUrl, urlAllowed);
    return parseRobotsPolicy(fetched.payload, fetched.finalUrl);
  } catch (error) {
    if (error instanceof DiscoveryFetchError && error.code === "discovery_http_404") {
      return { state: "MISSING", disallow: [], sitemapUrls: [] };
    }
    if (error instanceof DiscoveryFetchError && (
      error.code === "discovery_request_failed"
      || error.code === "discovery_timeout"
      || error.retryable
    )) {
      return { state: "FETCH_FAILED", disallow: [], sitemapUrls: [] };
    }
    return { state: "MALFORMED", disallow: [], sitemapUrls: [] };
  }
}

export async function discoverSitemapCandidates(
  root: AutomationDiscoveryRoot,
  options: DataAutomationDiscoverySweepOptions,
  maxCandidates: number,
): Promise<DiscoveryCandidatesResult> {
  if (!root.sourceUrl) throw new DiscoveryFetchError("discovery_unsafe_or_missing_url");
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const urlAllowed = sitemapHostPolicy(root);
  const maxDepth = configNumber(root, "maxDepth", SITEMAP_MAX_DEPTH, 0, SITEMAP_MAX_DEPTH);
  const maxDocuments = configNumber(root, "maxSitemapDocuments", SITEMAP_MAX_DOCUMENTS, 1, SITEMAP_MAX_DOCUMENTS);
  const maxChildren = configNumber(root, "maxChildSitemaps", SITEMAP_MAX_CHILDREN_PER_INDEX, 1, SITEMAP_MAX_CHILDREN_PER_INDEX);
  const configuredUrlLimit = configNumber(root, "maxSitemapUrls", 500, 1, SITEMAP_HARD_MAX_URLS);
  const maxUrls = Math.min(configuredUrlLimit, maxCandidates);
  const robots = await fetchRobotsPolicy(root, fetchImpl, sleep, urlAllowed);
  if (robots.state === "FETCH_FAILED") throw new DiscoveryFetchError("robots_fetch_failed", true);
  if (!robotsAllows(robots, root.sourceUrl)) throw new DiscoveryFetchError("robots_disallowed");

  const queue: Array<{ url: string; depth: number; parentUrl: string | null }> = [
    { url: root.sourceUrl, depth: 0, parentUrl: null },
  ];
  for (const directive of robots.sitemapUrls) {
    const canonical = canonicalizeSourceUrl(directive);
    if (canonical && urlAllowed(canonical) && canonical !== canonicalizeSourceUrl(root.sourceUrl)) {
      queue.push({ url: canonical, depth: 0, parentUrl: null });
    }
  }

  const visited = new Set<string>();
  const candidateMap = new Map<string, AutomationSourceCandidateInput>();
  const warnings: string[] = [];
  let fetchedDocuments = 0;

  while (queue.length && candidateMap.size < maxUrls) {
    if (fetchedDocuments >= maxDocuments) {
      warnings.push("sitemap_doc_limit");
      break;
    }
    const current = queue.shift()!;
    const canonicalSitemap = canonicalizeSourceUrl(current.url);
    if (!canonicalSitemap || visited.has(canonicalSitemap)) continue;
    if (!urlAllowed(canonicalSitemap)) {
      warnings.push("sitemap_host_blocked");
      continue;
    }
    if (current.depth > maxDepth) {
      warnings.push("sitemap_depth_limit");
      continue;
    }
    if (!robotsAllows(robots, canonicalSitemap)) {
      warnings.push("robots_disallowed");
      continue;
    }

    visited.add(canonicalSitemap);
    let fetched;
    try {
      fetched = await fetchWithRetry(root, fetchImpl, sleep, canonicalSitemap, urlAllowed);
      fetchedDocuments += 1;
    } catch (error) {
      if (current.depth === 0 && candidateMap.size === 0) throw error;
      warnings.push(safeErrorCode(error));
      continue;
    }

    let parsed;
    try {
      parsed = parseSitemapDocument(fetched.payload, fetched.finalUrl);
    } catch {
      if (current.depth === 0 && candidateMap.size === 0) {
        throw new DiscoveryFetchError("invalid_sitemap_xml");
      }
      warnings.push("invalid_sitemap_xml");
      continue;
    }

    if (parsed.type === "sitemapindex") {
      if (current.depth >= maxDepth) {
        if (parsed.entries.length) warnings.push("sitemap_depth_limit");
        continue;
      }
      const children = parsed.entries.slice(0, maxChildren);
      if (parsed.entries.length > maxChildren) warnings.push("sitemap_child_limit");
      for (const entry of children) {
        if (!urlAllowed(entry.loc)) {
          warnings.push("sitemap_host_blocked");
          continue;
        }
        queue.push({ url: entry.loc, depth: current.depth + 1, parentUrl: fetched.finalUrl });
      }
      continue;
    }

    for (const entry of parsed.entries) {
      if (candidateMap.size >= maxUrls) {
        warnings.push("sitemap_url_limit");
        break;
      }
      if (!urlAllowed(entry.loc) || !pathMatchesSitemapFilters(root, entry.loc)) continue;
      const existing = candidateMap.get(entry.loc);
      const pathMetadata = {
        rootId: root.id,
        rootSitemapUrl: root.sourceUrl,
        sitemapUrl: fetched.finalUrl,
        childSitemapUrl: current.parentUrl ? fetched.finalUrl : null,
        nestingDepth: current.depth,
        leafUrl: entry.loc,
        ...(entry.lastmod ? { lastmod: entry.lastmod } : {}),
        robotsState: robots.state,
      };
      if (existing) {
        const paths = Array.isArray(existing.metadata?.discoveryPaths)
          ? existing.metadata!.discoveryPaths as unknown[]
          : [existing.metadata];
        existing.metadata = { ...existing.metadata, discoveryPaths: [...paths, pathMetadata].slice(0, 20) };
        continue;
      }
      candidateMap.set(entry.loc, {
        candidateType: "SOURCE_CANDIDATE",
        discoveryType: "SITEMAP",
        sourceUrl: entry.loc,
        label: new URL(entry.loc).hostname,
        entityType: root.entityType,
        suggestedConnectorType: root.suggestedConnectorType ?? "CONTROLLED_HTML",
        reason: "URL bol explicitne uvedený v bounded sitemape schváleného discovery rootu.",
        metadata: {
          discoveredFrom: fetched.finalUrl,
          ...pathMetadata,
        },
      });
    }
  }

  return { candidates: [...candidateMap.values()], warnings: [...new Set(warnings)] };
}

function searchProviderError(error: unknown) {
  if (error instanceof AutomationSearchProviderError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return new AutomationSearchProviderError("TIMEOUT");
  return new AutomationSearchProviderError("PROVIDER_ERROR");
}

function searchUsageStatus(error: AutomationSearchProviderError): AutomationSearchUsageStatus {
  return error.code;
}

async function addressEnrichmentGovernanceAllowed(
  root: AutomationDiscoveryRoot,
  database: AutomationDiscoveryDatabase,
  now: Date,
) {
  if (root.discoveryType !== "SEARCH_PROVIDER" || root.entityType !== "DIRECTORY" || root.reviewStatus !== "APPROVED") {
    return false;
  }
  const governance = await getGovernanceState({ type: "DISCOVERY_ROOT", id: root.id }, database);
  const decision = evaluateGovernanceForActivation(governance, {
    recurring: true,
    cadenceMinutes: root.cadenceMinutes,
    storageFields: ["url", "title", "snippet", "metadata"],
  }, now);
  return decision.allowed;
}

async function addressEnrichmentSearchForRoot(
  root: AutomationDiscoveryRoot,
  options: DataAutomationDiscoverySweepOptions,
  discoveryRunId: number | null,
): Promise<DirectoryAddressSearch | undefined> {
  const now = options.now ? new Date(options.now) : new Date();
  if (!await addressEnrichmentGovernanceAllowed(
    root,
    options.database as AutomationDiscoveryDatabase,
    now,
  )) return undefined;

  const providerKey = typeof root.config.provider === "string" ? root.config.provider.trim() : "";
  if (!providerKey) return undefined;
  let provider: AutomationSearchProvider;
  try {
    provider = requireConfiguredSearchProvider(options.searchProvider, providerKey);
  } catch {
    return undefined;
  }
  const policy = automationSearchBudgetPolicy(root, now);

  return async (query: string) => {
    let request: AutomationSearchRequest;
    try {
      request = normalizeAutomationSearchRequest({
        query,
        maxResults: 5,
        locale: root.config.locale ?? "sk-SK",
        country: root.config.country ?? "SK",
      });
    } catch {
      return [];
    }
    const fingerprint = await automationSearchQueryFingerprint(provider.key, request);
    const dayBucket = now.toISOString().slice(0, 10);
    const operationKey = `address-enrichment:${dayBucket}:${root.id}:${fingerprint}`;
    const reservation = await reserveAutomationAddressEnrichmentRequest({
      operationKey,
      discoveryRunId,
      providerKey: provider.key,
      rootId: root.id,
      entityType: root.entityType,
      queryFingerprint: fingerprint,
      now,
      globalDailyLimit: policy.globalDailyRequests,
      entityDailyLimit: policy.entityDailyRequests,
      addressEnrichmentDailyLimit: policy.addressEnrichmentDailyRequests,
    }, options.database as AutomationDiscoveryDatabase);

    if (!reservation.reserved) {
      console.info(JSON.stringify({
        event: "data_automation_address_enrichment_search_skip",
        rootKey: root.rootKey,
        fingerprint,
        status: reservation.reason,
      }));
      return [];
    }

    try {
      const results = await provider.search(request);
      if (!Array.isArray(results)) throw new AutomationSearchProviderError("INVALID_RESPONSE");
      await finalizeAutomationSearchUsage({
        operationKey,
        status: results.length ? "SUCCESS" : "EMPTY",
        resultCount: results.length,
        now,
      }, options.database as AutomationDiscoveryDatabase);
      return results.slice(0, 5);
    } catch (rawError) {
      const error = searchProviderError(rawError);
      await finalizeAutomationSearchUsage({
        operationKey,
        status: searchUsageStatus(error),
        resultCount: 0,
        now,
      }, options.database as AutomationDiscoveryDatabase);
      console.info(JSON.stringify({
        event: "data_automation_address_enrichment_search_error",
        rootKey: root.rootKey,
        fingerprint,
        status: error.code,
      }));
      return [];
    }
  };
}

async function entityEnrichmentGovernanceAllowed(
  root: AutomationDiscoveryRoot,
  database: AutomationDiscoveryDatabase,
  now: Date,
) {
  if (
    root.discoveryType !== "SEARCH_PROVIDER"
    || !["DIRECTORY", "ORGANIZATION"].includes(root.entityType)
    || root.reviewStatus !== "APPROVED"
  ) return false;
  const governance = await getGovernanceState({ type: "DISCOVERY_ROOT", id: root.id }, database);
  const decision = evaluateGovernanceForActivation(governance, {
    recurring: true,
    cadenceMinutes: root.cadenceMinutes,
    storageFields: ["url", "title", "snippet", "metadata"],
  }, now);
  return decision.allowed;
}

async function entityEnrichmentSearchForRoot(
  root: AutomationDiscoveryRoot,
  options: DataAutomationDiscoverySweepOptions,
  discoveryRunId: number | null,
): Promise<EntityEnrichmentSearch | undefined> {
  const now = options.now ? new Date(options.now) : new Date();
  if (!await entityEnrichmentGovernanceAllowed(
    root,
    options.database as AutomationDiscoveryDatabase,
    now,
  )) return undefined;

  const providerKey = typeof root.config.provider === "string" ? root.config.provider.trim() : "";
  if (!providerKey) return undefined;
  let provider: AutomationSearchProvider;
  try {
    provider = requireConfiguredSearchProvider(options.searchProvider, providerKey);
  } catch {
    return undefined;
  }

  const policy = automationSearchBudgetPolicy(root, now);
  let runRequests = 0;

  return async (plan: AutomationEnrichmentSearchPlan) => {
    if (runRequests >= policy.entityEnrichmentRequestsPerRun) return [];

    let request: AutomationSearchRequest;
    try {
      request = normalizeAutomationSearchRequest({
        query: plan.query,
        maxResults: 5,
        locale: root.config.locale ?? "sk-SK",
        country: root.config.country ?? "SK",
        allowDomains: plan.sameDomain ? [plan.sameDomain] : undefined,
      });
    } catch {
      return [];
    }

    const fingerprint = await automationSearchQueryFingerprint(provider.key, request);
    const dayBucket = now.toISOString().slice(0, 10);
    const operationKey = `entity-enrichment:${dayBucket}:${root.id}:${plan.group.toLowerCase()}:${fingerprint}`;
    const reservation = await reserveAutomationEntityEnrichmentRequest({
      operationKey,
      discoveryRunId,
      providerKey: provider.key,
      rootId: root.id,
      entityType: root.entityType,
      queryFingerprint: fingerprint,
      now,
      globalDailyLimit: policy.globalDailyRequests,
      entityDailyLimit: policy.entityDailyRequests,
      entityEnrichmentDailyLimit: policy.entityEnrichmentDailyRequests,
    }, options.database as AutomationDiscoveryDatabase);

    if (!reservation.reserved) {
      console.info(JSON.stringify({
        event: "data_automation_entity_enrichment_search_skip",
        rootKey: root.rootKey,
        group: plan.group,
        fingerprint,
        status: reservation.reason,
      }));
      return [];
    }

    runRequests += 1;
    try {
      const results = await provider.search(request);
      if (!Array.isArray(results)) throw new AutomationSearchProviderError("INVALID_RESPONSE");
      await finalizeAutomationSearchUsage({
        operationKey,
        status: results.length ? "SUCCESS" : "EMPTY",
        resultCount: results.length,
        now,
      }, options.database as AutomationDiscoveryDatabase);
      return results.slice(0, 5);
    } catch (rawError) {
      const error = searchProviderError(rawError);
      await finalizeAutomationSearchUsage({
        operationKey,
        status: searchUsageStatus(error),
        resultCount: 0,
        now,
      }, options.database as AutomationDiscoveryDatabase);
      console.info(JSON.stringify({
        event: "data_automation_entity_enrichment_search_error",
        rootKey: root.rootKey,
        group: plan.group,
        fingerprint,
        status: error.code,
      }));
      return [];
    }
  };
}

function directoryRootForRefreshCandidate(
  roots: AutomationDiscoveryRoot[],
  candidate: Awaited<ReturnType<typeof listDirectRefreshCandidates>>[number],
) {
  if (candidate.entityType !== "DIRECTORY") return null;
  const category = candidate.category?.trim() ?? "";
  return roots.find((root) =>
    root.discoveryType === "SEARCH_PROVIDER"
    && root.reviewStatus === "APPROVED"
    && root.entityType === "DIRECTORY"
    && String(root.config.directoryCategory ?? "").trim() === category
  ) ?? null;
}

function enrichmentRootForRefreshCandidate(
  roots: AutomationDiscoveryRoot[],
  candidate: Awaited<ReturnType<typeof listDirectRefreshCandidates>>[number],
) {
  if (candidate.entityType === "DIRECTORY") return directoryRootForRefreshCandidate(roots, candidate);
  if (candidate.entityType !== "ORGANIZATION") return null;
  return roots.find((root) =>
    root.discoveryType === "SEARCH_PROVIDER"
    && root.reviewStatus === "APPROVED"
    && root.entityType === "ORGANIZATION"
  ) ?? null;
}

function searchRequestInputs(
  root: AutomationDiscoveryRoot,
  exclusions?: AutomationDiscoveryExclusionContext,
) {
  const configuredBlockDomains = Array.isArray(root.config.blockDomains)
    ? root.config.blockDomains.filter((value): value is string => typeof value === "string")
    : [];
  const blockDomains = [...new Set([
    ...configuredBlockDomains,
    ...(exclusions?.blockDomains ?? []),
  ])].slice(0, 25);
  const common = {
    maxResults: root.config.maxResults,
    locale: root.config.locale,
    country: root.config.country,
    freshness: root.config.freshness,
    allowDomains: root.config.allowDomains,
    blockDomains,
  };
  const configured = Array.isArray(root.config.queries) && root.config.queries.length
    ? root.config.queries
    : [root.config.query];
  return configured.map((item) => {
    if (typeof item === "string") return { ...common, query: item };
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return { ...common, ...(item as Record<string, unknown>) };
    }
    return { ...common, query: item };
  });
}

export function searchProviderCandidatesForRoot(input: {
  root: AutomationDiscoveryRoot;
  providerKey: string;
  request: AutomationSearchRequest;
  fingerprint: string;
  results: AutomationSearchResult[];
  operationKey: string;
}) {
  const directoryCategory = input.root.entityType === "DIRECTORY"
    && typeof input.root.config.directoryCategory === "string"
    ? input.root.config.directoryCategory.trim()
    : "";
  const helpCategory = input.root.entityType === "HELP_ITEM"
    && typeof input.root.config.helpCategory === "string"
    ? input.root.config.helpCategory.trim()
    : "";

  return automationSearchResultsToCandidates({
    providerKey: input.providerKey,
    request: input.request,
    fingerprint: input.fingerprint,
    results: input.results,
    entityType: input.root.entityType,
    suggestedConnectorType: input.root.suggestedConnectorType,
  }).map((candidate) => ({
    ...candidate,
    metadata: {
      ...(candidate.metadata ?? {}),
      ...(directoryCategory ? { directoryCategory } : {}),
      ...(helpCategory ? { helpCategory } : {}),
      searchOperationKey: input.operationKey,
    },
  }));
}

async function discoverCandidates(
  root: AutomationDiscoveryRoot,
  options: DataAutomationDiscoverySweepOptions,
  runId: number,
): Promise<DiscoveryCandidatesResult> {
  const maxCandidates = configNumber(root, "maxCandidates", 150, 1, 500);

  if (root.discoveryType === "SEARCH_PROVIDER") {
    const providerKey = typeof root.config.provider === "string" ? root.config.provider.trim() : "";
    if (!providerKey) throw new AutomationSearchProviderError("CONFIG_MISSING");
    const provider = requireConfiguredSearchProvider(options.searchProvider, providerKey);
    const mode = automationProductModeForRoot(root);
    const category = automationProductCategoryForRoot(root);
    const directEntity = mode === "DIRECT_ENTITY";
    const exclusions = await loadAutomationDiscoveryExclusions({
      entityType: root.entityType,
      directoryCategory: root.config.directoryCategory,
      directEntity,
    }, options.database);
    const policy = automationSearchBudgetPolicy(root);
    const requests = searchRequestInputs(root, exclusions).slice(0, policy.queriesPerRun);
    const fingerprints = new Set<string>();
    const candidates: AutomationSourceCandidateInput[] = [];
    let providerRequests = 0;
    let providerResultCount = 0;
    let localPrefilterCount = 0;
    let budgetBlocked = false;

    for (const requestInput of requests) {
      if (budgetBlocked || providerRequests >= policy.providerRequestsPerRun || candidates.length >= maxCandidates) break;
      const request = normalizeAutomationSearchRequest(requestInput);
      const fingerprint = await automationSearchQueryFingerprint(provider.key, request);
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);

      const cooldown = await getAutomationSearchCooldownState({
        providerKey: provider.key,
        queryFingerprint: fingerprint,
        baseCooldownMinutes: policy.queryCooldownMinutes,
        now: options.now ?? new Date(),
      }, options.database as AutomationDiscoveryDatabase);
      if (cooldown.blocked) {
        console.info(JSON.stringify({
          event: "data_automation_search_skip",
          rootKey: root.rootKey,
          provider: provider.key,
          fingerprint,
          status: cooldown.plateau ? "PLATEAU_COOLDOWN" : "QUERY_COOLDOWN",
          cooldownUntil: cooldown.cooldownUntil,
        }));
        continue;
      }

      const retries = configNumber(root, "retryMaxAttempts", 1, 0, 2);
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (providerRequests >= policy.providerRequestsPerRun) break;
        const now = options.now ? new Date(options.now) : new Date();
        const operationKey = `${runId}:${fingerprint}:${attempt + 1}`;
        const reservation = await reserveAutomationSearchRequest({
          operationKey,
          discoveryRunId: runId,
          providerKey: provider.key,
          rootId: root.id,
          entityType: root.entityType,
          queryFingerprint: fingerprint,
          now,
          globalDailyLimit: policy.globalDailyRequests,
          entityDailyLimit: policy.entityDailyRequests,
          rootDailyLimit: policy.rootDailyRequests,
        }, options.database as AutomationDiscoveryDatabase);

        if (!reservation.reserved) {
          console.info(JSON.stringify({
            event: "data_automation_search_skip",
            rootKey: root.rootKey,
            provider: provider.key,
            fingerprint,
            status: reservation.reason,
          }));
          budgetBlocked = reservation.reason !== "DUPLICATE_OPERATION";
          break;
        }

        providerRequests += 1;
        try {
          const results = await provider.search(request);
          if (!Array.isArray(results)) throw new AutomationSearchProviderError("INVALID_RESPONSE");
          const status: AutomationSearchUsageStatus = results.length ? "SUCCESS" : "EMPTY";
          await finalizeAutomationSearchUsage({
            operationKey,
            status,
            resultCount: results.length,
            now: options.now ? new Date(options.now) : new Date(),
          }, options.database as AutomationDiscoveryDatabase);
          providerResultCount += results.length;
          const mapped = searchProviderCandidatesForRoot({
            root,
            providerKey: provider.key,
            request,
            fingerprint,
            results,
            operationKey,
          });
          const filtered = mapped.filter((candidate) => {
            const excluded = automationDiscoveryCandidateExcluded(candidate.sourceUrl, exclusions, directEntity);
            if (excluded) localPrefilterCount += 1;
            return !excluded;
          });
          candidates.push(...filtered);
          break;
        } catch (rawError) {
          const error = searchProviderError(rawError);
          await finalizeAutomationSearchUsage({
            operationKey,
            status: searchUsageStatus(error),
            resultCount: 0,
            now: options.now ? new Date(options.now) : new Date(),
          }, options.database as AutomationDiscoveryDatabase);
          const retryable = error.code === "TIMEOUT" || error.code === "PROVIDER_ERROR";
          if (!retryable || attempt >= retries) throw error;
          await (options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(500 * (attempt + 1));
        }
      }
    }

    return {
      candidates: candidates.slice(0, maxCandidates),
      warnings: [],
      metrics: {
        category,
        discoveryMode: mode,
        exclusionEntityType: root.entityType,
        exclusionCategory: root.entityType === "DIRECTORY"
          ? String(root.config.directoryCategory ?? "") || null
          : category,
        exclusionCount: exclusions.exclusionCount,
        localPrefilterCount,
        providerResultCount,
      },
    };
  }

  if (options.internetTransport === "TAVILY_ONLY") {
    throw new AutomationSearchProviderError("TAVILY_ONLY_LEGACY_ROOT_UNSUPPORTED");
  }

  if (root.discoveryType === "SITEMAP") {
    return discoverSitemapCandidates(root, options, maxCandidates);
  }

  if (root.discoveryType === "RSS") {
    const urlAllowed = sitemapHostPolicy(root);
    const fetched = await fetchWithRetry(
      root,
      options.fetchImpl ?? fetch,
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      root.sourceUrl,
      urlAllowed,
    );
    const rawMaxAge = Number(root.config.maxEntryAgeDays);
    const maxEntryAgeDays = Number.isFinite(rawMaxAge) && rawMaxAge > 0
      ? Math.min(3650, Math.floor(rawMaxAge))
      : undefined;
    try {
      const discovered = rssDiscoveryCandidates({
        payload: fetched.payload,
        baseUrl: fetched.finalUrl,
        entityType: root.entityType,
        maxEntries: configNumber(root, "maxFeedEntries", 100, 1, 200),
        maxCandidates,
        maxEntryAgeDays,
        now: options.now ?? new Date(),
        urlAllowed,
        pathIncludes: configStrings(root, "pathIncludes"),
        pathExcludes: configStrings(root, "pathExcludes"),
      });
      return { candidates: discovered.candidates, warnings: discovered.warnings };
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_feed_xml") {
        throw new DiscoveryFetchError("invalid_feed_xml");
      }
      throw error;
    }
  }

  if (root.discoveryType !== "STRUCTURED_DIRECTORY") {
    throw new DiscoveryFetchError("automation_discovery_unknown_type");
  }

  let directoryConfig: StructuredDirectoryConfig;
  try {
    directoryConfig = parseStructuredDirectoryConfig(root.config);
  } catch {
    throw new DiscoveryFetchError("invalid_directory_config");
  }

  // Detail-page N+1 fetching is deliberately not part of DISCOVERY-4A. The
  // config surface is reserved and bounded, but enabling it fails closed until
  // a dedicated extraction contract exists for detail pages.
  if (directoryConfig.detailFetch) {
    throw new DiscoveryFetchError("directory_detail_fetch_not_supported");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const urlAllowed = sitemapHostPolicy(root);
  const maxPages = Math.min(directoryConfig.pagination?.maxPages ?? 1, 10);
  const visited = new Set<string>();
  const candidatesByUrl = new Map<string, AutomationSourceCandidateInput>();
  const warnings = new Set<string>();
  let nextUrl = root.sourceUrl;
  let rowsSeen = 0;

  for (let pageIndex = 0; pageIndex < maxPages && nextUrl && candidatesByUrl.size < maxCandidates; pageIndex += 1) {
    const canonicalPage = canonicalizeSourceUrl(nextUrl);
    if (!canonicalPage || visited.has(canonicalPage)) {
      warnings.add("directory_pagination_loop");
      break;
    }
    if (!urlAllowed(canonicalPage)) {
      warnings.add("directory_host_blocked");
      break;
    }
    visited.add(canonicalPage);

    const fetched = await fetchWithRetry(root, fetchImpl, sleep, canonicalPage, urlAllowed);
    let payload: unknown = fetched.payload;
    if (directoryConfig.format === "JSON") {
      try {
        payload = JSON.parse(fetched.payload);
      } catch {
        throw new DiscoveryFetchError("invalid_directory_response");
      }
    }

    const remainingRows = Math.max(0, directoryConfig.maxRows - rowsSeen);
    if (remainingRows <= 0) {
      warnings.add("directory_row_limit");
      break;
    }
    const parsed = structuredDirectoryDiscovery({
      payload,
      baseUrl: fetched.finalUrl,
      entityType: root.entityType,
      config: { ...directoryConfig, maxRows: remainingRows },
      pageIndex,
      maxCandidates: Math.max(1, maxCandidates - candidatesByUrl.size),
      urlAllowed,
      suggestedConnectorType: root.suggestedConnectorType,
    });
    rowsSeen += parsed.stats.rowsParsed;
    parsed.warnings.forEach((warning) => warnings.add(warning));

    for (const candidate of parsed.candidates) {
      const existing = candidatesByUrl.get(candidate.sourceUrl);
      if (!existing) {
        candidatesByUrl.set(candidate.sourceUrl, candidate);
        continue;
      }
      const paths = Array.isArray(existing.metadata?.discoveryPaths)
        ? existing.metadata!.discoveryPaths.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        : [existing.metadata ?? {}];
      const candidatePath = candidate.metadata ?? {};
      const pathKey = JSON.stringify([
        candidatePath.directoryPageUrl ?? "",
        candidatePath.rowIdentity ?? candidate.sourceUrl,
      ]);
      const hasPath = paths.some((path) => JSON.stringify([
        path.directoryPageUrl ?? "",
        path.rowIdentity ?? existing.sourceUrl,
      ]) === pathKey);
      existing.metadata = {
        ...(existing.metadata ?? {}),
        discoveryPaths: hasPath ? paths : [...paths, candidatePath].slice(0, 20),
      };
    }

    if (rowsSeen >= directoryConfig.maxRows) {
      warnings.add("directory_row_limit");
      break;
    }

    const proposedNext = structuredDirectoryNextPageUrl({
      payload: fetched.payload,
      currentUrl: fetched.finalUrl,
      config: directoryConfig,
      nextPageNumber: pageIndex + 1,
    });
    if (!proposedNext) break;
    if (!urlAllowed(proposedNext)) {
      warnings.add("directory_host_blocked");
      break;
    }
    nextUrl = proposedNext;
    if (pageIndex + 1 >= maxPages) warnings.add("directory_page_limit");
  }

  return {
    candidates: [...candidatesByUrl.values()].slice(0, maxCandidates),
    warnings: [...warnings],
  };
}


function evidenceMetadataValue(candidate: AutomationSourceCandidateInput, keys: string[]) {
  const metadata = candidate.metadata ?? {};
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function evidenceRank(candidate: AutomationSourceCandidateInput) {
  const metadata = candidate.metadata ?? {};
  for (const key of ["resultRank", "rank"]) {
    const value = Number(metadata[key]);
    if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return null;
}

export function discoveryEvidenceContext(
  root: AutomationDiscoveryRoot,
  candidate: AutomationSourceCandidateInput,
) {
  const discoveredFrom = evidenceMetadataValue(candidate, ["discoveredFrom", "feedUrl", "sitemapUrl", "directoryUrl"])
    ?? root.sourceUrl
    ?? root.rootKey;
  const externalId = evidenceMetadataValue(candidate, ["externalId", "guid", "id"]);
  let context: string;

  if (root.discoveryType === "SEARCH_PROVIDER") {
    const provider = evidenceMetadataValue(candidate, ["searchProvider"]) ?? "unconfigured";
    const query = evidenceMetadataValue(candidate, ["normalizedQuery"]);
    const fingerprint = evidenceMetadataValue(candidate, ["queryFingerprint"]);
    context = fingerprint
      ? `provider:${provider}|query:${query ?? ""}|fingerprint:${fingerprint}`
      : `provider:${provider}|root:${root.rootKey}`;
  } else if (root.discoveryType === "RSS") {
    const entryUrl = evidenceMetadataValue(candidate, ["entryUrl"]) ?? candidate.sourceUrl;
    const feedType = evidenceMetadataValue(candidate, ["feedType"]) ?? "RSS";
    context = externalId
      ? `feed:${discoveredFrom}|type:${feedType}|item:${externalId}|url:${entryUrl}`
      : `feed:${discoveredFrom}|type:${feedType}|url:${entryUrl}`;
  } else if (root.discoveryType === "SITEMAP") {
    const metadata = candidate.metadata ?? {};
    const rootSitemap = typeof metadata.rootSitemapUrl === "string" ? metadata.rootSitemapUrl : (root.sourceUrl ?? root.rootKey);
    const sitemapUrl = typeof metadata.sitemapUrl === "string" ? metadata.sitemapUrl : discoveredFrom;
    const depth = Number.isInteger(metadata.nestingDepth) ? Number(metadata.nestingDepth) : 0;
    const leafUrl = typeof metadata.leafUrl === "string" ? metadata.leafUrl : candidate.sourceUrl;
    context = `root:${rootSitemap}|sitemap:${sitemapUrl}|depth:${depth}|leaf:${leafUrl}`;
  } else {
    const metadata = candidate.metadata ?? {};
    if (metadata.schemaVersion === 2) {
      const pageUrl = typeof metadata.directoryPageUrl === "string" ? metadata.directoryPageUrl : discoveredFrom;
      const rowIdentity = typeof metadata.rowIdentity === "string" && metadata.rowIdentity
        ? metadata.rowIdentity
        : candidate.sourceUrl;
      context = `root:${root.rootKey}|page:${pageUrl}|row:${rowIdentity}`;
    } else {
      context = externalId ? `directory:${discoveredFrom}|record:${externalId}` : `directory:${discoveredFrom}`;
    }
  }

  const fingerprint = root.discoveryType === "SEARCH_PROVIDER"
    ? evidenceMetadataValue(candidate, ["queryFingerprint"])
    : null;
  const provider = root.discoveryType === "SEARCH_PROVIDER"
    ? evidenceMetadataValue(candidate, ["searchProvider"])
    : null;

  return {
    discoveryContext: context.slice(0, 1000),
    discoveryContextKey: root.discoveryType === "SEARCH_PROVIDER" && fingerprint
      ? `SEARCH_PROVIDER:${provider ?? "unknown"}:${fingerprint}`.slice(0, 500)
      : `${root.discoveryType}:${context}`.slice(0, 500),
    resultRank: evidenceRank(candidate),
    title: evidenceMetadataValue(candidate, ["title"]) ?? candidate.label,
    snippet: evidenceMetadataValue(candidate, ["snippet", "description"]),
    externalId,
    metadata: candidate.metadata ?? {},
  };
}

async function runDiscoveryRoot(
  root: AutomationDiscoveryRoot,
  options: DataAutomationDiscoverySweepOptions,
): Promise<DiscoveryRunSummary> {
  const startedAt = options.now ? new Date(options.now) : new Date();
  const runId = await beginAutomationDiscoveryRun(root.id, startedAt.toISOString(), options.database as AutomationDiscoveryDatabase);
  const category = automationProductCategoryForRoot(root);
  const discoveryMode = automationProductModeForRoot(root);
  let candidateCount = 0;
  let reviewableCandidateCount = 0;
  let duplicateCandidateCount = 0;
  let providerResultCount = 0;
  let localPrefilterCount = 0;
  let exclusionCount = 0;
  let canonicalDuplicateCount = 0;
  let newEntityCount = 0;
  let updateSuggestionCount = 0;
  let possibleDuplicateCount = 0;
  let addressVerifiedExactCount = 0;
  let addressNoExactCount = 0;
  const operationalOutcomes: AutomationDiscoveryOutcomeInput[] = [];
  let errors = 0;
  let status: DiscoveryRunSummary["status"] = "SUCCESS";
  let errorSummary: string | null = null;
  const searchMetrics = new Map<string, { newUnique: number; duplicates: number }>();

  try {
    const discovery = await discoverCandidates(root, options, runId);
    const candidates = discovery.candidates;
    candidateCount = candidates.length;
    providerResultCount = discovery.metrics?.providerResultCount ?? 0;
    localPrefilterCount = discovery.metrics?.localPrefilterCount ?? 0;
    exclusionCount = discovery.metrics?.exclusionCount ?? 0;
    if (discovery.warnings.length) {
      errors += discovery.warnings.length;
      status = candidates.length ? "PARTIAL" : "FAILED";
      errorSummary = discovery.warnings[0] ?? null;
    }

    if (discoveryMode === "DIRECT_ENTITY") {
      const exclusions = await loadAutomationDiscoveryExclusions({
        entityType: root.entityType,
        directoryCategory: root.config.directoryCategory,
        directEntity: true,
      }, options.database);
      exclusionCount = Math.max(exclusionCount, exclusions.exclusionCount);
      const enrichmentSearch = await entityEnrichmentSearchForRoot(root, options, runId);

      for (const candidate of candidates) {
        try {
          if (automationDiscoveryCandidateExcluded(candidate.sourceUrl, exclusions, true)) {
            localPrefilterCount += 1;
            canonicalDuplicateCount += 1;
            operationalOutcomes.push({
              outcomeType: "EXISTING_CANONICAL",
              canonicalEntityId: null,
              label: candidate.label,
              sourceUrl: candidate.sourceUrl,
              matchReasonCode: "SAME_WEB",
            });
            continue;
          }
          if (root.entityType !== "DIRECTORY" && root.entityType !== "ORGANIZATION") {
            throw new Error("automation_direct_entity_type_not_supported");
          }
          const directoryCategory = root.entityType === "DIRECTORY"
            ? String(candidate.metadata?.directoryCategory ?? root.config.directoryCategory ?? "").trim()
            : null;
          const addressSearch = root.entityType === "DIRECTORY"
            ? await addressEnrichmentSearchForRoot(root, options, runId)
            : undefined;
          const searchCandidateTitle = root.discoveryType === "SEARCH_PROVIDER"
            ? String(candidate.metadata?.title ?? candidate.label ?? "").trim() || null
            : null;
          const searchSnippet = root.discoveryType === "SEARCH_PROVIDER"
            && typeof candidate.metadata?.snippet === "string"
              ? candidate.metadata.snippet
              : null;
          const ingested = await ingestDirectEntityUrl({
            entityType: root.entityType,
            sourceUrl: candidate.sourceUrl,
            label: candidate.label,
            searchCandidateTitle,
            searchSnippet,
            directoryCategory,
            database: options.database,
            fetchImpl: options.fetchImpl,
            tavilyApiKey: options.tavilyApiKey,
            internetTransport: options.internetTransport,
            now: startedAt,
            provenanceType: "DIRECT_ENTITY_DISCOVERY",
            addressSearch,
            enrichmentSearch,
            addressEvidenceText: searchSnippet,
          });
          canonicalDuplicateCount += ingested.existingCanonicalMatches;
          newEntityCount += ingested.newEntities;
          updateSuggestionCount += ingested.updateSuggestions;
          possibleDuplicateCount += ingested.possibleDuplicates;
          addressVerifiedExactCount += ingested.addressVerifiedExact;
          addressNoExactCount += ingested.addressNoExact;
          operationalOutcomes.push(...ingested.outcomes);
        } catch (error) {
          errors += 1;
          status = "PARTIAL";
          errorSummary ??= safeErrorCode(error);
        }
      }
    } else {
      for (const candidate of candidates) {
        try {
          const stored = await upsertAutomationSourceCandidate({
            candidate,
            discoveredFromSourceId: null,
            detectedAt: startedAt,
          }, options.database);
          const paths = Array.isArray(candidate.metadata?.discoveryPaths)
            ? candidate.metadata!.discoveryPaths.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
            : [];
          const evidenceCandidates = paths.length
            ? paths.map((path) => ({ ...candidate, metadata: { ...candidate.metadata, ...path } }))
            : [candidate];
          for (const evidenceCandidate of evidenceCandidates) {
            const evidence = discoveryEvidenceContext(root, evidenceCandidate);
            await upsertAutomationSourceCandidateEvidence({
              candidateId: stored.id,
              rootId: root.id,
              discoveryRunId: runId,
              discoveryType: root.discoveryType,
              ...evidence,
              seenAt: startedAt,
            }, options.database);
          }
          const operationKey = typeof candidate.metadata?.searchOperationKey === "string"
            ? candidate.metadata.searchOperationKey
            : null;
          if (operationKey) {
            const metrics = searchMetrics.get(operationKey) ?? { newUnique: 0, duplicates: 0 };
            const newlyCreated = stored.firstDetectedAt === startedAt.toISOString();
            if (newlyCreated) metrics.newUnique += 1;
            else metrics.duplicates += 1;
            searchMetrics.set(operationKey, metrics);
          }
          if (stored.duplicateSourceId) duplicateCandidateCount += 1;
          else if (stored.reviewStatus === "NEW") reviewableCandidateCount += 1;
        } catch (error) {
          errors += 1;
          status = "PARTIAL";
          errorSummary ??= safeErrorCode(error);
        }
      }
    }
  } catch (error) {
    errors += 1;
    status = "FAILED";
    errorSummary = safeErrorCode(error);
  }

  for (const [operationKey, metrics] of searchMetrics) {
    try {
      await updateAutomationSearchUsageCandidateMetrics({
        operationKey,
        newUniqueCandidateCount: metrics.newUnique,
        duplicateCandidateCount: metrics.duplicates,
      }, options.database as AutomationDiscoveryDatabase);
    } catch (error) {
      errors += 1;
      status = status === "FAILED" ? status : "PARTIAL";
      errorSummary ??= safeErrorCode(error);
    }
  }

  const completedAt = options.now ? new Date(options.now) : new Date();
  const searchMetricsSummary = await getAutomationDiscoveryRunSearchMetrics(
    runId,
    options.database as AutomationDiscoveryDatabase,
  );
  try {
    await recordAutomationDiscoveryOutcomes({
      runId,
      rootId: root.id,
      categorySlug: category,
      entityType: root.entityType,
      outcomes: operationalOutcomes,
      createdAt: completedAt.toISOString(),
    }, options.database as AutomationDiscoveryDatabase);
  } catch (error) {
    errors += 1;
    status = status === "FAILED" ? status : "PARTIAL";
    errorSummary ??= safeErrorCode(error);
  }
  const health = await finishAutomationDiscoveryRun({
    runId,
    root,
    status,
    candidateCount,
    reviewableCandidateCount,
    duplicateCandidateCount,
    searchRequestCount: searchMetricsSummary.requestCount,
    searchResultCount: searchMetricsSummary.resultCount,
    providerResultCount,
    localPrefilterCount,
    exclusionCount,
    canonicalDuplicateCount,
    newEntityCount,
    updateSuggestionCount,
    possibleDuplicateCount,
    addressVerifiedExactCount,
    addressNoExactCount,
    errorCount: errors,
    errorSummary,
    startedAt,
    completedAt,
  }, options.database as AutomationDiscoveryDatabase);
  const summary: DiscoveryRunSummary = {
    runId,
    rootId: root.id,
    rootKey: root.rootKey,
    status,
    candidates: candidateCount,
    reviewableCandidates: reviewableCandidateCount,
    duplicateCandidates: duplicateCandidateCount,
    requestCount: searchMetricsSummary.requestCount,
    resultCount: searchMetricsSummary.resultCount,
    providerResultCount,
    localPrefilterCount,
    exclusionCount,
    canonicalDuplicateCount,
    newEntityCount,
    updateSuggestionCount,
    possibleDuplicateCount,
    addressVerifiedExactCount,
    addressNoExactCount,
    category,
    discoveryMode,
    errors,
    errorSummary,
    nextCheckAt: health.nextCheckAt,
  };
  console.info(JSON.stringify({
    event: "data_automation_discovery_root",
    ...summary,
    exclusionEntityType: root.entityType,
    exclusionCategory: root.entityType === "DIRECTORY"
      ? String(root.config.directoryCategory ?? "") || null
      : category,
  }));
  return summary;
}

function missingDiscoverySchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*automation_discovery_roots/i.test(message);
}

export async function runAutomationDiscoveryRootCanary(input: {
  rootId: number;
  options: DataAutomationDiscoverySweepOptions;
}) {
  const root = await getAutomationDiscoveryRoot(
    input.rootId,
    input.options.database as AutomationDiscoveryDatabase,
  );
  if (!root) throw new Error("automation_discovery_root_not_found");
  if (!root.enabled) throw new Error("automation_discovery_root_disabled");
  if (root.reviewStatus !== "APPROVED") throw new Error("automation_discovery_review_required");

  const now = input.options.now ?? new Date();
  const dueRoot = await getDueAutomationDiscoveryRoot(
    root.id,
    input.options.database as AutomationDiscoveryDatabase,
    now,
  );
  if (!dueRoot) throw new Error("automation_discovery_root_not_due_or_governance_blocked");
  const claimedRoot = await claimDueAutomationDiscoveryRoot(
    dueRoot,
    input.options.database as AutomationDiscoveryDatabase,
    now,
  );
  if (!claimedRoot) throw new Error("automation_discovery_root_already_claimed");

  return runDiscoveryRoot(claimedRoot, input.options);
}

type DirectRefreshRunSummary = {
  category: string;
  checked: number;
  canonicalDuplicates: number;
  updateSuggestions: number;
  errors: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  cursorEntityId: number;
};

function missingProductModelSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*automation_direct_refresh_settings/i.test(message)
    || /no such table:\s*canonical_external_provenance/i.test(message)
    || /no such table:\s*automation_update_suggestions/i.test(message);
}

async function runDirectEntityRefresh(
  setting: Awaited<ReturnType<typeof listDueDirectEntityRefreshSettings>>[number],
  options: DataAutomationDiscoverySweepOptions,
): Promise<DirectRefreshRunSummary> {
  const batchSize = 20;
  const now = options.now ? new Date(options.now) : new Date();
  const candidates = await listDirectRefreshCandidates(setting, options.database, batchSize);
  const refreshSearchRoots = await listAutomationDiscoveryRoots(
    options.database as AutomationDiscoveryDatabase,
    100,
    now,
  );
  const refreshEnrichmentSearches = new Map<number, EntityEnrichmentSearch | undefined>();
  let checked = 0;
  let canonicalDuplicates = 0;
  let updateSuggestions = 0;
  let errors = 0;
  let status: DirectRefreshRunSummary["status"] = "SUCCESS";
  let errorCode: string | null = null;
  let lastEntityId = setting.cursorEntityId;

  for (const candidate of candidates) {
    checked += 1;
    lastEntityId = candidate.id;
    try {
      const searchRoot = enrichmentRootForRefreshCandidate(refreshSearchRoots, candidate);
      const addressSearch = searchRoot && candidate.entityType === "DIRECTORY"
        ? await addressEnrichmentSearchForRoot(searchRoot, options, null)
        : undefined;
      let enrichmentSearch: EntityEnrichmentSearch | undefined;
      if (searchRoot) {
        if (!refreshEnrichmentSearches.has(searchRoot.id)) {
          refreshEnrichmentSearches.set(
            searchRoot.id,
            await entityEnrichmentSearchForRoot(searchRoot, options, null),
          );
        }
        enrichmentSearch = refreshEnrichmentSearches.get(searchRoot.id);
      }
      const refreshed = await ingestDirectEntityUrl({
        entityType: candidate.entityType,
        sourceUrl: candidate.sourceUrl,
        label: `refresh:${candidate.id}`,
        directoryCategory: candidate.category,
        database: options.database,
        fetchImpl: options.fetchImpl,
        tavilyApiKey: options.tavilyApiKey,
        internetTransport: options.internetTransport,
        now,
        provenanceType: "DIRECT_ENTITY_REFRESH",
        expectedCanonicalEntityId: candidate.id,
        addressSearch,
        enrichmentSearch,
      });
      canonicalDuplicates += refreshed.canonicalDuplicates;
      updateSuggestions += refreshed.updateSuggestions;
    } catch (error) {
      errors += 1;
      status = "PARTIAL";
      errorCode ??= safeErrorCode(error);
    }
  }

  await finishDirectEntityRefreshSetting({
    setting,
    lastEntityId,
    batchWasFull: candidates.length >= batchSize,
    status,
    errorCode,
    checkedCount: checked,
    updateSuggestionCount: updateSuggestions,
    errorCount: errors,
    now,
  }, options.database);

  const summary = {
    category: setting.categorySlug,
    checked,
    canonicalDuplicates,
    updateSuggestions,
    errors,
    status,
    cursorEntityId: candidates.length >= batchSize ? lastEntityId : 0,
  };
  console.info(JSON.stringify({ event: "data_automation_direct_refresh", ...summary }));
  return summary;
}

export async function runDataAutomationDiscoverySweep(options: DataAutomationDiscoverySweepOptions) {
  let roots: AutomationDiscoveryRoot[];
  try {
    roots = await listDueAutomationDiscoveryRoots(
      options.database as AutomationDiscoveryDatabase,
      options.now ?? new Date(),
      options.internetTransport === "TAVILY_ONLY"
        ? 50
        : DATA_AUTOMATION_MAX_DISCOVERY_ROOTS_PER_SWEEP,
    );
    if (options.internetTransport === "TAVILY_ONLY") {
      // Legacy RSS/SITEMAP/STRUCTURED_DIRECTORY roots are intentionally not
      // executed in production: they perform direct third-party HTTP reads.
      // Tavily SEARCH_PROVIDER roots are the only internet discovery transport.
      roots = roots
        .filter((root) => root.discoveryType === "SEARCH_PROVIDER")
        .slice(0, DATA_AUTOMATION_MAX_DISCOVERY_ROOTS_PER_SWEEP);
    }
  } catch (error) {
    if (missingDiscoverySchema(error)) {
      return { roots: 0, success: 0, partial: 0, failed: 0, candidates: 0, reviewableCandidates: 0, duplicateCandidates: 0, errors: 0, schemaReady: false, runs: [] as DiscoveryRunSummary[] };
    }
    throw error;
  }

  const runs: DiscoveryRunSummary[] = [];
  for (const root of roots) {
    try {
      const claimedRoot = await claimDueAutomationDiscoveryRoot(
        root,
        options.database as AutomationDiscoveryDatabase,
        options.now ?? new Date(),
      );
      if (!claimedRoot) continue;
      runs.push(await runDiscoveryRoot(claimedRoot, options));
    } catch (error) {
      console.error(JSON.stringify({
        event: "data_automation_discovery_root",
        rootKey: root.rootKey,
        result: "isolated_failure",
        error: safeErrorCode(error),
      }));
      runs.push({
        runId: 0,
        rootId: root.id,
        rootKey: root.rootKey,
        status: "FAILED",
        candidates: 0,
        reviewableCandidates: 0,
        duplicateCandidates: 0,
        requestCount: 0,
        resultCount: 0,
        providerResultCount: 0,
        localPrefilterCount: 0,
        exclusionCount: 0,
        canonicalDuplicateCount: 0,
        newEntityCount: 0,
        updateSuggestionCount: 0,
        possibleDuplicateCount: 0,
        addressVerifiedExactCount: 0,
        addressNoExactCount: 0,
        category: automationProductCategoryForRoot(root),
        discoveryMode: automationProductModeForRoot(root),
        errors: 1,
        errorSummary: safeErrorCode(error),
        nextCheckAt: root.nextCheckAt,
      });
    }
  }

  const directRefreshRuns: DirectRefreshRunSummary[] = [];
  try {
    const refreshSettings = await listDueDirectEntityRefreshSettings(
      options.database,
      options.now ?? new Date(),
      1,
    );
    for (const setting of refreshSettings) {
      const claimedSetting = await claimDueDirectEntityRefreshSetting(
        setting,
        options.database,
        options.now ?? new Date(),
      );
      if (!claimedSetting) continue;
      directRefreshRuns.push(await runDirectEntityRefresh(claimedSetting, options));
    }
  } catch (error) {
    if (!missingProductModelSchema(error)) throw error;
  }

  return {
    roots: runs.length,
    success: runs.filter((run) => run.status === "SUCCESS").length,
    partial: runs.filter((run) => run.status === "PARTIAL").length,
    failed: runs.filter((run) => run.status === "FAILED").length,
    candidates: runs.reduce((sum, run) => sum + run.candidates, 0),
    reviewableCandidates: runs.reduce((sum, run) => sum + run.reviewableCandidates, 0),
    duplicateCandidates: runs.reduce((sum, run) => sum + run.duplicateCandidates, 0),
    errors: runs.reduce((sum, run) => sum + run.errors, 0),
    schemaReady: true,
    runs,
    directRefreshRuns,
  };
}
