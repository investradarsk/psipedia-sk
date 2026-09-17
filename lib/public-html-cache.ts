const PUBLIC_HTML_CACHE_VERSION_PARAM = "__psipedia_worker_version";

type PublicHtmlCacheStorage = Pick<Cache, "delete">;

/**
 * Build an internal Cache API key that isolates HTML across Worker versions.
 * The public request URL is never mutated or passed to the application router.
 */
export function versionedPublicHtmlCacheUrl(publicUrl: URL, workerVersionId: string): URL {
  if (!workerVersionId) throw new Error("Worker version metadata is required for public HTML caching.");
  const cacheUrl = new URL(publicUrl);
  cacheUrl.searchParams.set(PUBLIC_HTML_CACHE_VERSION_PARAM, workerVersionId);
  return cacheUrl;
}

/**
 * Remove one public HTML entry from the same versioned Cache API namespace used
 * by the Worker. Missing Cache API/version metadata is a safe no-op because no
 * matching Worker cache entry can be addressed in that runtime.
 */
export async function invalidateVersionedPublicHtmlCacheUrl(
  publicUrl: URL,
  workerVersionId?: string,
  storage?: PublicHtmlCacheStorage,
): Promise<boolean> {
  if (!workerVersionId) return false;
  const resolved = storage ?? (globalThis as unknown as { caches?: { default?: PublicHtmlCacheStorage } }).caches?.default;
  if (!resolved) return false;
  return resolved.delete(new Request(versionedPublicHtmlCacheUrl(publicUrl, workerVersionId), { method: "GET" }));
}
