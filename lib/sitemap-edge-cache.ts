import { validSitemapXml } from "./sitemap-xml-validator.ts";
export { validSitemapXml } from "./sitemap-xml-validator.ts";

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

function upstreamForbidsSharedCache(response: Response): boolean {
  return response.headers.has("set-cookie")
    || /(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|,|=|$)/i.test(response.headers.get("cache-control") ?? "")
    || response.headers.get("vary")?.split(",").some((value) => value.trim() === "*") === true;
}

function upstreamAllowsSharedCache(response: Response): boolean {
  if (response.status !== 200 || upstreamForbidsSharedCache(response)) return false;
  if (response.headers.has("set-cookie")) return false;
  if (/(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|,|=|$)/i.test(response.headers.get("cache-control") ?? "")) return false;
  return /(?:application|text)\/xml|application\/xhtml\+xml/i.test(response.headers.get("content-type") ?? "");
}

/** Read the XML without buffering an unbounded origin body; fail closed on bad UTF-8. */
async function boundedSitemapXml(response: Response): Promise<string | null> {
  const indicatedSize = response.headers.get("content-length");
  if (indicatedSize && /^\d+$/.test(indicatedSize) && Number(indicatedSize) > MAX_SITEMAP_BYTES) return null;
  const reader = response.clone().body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SITEMAP_BYTES) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    void reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
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

function invalidOriginResponse(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 502,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Previously cached snapshots can predate the hardened validator: recheck on HIT. */
async function validCachedResponse(cached: Response | undefined): Promise<boolean> {
  if (!cached || cached.status !== 200 || !upstreamAllowsSharedCache(cached)) return false;
  const xml = await boundedSitemapXml(cached);
  return xml !== null && validSitemapXml(xml);
}

async function lastGoodOrOriginal(
  request: Request,
  storage: SitemapCache,
  originalResponse?: Response,
  originalError?: unknown,
): Promise<Response> {
  try {
    const previous = await storage.match(sitemapCacheKey(request.url, "last-good"));
    if (previous && await validCachedResponse(previous)) {
      const headers = new Headers(previous.headers);
      // Do not invite downstream caches to extend the stale interval.
      headers.set("Cache-Control", "no-store");
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
    if (cached && await validCachedResponse(cached)) return cached;
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

  // An explicit origin privacy/cache prohibition also forbids stale substitution.
  if (upstreamForbidsSharedCache(response)) return response;

  if (!upstreamAllowsSharedCache(response)) {
    if (response.status >= 500) {
      console.error(JSON.stringify({ event: "sitemap_origin_failed", status: response.status }));
      return lastGoodOrOriginal(request, storage, response);
    }
    return response;
  }

  const xml = await boundedSitemapXml(response);
  if (xml === null || !validSitemapXml(xml)) {
    console.error(JSON.stringify({ event: "sitemap_invalid_xml", cached: false }));
    return lastGoodOrOriginal(request, storage, invalidOriginResponse());
  }

  const writes = Promise.allSettled([
    Promise.resolve().then(() => storage.put(sitemapCacheKey(request.url, "fresh"), cachedXmlResponse(xml, SITEMAP_FRESH_TTL_SECONDS))),
    Promise.resolve().then(() => storage.put(sitemapCacheKey(request.url, "last-good"), cachedXmlResponse(xml, SITEMAP_LAST_GOOD_TTL_SECONDS))),
  ]).then(() => undefined);
  try {
    context.waitUntil(writes);
  } catch {
    // Background registration failure must not turn valid origin XML into 500.
  }
  return response;
}
