import { logStability, stabilityDuration, type StabilityStage } from "./stability-diagnostics.ts";
import { isTransientPublicReadError } from "./public-read-retry.ts";

/**
 * Only for optional presentation reads: known transient failures may degrade
 * an independent component. Unknown, auth and framework errors remain visible.
 * Never use an empty fallback for an essential listing or account permission.
 */
export async function settleOptionalRead<T, F>(
  stage: StabilityStage,
  read: Promise<T>,
  fallback: F,
): Promise<T | F> {
  const start = performance.now();
  try {
    return await read;
  } catch (error) {
    if (!isTransientPublicReadError(error)) throw error;
    logStability({ stage, dependency: "read", outcome: "degraded", transient: true, durationMs: stabilityDuration(start) });
    return fallback;
  }
}

/** Cache storage is an optimization, never a prerequisite for a public response. */
export async function matchOptionalPublicCache(
  cache: Pick<Cache, "match">,
  key: Request,
  stage: "html" | "media" | "hero",
): Promise<Response | undefined> {
  const start = performance.now();
  try {
    return await cache.match(key);
  } catch {
    logStability({ stage, dependency: "cache", outcome: "degraded", operation: "match", durationMs: stabilityDuration(start) });
    return undefined;
  }
}

export async function putOptionalPublicCache(
  cache: Pick<Cache, "put">,
  key: Request,
  response: Response,
  stage: "html" | "media" | "hero",
): Promise<void> {
  const start = performance.now();
  try {
    await cache.put(key, response);
  } catch {
    logStability({ stage, dependency: "cache", outcome: "degraded", operation: "put", durationMs: stabilityDuration(start) });
  }
}
