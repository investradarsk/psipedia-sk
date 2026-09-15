const PUBLIC_HTML_CACHE_VERSION_PARAM = "__psipedia_worker_version";

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
