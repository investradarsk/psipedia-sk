import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  eligiblePublicSitemapRequest, servePublicSitemap, sitemapCacheKey,
  validSitemapXml, SITEMAP_FRESH_TTL_SECONDS, SITEMAP_LAST_GOOD_TTL_SECONDS,
} from "../lib/sitemap-edge-cache.ts";

const uri = "https://psipedia.sk/sitemap.xml";
const xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://psipedia.sk/</loc></url></urlset>';
const validResponse = () => new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
const failedResponse = () => new Response("Origin failure", { status: 500 });

function fakeCache() {
  const store = new Map();
  const calls = [];
  return {
    calls, store,
    async match(request) { calls.push(["match", request.url]); return store.get(request.url)?.clone(); },
    async put(request, response) { calls.push(["put", request.url]); store.set(request.url, response.clone()); },
  };
}
function background() {
  const jobs = [];
  return { jobs, waitUntil(task) { jobs.push(task); }, async drain() { await Promise.all(jobs); } };
}

test("only anonymous, queryless GET sitemap is eligible", () => {
  assert.equal(eligiblePublicSitemapRequest(new Request(uri)), true);
  for (const request of [
    new Request(uri, { method: "HEAD" }),
    new Request(uri + "?preview=1"),
    new Request(uri, { headers: { cookie: "session=x" } }),
    new Request(uri, { headers: { authorization: "Bearer secret" } }),
    new Request(uri, { headers: { range: "bytes=0-100" } }),
    new Request("https://psipedia.sk/news-sitemap.xml"),
    new Request("https://psipedia.sk/api/admin/foo"),
  ]) assert.equal(eligiblePublicSitemapRequest(request), false);
});

test("XML validator refuses empty, broken, noncanonical and dangerous snapshots", () => {
  assert.equal(validSitemapXml(xml), true);
  assert.equal(validSitemapXml("<urlset></urlset>"), false);
  assert.equal(validSitemapXml("<html>error</html>"), false);
  assert.equal(validSitemapXml('<urlset><loc>https://evil.com/</loc></urlset>'), false);
  assert.equal(validSitemapXml('<!DOCTYPE x><urlset><loc>https://psipedia.sk/</loc></urlset>'), false);
  assert.equal(validSitemapXml('<urlset><loc>https://psipedia.sk/</loc>'), false);
});

test("two independent Cache API slots: fresh HIT and last-good on 500", async () => {
  const cache = fakeCache(), ctx = background();
  let originCalls = 0;
  const origin = async () => { originCalls++; return validResponse(); };
  const first = await servePublicSitemap(new Request(uri), origin, cache, ctx);
  assert.equal(first.status, 200);
  assert.equal(originCalls, 1);
  await ctx.drain();
  const fresh = cache.store.get(sitemapCacheKey(uri, "fresh").url);
  const backup = cache.store.get(sitemapCacheKey(uri, "last-good").url);
  assert.equal(fresh.headers.get("cache-control"), "public, max-age=" + SITEMAP_FRESH_TTL_SECONDS);
  assert.equal(backup.headers.get("cache-control"), "public, max-age=" + SITEMAP_LAST_GOOD_TTL_SECONDS);
  const hit = await servePublicSitemap(new Request(uri), origin, cache, background());
  assert.equal(hit.status, 200);
  assert.equal(originCalls, 1, "fresh hit must not query D1 again");
  cache.store.delete(sitemapCacheKey(uri, "fresh").url);
  const served = await servePublicSitemap(new Request(uri), failedResponse, cache, background());
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("x-psipedia-sitemap-cache"), "LAST_GOOD");
  assert.equal(served.headers.get("cache-control"), "public, max-age=60");
  assert.equal(await served.text(), xml);
});

test("cold POP does not fabricate success; origin 500 remains 500", async () => {
  const result = await servePublicSitemap(new Request(uri), failedResponse, fakeCache(), background());
  assert.equal(result.status, 500);
});

test("invalid public XML, private, Set-Cookie and 404 cannot contaminate snapshot", async () => {
  const cache = fakeCache();
  const candidates = [
    new Response("<html>wrong</html>", { status: 200, headers: { "content-type": "application/xml" } }),
    new Response(xml, { status: 200, headers: { "content-type": "application/xml", "cache-control": "private, no-store" } }),
    new Response(xml, { status: 200, headers: { "content-type": "application/xml", "set-cookie": "session=x" } }),
    new Response("404", { status: 404 }),
  ];
  for (const response of candidates) {
    const ctx = background();
    const returned = await servePublicSitemap(new Request(uri), () => Promise.resolve(response), cache, ctx);
    assert.equal(returned.status, response.status);
    await ctx.drain();
  }
  assert.equal(cache.calls.some(([action]) => action === "put"), false);
});

test("origin exception falls back only when last-good exists", async () => {
  const cache = fakeCache(), ctx = background();
  await servePublicSitemap(new Request(uri), async () => validResponse(), cache, ctx);
  await ctx.drain();
  cache.store.delete(sitemapCacheKey(uri, "fresh").url);
  const saved = await servePublicSitemap(new Request(uri), async () => { throw new Error("D1 down"); }, cache, background());
  assert.equal(saved.status, 200);
  cache.store.clear();
  await assert.rejects(servePublicSitemap(new Request(uri), async () => { throw new Error("D1 down"); }, cache, background()), /D1 down/);
});

test("query and authenticated calls bypass cache and never receive old public snapshot", async () => {
  const cache = fakeCache();
  const request = new Request(uri, { headers: { cookie: "login" } });
  const response = await servePublicSitemap(request, failedResponse, cache, background());
  assert.equal(response.status, 500);
  assert.equal(cache.calls.length, 0);
});

test("Worker invokes sitemap guard before HTML cache and does not affect other routes", () => {
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  const start = worker.indexOf("if (eligiblePublicSitemapRequest(request))");
  assert.ok(start > 0);
  assert.ok(start < worker.indexOf("const cache = publicHtmlCache("));
  assert.match(worker.slice(start, start + 450), /servePublicSitemap\(request, \(\) => handler\.fetch\(request, env, ctx\), storage, ctx\)/);
  const sitemap = readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(sitemap, /sitemap_generation_failed/);
  assert.match(sitemap, /SitemapStageError/);
});
