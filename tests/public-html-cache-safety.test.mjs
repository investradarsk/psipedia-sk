import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { versionedPublicHtmlCacheUrl } from "../lib/public-html-cache.ts";
import { isExplicitAnonymousHtmlRoute } from "../lib/public-anonymous-html-cache.ts";

const source = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");

// Load only Worker cache helpers, stripping the small TypeScript annotations.
// This runs the real source logic without booting the application or fetching data.
function cacheOps(storage) {
  const begin = source.indexOf("function publicHtmlCache(");
  const end = source.indexOf("\nfunction responseWithHeader(", begin);
  assert.ok(begin >= 0 && end > begin);
  const cacheSrc = source.slice(begin, end)
    .replace(
      "(request: Request, url: URL, workerVersionId?: string): { storage: Cache; key: Request } | null",
      "(request, url, workerVersionId)",
    )
    .replace('(status: "HIT" | "MISS"): Record<string, string>', "(status)")
    .replaceAll("value: string", "value")
    .replaceAll("response: Response", "response")
    .replaceAll("): boolean", ")")
    .replace("(globalThis as unknown as { caches?: { default?: Cache } })", "globalThis");
  const headStart = source.indexOf("function responseWithHeaders(", end);
  const headEnd = source.indexOf("\nfunction isReviewAuthorRoute(", headStart);
  const headSrc = source.slice(headStart, headEnd)
    .replace("(response: Response, values: Record<string, string>): Response", "(response, values)");
  const routeStart = source.indexOf("function isReviewAuthorRoute(", headEnd);
  const routeEnd = source.indexOf("\nasync function verifyAccessIdentity(", routeStart);
  const routeSrc = source.slice(routeStart, routeEnd)
    .replaceAll("pathname: string", "pathname")
    .replaceAll("): boolean", ")");

  assert.ok(headStart > end && headEnd > headStart && routeStart >= headEnd && routeEnd > routeStart);
  assert.doesNotMatch(cacheSrc, /\bas unknown as\b|:\s*Response\b|:\s*Request\b/);

  const check = source.indexOf("if (!cache || (!isCacheableHtmlResponse(response) && !isExplicitAnonymousSsrHtml(response, url.pathname))) return response;");
  const rewrite = source.indexOf('const cacheable = responseWithHeaders(response, publicHtmlCacheHeaders("MISS"));');
  const put = source.indexOf("ctx.waitUntil(cache.storage.put(cache.key, cacheable.clone()))");
  assert.ok(check >= 0 && rewrite > check && put > rewrite, "Must check upstream response before overwriting and caching");

  const setup = "const globalThis = { caches: { default: storage } };\n" +
    "const ADMIN_AUTH_PATHS = [\"/admin\", \"/api/admin\"];\n" +
    "const PUBLIC_HTML_CACHE_TTL_SECONDS = 45;\n" +
    "const USER_EMAIL_HEADER = \"oai-authenticated-user-email\";\n" +
    "const ADMIN_AUTHORIZED_HEADER = \"x-psipedia-admin-authorized\";\n" +
    "const AUTH_PROVIDER_HEADER = \"x-psipedia-auth-provider\";\n";
  return new Function("storage", "versionedPublicHtmlCacheUrl", "isExplicitAnonymousHtmlRoute",
    setup + routeSrc + "\n" + cacheSrc + "\n" + headSrc + "\n" +
    "return {publicHtmlCache, publicHtmlCacheHeaders, isCacheableHtmlResponse, responseWithHeaders};"
  )(storage, versionedPublicHtmlCacheUrl, isExplicitAnonymousHtmlRoute);
}

function html(control = "public, s-maxage=120", extra = {}, status = 200) {
  return new Response("<html>safe fixture</html>", {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...(control === null ? {} : { "Cache-Control": control }), ...extra },
  });
}

test("public HTML allows normal anonymous HTML but blocks private/no-store and revalidation", () => {
  const { isCacheableHtmlResponse: allowed } = cacheOps({});
  assert.equal(allowed(html()), true);
  assert.equal(allowed(html(null)), true);
  assert.equal(allowed(html("public, max-age=45")), true);
  for (const control of [
    "private", "PRIVATE, max-age=900", 'private="Set-Cookie, Authorization"',
    "no-store", "public, NO-STORE", "no-cache", 'no-cache="Set-Cookie"',
    "must-revalidate", "proxy-revalidate", "max-age=0", "s-maxage=0",
    's-maxage="0"', "public, max-age=30", "public, s-maxage=44",
    "max-age=bogus", "s-maxage", "max-age=-1", "max-age=" + "9".repeat(320),
  ]) assert.equal(allowed(html(control)), false, control);
});

test("CDN, Surrogate, Pragma and Vary restrictions cannot be overwritten", () => {
  const { isCacheableHtmlResponse: allowed } = cacheOps({});
  for (const name of ["CDN-Cache-Control", "Cloudflare-CDN-Cache-Control", "Surrogate-Control"]) {
    for (const value of ["private", "no-store", "no-cache", "s-maxage=0"]) {
      assert.equal(allowed(html("public, s-maxage=120", { [name]: value })), false, name + ": " + value);
    }
  }
  assert.equal(allowed(html(null, { Pragma: "no-cache" })), false);
  for (const vary of ["*", "Cookie", "Accept-Encoding, Authorization", "CF-Access-JWT-Assertion"]) {
    assert.equal(allowed(html(null, { Vary: vary })), false, vary);
  }
  assert.equal(allowed(html(null, { Vary: "Accept-Encoding" })), true);
});

test("Set-Cookie, JSON and error responses cannot enter public HTML cache", () => {
  const { isCacheableHtmlResponse: allowed } = cacheOps({});
  assert.equal(allowed(html(null, { "Set-Cookie": "fake=test; HttpOnly" })), false);
  assert.equal(allowed(html(null, {}, 201)), false);
  assert.equal(allowed(html(null, {}, 404)), false);
  assert.equal(allowed(new Response("{}", { headers: { "content-type": "application/json" } })), false);
});

test("Worker helpers maintain HIT/MISS while private and authenticated requests bypass", async () => {
  const entries = new Map();
  const storage = {
    async match(req) { return entries.get(req.url)?.clone(); },
    async put(req, response) { entries.set(req.url, response.clone()); },
  };
  const ops = cacheOps(storage);
  // Corresponds directly to Worker.fetch cache match/guard/put sequence;
  // asserted above so drift fails the test.
  async function handle(req, upstream) {
    const candidate = ops.publicHtmlCache(req, new URL(req.url), "fixture-version");
    if (!candidate) return upstream;
    const cached = await candidate.storage.match(candidate.key);
    if (cached) return ops.responseWithHeaders(cached, ops.publicHtmlCacheHeaders("HIT"));
    if (!ops.isCacheableHtmlResponse(upstream)) return upstream;
    const miss = ops.responseWithHeaders(upstream, ops.publicHtmlCacheHeaders("MISS"));
    await candidate.storage.put(candidate.key, miss.clone());
    return miss;
  }

  const denied = await handle(new Request("https://psipedia.sk/sukromne"), html("private, no-store"));
  assert.equal(denied.headers.get("Cache-Control"), "private, no-store");
  assert.equal(denied.headers.get("X-Psipedia-Cache"), null);
  assert.equal(entries.size, 0);

  const req = new Request("https://psipedia.sk/plemena/labradorsky-retriever", { headers: { Accept: "text/html" } });
  const miss = await handle(req, html());
  assert.equal(miss.headers.get("X-Psipedia-Cache"), "MISS");
  assert.match(miss.headers.get("Cache-Control"), /s-maxage=45/);
  assert.equal(entries.size, 1);
  const hit = await handle(req, html());
  assert.equal(hit.headers.get("X-Psipedia-Cache"), "HIT");
  assert.equal(await hit.text(), "<html>safe fixture</html>");

  for (const path of [
    "/admin", "/admin/articles", "/api/admin", "/api/health", "/media/file",
    "/_next/static/file", "/recenzia", "/recenzia/test", "/plemena?term=a",
  ]) {
    const result = await handle(new Request("https://psipedia.sk" + path), html("private, no-store"));
    assert.equal(result.headers.get("X-Psipedia-Cache"), null, path);
  }
  for (const name of ["Cookie", "Authorization", "CF-Access-JWT-Assertion"]) {
    const result = await handle(new Request(req.url, { headers: { [name]: "fake-test-only" } }), html("private, no-store"));
    assert.equal(result.headers.get("X-Psipedia-Cache"), null, name);
  }
  const withCookie = await handle(new Request("https://psipedia.sk/with-cookie"), html("public", { "Set-Cookie": "fake=test" }));
  assert.equal(withCookie.headers.get("X-Psipedia-Cache"), null);
  assert.equal(entries.size, 1);
});
