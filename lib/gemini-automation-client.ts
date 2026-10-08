import { GeminiAutomationError, type GeminiRuntimeConfig } from "./gemini-automation-types.ts";

export type GeminiFetch = typeof fetch;
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_TIMEOUT_MS = 30_000;
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

export function resolveGeminiConfig(env: GeminiRuntimeConfig) {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiAutomationError("CONFIG_MISSING");
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  if (!MODEL_PATTERN.test(model)) throw new GeminiAutomationError("CONFIG_MISSING");
  return { key, model };
}

/** Server-only low-level transport; callers must explicitly supply approved public payloads. */
export function createGeminiAutomationClient(options: {
  env: GeminiRuntimeConfig;
  fetchImpl?: GeminiFetch;
  timeoutMs?: number;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.trunc(options.timeoutMs ?? 12_000)));
  return {
    async generateContent(payload: { contents: Array<{ role: "user"; parts: Array<{ text: string }> }> }) {
      const { key, model } = resolveGeminiConfig(options.env);
      // No automatic grounding or discovery tools; the payload is owned by the caller.
      if (!payload || !Array.isArray(payload.contents) || !payload.contents.length) {
        throw new GeminiAutomationError("INVALID_RESPONSE");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({ contents: payload.contents }),
            signal: controller.signal,
          },
        );
        if (response.status === 401 || response.status === 403) throw new GeminiAutomationError("AUTH_FAILED", response.status);
        if (response.status === 429) throw new GeminiAutomationError("RATE_LIMITED", response.status);
        if (!response.ok) throw new GeminiAutomationError("PROVIDER_ERROR", response.status);
        // Bound provider response memory and forbid persisting/logging the raw body.
        const length = Number(response.headers.get("content-length") || 0);
        if (length > 512_000) throw new GeminiAutomationError("INVALID_RESPONSE");
        const raw = await response.text();
        if (raw.length > 512_000) throw new GeminiAutomationError("INVALID_RESPONSE");
        let data: unknown;
        try { data = JSON.parse(raw); } catch { throw new GeminiAutomationError("INVALID_RESPONSE"); }
        if (!data || typeof data !== "object" || !Array.isArray((data as { candidates?: unknown }).candidates)) {
          throw new GeminiAutomationError("INVALID_RESPONSE");
        }
        return { model, candidates: (data as { candidates: unknown[] }).candidates };
      } catch (error) {
        if (error instanceof GeminiAutomationError) throw error;
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          throw new GeminiAutomationError("TIMEOUT");
        }
        throw new GeminiAutomationError("PROVIDER_ERROR");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
