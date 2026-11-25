import { isTransientPublicReadError } from "./public-read-retry.ts";

/**
 * Only for optional presentation reads: known transient failures may degrade
 * an independent component. Unknown, auth and framework errors remain visible.
 * Never use an empty fallback for an essential listing or account permission.
 */
export async function settleOptionalRead<T, F>(
  stage: string,
  read: Promise<T>,
  fallback: F,
): Promise<T | F> {
  try {
    return await read;
  } catch (error) {
    if (!isTransientPublicReadError(error)) throw error;
    console.warn(JSON.stringify({ event: "optional_read_unavailable", stage }));
    return fallback;
  }
}

/** Cache storage is an optimization, never a prerequisite for a public response. */
export async function matchOptionalPublicCache(
  cache: Pick<Cache, "match">,
  key: Request,
  stage: "html" | "media" | "hero",
): Promise<Response | undefined> {
  try {
    return await cache.match(key);
  } catch {
    console.warn(JSON.stringify({ event: "public_cache_unavailable", stage, operation: "match" }));
    return undefined;
  }
}

export async function putOptionalPublicCache(
  cache: Pick<Cache, "put">,
  key: Request,
  response: Response,
  stage: "html" | "media" | "hero",
): Promise<void> {
  try {
    await cache.put(key, response);
  } catch {
    console.warn(JSON.stringify({ event: "public_cache_unavailable", stage, operation: "put" }));
  }
}
