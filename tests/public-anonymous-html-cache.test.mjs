import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isExplicitAnonymousHtmlRoute, isExplicitAnonymousSsrHtml } from "../lib/public-anonymous-html-cache.ts";

const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const wrangler = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

const ssr = (cacheControl = "private, no-cache, no-store, max-age=0, must-revalidate", extra = {}) =>
  new Response("<html><body>public</body></html>", {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cacheControl, ...extra },
  });

test("only explicitly public and non-personalized routes are eligible", () => {
  for (const path of ["/", "/clanky", "/podujatia", "/plemena", "/plemena/labradorsky-retriever", "/adresar", "/adresar/veterinari"]) {
    assert.equal(isExplicitAnonymousHtmlRoute(path), true, path);
    assert.equal(isExplicitAnonymousSsrHtml(ssr(), path), true, path);
  }
  for (const path of ["/admin", "/admin/clanky", "/partner", "/partner/prihlasenie", "/api/adresar", "/recenzia", "/recenzia/123", "/adresar/veterinari/profil", "/podujatia/pridat-podujatie", "/random"]) {
    assert.equal(isExplicitAnonymousHtmlRoute(path), false, path);
    assert.equal(isExplicitAnonymousSsrHtml(ssr(), path), false, path);
  }
});

test("cache promotion rejects Set-Cookie, private variants, suspicious headers and responses", () => {
  for (const bad of [
    ssr(undefined, { "Set-Cookie": "session=secret" }),
    ssr(undefined, { Vary: "Cookie" }),
    ssr(undefined, { Vary: "*" }),
    ssr(undefined, { Vary: "Authorization" }),
    ssr(undefined, { "CDN-Cache-Control": "no-store" }),
    ssr(undefined, { "Cloudflare-CDN-Cache-Control": "no-store" }),
    ssr(undefined, { "Surrogate-Control": "no-store" }),
    ssr(undefined, { "Pragma": "no-cache" }),
    ssr(undefined, { "X-Robots-Tag": "noindex" }),
    ssr("private, no-store, s-maxage=300"),
    ssr("private, must-revalidate"),
    new Response("not html", { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }),
    new Response("<html>not found</html>", { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } }),
  ]) assert.equal(isExplicitAnonymousSsrHtml(bad, "/plemena"), false);
});

test("HTML cache is still strictly anonymous and local, not new pre-Worker Workers Cache", () => {
  assert.match(worker, /request\.headers\.has\("cookie"\)/);
  assert.match(worker, /request\.headers\.has\("authorization"\)/);
  assert.match(worker, /request\.headers\.has\("cf-access-jwt-assertion"\)/);
  assert.match(worker, /request\.headers\.has\(USER_EMAIL_HEADER\)/);
  assert.match(worker, /request\.headers\.has\(ADMIN_AUTHORIZED_HEADER\)/);
  assert.match(worker, /url\.hostname\.toLowerCase\(\) !== "psipedia.sk" \|\| !isExplicitAnonymousHtmlRoute\(url\.pathname\)/);
  assert.match(worker, /!isCacheableHtmlResponse\(response\) && !isExplicitAnonymousSsrHtml\(response, url\.pathname\)/);
  assert.equal(wrangler.cache?.enabled ?? false, false, "Do not enable Worker-wide pre-execution cache for cookie-personalized pages");
});
