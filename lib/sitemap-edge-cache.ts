/**
 * Best-effort Cloudflare Cache API guard for the public XML sitemap.
 * Only a validated public 200 response can replace the previous snapshot.
 * The last-good slot intentionally outlives the fresh slot so a transient
 * origin 500 does not become a crawler-visible 500 in a warm Cloudflare POP.
 * It is not a substitute for repairing persistent origin/data failures.
 */
export const SITEMAP_FRESH_TTL_SECONDS = 10 * 60;
export const SITEMAP_LAST_GOOD_TTL_SECONDS = 60 * 60;
const CACHE_PARAMETER = "__psipedia_sitemap_cache";
const MAX_SITEMAP_BYTES = 8 * 1024 * 1024;

type SitemapCache = Pick<Cache, "match" | "put">;
type BackgroundContext = { waitUntil(task: Promise<unknown>): void };

export function eligiblePublicSitemapRequest(request: Request): boolean {
  const url = new URL(request.url);
  return request.method === "GET"
    && url.pathname === "/sitemap.xml"
    && !url.search
    && !request.headers.has("cookie")
    && !request.headers.has("authorization")
    && !request.headers.has("range");
}

export function sitemapCacheKey(requestUrl: string, kind: "fresh" | "last-good"): Request {
  const url = new URL(requestUrl);
  url.searchParams.set(CACHE_PARAMETER, kind);
  return new Request(url, { method: "GET" });
}

export function validSitemapXml(xml: string): boolean {
  const body = xml.trim();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_SITEMAP_BYTES) return false;
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) return false;
  const root = body.match(/^(?:<\?xml\s[^>]*\?>\s*)?<(urlset|sitemapindex)(?:\s[^>]*)?>/i)?.[1];
  if (!root) return false;
  return body.endsWith("</" + root + ">")
    && /<loc>\s*https:\/\/psipedia\.sk\//i.test(body);
}

function upstreamAllowsSharedCache(response: Response): boolean {
  if (response.status !== 200) return false;
  if (response.headers.has("set-cookie")) return false;
  if (/(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|,|=|$)/i.test(response.headers.get("cache-control") ?? "")) return false;
  return /(?:application|text)\/xml|application\/xhtml\+xml/i.test(response.headers.get("content-type") ?? "");
}

function cachedXmlResponse(xml: string, maxAgeSeconds: number): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=" + maxAgeSeconds,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function lastGoodOrOriginal(
  request: Request,
  storage: SitemapCache,
  originalResponse?: Response,
  originalError?: unknown,
): Promise<Response> {
  try {
    const previous = await storage.match(sitemapCacheKey(request.url, "last-good"));
    if (previous?.status === 200) {
      const headers = new Headers(previous.headers);
      // Do not invite downstream caches to extend the stale interval.
      headers.set("Cache-Control", "public, max-age=60");
      headers.set("X-Psipedia-Sitemap-Cache", "LAST_GOOD");
      return new Response(previous.body, { status: 200, headers });
    }
  } catch {
    // Best-effort cache read never hides the true origin response.
  }
  if (originalResponse) return originalResponse;
  throw originalError instanceof Error ? originalError : new Error("sitemap-origin-unavailable");
}

export async function servePublicSitemap(
  request: Request,
  origin: () => Promise<Response>,
  storage: SitemapCache | undefined,
  context: BackgroundContext,
): Promise<Response> {
  if (!eligiblePublicSitemapRequest(request) || !storage) return origin();

  try {
    const cached = await storage.match(sitemapCacheKey(request.url, "fresh"));
    if (cached?.status === 200) return cached;
  } catch {
    // Origin remains reachable when Cloudflare Cache API is unavailable.
  }

  let response: Response;
  try {
    response = await origin();
  } catch (error) {
    console.error(JSON.stringify({ event: "sitemap_origin_failed", kind: "exception" }));
    return lastGoodOrOriginal(request, storage, undefined, error);
  }

  if (!upstreamAllowsSharedCache(response)) {
    if (response.status >= 500) {
      console.error(JSON.stringify({ event: "sitemap_origin_failed", status: response.status }));
      return lastGoodOrOriginal(request, storage, response);
    }
    return response;
  }

  let xml: string;
  try {
    xml = await response.clone().text();
  } catch {
    return lastGoodOrOriginal(request, storage, response);
  }
  if (!validSitemapXml(xml)) {
    console.error(JSON.stringify({ event: "sitemap_invalid_xml", cached: false }));
    return lastGoodOrOriginal(request, storage, response);
  }

  const writes = Promise.allSettled([
    storage.put(sitemapCacheKey(request.url, "fresh"), cachedXmlResponse(xml, SITEMAP_FRESH_TTL_SECONDS)),
    storage.put(sitemapCacheKey(request.url, "last-good"), cachedXmlResponse(xml, SITEMAP_LAST_GOOD_TTL_SECONDS)),
  ]).then(() => undefined);
  context.waitUntil(writes);
  return response;
}
