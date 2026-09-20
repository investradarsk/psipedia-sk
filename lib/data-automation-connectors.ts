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
}) => Promise<AutomationSourceRecord[]> | AutomationSourceRecord[];

export type AutomationConnectorContext = {
  fetchImpl?: AutomationFetch;
  htmlAdapters?: Record<string, ControlledHtmlAdapter>;
  sleep?: (ms: number) => Promise<void>;
};

const MAX_SOURCE_BYTES = 1_000_000;

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

async function responseText(response: Response) {
  const text = await response.text();
  if (text.length > MAX_SOURCE_BYTES) throw new AutomationConnectorError("source_response_too_large");
  return text;
}

async function fetchOnce(source: AutomationSource, fetchImpl: AutomationFetch) {
  if (!source.sourceUrl || !isSafeAutomationSourceUrl(source.sourceUrl)) {
    throw new AutomationConnectorError("unsafe_or_missing_source_url");
  }
  let response: Response;
  try {
    response = await fetchImpl(source.sourceUrl, {
      headers: {
        accept: source.connectorType === "STRUCTURED_JSON" ? "application/json" : "text/html,application/xhtml+xml",
        "user-agent": "PsipediaDataResearch/1.0 (+https://psipedia.sk)",
      },
      signal: AbortSignal.timeout(source.timeoutMs),
    });
  } catch {
    throw new AutomationConnectorError("source_request_failed", true);
  }
  if (!response.ok) {
    throw new AutomationConnectorError(
      `source_http_${response.status}`,
      shouldRetryAutomationStatus(response.status),
    );
  }
  return response;
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
    const response = await fetchOnce(source, fetchImpl);
    if (source.connectorType === "STRUCTURED_JSON") {
      const text = await responseText(response);
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new AutomationConnectorError("structured_json_invalid_json");
      }
      return sourceRecordsFromPayload(payload, source);
    }

    const adapterKey = source.config.htmlAdapterKey?.trim();
    const adapter = adapterKey ? context.htmlAdapters?.[adapterKey] : undefined;
    if (!adapter) throw new AutomationConnectorError("controlled_html_adapter_not_configured");
    const html = await responseText(response);
    return boundedAutomationRecords(await adapter({ html, source }), source.maxRecordsPerRun);
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
