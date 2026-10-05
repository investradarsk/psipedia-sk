import {
  boundedAutomationRecords,
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  retryBackoffMs,
  shouldRetryAutomationStatus,
  type AutomationExtractionStrategy,
  type AutomationSource,
  type AutomationSourceConfig,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import {
  eventHtmlAdapterConfigForSourceUrl,
  organizationHtmlAdapterKeyForSourceUrl,
} from "./data-automation-source-provisioning.ts";
import {
  AUTOMATION_SOURCE_HTTP_USER_AGENT,
  AUTOMATION_SOURCE_MAX_BYTES,
  AUTOMATION_SOURCE_MAX_REDIRECT_HOPS,
  automationSourceRequestTimeoutMs,
} from "./data-automation-http-policy.ts";
import { automationHelpRecordShapeError } from "./data-automation-help-source-readiness.ts";
import {
  extractGenericFirstPartySource,
  GenericFirstPartyExtractionError,
  genericFirstPartyProbeContract,
} from "./data-automation-generic-source-extractor.ts";
import {
  automationUrlWithinApprovedSourceScope,
  type SourceScopedExtractionContract,
} from "./data-automation-source-scoped-extraction.ts";
import {
  TavilyAutomationCrawlProvider,
  TavilyAutomationExtractProvider,
  TavilySourceScopedError,
  type TavilySourceScopedRequestGate,
} from "./data-automation-tavily-source-scoped.ts";

export class AutomationConnectorError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = "AutomationConnectorError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type AutomationFetch = typeof fetch;
export type ControlledHtmlAdapter = (input: {
  html: string;
  source: AutomationSource;
  fetchHtml?: (url: string) => Promise<{ html: string; finalUrl: string }>;
}) => Promise<AutomationSourceRecord[]> | AutomationSourceRecord[];

export type AutomationConnectorContext = {
  fetchImpl?: AutomationFetch;
  htmlAdapters?: Record<string, ControlledHtmlAdapter>;
  sleep?: (ms: number) => Promise<void>;
  sourceScopedContract?: SourceScopedExtractionContract;
  strategyOverride?: AutomationExtractionStrategy;
  genericProbe?: boolean;
  tavilyCrawlProvider?: TavilyAutomationCrawlProvider;
  tavilyExtractProvider?: TavilyAutomationExtractProvider;
  tavilyRequestGate?: TavilySourceScopedRequestGate;
  onResponse?: (meta: {
    status: number;
    contentType: string | null;
    contentLength: number | null;
    finalUrl: string;
    redirectCount: number;
  }) => void;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function redirectVisitKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return value;
  }
}

function pathValue(value: unknown, path: string | undefined) {
  if (!path) return value;
  return path.split(".").filter(Boolean).reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function cleanRecordId(value: unknown, index: number) {
  const text = String(value ?? "").trim();
  if (text) return text.slice(0, 240);
  return `row-${index + 1}`;
}

function mappedProposal(record: unknown, source: AutomationSource) {
  const config = source.config;
  const fields = config.fields ?? {};
  const proposal: Record<string, unknown> = { ...(config.staticFields ?? {}) };
  for (const [target, sourcePath] of Object.entries(fields)) {
    const value = pathValue(record, sourcePath);
    if (value !== undefined) proposal[target] = value;
  }
  if (Object.keys(fields).length === 0 && record && typeof record === "object" && !Array.isArray(record)) {
    Object.assign(proposal, record as Record<string, unknown>);
  }
  return proposal;
}

function sourceRecordsFromPayload(payload: unknown, source: AutomationSource) {
  const records = pathValue(payload, source.config.recordsPath);
  if (!Array.isArray(records)) throw new AutomationConnectorError("structured_json_records_not_array");
  return boundedAutomationRecords(records, source.maxRecordsPerRun).map((record, index) => {
    const sourceRecordId = cleanRecordId(pathValue(record, source.config.idField ?? "id"), index);
    const recordUrl = canonicalizeSourceUrl(pathValue(record, source.config.urlField ?? "url"));
    const sourceTimestampValue = pathValue(record, source.config.timestampField ?? "updatedAt");
    const sourceTimestamp = typeof sourceTimestampValue === "string" && sourceTimestampValue.trim()
      ? sourceTimestampValue.trim()
      : null;
    return {
      sourceRecordId,
      sourceUrl: recordUrl ?? source.sourceUrl,
      sourceTimestamp,
      rawRecord: record,
      proposed: mappedProposal(record, source),
    } satisfies AutomationSourceRecord;
  });
}

function classifyFetchFailure(error: unknown) {
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (name.includes("timeout") || name === "aborterror" || /timed?\s*out|timeout/.test(message)) {
    return new AutomationConnectorError("source_timeout", true);
  }
  if (/dns|name resolution|getaddrinfo|host not found|resolve host/.test(message)) {
    return new AutomationConnectorError("source_dns_failed", true);
  }
  if (/tls|ssl|certificate|cert(?:ificate)? verify/.test(message)) {
    return new AutomationConnectorError("source_tls_failed");
  }
  if (/connection|connect|socket|network|reset|econn/.test(message)) {
    return new AutomationConnectorError("source_connection_failed", true);
  }
  return new AutomationConnectorError("source_request_failed", true);
}

function validateContentType(source: AutomationSource, contentType: string | null) {
  if (!contentType) return;
  const normalized = contentType.toLowerCase();
  if (source.connectorType === "STRUCTURED_JSON") {
    if (!normalized.includes("application/json") && !normalized.includes("+json")) {
      throw new AutomationConnectorError("source_invalid_content_type");
    }
    return;
  }
  if (source.connectorType === "CONTROLLED_HTML"
    && !normalized.includes("text/html")
    && !normalized.includes("application/xhtml+xml")) {
    throw new AutomationConnectorError("source_invalid_content_type");
  }
}

function eventSourceFallbackConfig(source: AutomationSource): AutomationSourceConfig {
  return source.entityType === "EVENT"
    ? eventHtmlAdapterConfigForSourceUrl(source.sourceUrl)
    : {};
}

function expectedMinimumRecords(source: AutomationSource) {
  const fallback = eventSourceFallbackConfig(source);
  const configured = Number(source.config.expectedMinRecords ?? fallback.expectedMinRecords ?? 0);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(source.maxRecordsPerRun, Math.max(1, Math.floor(configured)));
  }
  const adapterKey = source.config.htmlAdapterKey?.trim() || fallback.htmlAdapterKey?.trim();
  if (adapterKey === "organization-official-site") return 1;
  if (adapterKey === "psiadusa-organization-directory") return 1;
  if (adapterKey === "svps-shelters-register") return 10;
  if (adapterKey === "skj-exhibition-calendar") return 1;
  if (adapterKey === "agility-sk-events") return 1;
  if (adapterKey === "zsk-sr-events") return 1;
  if (adapterKey === "szpz-mushing-events") return 1;
  return 0;
}

function validateRecordCount(source: AutomationSource, records: AutomationSourceRecord[]) {
  const expectedMinimum = expectedMinimumRecords(source);
  if (expectedMinimum > 0 && records.length === 0) {
    throw new AutomationConnectorError("adapter_no_records");
  }
  if (expectedMinimum > 0 && records.length < expectedMinimum) {
    throw new AutomationConnectorError("adapter_record_count_below_minimum");
  }
}

async function responseText(response: Response, maxBytes = AUTOMATION_SOURCE_MAX_BYTES) {
  const boundedMaxBytes = Math.max(1, Math.min(AUTOMATION_SOURCE_MAX_BYTES, Math.floor(maxBytes)));
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > boundedMaxBytes) {
    throw new AutomationConnectorError("source_response_too_large");
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
      if (bytes > boundedMaxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AutomationConnectorError("source_response_too_large");
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}

async function fetchOnce(
  source: AutomationSource,
  fetchImpl: AutomationFetch,
  onResponse?: AutomationConnectorContext["onResponse"],
  options: {
    urlPolicy?: (url: string) => boolean;
    maxRedirects?: number;
  } = {},
) {
  if (!source.sourceUrl || !isSafeAutomationSourceUrl(source.sourceUrl)) {
    throw new AutomationConnectorError("unsafe_or_missing_source_url");
  }

  const originalUrl = source.sourceUrl;
  let currentUrl = originalUrl;
  const seen = new Set<string>();
  let redirectCount = 0;

  while (true) {
    if (options.urlPolicy && !options.urlPolicy(currentUrl)) {
      throw new AutomationConnectorError("source_scope_violation");
    }
    const loopKey = redirectVisitKey(currentUrl);
    if (seen.has(loopKey)) throw new AutomationConnectorError("source_redirect_loop");
    seen.add(loopKey);

    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        headers: {
          accept: source.connectorType === "STRUCTURED_JSON" ? "application/json" : "text/html,application/xhtml+xml",
          "user-agent": AUTOMATION_SOURCE_HTTP_USER_AGENT,
        },
        signal: AbortSignal.timeout(automationSourceRequestTimeoutMs(source.timeoutMs)),
        redirect: "manual",
      });
    } catch (error) {
      throw classifyFetchFailure(error);
    }

    const contentType = response.headers.get("content-type");
    const declaredLengthHeader = response.headers.get("content-length");
    const declaredLength = declaredLengthHeader === null ? null : Number(declaredLengthHeader);
    onResponse?.({
      status: response.status,
      contentType,
      contentLength: declaredLength !== null && Number.isFinite(declaredLength) && declaredLength >= 0 ? declaredLength : null,
      finalUrl: currentUrl,
      redirectCount,
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new AutomationConnectorError("source_redirect_invalid");
      if (redirectCount >= (options.maxRedirects ?? AUTOMATION_SOURCE_MAX_REDIRECT_HOPS)) {
        throw new AutomationConnectorError("source_redirect_too_many");
      }
      let target: URL;
      try {
        target = new URL(location, currentUrl);
      } catch {
        throw new AutomationConnectorError("source_redirect_invalid");
      }
      if (!isSafeAutomationSourceUrl(target.toString())) {
        throw new AutomationConnectorError("source_redirect_blocked");
      }
      if (options.urlPolicy && !options.urlPolicy(target.toString())) {
        throw new AutomationConnectorError("source_scope_violation");
      }
      await response.body?.cancel().catch(() => undefined);
      currentUrl = target.toString();
      redirectCount += 1;
      continue;
    }

    if (!response.ok) {
      throw new AutomationConnectorError(
        `source_http_${response.status}`,
        shouldRetryAutomationStatus(response.status),
      );
    }
    validateContentType(source, contentType);
    if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > AUTOMATION_SOURCE_MAX_BYTES) {
      throw new AutomationConnectorError("source_response_too_large");
    }
    return { response, finalUrl: currentUrl };
  }
}

const GENERIC_TAVILY_FALLBACK_CODES = new Set([
  "no_items_discovered",
  "ambiguous_listing",
  "unsupported_structured_data",
  "invalid_item_structure",
]);

export function canFallbackGenericExtractionToTavily(code: string) {
  return GENERIC_TAVILY_FALLBACK_CODES.has(code);
}

function tavilyConnectorError(error: unknown) {
  if (!(error instanceof TavilySourceScopedError)) {
    return new AutomationConnectorError("tavily_provider_error");
  }
  return new AutomationConnectorError(error.code.toLowerCase(), error.retryable);
}

async function validateTavilyRecords(source: AutomationSource, records: AutomationSourceRecord[]) {
  const bounded = boundedAutomationRecords(records, source.maxRecordsPerRun);
  const helpShapeError = automationHelpRecordShapeError(source, bounded.length);
  if (helpShapeError) throw new AutomationConnectorError(helpShapeError);
  validateRecordCount(source, bounded);
  return bounded;
}

async function withRetry<T>(
  source: AutomationSource,
  operation: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
) {
  let last: unknown;
  for (let attempt = 0; attempt <= source.retryMaxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      last = error;
      const retryable = error instanceof AutomationConnectorError && error.retryable;
      if (!retryable || attempt >= source.retryMaxAttempts) throw error;
      await sleep(Math.max(source.throttleMs, retryBackoffMs(attempt, source.retryBackoffMs)));
    }
  }
  throw last;
}

export async function fetchAutomationSourceRecords(
  source: AutomationSource,
  context: AutomationConnectorContext = {},
): Promise<AutomationSourceRecord[]> {
  if (source.connectorType === "MANUAL_IMPORT") return [];
  const fetchImpl = context.fetchImpl ?? fetch;
  const sleep = context.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const initialEventFallback: AutomationSourceConfig = source.entityType === "EVENT"
    ? eventHtmlAdapterConfigForSourceUrl(source.sourceUrl)
    : {};
  const initialAdapterKey = source.config.htmlAdapterKey?.trim()
    || initialEventFallback.htmlAdapterKey?.trim()
    || (source.entityType === "ORGANIZATION" ? organizationHtmlAdapterKeyForSourceUrl(source.sourceUrl) : null);
  const tavilyOverride = context.strategyOverride === "TAVILY_CRAWL"
    || context.strategyOverride === "TAVILY_EXTRACT";
  const genericRequested = source.connectorType === "CONTROLLED_HTML"
    && Boolean(context.sourceScopedContract)
    && !tavilyOverride
    && (context.strategyOverride === "GENERIC_FIRST_PARTY" || !initialAdapterKey);
  const scopedPolicy = genericRequested && context.sourceScopedContract
    ? (url: string) => automationUrlWithinApprovedSourceScope(context.sourceScopedContract!.identity, url)
    : undefined;

  if (tavilyOverride) {
    if (source.connectorType !== "CONTROLLED_HTML") {
      throw new AutomationConnectorError("tavily_unsupported_connector");
    }
    const contract = context.sourceScopedContract;
    const gate = context.tavilyRequestGate;
    if (!contract || !gate) throw new AutomationConnectorError("tavily_source_contract_missing");
    try {
      if (context.strategyOverride === "TAVILY_CRAWL") {
        if (!context.tavilyCrawlProvider) throw new AutomationConnectorError("tavily_crawl_unavailable");
        const result = await context.tavilyCrawlProvider.crawl({ source, contract, gate });
        return validateTavilyRecords(source, result.records);
      }
      if (!context.tavilyExtractProvider) throw new AutomationConnectorError("tavily_extract_unavailable");
      if (!source.sourceUrl) throw new AutomationConnectorError("unsafe_or_missing_source_url");
      const result = await context.tavilyExtractProvider.extract({
        source,
        contract,
        gate,
        urls: [source.sourceUrl],
      });
      return validateTavilyRecords(source, result.records);
    } catch (error) {
      if (error instanceof AutomationConnectorError) throw error;
      throw tavilyConnectorError(error);
    }
  }

  return withRetry(source, async () => {
    const fetched = await fetchOnce(source, fetchImpl, context.onResponse, {
      urlPolicy: scopedPolicy,
      maxRedirects: context.sourceScopedContract?.limits.maxRedirects,
    });
    const response = fetched.response;
    const effectiveSource = fetched.finalUrl === source.sourceUrl ? source : { ...source, sourceUrl: fetched.finalUrl };
    if (source.connectorType === "STRUCTURED_JSON") {
      const text = await responseText(response);
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new AutomationConnectorError("structured_json_invalid_json");
      }
      return sourceRecordsFromPayload(payload, effectiveSource);
    }

    const configuredAdapterKey = source.config.htmlAdapterKey?.trim() || null;
    const eventFallback: AutomationSourceConfig = source.entityType === "EVENT"
      ? eventHtmlAdapterConfigForSourceUrl(effectiveSource.sourceUrl)
      : {};
    const expectedEventAdapterKey = eventFallback.htmlAdapterKey?.trim() || null;
    if (configuredAdapterKey && expectedEventAdapterKey && configuredAdapterKey !== expectedEventAdapterKey) {
      throw new AutomationConnectorError("controlled_html_adapter_source_mismatch");
    }
    const adapterKey = configuredAdapterKey
      || expectedEventAdapterKey
      || (source.entityType === "ORGANIZATION"
        ? organizationHtmlAdapterKeyForSourceUrl(effectiveSource.sourceUrl)
        : null);
    const adapter = adapterKey ? context.htmlAdapters?.[adapterKey] : undefined;
    const useGeneric = context.strategyOverride === "GENERIC_FIRST_PARTY" || (!adapter && Boolean(context.sourceScopedContract));

    if (useGeneric) {
      const baseContract = context.sourceScopedContract;
      if (!baseContract) throw new AutomationConnectorError("generic_source_contract_missing");
      const contract = context.genericProbe ? genericFirstPartyProbeContract(baseContract) : baseContract;
      let remainingBytes = contract.limits.maxBytes;
      const html = await responseText(response, remainingBytes);
      remainingBytes -= new TextEncoder().encode(html).byteLength;
      try {
        const result = await extractGenericFirstPartySource({
          source: effectiveSource,
          contract,
          rootHtml: html,
          rootUrl: fetched.finalUrl,
          fetchPage: async (url) => {
            if (!automationUrlWithinApprovedSourceScope(contract.identity, url)) {
              throw new AutomationConnectorError("source_scope_violation");
            }
            if (contract.limits.throttleMs > 0) await sleep(contract.limits.throttleMs);
            const nestedSource = { ...effectiveSource, sourceUrl: url };
            const nested = await fetchOnce(nestedSource, fetchImpl, context.onResponse, {
              urlPolicy: (candidate) => automationUrlWithinApprovedSourceScope(contract.identity, candidate),
              maxRedirects: contract.limits.maxRedirects,
            });
            if (!automationUrlWithinApprovedSourceScope(contract.identity, nested.finalUrl)) {
              throw new AutomationConnectorError("source_scope_violation");
            }
            const nestedHtml = await responseText(nested.response, remainingBytes);
            remainingBytes -= new TextEncoder().encode(nestedHtml).byteLength;
            if (remainingBytes < 0) throw new AutomationConnectorError("source_response_too_large");
            return { html: nestedHtml, finalUrl: nested.finalUrl };
          },
        });
        const records = boundedAutomationRecords(result.records, Math.min(source.maxRecordsPerRun, contract.limits.maxItems));
        const helpShapeError = automationHelpRecordShapeError(source, records.length);
        if (helpShapeError) throw new AutomationConnectorError(helpShapeError);
        validateRecordCount(source, records);
        return records;
      } catch (error) {
        if (error instanceof AutomationConnectorError) throw error;
        if (error instanceof GenericFirstPartyExtractionError) {
          const fallbackAllowed = !context.genericProbe
            && canFallbackGenericExtractionToTavily(error.code)
            && Boolean(context.tavilyRequestGate);
          if (fallbackAllowed) {
            try {
              if (
                source.config.sourceShape === "SINGLE_ITEM"
                && context.tavilyExtractProvider
              ) {
                const result = await context.tavilyExtractProvider.extract({
                  source: effectiveSource,
                  contract: baseContract,
                  gate: context.tavilyRequestGate!,
                  urls: [fetched.finalUrl],
                });
                return validateTavilyRecords(source, result.records);
              }
              if (context.tavilyCrawlProvider) {
                const result = await context.tavilyCrawlProvider.crawl({
                  source: effectiveSource,
                  contract: baseContract,
                  gate: context.tavilyRequestGate!,
                });
                return validateTavilyRecords(source, result.records);
              }
            } catch (providerError) {
              if (providerError instanceof AutomationConnectorError) throw providerError;
              throw tavilyConnectorError(providerError);
            }
          }
          throw new AutomationConnectorError(error.code);
        }
        throw new AutomationConnectorError("generic_source_parse_failed");
      }
    }

    if (!adapter) throw new AutomationConnectorError("controlled_html_adapter_not_configured");
    const html = await responseText(response);
    let parsed: AutomationSourceRecord[];
    try {
      const result = await adapter({
        html,
        source: effectiveSource,
        fetchHtml: async (url) => {
          const nestedUrl = canonicalizeSourceUrl(url);
          if (!nestedUrl || !isSafeAutomationSourceUrl(nestedUrl)) {
            throw new AutomationConnectorError("adapter_nested_url_not_safe");
          }
          const nestedSource = { ...effectiveSource, sourceUrl: nestedUrl };
          const nested = await fetchOnce(nestedSource, fetchImpl, context.onResponse);
          return { html: await responseText(nested.response), finalUrl: nested.finalUrl };
        },
      });
      if (!Array.isArray(result)) throw new Error("adapter_result_not_array");
      parsed = result;
    } catch (error) {
      if (error instanceof AutomationConnectorError) throw error;
      throw new AutomationConnectorError("adapter_parse_failed");
    }
    const records = boundedAutomationRecords(parsed, source.maxRecordsPerRun);
    const helpShapeError = automationHelpRecordShapeError(source, records.length);
    if (helpShapeError) throw new AutomationConnectorError(helpShapeError);
    validateRecordCount(source, records);
    return records;
  }, sleep);
}

export function normalizeManualAutomationRecords(
  source: AutomationSource,
  records: unknown[],
): AutomationSourceRecord[] {
  return boundedAutomationRecords(records, source.maxRecordsPerRun).map((record, index) => ({
    sourceRecordId: cleanRecordId(pathValue(record, source.config.idField ?? "id"), index),
    sourceUrl: canonicalizeSourceUrl(pathValue(record, source.config.urlField ?? "url")) ?? source.sourceUrl,
    sourceTimestamp: String(pathValue(record, source.config.timestampField ?? "updatedAt") ?? "").trim() || null,
    rawRecord: record,
    proposed: mappedProposal(record, source),
  }));
}
