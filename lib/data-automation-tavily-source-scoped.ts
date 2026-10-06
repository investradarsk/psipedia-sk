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
import {
  normalizeAutomationSourceProviderDiagnostics,
  type AutomationSourceProviderErrorDiagnostics,
  type AutomationSourceProviderOperation,
  type AutomationSourceProviderTransportPhase,
  type AutomationSourceProviderUsageStatus,
} from "./data-automation-source-provider-usage.ts";

export const TAVILY_CRAWL_ENDPOINT = "https://api.tavily.com/crawl";
export const TAVILY_EXTRACT_ENDPOINT = "https://api.tavily.com/extract";
export const TAVILY_EXTRACT_MAX_URLS = 20;

const MAX_RETRIES = 2;
const RAW_EXCERPT_MAX = 4000;
const DESCRIPTION_MAX = 5000;
const CONTENT_MAX = 250000;
const PROVIDER_ERROR_BODY_MAX_BYTES = 4096;

export const tavilySourceScopedErrorCodes = [
  "TAVILY_CONFIG_MISSING",
  "TAVILY_AUTH_FAILED",
  "TAVILY_RATE_LIMITED",
  "TAVILY_TIMEOUT",
  "TAVILY_PROVIDER_ERROR",
  "TAVILY_INVALID_RESPONSE",
  "TAVILY_SCOPE_VIOLATION",
  "TAVILY_BUDGET_EXHAUSTED",
  "TAVILY_COOLDOWN",
  "TAVILY_NO_USABLE_RESULTS",
] as const;

export type TavilySourceScopedErrorCode = typeof tavilySourceScopedErrorCodes[number];

export type TavilyProviderErrorDiagnostics = AutomationSourceProviderErrorDiagnostics;

export class TavilySourceScopedError extends Error {
  readonly code: TavilySourceScopedErrorCode;
  readonly retryable: boolean;
  readonly diagnostics: TavilyProviderErrorDiagnostics;

  constructor(
    code: TavilySourceScopedErrorCode,
    retryable = false,
    diagnostics: TavilyProviderErrorDiagnostics = {},
  ) {
    super(code);
    this.name = "TavilySourceScopedError";
    this.code = code;
    this.retryable = retryable;
    this.diagnostics = normalizeAutomationSourceProviderDiagnostics(diagnostics);
  }
}

type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type TavilySourceScopedRequestGate = {
  reserve(operation: AutomationSourceProviderOperation): Promise<{
    operationKey: string;
    runId?: number | null;
    blockedReason?: "COOLDOWN";
  } | null>;
  finalize(input: {
    operationKey: string;
    status: Exclude<AutomationSourceProviderUsageStatus, "RESERVED">;
    resultCount: number;
    acceptedCount: number;
    scopeRejectedCount: number;
    diagnostics?: AutomationSourceProviderErrorDiagnostics;
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
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function boundedJson(
  response: Response,
  maxBytes: number,
  apiKey: string,
  providerHttpStatus: number,
) {
  const cap = clamp(maxBytes, 1, 2_000_000);
  let declared: number;
  try {
    declared = Number(response.headers.get("content-length"));
  } catch (error) {
    throw mapTransportFailure(error, apiKey, "RESPONSE_HEADERS", providerHttpStatus);
  }
  if (Number.isFinite(declared) && declared > cap) {
    await response.body?.cancel().catch(() => undefined);
    throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE", false, {
      providerHttpStatus,
      transportPhase: "RESPONSE_VALIDATE",
    });
  }
  if (!response.body) {
    throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE", false, {
      providerHttpStatus,
      transportPhase: "RESPONSE_VALIDATE",
    });
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch (error) {
    throw mapTransportFailure(error, apiKey, "SUCCESS_BODY_READ", providerHttpStatus);
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  let releaseError: unknown;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > cap) {
        await reader.cancel().catch(() => undefined);
        throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE", false, {
          providerHttpStatus,
          transportPhase: "RESPONSE_VALIDATE",
        });
      }
      chunks.push(decoder.decode(part.value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } catch (error) {
    if (error instanceof TavilySourceScopedError) throw error;
    throw mapTransportFailure(error, apiKey, "SUCCESS_BODY_READ", providerHttpStatus);
  } finally {
    try {
      reader.releaseLock();
    } catch (error) {
      releaseError = error;
    }
  }
  if (releaseError) {
    throw mapTransportFailure(releaseError, apiKey, "SUCCESS_BODY_READ", providerHttpStatus);
  }

  try {
    return JSON.parse(chunks.join("")) as unknown;
  } catch {
    throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE", false, {
      providerHttpStatus,
      transportPhase: "JSON_PARSE",
    });
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

function redactKnownSecret(value: unknown, secret: string) {
  if (typeof value !== "string") return value;
  if (!secret) return value;
  return value.split(secret).join("[REDACTED]");
}

function scalarDiagnostic(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return undefined;
}

function objectDiagnostic(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function coarseTransportErrorCode(error: Error) {
  const cause = objectDiagnostic(error.cause);
  const causeCode = scalarDiagnostic(cause?.code);
  if (causeCode) return causeCode;
  if (error.name === "AbortError") return "ABORTED";
  if (error.name !== "TypeError") return undefined;

  const message = error.message.toLowerCase();
  if (message.includes("fetch failed")) return "FETCH_FAILED";
  if (/body.*(?:unusable|used|disturbed|locked)|already.*(?:read|used)/.test(message)) {
    return "BODY_ALREADY_USED";
  }
  if (message.includes("stream")) return "BODY_STREAM_ERROR";
  if (/invalid.*(?:request|url)|failed to parse.*url/.test(message)) return "INVALID_REQUEST";
  return "UNKNOWN_TYPEERROR";
}

function transportDiagnostics(
  error: unknown,
  apiKey: string,
  transportPhase: AutomationSourceProviderTransportPhase,
  providerHttpStatus?: number | null,
): TavilyProviderErrorDiagnostics {
  if (!(error instanceof Error)) {
    return normalizeAutomationSourceProviderDiagnostics({
      providerHttpStatus,
      transportPhase,
    });
  }
  return normalizeAutomationSourceProviderDiagnostics({
    providerHttpStatus,
    transportPhase,
    transportErrorName: redactKnownSecret(error.name, apiKey),
    transportErrorCode: redactKnownSecret(coarseTransportErrorCode(error), apiKey),
  });
}

function mapTransportFailure(
  error: unknown,
  apiKey: string,
  transportPhase: AutomationSourceProviderTransportPhase,
  providerHttpStatus?: number | null,
) {
  const name = error instanceof Error ? error.name : "";
  const diagnostics = transportDiagnostics(error, apiKey, transportPhase, providerHttpStatus);
  return name === "TimeoutError" || name === "AbortError"
    ? new TavilySourceScopedError("TAVILY_TIMEOUT", true, diagnostics)
    : new TavilySourceScopedError("TAVILY_PROVIDER_ERROR", true, diagnostics);
}

async function readProviderErrorDiagnostics(
  response: Response,
  apiKey: string,
  providerHttpStatus: number,
): Promise<TavilyProviderErrorDiagnostics> {
  let providerRequestId: unknown;
  try {
    providerRequestId = response.headers.get("x-request-id")
      ?? response.headers.get("request-id")
      ?? response.headers.get("x-tavily-request-id");
  } catch (error) {
    return transportDiagnostics(error, apiKey, "RESPONSE_HEADERS", providerHttpStatus);
  }

  const base: TavilyProviderErrorDiagnostics = {
    providerHttpStatus,
    transportPhase: "RESPONSE_HEADERS",
    providerRequestId: redactKnownSecret(scalarDiagnostic(providerRequestId), apiKey),
  };

  let bodyText = "";
  try {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > PROVIDER_ERROR_BODY_MAX_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      return normalizeAutomationSourceProviderDiagnostics(base);
    }
    if (!response.body) return normalizeAutomationSourceProviderDiagnostics(base);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let bytes = 0;
    let releaseError: unknown;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > PROVIDER_ERROR_BODY_MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          return normalizeAutomationSourceProviderDiagnostics(base);
        }
        chunks.push(decoder.decode(part.value, { stream: true }));
      }
      chunks.push(decoder.decode());
    } finally {
      try {
        reader.releaseLock();
      } catch (error) {
        releaseError = error;
      }
    }
    if (releaseError) throw releaseError;
    bodyText = chunks.join("");
  } catch (error) {
    const transport = transportDiagnostics(error, apiKey, "ERROR_BODY_READ", providerHttpStatus);
    return normalizeAutomationSourceProviderDiagnostics({
      ...base,
      transportPhase: transport.transportPhase,
      transportErrorName: transport.transportErrorName,
      transportErrorCode: transport.transportErrorCode,
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return normalizeAutomationSourceProviderDiagnostics(base);
  }
  const object = objectDiagnostic(payload);
  if (!object) return normalizeAutomationSourceProviderDiagnostics(base);
  const nestedDetail = objectDiagnostic(object.detail);
  const nestedError = objectDiagnostic(object.error);

  const providerErrorCode = scalarDiagnostic(
    object.code
      ?? object.type
      ?? nestedDetail?.code
      ?? nestedDetail?.type
      ?? nestedError?.code
      ?? nestedError?.type,
  );
  const providerErrorDetail = scalarDiagnostic(
    (typeof object.detail === "string" ? object.detail : undefined)
      ?? nestedDetail?.error
      ?? nestedDetail?.message
      ?? (typeof object.error === "string" ? object.error : undefined)
      ?? nestedError?.detail
      ?? nestedError?.message,
  );
  const providerRequestIdFromBody = scalarDiagnostic(
    object.request_id
      ?? object.requestId
      ?? nestedDetail?.request_id
      ?? nestedDetail?.requestId
      ?? nestedError?.request_id
      ?? nestedError?.requestId
      ?? base.providerRequestId,
  );
  return normalizeAutomationSourceProviderDiagnostics({
    ...base,
    providerErrorCode: redactKnownSecret(providerErrorCode, apiKey),
    providerErrorDetail: redactKnownSecret(providerErrorDetail, apiKey),
    providerRequestId: redactKnownSecret(providerRequestIdFromBody, apiKey),
  });
}

function httpError(status: number, diagnostics: TavilyProviderErrorDiagnostics = {}) {
  if (status === 401 || status === 403) return new TavilySourceScopedError("TAVILY_AUTH_FAILED", false, diagnostics);
  if (status === 429) return new TavilySourceScopedError("TAVILY_RATE_LIMITED", false, diagnostics);
  if (status === 432 || status === 433) return new TavilySourceScopedError("TAVILY_BUDGET_EXHAUSTED", false, diagnostics);
  if (status >= 500) return new TavilySourceScopedError("TAVILY_PROVIDER_ERROR", true, diagnostics);
  if (status >= 400) return new TavilySourceScopedError("TAVILY_PROVIDER_ERROR", false, diagnostics);
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

    const retryOrThrow = async (error: TavilySourceScopedError, attempt: number) => {
      lastError = error;
      if (!error.retryable || attempt >= retryLimit) throw error;
      await this.sleep(retryBackoffMs(attempt, input.retryBackoffMs));
    };

    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(input.endpoint, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input.body),
          signal: AbortSignal.timeout(input.timeoutMs),
        });
      } catch (error) {
        await retryOrThrow(mapTransportFailure(error, this.apiKey, "FETCH", null), attempt);
        continue;
      }

      let providerHttpStatus: number;
      try {
        providerHttpStatus = response.status;
      } catch (error) {
        await retryOrThrow(
          mapTransportFailure(error, this.apiKey, "RESPONSE_HEADERS", null),
          attempt,
        );
        continue;
      }

      try {
        const responseOk = response.ok;
        const diagnostics = responseOk
          ? undefined
          : await readProviderErrorDiagnostics(response, this.apiKey, providerHttpStatus);
        const classified = httpError(providerHttpStatus, diagnostics);
        if (classified) throw classified;
        if (!responseOk) {
          throw new TavilySourceScopedError("TAVILY_PROVIDER_ERROR", false, diagnostics);
        }
        const payload = await boundedJson(
          response,
          input.maxBytes,
          this.apiKey,
          providerHttpStatus,
        );
        return { payload, providerHttpStatus };
      } catch (error) {
        const mapped = error instanceof TavilySourceScopedError
          ? error
          : mapTransportFailure(
              error,
              this.apiKey,
              "RESPONSE_HEADERS",
              providerHttpStatus,
            );
        await retryOrThrow(mapped, attempt);
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

function markdownCellText(value: string) {
  return value
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[*_`>#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeSlovakEventDate(value: string) {
  const text = value.replace(/\s+/g, "");
  return /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text)
    || /^\d{1,2}\.[–—-]\d{1,2}\.\d{1,2}\.\d{4}$/.test(text)
    || /^\d{1,2}\.\d{1,2}\.[–—-]\d{1,2}\.\d{1,2}\.\d{4}$/.test(text);
}

function markdownEventRows(content: string) {
  const rows: Array<{ dateText: string; title: string; venue: string | null; rawLine: string }> = [];
  for (const rawLine of content.split(/\r?\n/).slice(0, 2000)) {
    if (!rawLine.includes("|")) continue;
    const cells = rawLine
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map(markdownCellText)
      .filter(Boolean);
    if (cells.length < 2 || !looksLikeSlovakEventDate(cells[0])) continue;
    const title = cells[1]?.slice(0, 500) ?? "";
    const venue = cells[2]?.slice(0, 500) || null;
    if (!title || /^[-–—\s]+$/.test(title)) continue;
    rows.push({ dateText: cells[0], title, venue, rawLine: rawLine.slice(0, 4000) });
  }
  return rows;
}

async function providerRecord(input: {
  source: AutomationSource;
  contract: SourceScopedExtractionContract;
  strategy: "TAVILY_CRAWL" | "TAVILY_EXTRACT";
  url: string;
  content: string;
  retrievedAt: string;
  coverage: AutomationExtractionCoverage;
}) {
  const title = markdownTitle(input.content, input.url);
  const description = markdownDescription(input.content);
  const proposed: Record<string, unknown> = {
    ...(input.source.config.staticFields ?? {}),
    websiteUrl: input.url,
  };
  if (title) {
    proposed.title = title;
    proposed.name = title;
  }
  if (description) proposed.description = description;

  const firstPartyEntity = input.source.entityType === "DIRECTORY" || input.source.entityType === "ORGANIZATION";
  const fieldOrigins: Record<string, string> = {};
  if (firstPartyEntity) {
    if (title) fieldOrigins.name = "FIRST_PARTY";
    fieldOrigins.websiteUrl = "FIRST_PARTY";
    if (description) fieldOrigins.description = "FIRST_PARTY";
  }

  return {
    sourceRecordId: "url:" + await sha256Hex(input.url),
    sourceUrl: input.url,
    sourceTimestamp: null,
    rawRecord: {
      provider: "tavily",
      url: input.url,
      contentExcerpt: input.content.slice(0, RAW_EXCERPT_MAX),
      contentTruncated: input.content.length > RAW_EXCERPT_MAX,
      ...(firstPartyEntity ? {
        identitySource: input.strategy === "TAVILY_EXTRACT"
          ? "TAVILY_EXTRACT_FIRST_PARTY"
          : "TAVILY_CRAWL_FIRST_PARTY",
        directEvidence: { fieldOrigins },
      } : {}),
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

async function providerRecordsForRow(input: {
  source: AutomationSource;
  contract: SourceScopedExtractionContract;
  strategy: "TAVILY_CRAWL" | "TAVILY_EXTRACT";
  url: string;
  content: string;
  retrievedAt: string;
  coverage: AutomationExtractionCoverage;
}) {
  if (
    input.source.entityType === "EVENT"
    && input.source.config.sourceShape === "MULTI_ITEM_LIST"
  ) {
    const rows = markdownEventRows(input.content);
    if (rows.length) {
      return Promise.all(rows.slice(0, input.source.maxRecordsPerRun).map(async (row) => ({
        sourceRecordId: "tavily-row:" + await sha256Hex(
          [input.url, row.dateText, row.title, row.venue ?? ""].join("|"),
        ),
        sourceUrl: input.url,
        sourceTimestamp: null,
        rawRecord: {
          provider: "tavily",
          url: input.url,
          contentExcerpt: row.rawLine,
          dateText: row.dateText,
          venue: row.venue,
          identitySource: input.strategy === "TAVILY_CRAWL"
            ? "TAVILY_CRAWL_LIST_ROW"
            : "TAVILY_EXTRACT_LIST_ROW",
        },
        proposed: {
          ...(input.source.config.staticFields ?? {}),
          title: row.title,
          ...(row.venue ? { venue: row.venue } : {}),
          websiteUrl: input.url,
        },
        extraction: {
          itemUrl: input.url,
          externalId: null,
          discoveredFromRoot: input.contract.identity.canonicalSourceRootUrl,
          strategy: input.strategy,
          evidenceMetadata: {
            provider: "tavily",
            providerEvidenceType: input.strategy === "TAVILY_CRAWL"
              ? "CRAWL_LIST_ROW"
              : "EXTRACT_LIST_ROW",
            retrievedAt: input.retrievedAt,
            approvedScopeIdentityKey: input.contract.identity.identityKey,
          },
          coverage: input.coverage,
          confidence: "MEDIUM",
        },
      } satisfies AutomationSourceRecord)));
    }
  }
  return [await providerRecord(input)];
}

abstract class TavilyProviderBase {
  protected readonly client: TavilyHttpClient;
  protected readonly now: () => Date;
  protected readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ProviderOptions) {
    this.client = new TavilyHttpClient(options);
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
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
    const retryLimit = Math.min(MAX_RETRIES, Math.max(0, Math.floor(input.source.retryMaxAttempts)));
    const started = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      const reservation = await input.gate.reserve(input.operation);
      if (!reservation) throw new TavilySourceScopedError("TAVILY_BUDGET_EXHAUSTED");
      if (reservation.blockedReason === "COOLDOWN") {
        throw new TavilySourceScopedError("TAVILY_COOLDOWN", true);
      }
      try {
        const response = await this.client.post({
          endpoint: input.endpoint,
          body: input.body,
          timeoutMs: input.contract.limits.timeoutMs,
          maxBytes: input.contract.limits.maxBytes,
          retryMaxAttempts: 0,
          retryBackoffMs: input.source.retryBackoffMs,
        });
        return {
          payload: response.payload,
          providerHttpStatus: response.providerHttpStatus,
          operationKey: reservation.operationKey,
          started,
        };
      } catch (error) {
        lastError = error;
        const diagnostics = error instanceof TavilySourceScopedError ? error.diagnostics : undefined;
        await input.gate.finalize({
          operationKey: reservation.operationKey,
          status: usageStatus(error),
          resultCount: 0,
          acceptedCount: 0,
          scopeRejectedCount: 0,
          diagnostics,
        });
        console.info(JSON.stringify({
          event: "automation_source_provider_request_failed",
          provider: "tavily",
          sourceId: input.source.id,
          runId: reservation.runId ?? undefined,
          operation: input.operation,
          operationKey: reservation.operationKey,
          errorCode: error instanceof TavilySourceScopedError ? error.code : "TAVILY_PROVIDER_ERROR",
          httpStatus: diagnostics?.providerHttpStatus ?? undefined,
          providerErrorCode: diagnostics?.providerErrorCode ?? undefined,
          providerRequestId: diagnostics?.providerRequestId ?? undefined,
          transportPhase: diagnostics?.transportPhase ?? undefined,
          transportErrorName: diagnostics?.transportErrorName ?? undefined,
          transportErrorCode: diagnostics?.transportErrorCode ?? undefined,
        }));
        const retryable = error instanceof TavilySourceScopedError && error.retryable;
        if (!retryable || attempt >= retryLimit) throw error;
        await this.sleep(retryBackoffMs(attempt, input.source.retryBackoffMs));
      }
    }

    throw lastError;
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
    const status = input.diagnostics.acceptedCount > 0
      ? "SUCCESS"
      : input.diagnostics.scopeRejectedCount > 0
        ? "SCOPE_VIOLATION"
        : input.diagnostics.invalidCount > 0
          ? "INVALID_RESPONSE"
          : "EMPTY";
    await input.gate.finalize({
      operationKey: input.operationKey,
      status,
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
        extract_depth: "advanced",
        format: "markdown",
        include_usage: true,
      },
    });

    let parsed: ParsedPayload;
    try {
      parsed = parsePayload(req.payload);
    } catch (error) {
      const invalid = error instanceof TavilySourceScopedError
        ? new TavilySourceScopedError(error.code, error.retryable, {
            ...error.diagnostics,
            providerHttpStatus: req.providerHttpStatus,
            transportPhase: "RESPONSE_VALIDATE",
          })
        : new TavilySourceScopedError("TAVILY_INVALID_RESPONSE", false, {
            providerHttpStatus: req.providerHttpStatus,
            transportPhase: "RESPONSE_VALIDATE",
          });
      await input.gate.finalize({
        operationKey: req.operationKey,
        status: "INVALID_RESPONSE",
        resultCount: 0,
        acceptedCount: 0,
        scopeRejectedCount: 0,
        diagnostics: invalid.diagnostics,
      });
      throw invalid;
    }
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
    const records = (await Promise.all(filtered.accepted.map((row) => providerRecordsForRow({
      source: input.source,
      contract: input.contract,
      strategy: "TAVILY_CRAWL",
      url: row.url,
      content: row.content,
      retrievedAt: at,
      coverage,
    })))).flat().slice(0, input.source.maxRecordsPerRun);
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
    if (!records.length) {
      if (diagnostics.scopeRejectedCount > 0) throw new TavilySourceScopedError("TAVILY_SCOPE_VIOLATION");
      if (diagnostics.invalidCount > 0) throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE");
      throw new TavilySourceScopedError("TAVILY_NO_USABLE_RESULTS");
    }
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
        extract_depth: "advanced",
        include_images: false,
        format: "markdown",
        include_usage: true,
      },
    });

    let parsed: ParsedPayload;
    try {
      parsed = parsePayload(req.payload);
    } catch (error) {
      const invalid = error instanceof TavilySourceScopedError
        ? new TavilySourceScopedError(error.code, error.retryable, {
            ...error.diagnostics,
            providerHttpStatus: req.providerHttpStatus,
            transportPhase: "RESPONSE_VALIDATE",
          })
        : new TavilySourceScopedError("TAVILY_INVALID_RESPONSE", false, {
            providerHttpStatus: req.providerHttpStatus,
            transportPhase: "RESPONSE_VALIDATE",
          });
      await input.gate.finalize({
        operationKey: req.operationKey,
        status: "INVALID_RESPONSE",
        resultCount: 0,
        acceptedCount: 0,
        scopeRejectedCount: 0,
        diagnostics: invalid.diagnostics,
      });
      throw invalid;
    }
    const filtered = filterRows(parsed.rows, input.contract);
    const coverage: AutomationExtractionCoverage = {
      classification: "DETAIL_ONLY",
      complete: false,
      visitedPageCount: filtered.accepted.length,
      enumeratedItemCount: filtered.accepted.length,
      truncated: unique.length > urls.length || filtered.contentTruncatedCount > 0,
    };
    const at = this.now().toISOString();
    const records = (await Promise.all(filtered.accepted.map((row) => providerRecordsForRow({
      source: input.source,
      contract: input.contract,
      strategy: "TAVILY_EXTRACT",
      url: row.url,
      content: row.content,
      retrievedAt: at,
      coverage,
    })))).flat().slice(0, input.source.maxRecordsPerRun);
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
    if (!records.length) {
      if (diagnostics.scopeRejectedCount > 0) throw new TavilySourceScopedError("TAVILY_SCOPE_VIOLATION");
      if (diagnostics.invalidCount > 0) throw new TavilySourceScopedError("TAVILY_INVALID_RESPONSE");
      throw new TavilySourceScopedError("TAVILY_NO_USABLE_RESULTS");
    }
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
