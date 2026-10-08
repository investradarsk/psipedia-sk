import { createGeminiDiscoveryRequest, buildGeminiDiscoveryJsonSchema, buildGeminiDiscoveryPrompt,
  parseGeminiDiscoveryEnvelope, type GeminiDiscoveryCandidateV1,
} from "./gemini-automation-discovery-contract.ts";
import { resolveGeminiConfig, type GeminiFetch } from "./gemini-automation-client.ts";
import { GeminiAutomationError, type GeminiRuntimeConfig } from "./gemini-automation-types.ts";

type UnknownRecord = Record<string, unknown>;
type ProviderResult = { model: string; payload: unknown };
type DiscoveryOptions = {
  env: GeminiRuntimeConfig;
  stableKey: string;
  maxCandidates: number;
  fetchImpl?: GeminiFetch;
  timeoutMs?: number;
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
function fail(): never { throw new GeminiAutomationError("INVALID_RESPONSE"); }
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
  citedUrls: Set<string>;
} {
  const value = record(payload);
  if (!value || value.status !== "completed" || !Array.isArray(value.steps) || value.steps.length > 80) fail();
  const textBlocks: UnknownRecord[] = [];
  const citations = new Set<string>();
  let calls = 0;
  let results = 0;
  let searchCount = 0;
  for (const raw of value.steps) {
    const step = record(raw);
    if (!step) fail();
    if (step.type === "google_search_call") {
      calls++;
      const queries = record(step.arguments)?.queries;
      if (!Array.isArray(queries) || queries.length > 30 ||
        queries.some((query) => typeof query !== "string" || query.length > 300)) fail();
      searchCount += queries.filter((q: string) => q.trim().length > 0).length;
    }
    if (step.type === "google_search_result") results++;
    if (step.type === "model_output") {
      if (!Array.isArray(step.content)) fail();
      for (const content of step.content) {
        const part = record(content);
        if (!part || part.type !== "text") fail();
        textBlocks.push(part);
        const annotations = part.annotations;
        if (annotations === undefined) continue;
        if (!Array.isArray(annotations) || annotations.length > 128) fail();
        for (const annotation of annotations) {
          const citation = record(annotation);
          if (citation?.type === "url_citation") {
            const url = citedUrl(citation.url);
            if (url) citations.add(url);
          }
        }
      }
    }
  }
  // Search must actually have run; merely supplying the tool declaration is insufficient.
  if (calls < 1 || results < 1 || searchCount < 1 || textBlocks.length !== 1 ||
    typeof textBlocks[0].text !== "string" || textBlocks[0].text.length > 100_000) fail();
  let output: unknown;
  try { output = JSON.parse(textBlocks[0].text as string); } catch { fail(); }
  return { output, groundedSearchQueryCount: Math.min(searchCount, 100), citedUrls: citations };
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
  const timeoutMs = Math.min(30_000, Math.max(1, Math.trunc(options.timeoutMs ?? 12_000)));
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
    if (!Number.isFinite(length) || length > 512_000) fail();
    const raw = await response.text();
    if (raw.length > 512_000) fail();
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { fail(); }
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
    prompt: buildGeminiDiscoveryPrompt(request),
    schema: buildGeminiDiscoveryJsonSchema(request),
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  const { output, groundedSearchQueryCount, citedUrls } = groundedResponse(response.payload);
  const parsed = parseGeminiDiscoveryEnvelope(output, request);
  // For every entity, require an evidence source actually cited by Google's grounded model
  // output. Grounded search for a different entity must not authenticate invented records.
  for (const candidate of parsed.candidates) {
    if (!candidate.evidence.some((evidence) => {
      const normalized = citedUrl(evidence.source_url);
      return normalized !== null && citedUrls.has(normalized);
    })) fail();
  }
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
