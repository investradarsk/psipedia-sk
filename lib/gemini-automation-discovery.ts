import { createGeminiDiscoveryRequest, buildGeminiDiscoveryJsonSchema, buildGeminiDiscoveryPrompt,
  parseGeminiDiscoveryEnvelope, GeminiDiscoverySchemaError, type GeminiDiscoveryCandidateV1,
} from "./gemini-automation-discovery-contract.ts";
import { resolveGeminiConfig, type GeminiFetch } from "./gemini-automation-client.ts";
import type { GeminiCategoryExclusionContext } from "./gemini-automation-category-memory.ts";
import { GeminiAutomationError, type GeminiRuntimeConfig } from "./gemini-automation-types.ts";

const DISCOVERY_TIMEOUT_MS = 120_000;
const GEMINI_DISCOVERY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

type UnknownRecord = Record<string, unknown>;
type ProviderResult = { model: string; payload: unknown };
type DiscoveryOptions = {
  env: GeminiRuntimeConfig;
  stableKey: string;
  maxCandidates: number;
  fetchImpl?: GeminiFetch;
  timeoutMs?: number;
  knownContext?: GeminiCategoryExclusionContext;
};

/**
 * Interactions API (v1beta, post-May-2026 steps format).
 * The earlier foundation generateContent client stays compatible and unmodified.
 * Official contract: https://ai.google.dev/gemini-api/docs/structured-output
 * Grounding citations: https://ai.google.dev/gemini-api/docs/google-search
 */
function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}
type InvalidResponseReason =
  | "INTERACTION_SHAPE" | "INTERACTION_STATUS" | "STEPS_INVALID"
  | "SEARCH_CALL_INVALID" | "SEARCH_RESULT_INVALID" | "SEARCH_RESULT_MISSING"
  | "MODEL_OUTPUT_INVALID" | "OUTPUT_JSON_INVALID" | "DISCOVERY_SCHEMA_INVALID"
  | "RESPONSE_TOO_LARGE";
type SafeDiagnostic = {
  status?: string;
  stepCount?: number;
  stepTypes?: string[];
  modelOutputBlocks?: number;
  searchCalls?: number;
  searchResults?: number;
  citations?: number;
  searchQueryCount?: number;
  jsonParsed?: boolean;
  schemaValid?: boolean;
  schemaFailure?: string;
  responseBytes?: number;
};
const KNOWN_STATUSES = new Set(["completed", "failed", "in_progress", "requires_action", "cancelled"]);
const KNOWN_STEP_TYPES = new Set(["google_search_call", "google_search_result", "model_output", "thought", "user_input"]);

/** Never log the provider payload, its text, URLs, queries, candidates, prompt or credentials. */
function fail(reason: InvalidResponseReason, safe: SafeDiagnostic = {}): never {
  console.warn("gemini_discovery_invalid_response", {
    reason,
    status: safe.status ?? "unknown",
    stepCount: safe.stepCount ?? 0,
    stepTypes: safe.stepTypes ?? [],
    modelOutputBlocks: safe.modelOutputBlocks ?? 0,
    googleSearchCalls: safe.searchCalls ?? 0,
    googleSearchResults: safe.searchResults ?? 0,
    citations: safe.citations ?? 0,
    jsonParsed: safe.jsonParsed ?? false,
    schemaValid: safe.schemaValid ?? false,
    schemaFailure: safe.schemaFailure ?? "NONE",
    ...(safe.responseBytes === undefined ? {} : { responseBytes: safe.responseBytes }),
  });
  throw new GeminiAutomationError("INVALID_RESPONSE", undefined, Math.min(100, Math.max(0, safe.searchQueryCount ?? 0)));
}
function citedUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
function groundedResponse(payload: unknown): {
  output: unknown;
  groundedSearchQueryCount: number;
  diagnostic: SafeDiagnostic;
} {
  const value = record(payload);
  if (!value) fail("INTERACTION_SHAPE");
  const safe: SafeDiagnostic = {
    status: typeof value.status === "string" && KNOWN_STATUSES.has(value.status) ? value.status : "unknown",
    stepCount: Array.isArray(value.steps) ? Math.min(value.steps.length, 81) : 0,
    stepTypes: [],
    modelOutputBlocks: 0,
    searchCalls: 0,
    searchResults: 0,
    citations: 0,
    searchQueryCount: 0,
    jsonParsed: false,
    schemaValid: false,
  };
  const invalid = (reason: InvalidResponseReason): never => fail(reason, safe);
  if (value.status !== "completed") invalid("INTERACTION_STATUS");
  if (!Array.isArray(value.steps) || value.steps.length > 80) invalid("STEPS_INVALID");
  const textPieces: string[] = [];
  const citations = new Set<string>();
  const callIds = new Set<string>();
  const resultIds = new Set<string>();
  let searchCount = 0;
  let textLength = 0;
  for (const raw of value.steps) {
    const step = record(raw);
    if (!step || typeof step.type !== "string") invalid("STEPS_INVALID");
    const safeType = KNOWN_STEP_TYPES.has(step.type) ? step.type : "other";
    if (!safe.stepTypes!.includes(safeType) && safe.stepTypes!.length < 8) safe.stepTypes!.push(safeType);
    if (step.type === "google_search_call") {
      safe.searchCalls!++;
      const args = record(step.arguments);
      if (!args || typeof step.id !== "string" || !step.id || step.id.length > 256 ||
        callIds.has(step.id)) invalid("SEARCH_CALL_INVALID");
      callIds.add(step.id);
      // Both shapes appear in the official v1beta documentation. Never accept a hybrid.
      const keys = Object.keys(args);
      if (keys.length !== 1 || !["query", "queries"].includes(keys[0])) invalid("SEARCH_CALL_INVALID");
      const queries = keys[0] === "query" ? [args.query] : args.queries;
      if (!Array.isArray(queries) || queries.length < 1 || queries.length > 30 ||
        queries.some((query) => typeof query !== "string" || !query.trim() || query.length > 300)) {
        invalid("SEARCH_CALL_INVALID");
      }
      searchCount += queries.length;
      safe.searchQueryCount = Math.min(searchCount, 100);
    } else if (step.type === "google_search_result") {
      safe.searchResults!++;
      if (typeof step.call_id !== "string" || !step.call_id || step.call_id.length > 256 ||
        step.is_error === true || !Array.isArray(step.result) || step.result.length > 100 ||
        step.result.some((item: unknown) => !record(item))) invalid("SEARCH_RESULT_INVALID");
      resultIds.add(step.call_id);
    } else if (step.type === "model_output") {
      if (!Array.isArray(step.content) || step.content.length > 32) invalid("MODEL_OUTPUT_INVALID");
      for (const content of step.content) {
        const part = record(content);
        if (!part || part.type !== "text" || typeof part.text !== "string") invalid("MODEL_OUTPUT_INVALID");
        safe.modelOutputBlocks!++;
        textLength += part.text.length;
        if (textLength > 100_000) invalid("RESPONSE_TOO_LARGE");
        textPieces.push(part.text);
        const annotations = part.annotations;
        if (annotations === undefined) continue;
        if (!Array.isArray(annotations) || annotations.length > 128) invalid("MODEL_OUTPUT_INVALID");
        for (const annotation of annotations) {
          const citation = record(annotation);
          if (citation?.type === "url_citation") {
            const normalized = citedUrl(citation.url);
            if (normalized) citations.add(normalized);
          }
        }
      }
    }
  }
  safe.citations = Math.min(citations.size, 128);
  if (safe.searchCalls! < 1 || searchCount < 1) invalid("SEARCH_CALL_INVALID");
  if (safe.searchResults! < 1 || ![...resultIds].every((id) => callIds.has(id))) invalid("SEARCH_RESULT_MISSING");
  if (textPieces.length < 1 || !textLength) invalid("MODEL_OUTPUT_INVALID");
  // Text blocks are optional/multiple in the wire contract; JSON remains validated as one document.
  let output: unknown;
  try { output = JSON.parse(textPieces.join("")); } catch { invalid("OUTPUT_JSON_INVALID"); }
  safe.jsonParsed = true;
  return { output, groundedSearchQueryCount: Math.min(searchCount, 100), diagnostic: safe };
}

async function interact(options: {
  env: GeminiRuntimeConfig;
  prompt: string;
  schema: unknown;
  fetchImpl?: GeminiFetch;
  timeoutMs?: number;
}): Promise<ProviderResult> {
  const { key, model } = resolveGeminiConfig(options.env);
  // Structured output + built-in Search is a Gemini 3-series capability.
  // Fail before network for foundation's default 2.5 model; never silently switch models.
  if (!/^gemini-3(?:[.-]|$)/.test(model)) throw new GeminiAutomationError("CONFIG_MISSING");
  // Grounded Google Search + structured output can take longer than simple generation.
  // This single-request budget is discovery-only; no retries or fallback.
  const timeoutMs = Math.min(DISCOVERY_TIMEOUT_MS, Math.max(1, Math.trunc(options.timeoutMs ?? DISCOVERY_TIMEOUT_MS)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(
      "https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model,
          input: options.prompt,
          tools: [{ type: "google_search" }],
          response_format: { type: "text", mime_type: "application/json", schema: options.schema },
          store: false,
        }),
        signal: controller.signal,
      });
    if (response.status === 401 || response.status === 403) throw new GeminiAutomationError("AUTH_FAILED", response.status);
    if (response.status === 429) throw new GeminiAutomationError("RATE_LIMITED", response.status);
    if (!response.ok) throw new GeminiAutomationError("PROVIDER_ERROR", response.status);
    const length = Number(response.headers.get("content-length") || 0);
    if (!Number.isFinite(length) || length > GEMINI_DISCOVERY_MAX_RESPONSE_BYTES) {
      fail("RESPONSE_TOO_LARGE", { responseBytes: Number.isSafeInteger(length) && length >= 0 ? length : undefined });
    }
    const raw = await response.text();
    const responseBytes = new TextEncoder().encode(raw).byteLength;
    if (responseBytes > GEMINI_DISCOVERY_MAX_RESPONSE_BYTES) fail("RESPONSE_TOO_LARGE", { responseBytes });
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { fail("INTERACTION_SHAPE"); }
    return { model, payload };
  } catch (error) {
    if (error instanceof GeminiAutomationError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new GeminiAutomationError("TIMEOUT");
    }
    throw new GeminiAutomationError("PROVIDER_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Purely on-demand provider boundary. No DB, admin API, cron, Notion, dedupe or persistence.
 * The only caller-provided discovery fields are the server-known stableKey and a bounded max.
 */
export async function discoverGeminiCandidates(options: DiscoveryOptions): Promise<{
  candidates: GeminiDiscoveryCandidateV1[];
  providerMetrics: {
    model: string;
    requestCount: 1;
    groundedSearchQueryCount: number;
    candidateCount: number;
  };
}> {
  // Validate catalog and limits before even resolving provider config, let alone fetching.
  const request = createGeminiDiscoveryRequest({ stableKey: options.stableKey, maxCandidates: options.maxCandidates });
  const response = await interact({
    env: options.env,
    prompt: buildGeminiDiscoveryPrompt(request, options.knownContext),
    schema: buildGeminiDiscoveryJsonSchema(request),
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  const { output, groundedSearchQueryCount, diagnostic } = groundedResponse(response.payload);
  let parsed: ReturnType<typeof parseGeminiDiscoveryEnvelope>;
  try {
    parsed = parseGeminiDiscoveryEnvelope(output, request);
  } catch (error) {
    if (error instanceof GeminiAutomationError && error.code === "INVALID_RESPONSE") {
      fail("DISCOVERY_SCHEMA_INVALID", { ...diagnostic,
        schemaFailure: error instanceof GeminiDiscoverySchemaError ? error.schemaFailure : "CANDIDATE_STRUCTURE" });
    }
    throw error;
  }
  diagnostic.schemaValid = true;
  // REVIEW-FIRST: Google Search must have executed and local Discovery Candidate V1
  // strictly validates public source/evidence URLs. Candidates then pass through
  // deterministic dedupe and human review in unpublished drafts/Notion concepts.
  // Inline Google citations are optional diagnostics, never a creation gate.
  // Publishing without an explicit human decision is not available here.
  return {
    candidates: parsed.candidates,
    providerMetrics: {
      model: response.model,
      requestCount: 1,
      groundedSearchQueryCount,
      candidateCount: parsed.candidates.length,
    },
  };
}
