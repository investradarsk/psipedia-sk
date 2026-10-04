import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  retryBackoffMs,
  sha256Hex,
  type AutomationExtractionCoverage,
  type AutomationSource,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import {
  automationUrlWithinApprovedSourceScope,
  type SourceScopedExtractionContract,
} from "./data-automation-source-scoped-extraction.ts";
import type {
  AutomationSourceProviderOperation,
  AutomationSourceProviderUsageStatus,
} from "./data-automation-source-provider-usage.ts";

export const TAVILY_CRAWL_ENDPOINT = "https://api.tavily.com/crawl";
export const TAVILY_EXTRACT_ENDPOINT = "https://api.tavily.com/extract";
export const TAVILY_EXTRACT_MAX_URLS = 20;

const MAX_RETRIES = 2;
const RAW_EXCERPT_MAX = 4000;
const DESCRIPTION_MAX = 5000;
const CONTENT_MAX = 250000;

export const tavilySourceScopedErrorCodes = [
  "TAVILY_CONFIG_MISSING",
  "TAVILY_AUTH_FAILED",
  "TAVILY_RATE_LIMITED",
  "TAVILY_TIMEOUT",
  "TAVILY_PROVIDER_ERROR",
  "TAVILY_INVALID_RESPONSE",
  "TAVILY_SCOPE_VIOLATION",
  "TAVILY_BUDGET_EXHAUSTED",
  "TAVILY_NO_USABLE_RESULTS",
] as const;

export type TavilySourceScopedErrorCode = typeof tavilySourceScopedErrorCodes[number];

export class TavilySourceScopedError extends Error {
  readonly code: TavilySourceScopedErrorCode;
  readonly retryable: boolean;

  constructor(code: TavilySourceScopedErrorCode, retryable = false) {
    super(code);
    this.name = "TavilySourceScopedError";
    this.code = code;
    this.retryable = retryable;
  }
}

type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type TavilySourceScopedRequestGate = {
  reserve(operation: AutomationSourceProviderOperation): Promise<{ operationKey: string } | null>;
  finalize(input: {
    operationKey: string;
    status: Exclude<AutomationSourceProviderUsageStatus, "RESERVED">;
    resultCount: number;
    acceptedCount: number;
    scopeRejectedCount: number;
  }): Promise<void>;
};

type ProviderOptions = {
  apiKey?: string;
  fetchImpl?: ProviderFetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

type ParsedPayload = {
  rows: Array<{ url: string; content: string }>;
  invalidCount: number;
  failedCount: number;
  responseTime: number | null;
  usage: Record<string, number>;
};

export type TavilySourceScopedDiagnostics = {
  provider: "tavily";
  operation: AutomationSourceProviderOperation;
  resultCount: number;
  acceptedCount: number;
  scopeRejectedCount: number;
  duplicateCount: number;
  invalidCount: number;
  failedCount: number;
  contentTruncatedCount: number;
  responseTime: number | null;
  usage: Record<string, number>;
  truncated: boolean;
};

export type TavilySourceScopedResult = {
  records: AutomationSourceRecord[];
  coverage: AutomationExtractionCoverage;
  diagnostics: TavilySourceScopedDiagnostics;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]{}]/g, "\\$&");
}

function scopePatternRegex(pattern: string) {
  if (pattern === "/**") return "^/.*$";
  if (pattern.endsWith("/**")) {
    const base = escapeRegex(pattern.slice(0, -3) || "/");
    return "^" + base + "(?:/.*)?$";
  }
  if (pattern.endsWith("/*")) {
    const base = escapeRegex(pattern.slice(0, -2) || "/");
    return "^" + base + "/[^/]+$";
  }
  return "^" + escapeRegex(pattern) + "$";
}

function boundedText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFC").replace(/\u0000/g, "").trim();
  return text ? text.slice(0, max) : null;
}

function markdownTitle(content: string, url: string) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20);
  const heading = lines.find((line) => /^#{1,3}\s+\S/.test(line));
  const candidate = (heading ? heading.replace(/^#{1,3}\s+/, "") : lines[0])
    ?.replace(/[*_`>#]+/g, " ").replace(/\s+/g, " ").trim();
  if (candidate) return candidate.slice(0, 500);
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "")
      .replace(/[-_]+/g, " ").trim().slice(0, 500) || null;
  } catch {
    return null;
  }
}

function markdownDescription(content: string) {
  const text = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[*_`>#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, DESCRIPTION_MAX) : null;
}

function safeUsage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) output[key.slice(0, 80)] = raw;
  }
  return output;
}

async function boundedJson(response: Response, maxBytes: number) {
  const cap = clamp(maxBytes, 1, 2_000_000);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE");
  if (!response.body) throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > cap) {
        await reader.cancel().catch(() => undefined);
        throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE");
      }
      chunks.push(decoder.decode(part.value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(chunks.join("")) as unknown;
  } catch {
    throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE");
  }
}

function parsePayload(payload: unknown): ParsedPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE");
  }
  const object = payload as Record<string, unknown>;
  if (!Array.isArray(object.results)) throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE");

  const rows: ParsedPayload["rows"] = [];
  let invalidCount = 0;
  for (const raw of object.results) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      invalidCount += 1;
      continue;
    }
    const item = raw as Record<string, unknown>;
    const url = canonicalizeSourceUrl(item.url);
    const content = boundedText(item.raw_content, CONTENT_MAX);
    if (!url || !content) {
      invalidCount += 1;
      continue;
    }
    rows.push({ url, content });
  }

  return {
    rows,
    invalidCount,
    failedCount: Array.isArray(object.failed_results) ? object.failed_results.length : 0,
    responseTime: typeof object.response_time === "number" && Number.isFinite(object.response_time)
      ? object.response_time : null,
    usage: safeUsage(object.usage),
  };
}

function httpError(status: number) {
  if (status === 401 || status === 403) return new TavilySourceScopedError("TAVILY_AUTH_FAILED");
  if (status === 429) return new TavilySourceScopedError("TAVILY_RATE_LIMITED");
  if (status === 432 || status === 433) return new TavilySourceScopedError("TAVILY_BUDGET_EXHAUSTED");
  if (status >= 500) return new TavilySourceScopedError("TAVILY_PROVIDER_ERROR", true);
  if (status >= 400) return new TavilySourceScopedError("TAVILY_PROVIDER_ERROR");
  return null;
}

function usageStatus(error: unknown): Exclude<AutomationSourceProviderUsageStatus, "RESERVED"> {
  if (!(error instanceof TavilySourceScopedError)) return "PROVIDER_ERROR";
  if (error.code === "TAVILY_AUTH_FAILED") return "AUTH_FAILED";
  if (error.code === "TAVILY_RATE_LIMITED") return "RATE_LIMITED";
  if (error.code === "TAVILY_CONFIG_MISSING") return "CONFIG_MISSING";
  if (error.code === "TAVILY_TIMEOUT") return "TIMEOUT";
  if (error.code === "TAVILY_INVALID_RESPONSE") return "INVALID_RESPONSE";
  if (error.code === "TAVILY_SCOPE_VIOLATION") return "SCOPE_VIOLATION";
  if (error.code === "TAVILY_BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
  return "PROVIDER_ERROR";
}

class TavilyHttpClient {
  private readonly apiKey: string;
  private readonly fetchImpl: ProviderFetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ProviderOptions) {
    this.apiKey = options.apiKey?.trim() ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async post(input: {
    endpoint: string;
    body: Record<string, unknown>;
    timeoutMs: number;
    maxBytes: number;
    retryMaxAttempts: number;
    retryBackoffMs: number;
  }) {
    if (!this.configured) throw new TavilySourceScopedError("TAVILY_CONFIG_MISSING");
    const retryLimit = Math.min(MAX_RETRIES, Math.max(0, Math.floor(input.retryMaxAttempts)));
    let lastError: unknown;

    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      try {
        const response = await this.fetchImpl(input.endpoint, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input.body),
          signal: AbortSignal.timeout(input.timeoutMs),
        });
        const classified = httpError(response.status);
        if (classified) throw classified;
        if (!response.ok) throw new TavilySourceScopedError("TAVILY_PROVIDER_ERROR");
        return boundedJson(response, input.maxBytes);
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        const mapped = error instanceof TavilySourceScopedError
          ? error
          : name === "TimeoutError" || name === "AbortError"
            ? new TavilySourceScopedError("TAVILY_TIMEOUT", true)
            : new TavilySourceScopedError("TAVILY_PROVIDER_ERROR", true);
        lastError = mapped;
        if (!mapped.retryable || attempt >= retryLimit) throw mapped;
        await this.sleep(retryBackoffMs(attempt, input.retryBackoffMs));
      }
    }
    throw lastError;
  }
}

function filterRows(rows: ParsedPayload["rows"], contract: SourceScopedExtractionContract) {
  const accepted: ParsedPayload["rows"] = [];
  const seen = new Set<string>();
  let scopeRejectedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let contentTruncatedCount = 0;

  for (const row of rows) {
    if (!isSafeAutomationSourceUrl(row.url)) {
      invalidCount += 1;
      continue;
    }
    if (!automationUrlWithinApprovedSourceScope(contract.identity, row.url)) {
      scopeRejectedCount += 1;
      continue;
    }
    if (seen.has(row.url)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(row.url);
    const content = row.content.slice(0, Math.min(CONTENT_MAX, contract.limits.maxBytes));
    if (content.length < row.content.length) contentTruncatedCount += 1;
    accepted.push({ url: row.url, content });
    if (accepted.length >= contract.limits.maxItems) break;
  }

  return { accepted, scopeRejectedCount, duplicateCount, invalidCount, contentTruncatedCount };
}

async function providerRecord(input: {
  contract: SourceScopedExtractionContract;
  strategy: "TAVILY_CRAWL" | "TAVILY_EXTRACT";
  url: string;
  content: string;
  retrievedAt: string;
  coverage: AutomationExtractionCoverage;
}) {
  const title = markdownTitle(input.content, input.url);
  const description = markdownDescription(input.content);
  const proposed: Record<string, unknown> = { websiteUrl: input.url };
  if (title) {
    proposed.title = title;
    proposed.name = title;
  }
  if (description) proposed.description = description;

  return {
    sourceRecordId: "url:" + await sha256Hex(input.url),
    sourceUrl: input.url,
    sourceTimestamp: null,
    rawRecord: {
      provider: "tavily",
      url: input.url,
      contentExcerpt: input.content.slice(0, RAW_EXCERPT_MAX),
      contentTruncated: input.content.length > RAW_EXCERPT_MAX,
    },
    proposed,
    extraction: {
      itemUrl: input.url,
      externalId: null,
      discoveredFromRoot: input.contract.identity.canonicalSourceRootUrl,
      strategy: input.strategy,
      evidenceMetadata: {
        provider: "tavily",
        providerEvidenceType: input.strategy === "TAVILY_CRAWL" ? "CRAWL_PAGE" : "EXTRACT_PAGE",
        retrievedAt: input.retrievedAt,
        approvedScopeIdentityKey: input.contract.identity.identityKey,
        approvedPathScope: {
          includes: input.contract.identity.approvedPathScope.includes,
          excludes: input.contract.identity.approvedPathScope.excludes,
          sameOrigin: true,
        },
      },
      coverage: input.coverage,
      confidence: "LOW",
    },
  } satisfies AutomationSourceRecord;
}

abstract class TavilyProviderBase {
  protected readonly client: TavilyHttpClient;
  protected readonly now: () => Date;

  constructor(options: ProviderOptions) {
    this.client = new TavilyHttpClient(options);
    this.now = options.now ?? (() => new Date());
  }

  get credentialConfigured() {
    return this.client.configured;
  }

  protected async request(input: {
    source: AutomationSource;
    contract: SourceScopedExtractionContract;
    gate: TavilySourceScopedRequestGate;
    operation: AutomationSourceProviderOperation;
    endpoint: string;
    body: Record<string, unknown>;
  }) {
    const reservation = await input.gate.reserve(input.operation);
    if (!reservation) throw new TavilySourceScopedError("TAVILY_BUDGET_EXHAUSTED");
    const started = Date.now();
    try {
      const payload = await this.client.post({
        endpoint: input.endpoint,
        body: input.body,
        timeoutMs: input.contract.limits.timeoutMs,
        maxBytes: input.contract.limits.maxBytes,
        retryMaxAttempts: input.source.retryMaxAttempts,
        retryBackoffMs: input.source.retryBackoffMs,
      });
      return { payload, operationKey: reservation.operationKey, started };
    } catch (error) {
      await input.gate.finalize({
        operationKey: reservation.operationKey,
        status: usageStatus(error),
        resultCount: 0,
        acceptedCount: 0,
        scopeRejectedCount: 0,
      });
      throw error;
    }
  }

  protected async complete(input: {
    source: AutomationSource;
    gate: TavilySourceScopedRequestGate;
    operationKey: string;
    operation: AutomationSourceProviderOperation;
    strategy: "TAVILY_CRAWL" | "TAVILY_EXTRACT";
    diagnostics: TavilySourceScopedDiagnostics;
    coverage: AutomationExtractionCoverage;
    started: number;
  }) {
    await input.gate.finalize({
      operationKey: input.operationKey,
      status: input.diagnostics.acceptedCount ? "SUCCESS" : "EMPTY",
      resultCount: input.diagnostics.resultCount,
      acceptedCount: input.diagnostics.acceptedCount,
      scopeRejectedCount: input.diagnostics.scopeRejectedCount,
    });
    console.info(JSON.stringify({
      event: "automation_source_provider_request",
      provider: "tavily",
      operation: input.operation,
      strategy: input.strategy,
      sourceId: input.source.id,
      entityType: input.source.entityType,
      durationMs: Math.max(0, Date.now() - input.started),
      resultCount: input.diagnostics.resultCount,
      acceptedCount: input.diagnostics.acceptedCount,
      scopeRejectedCount: input.diagnostics.scopeRejectedCount,
      truncation: input.diagnostics.truncated,
      coverage: input.coverage.classification,
    }));
  }
}

export class TavilyAutomationCrawlProvider extends TavilyProviderBase {
  async crawl(input: {
    source: AutomationSource;
    contract: SourceScopedExtractionContract;
    gate: TavilySourceScopedRequestGate;
  }): Promise<TavilySourceScopedResult> {
    const root = input.contract.identity.canonicalSourceRootUrl;
    if (!isSafeAutomationSourceUrl(root) || !automationUrlWithinApprovedSourceScope(input.contract.identity, root)) {
      throw new TavilySourceScopedError("TAVILY_SCOPE_VIOLATION");
    }
    const rootUrl = new URL(root);
    const limit = Math.max(1, Math.min(50, input.contract.limits.maxPages, input.contract.limits.maxItems));
    const req = await this.request({
      ...input,
      operation: "CRAWL",
      endpoint: TAVILY_CRAWL_ENDPOINT,
      body: {
        url: root,
        max_depth: clamp(input.contract.limits.maxDepth, 1, 5),
        max_breadth: clamp(input.contract.limits.maxBreadth, 1, 50),
        limit,
        select_paths: input.contract.identity.approvedPathScope.includes.map(scopePatternRegex),
        exclude_paths: input.contract.identity.approvedPathScope.excludes.map(scopePatternRegex),
        select_domains: ["^" + escapeRegex(rootUrl.hostname) + "$"],
        allow_external: false,
        include_images: false,
        extract_depth: "basic",
        format: "markdown",
        include_usage: true,
      },
    });

    const parsed = parsePayload(req.payload);
    const filtered = filterRows(parsed.rows, input.contract);
    const truncated = parsed.rows.length >= limit
      || filtered.contentTruncatedCount > 0
      || filtered.accepted.length >= input.contract.limits.maxItems;
    const coverage: AutomationExtractionCoverage = {
      classification: "BOUNDED_PARTIAL",
      complete: false,
      visitedPageCount: parsed.rows.length,
      enumeratedItemCount: filtered.accepted.length,
      truncated,
    };
    const at = this.now().toISOString();
    const records = await Promise.all(filtered.accepted.map((row) => providerRecord({
      contract: input.contract,
      strategy: "TAVILY_CRAWL",
      url: row.url,
      content: row.content,
      retrievedAt: at,
      coverage,
    })));
    const diagnostics: TavilySourceScopedDiagnostics = {
      provider: "tavily",
      operation: "CRAWL",
      resultCount: parsed.rows.length + parsed.invalidCount,
      acceptedCount: records.length,
      scopeRejectedCount: filtered.scopeRejectedCount,
      duplicateCount: filtered.duplicateCount,
      invalidCount: parsed.invalidCount + filtered.invalidCount,
      failedCount: parsed.failedCount,
      contentTruncatedCount: filtered.contentTruncatedCount,
      responseTime: parsed.responseTime,
      usage: parsed.usage,
      truncated,
    };
    await this.complete({
      source: input.source,
      gate: input.gate,
      operationKey: req.operationKey,
      operation: "CRAWL",
      strategy: "TAVILY_CRAWL",
      diagnostics,
      coverage,
      started: req.started,
    });
    if (!records.length) throw new TavilySourceScopedError("TAVILY_NO_USABLE_RESULTS");
    return { records, coverage, diagnostics };
  }
}

export class TavilyAutomationExtractProvider extends TavilyProviderBase {
  async extract(input: {
    source: AutomationSource;
    contract: SourceScopedExtractionContract;
    gate: TavilySourceScopedRequestGate;
    urls: string[];
  }): Promise<TavilySourceScopedResult> {
    const unique: string[] = [];
    for (const raw of input.urls) {
      const url = canonicalizeSourceUrl(raw);
      if (!url || !isSafeAutomationSourceUrl(url) || !automationUrlWithinApprovedSourceScope(input.contract.identity, url)) {
        if (input.urls.length === 1) throw new TavilySourceScopedError("TAVILY_SCOPE_VIOLATION");
        continue;
      }
      if (!unique.includes(url)) unique.push(url);
    }
    const urls = unique.slice(0, Math.min(TAVILY_EXTRACT_MAX_URLS, input.contract.limits.maxItems));
    if (!urls.length) throw new TavilySourceScopedError("TAVILY_SCOPE_VIOLATION");

    const req = await this.request({
      source: input.source,
      contract: input.contract,
      gate: input.gate,
      operation: "EXTRACT",
      endpoint: TAVILY_EXTRACT_ENDPOINT,
      body: {
        urls,
        extract_depth: "basic",
        include_images: false,
        format: "markdown",
        include_usage: true,
      },
    });

    const parsed = parsePayload(req.payload);
    const filtered = filterRows(parsed.rows, input.contract);
    const coverage: AutomationExtractionCoverage = {
      classification: "DETAIL_ONLY",
      complete: false,
      visitedPageCount: filtered.accepted.length,
      enumeratedItemCount: filtered.accepted.length,
      truncated: unique.length > urls.length || filtered.contentTruncatedCount > 0,
    };
    const at = this.now().toISOString();
    const records = await Promise.all(filtered.accepted.map((row) => providerRecord({
      contract: input.contract,
      strategy: "TAVILY_EXTRACT",
      url: row.url,
      content: row.content,
      retrievedAt: at,
      coverage,
    })));
    const diagnostics: TavilySourceScopedDiagnostics = {
      provider: "tavily",
      operation: "EXTRACT",
      resultCount: parsed.rows.length + parsed.invalidCount,
      acceptedCount: records.length,
      scopeRejectedCount: filtered.scopeRejectedCount,
      duplicateCount: filtered.duplicateCount,
      invalidCount: parsed.invalidCount + filtered.invalidCount,
      failedCount: parsed.failedCount,
      contentTruncatedCount: filtered.contentTruncatedCount,
      responseTime: parsed.responseTime,
      usage: parsed.usage,
      truncated: Boolean(coverage.truncated),
    };
    await this.complete({
      source: input.source,
      gate: input.gate,
      operationKey: req.operationKey,
      operation: "EXTRACT",
      strategy: "TAVILY_EXTRACT",
      diagnostics,
      coverage,
      started: req.started,
    });
    if (!records.length) throw new TavilySourceScopedError("TAVILY_NO_USABLE_RESULTS");
    return { records, coverage, diagnostics };
  }
}

export const tavilySourceScopedProviderContract = Object.freeze({
  crawlEndpoint: TAVILY_CRAWL_ENDPOINT,
  extractEndpoint: TAVILY_EXTRACT_ENDPOINT,
  secretEnvName: "TAVILY_API_KEY",
  extractMaxUrls: TAVILY_EXTRACT_MAX_URLS,
  crawlCoverage: "BOUNDED_PARTIAL",
  extractCoverage: "DETAIL_ONLY",
});
