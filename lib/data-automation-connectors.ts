import {
  boundedAutomationRecords,
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  retryBackoffMs,
  shouldRetryAutomationStatus,
  type AutomationSource,
  type AutomationSourceRecord,
} from "./data-automation.ts";

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
  onResponse?: (meta: {
    status: number;
    contentType: string | null;
    contentLength: number | null;
    finalUrl: string;
    redirectCount: number;
  }) => void;
};

const MAX_SOURCE_BYTES = 1_000_000;
const MAX_REDIRECT_HOPS = 3;
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

function expectedMinimumRecords(source: AutomationSource) {
  const configured = Number(source.config.expectedMinRecords ?? 0);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(source.maxRecordsPerRun, Math.max(1, Math.floor(configured)));
  }
  if (source.config.htmlAdapterKey === "svps-shelters-register") return 10;
  if (source.config.htmlAdapterKey === "skj-exhibition-calendar") return 1;
  if (source.config.htmlAdapterKey === "agility-sk-events") return 1;
  if (source.config.htmlAdapterKey === "zsk-sr-events") return 1;
  if (source.config.htmlAdapterKey === "szpz-mushing-events") return 1;
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

async function responseText(response: Response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) {
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
      if (bytes > MAX_SOURCE_BYTES) {
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
) {
  if (!source.sourceUrl || !isSafeAutomationSourceUrl(source.sourceUrl)) {
    throw new AutomationConnectorError("unsafe_or_missing_source_url");
  }

  const originalUrl = source.sourceUrl;
  let currentUrl = originalUrl;
  const seen = new Set<string>();
  let redirectCount = 0;

  while (true) {
    const loopKey = redirectVisitKey(currentUrl);
    if (seen.has(loopKey)) throw new AutomationConnectorError("source_redirect_loop");
    seen.add(loopKey);

    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        headers: {
          accept: source.connectorType === "STRUCTURED_JSON" ? "application/json" : "text/html,application/xhtml+xml",
          "user-agent": "PsipediaDataResearch/1.0 (+https://psipedia.sk)",
        },
        signal: AbortSignal.timeout(source.timeoutMs),
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
      if (redirectCount >= MAX_REDIRECT_HOPS) throw new AutomationConnectorError("source_redirect_too_many");
      let target: URL;
      try {
        target = new URL(location, currentUrl);
      } catch {
        throw new AutomationConnectorError("source_redirect_invalid");
      }
      if (!isSafeAutomationSourceUrl(target.toString())) {
        throw new AutomationConnectorError("source_redirect_blocked");
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
    if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
      throw new AutomationConnectorError("source_response_too_large");
    }
    return { response, finalUrl: currentUrl };
  }
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

  return withRetry(source, async () => {
    const fetched = await fetchOnce(source, fetchImpl, context.onResponse);
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

    const adapterKey = source.config.htmlAdapterKey?.trim();
    const adapter = adapterKey ? context.htmlAdapters?.[adapterKey] : undefined;
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
