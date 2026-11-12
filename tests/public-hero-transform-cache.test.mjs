import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  publicHeroTransformEdgeCacheKey,
  isCacheablePublicHeroTransformResponse,
  PUBLIC_HERO_TRANSFORM_EDGE_TTL_SECONDS,
  PUBLIC_HERO_TRANSFORM_BROWSER_CACHE_CONTROL,
} from "../lib/public-hero-transform-cache.ts";

const home = "https://psipedia.sk/_vinext/image?url=%2Fimages%2Fhero-labrador.webp&w=828&q=72";
const get = (url = home, headers = {}, method = "GET") => new Request(url, { method, headers });
const key = request => publicHeroTransformEdgeCacheKey(request, "deployment-v42");
const image = (headers = {}, status = 200) => new Response("image-bytes", { status, headers: { "content-type": "image/webp", ...headers } });

test("homepage photo variant is the only cacheable Vinext optimizer input", () => {
  assert.equal(PUBLIC_HERO_TRANSFORM_EDGE_TTL_SECONDS, 86400);
  assert.equal(PUBLIC_HERO_TRANSFORM_BROWSER_CACHE_CONTROL, "public, max-age=86400");
  assert.ok(key(get()));
  for (const width of [384,640,828,1200,1920]) {
    assert.ok(key(get(home.replace("w=828", "w=" + width))), String(width));
  }
  for (const bad of [
    home.replace("w=828", "w=999"),
    home.replace("w=828", "w=0828"),
    home.replace("q=72", "q=90"),
    home.replace("hero-labrador.webp", "some-private-file.webp"),
    home + "&quality=90",
    home + "&url=https%3A%2F%2Fattacker.com%2Fimage.jpg",
    home.replace("psipedia.sk", "example.com"),
    home.replace("/_vinext/image", "/api/image"),
  ]) assert.equal(key(get(bad)), null, bad);
  assert.equal(key(get(home, {}, "POST")), null);
  assert.equal(publicHeroTransformEdgeCacheKey(get(), ""), null);
});

test("no auth, cookie, byte range or cache bypass may enter the image edge cache", () => {
  for (const headers of [
    { cookie: "session=abc" },
    { authorization: "Bearer secret" },
    { "cf-access-jwt-assertion": "signed" },
    { "x-psipedia-admin-authorized": "1" },
    { range: "bytes=0-100" },
    { "if-none-match": "w/tag" },
    { "cache-control": "no-cache" },
    { pragma: "no-cache" },
  ]) assert.equal(key(get(home, headers)), null, JSON.stringify(headers));
});

test("Accept variants and worker deployments have separate cache keys", () => {
  const avif = key(get(home, { accept: "image/avif,image/webp,*/*" }));
  const webp = key(get(home, { accept: "image/webp,*/*" }));
  const other = key(get(home));
  const oldDeploy = publicHeroTransformEdgeCacheKey(get(home, { accept: "image/webp" }), "older-deploy");
  assert.ok(avif && webp && other && oldDeploy);
  assert.notEqual(avif.url, webp.url);
  assert.notEqual(webp.url, other.url);
  assert.notEqual(webp.url, oldDeploy.url);
  assert.match(avif.url, /__psipedia_hero_accept=avif/);
  assert.match(avif.url, /__psipedia_cf_version=deployment-v42/);
});

test("only valid public image bytes are stored, never errors, HTML or private responses", () => {
  assert.equal(isCacheablePublicHeroTransformResponse(image()), true);
  assert.equal(isCacheablePublicHeroTransformResponse(image({ "content-type": "image/avif" })), true);
  assert.equal(isCacheablePublicHeroTransformResponse(image({}, 404)), false);
  assert.equal(isCacheablePublicHeroTransformResponse(image({}, 206)), false);
  assert.equal(isCacheablePublicHeroTransformResponse(image({ "content-type": "text/html" })), false);
  assert.equal(isCacheablePublicHeroTransformResponse(image({ "set-cookie": "sid=secret" })), false);
  assert.equal(isCacheablePublicHeroTransformResponse(image({ "cache-control": "private, no-store" })), false);
  assert.equal(isCacheablePublicHeroTransformResponse(image({ vary: "Cookie" })), false);
});

test("Worker uses cache-hit fastpath and stores only vetted LCP responses", () => {
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /url\.pathname === "\/_vinext\/image"/);
  assert.match(worker, /publicHeroTransformEdgeCacheKey\(appRequest, env\.CF_VERSION_METADATA\?\.id\)/);
  assert.match(worker, /await heroCache\.match\(heroCacheKey\)/);
  assert.match(worker, /isCacheablePublicHeroTransformResponse\(optimized\)/);
  assert.match(worker, /ctx\.waitUntil\(heroCache\.put\(heroCacheKey, edgeCopy\)\)/);
  assert.match(worker, /"X-Psipedia-Hero-Cache": "HIT"/);
  assert.match(worker, /"X-Psipedia-Hero-Cache": "MISS"/);
});
