import { RESPONSIVE_MEDIA_WIDTHS } from "./responsive-media.ts";

// /media assets are public and already served with immutable browser caching.
// Keep the shorter POP cache independent of the SSR/HTML cache.
export const PUBLIC_MEDIA_EDGE_TTL_SECONDS = 300;
export const PUBLIC_MEDIA_BROWSER_CACHE_CONTROL = "public, max-age=31536000, immutable";

const PUBLIC_RASTER_MEDIA_PATH = /^\/media\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:jpe?g|png|webp|avif)$/i;
const NON_PUBLIC_PREFIXES = new Set(["safe", "quarantine", "quality-missing-candidates"]);
const PRIVATE_REQUEST_HEADERS = [
  "authorization", "cookie", "cf-access-jwt-assertion",
  "x-psipedia-admin-authorized", "x-psipedia-auth-provider",
  "oai-authenticated-user-email", "range", "if-range",
];

export function isEligiblePublicMediaEdgeRequest(request: Request, url = new URL(request.url)): boolean {
  if (request.method !== "GET" || url.hostname.toLowerCase() !== "psipedia.sk") return false;
  if (!PUBLIC_RASTER_MEDIA_PATH.test(url.pathname)) return false;
  if (NON_PUBLIC_PREFIXES.has(url.pathname.split("/")[2]?.toLowerCase() ?? "")) return false;
  if (PRIVATE_REQUEST_HEADERS.some((name) => request.headers.has(name))) return false;
  if (request.headers.get("cache-control")?.toLowerCase().includes("no-cache") || request.headers.has("pragma")) return false;
  if (request.headers.has("if-none-match") || request.headers.has("if-modified-since")) return false;

  if (url.search) {
    const params = [...url.searchParams.entries()];
    if (params.length !== 1 || params[0][0] !== "w") return false;
    const width = params[0][1];
    if (!/^[1-9]\d*$/.test(width) || !RESPONSIVE_MEDIA_WIDTHS.includes(Number(width) as typeof RESPONSIVE_MEDIA_WIDTHS[number])) return false;
  }
  return true;
}

export function isCacheablePublicMediaEdgeResponse(response: Response): boolean {
  if (response.status !== 200 || response.headers.has("set-cookie")) return false;
  if (!/^image\/(?:jpeg|png|webp|avif)(?:\s*;|\s*$)/i.test(response.headers.get("content-type") ?? "")) return false;

  const control = (response.headers.get("cache-control") ?? "").toLowerCase();
  if (!/(?:^|,)\s*public\s*(?:,|$)/.test(control)) return false;
  if (/(?:^|,)\s*(?:private|no-store|no-cache|must-revalidate|proxy-revalidate)\b/.test(control)) return false;
  const maxAge = /(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/.exec(control);
  if (!maxAge || Number(maxAge[1]) < PUBLIC_MEDIA_EDGE_TTL_SECONDS) return false;

  for (const header of ["cdn-cache-control", "cloudflare-cdn-cache-control", "surrogate-control"]) {
    const value = response.headers.get(header)?.toLowerCase();
    if (value && /(?:^|,)\s*(?:private|no-store|no-cache|max-age=0|s-maxage=0)\b/.test(value)) return false;
  }
  const vary = response.headers.get("vary");
  if (vary && vary.split(",").some((item) => ["*", "cookie", "authorization", "cf-access-jwt-assertion"].includes(item.trim().toLowerCase()))) return false;
  return true;
}
