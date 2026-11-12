/**
 * Only content-addressed, public vinext client assets can be cached for a year.
 * No public HTML, API, R2 media, query/Range response or user data is in scope.
 */
export const IMMUTABLE_BUILD_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

const HASHED_ASSET = /^\/assets\/(?:[a-z0-9._-]+\/)*[a-z0-9][a-z0-9._-]*-[a-z0-9_-]{8,}\.(?:css|js|woff2?|png|jpe?g|webp|avif|svg)$/i;
// A single audited CSS asset is intentionally outside Vite's asset graph.
// Its filename contains the 12-character Git blob fingerprint of the exact
// CSS content, so browser caching is safe without a session or query key.
const VERSIONED_BREED_STYLESHEET = /^\/styles\/breed-reference-[a-f0-9]{12}\.css$/;

export function isEligibleImmutableBuildAsset(request: Request, url: URL): boolean {
  if (request.method !== "GET") return false;
  if (url.search || request.headers.has("authorization") || request.headers.has("range")) return false;
  return HASHED_ASSET.test(url.pathname) || VERSIONED_BREED_STYLESHEET.test(url.pathname);
}

export function isImmutableBuildAssetResponse(response: Response, path: string): boolean {
  if (response.status !== 200 || response.headers.has("set-cookie")) return false;
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "css") return contentType.includes("text/css");
  if (extension === "js") return contentType.includes("javascript");
  if (extension === "woff" || extension === "woff2") return contentType.includes("font/");
  return contentType.startsWith("image/");
}
