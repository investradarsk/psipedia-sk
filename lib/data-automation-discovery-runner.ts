import {
  htmlLinkDirectoryDiscovery,
  requireConfiguredSearchProvider,
  rssDiscoveryAdapter,
  sitemapDiscoveryAdapter,
  structuredDirectoryDiscovery,
  type AutomationSearchProvider,
  type AutomationSourceCandidateInput,
} from "./data-automation-discovery.ts";
import {
  beginAutomationDiscoveryRun,
  finishAutomationDiscoveryRun,
  listDueAutomationDiscoveryRoots,
  type AutomationDiscoveryDatabase,
  type AutomationDiscoveryRoot,
} from "./data-automation-discovery-store.ts";
import { canonicalizeSourceUrl, isSafeAutomationSourceUrl } from "./data-automation.ts";
import {
  upsertAutomationSourceCandidate,
  upsertAutomationSourceCandidateEvidence,
} from "./data-automation-source-store.ts";

export const DATA_AUTOMATION_MAX_DISCOVERY_ROOTS_PER_SWEEP = 2;
const MAX_DISCOVERY_BYTES = 1_000_000;
const MAX_REDIRECT_HOPS = 3;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type AutomationDiscoveryFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type DataAutomationDiscoverySweepOptions = {
  database: D1Database;
  now?: Date;
  fetchImpl?: AutomationDiscoveryFetch;
  searchProvider?: AutomationSearchProvider;
  sleep?: (ms: number) => Promise<void>;
};

type DiscoveryRunSummary = {
  rootId: number;
  rootKey: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  candidates: number;
  reviewableCandidates: number;
  duplicateCandidates: number;
  errors: number;
  nextCheckAt: string | null;
};

class DiscoveryFetchError extends Error {
  constructor(public readonly code: string, public readonly retryable = false) {
    super(code);
    this.name = "DiscoveryFetchError";
  }
}

function safeErrorCode(error: unknown) {
  if (error instanceof DiscoveryFetchError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 180) || "automation_discovery_unknown_error";
}

function configNumber(root: AutomationDiscoveryRoot, key: string, fallback: number, min: number, max: number) {
  const value = Number(root.config[key]);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
}

function configBoolean(root: AutomationDiscoveryRoot, key: string, fallback = false) {
  const value = root.config[key];
  return typeof value === "boolean" ? value : fallback;
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
    const adapter = String(root.config.adapter ?? "");
    if (adapter === "HTML_LINK_DIRECTORY") {
      if (!value.includes("text/html") && !value.includes("application/xhtml+xml")) {
        throw new DiscoveryFetchError("discovery_invalid_content_type");
      }
    } else if (!value.includes("application/json") && !value.includes("+json")) {
      throw new DiscoveryFetchError("discovery_invalid_content_type");
    }
  }
}

async function fetchDiscoveryPayload(
  root: AutomationDiscoveryRoot,
  fetchImpl: AutomationDiscoveryFetch,
) {
  if (!root.sourceUrl || !isSafeAutomationSourceUrl(root.sourceUrl)) {
    throw new DiscoveryFetchError("discovery_unsafe_or_missing_url");
  }

  let currentUrl = root.sourceUrl;
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
          accept: root.discoveryType === "STRUCTURED_DIRECTORY" && String(root.config.adapter ?? "") !== "HTML_LINK_DIRECTORY"
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
      if (!isSafeAutomationSourceUrl(target.toString())) throw new DiscoveryFetchError("discovery_redirect_blocked");
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
) {
  const retries = configNumber(root, "retryMaxAttempts", 1, 0, 3);
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchDiscoveryPayload(root, fetchImpl);
    } catch (error) {
      lastError = error;
      if (!(error instanceof DiscoveryFetchError) || !error.retryable || attempt >= retries) throw error;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function discoverCandidates(
  root: AutomationDiscoveryRoot,
  options: DataAutomationDiscoverySweepOptions,
): Promise<AutomationSourceCandidateInput[]> {
  const maxCandidates = configNumber(root, "maxCandidates", 150, 1, 500);

  if (root.discoveryType === "SEARCH_PROVIDER") {
    const provider = requireConfiguredSearchProvider(options.searchProvider);
    const query = String(root.config.query ?? "").trim();
    if (!query) throw new Error("automation_discovery_query_missing");
    const candidates = await provider.discover({ query, entityType: root.entityType, limit: maxCandidates });
    return candidates.slice(0, maxCandidates);
  }

  const fetched = await fetchWithRetry(
    root,
    options.fetchImpl ?? fetch,
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  );

  if (root.discoveryType === "SITEMAP") {
    return sitemapDiscoveryAdapter({
      payload: fetched.payload,
      baseUrl: fetched.finalUrl,
      entityType: root.entityType,
    }).slice(0, maxCandidates);
  }

  if (root.discoveryType === "RSS") {
    return rssDiscoveryAdapter({
      payload: fetched.payload,
      baseUrl: fetched.finalUrl,
      entityType: root.entityType,
    }).slice(0, maxCandidates);
  }

  if (String(root.config.adapter ?? "") === "HTML_LINK_DIRECTORY") {
    return htmlLinkDirectoryDiscovery({
      payload: fetched.payload,
      baseUrl: fetched.finalUrl,
      entityType: root.entityType,
      suggestedConnectorType: root.suggestedConnectorType,
      externalOnly: configBoolean(root, "externalOnly", true),
      excludeHosts: configStrings(root, "excludeHosts"),
      maxCandidates,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fetched.payload);
  } catch {
    throw new DiscoveryFetchError("discovery_structured_json_invalid");
  }
  return structuredDirectoryDiscovery({
    payload: parsed,
    baseUrl: fetched.finalUrl,
    entityType: root.entityType,
    recordsPath: typeof root.config.recordsPath === "string" ? root.config.recordsPath : undefined,
    urlField: typeof root.config.urlField === "string" ? root.config.urlField : undefined,
    labelField: typeof root.config.labelField === "string" ? root.config.labelField : undefined,
    suggestedConnectorType: root.suggestedConnectorType,
  }).slice(0, maxCandidates);
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
    const query = String(root.config.query ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    context = query ? `query:${query}` : `root:${root.rootKey}`;
  } else if (root.discoveryType === "RSS") {
    context = externalId ? `feed:${discoveredFrom}|item:${externalId}` : `feed:${discoveredFrom}`;
  } else if (root.discoveryType === "SITEMAP") {
    context = `sitemap:${discoveredFrom}`;
  } else {
    context = externalId ? `directory:${discoveredFrom}|record:${externalId}` : `directory:${discoveredFrom}`;
  }

  return {
    discoveryContext: context.slice(0, 1000),
    discoveryContextKey: `${root.discoveryType}:${context}`.slice(0, 500),
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
  let candidateCount = 0;
  let reviewableCandidateCount = 0;
  let duplicateCandidateCount = 0;
  let errors = 0;
  let status: DiscoveryRunSummary["status"] = "SUCCESS";
  let errorSummary: string | null = null;

  try {
    const candidates = await discoverCandidates(root, options);
    candidateCount = candidates.length;
    for (const candidate of candidates) {
      try {
        const stored = await upsertAutomationSourceCandidate({
          candidate,
          discoveredFromSourceId: null,
          detectedAt: startedAt,
        }, options.database);
        const evidence = discoveryEvidenceContext(root, candidate);
        await upsertAutomationSourceCandidateEvidence({
          candidateId: stored.id,
          rootId: root.id,
          discoveryRunId: runId,
          discoveryType: root.discoveryType,
          ...evidence,
          seenAt: startedAt,
        }, options.database);
        if (stored.duplicateSourceId) duplicateCandidateCount += 1;
        else if (stored.reviewStatus === "NEW") reviewableCandidateCount += 1;
      } catch (error) {
        errors += 1;
        status = "PARTIAL";
        errorSummary ??= safeErrorCode(error);
      }
    }
  } catch (error) {
    errors += 1;
    status = "FAILED";
    errorSummary = safeErrorCode(error);
  }

  const completedAt = options.now ? new Date(options.now) : new Date();
  const health = await finishAutomationDiscoveryRun({
    runId,
    root,
    status,
    candidateCount,
    reviewableCandidateCount,
    duplicateCandidateCount,
    errorCount: errors,
    errorSummary,
    startedAt,
    completedAt,
  }, options.database as AutomationDiscoveryDatabase);

  const summary = {
    rootId: root.id,
    rootKey: root.rootKey,
    status,
    candidates: candidateCount,
    reviewableCandidates: reviewableCandidateCount,
    duplicateCandidates: duplicateCandidateCount,
    errors,
    nextCheckAt: health.nextCheckAt,
  };
  console.info(JSON.stringify({ event: "data_automation_discovery_root", ...summary }));
  return summary;
}

function missingDiscoverySchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*automation_discovery_roots/i.test(message);
}

export async function runDataAutomationDiscoverySweep(options: DataAutomationDiscoverySweepOptions) {
  let roots: AutomationDiscoveryRoot[];
  try {
    roots = await listDueAutomationDiscoveryRoots(
      options.database as AutomationDiscoveryDatabase,
      options.now ?? new Date(),
      DATA_AUTOMATION_MAX_DISCOVERY_ROOTS_PER_SWEEP,
    );
  } catch (error) {
    if (missingDiscoverySchema(error)) {
      return { roots: 0, success: 0, partial: 0, failed: 0, candidates: 0, reviewableCandidates: 0, duplicateCandidates: 0, errors: 0, schemaReady: false, runs: [] as DiscoveryRunSummary[] };
    }
    throw error;
  }

  const runs: DiscoveryRunSummary[] = [];
  for (const root of roots) {
    try {
      runs.push(await runDiscoveryRoot(root, options));
    } catch (error) {
      console.error(JSON.stringify({
        event: "data_automation_discovery_root",
        rootKey: root.rootKey,
        result: "isolated_failure",
        error: safeErrorCode(error),
      }));
      runs.push({
        rootId: root.id,
        rootKey: root.rootKey,
        status: "FAILED",
        candidates: 0,
        reviewableCandidates: 0,
        duplicateCandidates: 0,
        errors: 1,
        nextCheckAt: root.nextCheckAt,
      });
    }
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
  };
}
