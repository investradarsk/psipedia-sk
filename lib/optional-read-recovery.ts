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
