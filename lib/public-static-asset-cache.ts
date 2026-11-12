/**
 * Only content-addressed, public vinext client assets can be cached for a year.
 * No public HTML, API, R2 media, query/Range response or user data is in scope.
 */
export const IMMUTABLE_BUILD_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

const HASHED_ASSET = /^\/assets\/(?:[a-z0-9._-]+\/)*[a-z0-9][a-z0-9._-]*-[a-z0-9_-]{8,}\.(?:css|js|woff2?|png|jpe?g|webp|avif|svg)$/i;

export function isEligibleImmutableBuildAsset(request: Request, url: URL): boolean {
  if (request.method !== "GET") return false;
  if (url.search || request.headers.has("authorization") || request.headers.has("range")) return false;
  return HASHED_ASSET.test(url.pathname);
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
