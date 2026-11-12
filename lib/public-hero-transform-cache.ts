/**
 * One explicitly public, repository-owned homepage photo may be cached at the
 * Cloudflare POP after its image transformation. Do not cache arbitrary
 * /_vinext/image?url= inputs, R2 media, user uploads, or authenticated requests.
 */
export const PUBLIC_HERO_TRANSFORM_EDGE_TTL_SECONDS = 86400;
export const PUBLIC_HERO_TRANSFORM_BROWSER_CACHE_CONTROL = "public, max-age=86400";

const HERO_URL = "/images/hero-labrador.webp";
const HERO_WIDTHS = new Set(["384", "640", "828", "1200", "1920"]);
const SECRET_REQUEST_HEADERS = [
  "authorization", "cookie", "cf-access-jwt-assertion",
  "x-psipedia-admin-authorized", "x-psipedia-auth-provider",
  "oai-authenticated-user-email", "range", "if-range",
  "if-none-match", "if-modified-since",
];

function acceptVariant(request: Request): string {
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  if (accept.includes("image/avif")) return "avif";
  if (accept.includes("image/webp")) return "webp";
  return "fallback";
}

/** Internal versioned key, never sent as a new URL to the image handler. */
export function publicHeroTransformEdgeCacheKey(
  request: Request,
  workerVersion?: string,
): Request | null {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== "psipedia.sk" || url.pathname !== "/_vinext/image") return null;
  if (request.method !== "GET" || !workerVersion) return null;
  if (SECRET_REQUEST_HEADERS.some(header => request.headers.has(header))) return null;
  if (/no-cache|no-store/i.test(request.headers.get("cache-control") ?? "") || request.headers.has("pragma")) return null;
  const params = [...url.searchParams.entries()];
  if (params.length !== 3 || new Set(params.map(([key]) => key)).size !== 3) return null;
  if (url.searchParams.get("url") !== HERO_URL) return null;
  if (!HERO_WIDTHS.has(url.searchParams.get("w") ?? "")) return null;
  if (url.searchParams.get("q") !== "72") return null;

  url.searchParams.set("__psipedia_cf_version", workerVersion);
  // Cloudflare Cache API does not partition entries by Vary: Accept. The
  // accept format must be encoded in the cache key explicitly.
  url.searchParams.set("__psipedia_hero_accept", acceptVariant(request));
  return new Request(url.toString(), { method: "GET" });
}

export function isCacheablePublicHeroTransformResponse(response: Response): boolean {
  if (response.status !== 200 || response.headers.has("set-cookie")) return false;
  if (!/^image\/(?:avif|webp|jpeg|png)(?:\s*;|\s*$)/i.test(response.headers.get("content-type") ?? "")) return false;
  const cc = response.headers.get("cache-control")?.toLowerCase() ?? "";
  if (/(?:^|,)\s*(?:private|no-store|no-cache)\b/.test(cc)) return false;
  const vary = response.headers.get("vary");
  if (vary && vary.split(",").some(v => ["*", "cookie", "authorization", "cf-access-jwt-assertion"].includes(v.trim().toLowerCase()))) return false;
  return true;
}
