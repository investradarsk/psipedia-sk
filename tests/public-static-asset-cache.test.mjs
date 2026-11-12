import assert from "node:assert/strict";
import test from "node:test";
import {
  IMMUTABLE_BUILD_ASSET_CACHE_CONTROL,
  isEligibleImmutableBuildAsset,
  isImmutableBuildAssetResponse,
} from "../lib/public-static-asset-cache.ts";

const get = (path, init = {}) => {
  const request = new Request("https://psipedia.sk" + path, init);
  return [request, new URL(request.url)];
};

test("only public fingerprinted vinext chunks qualify for immutable caching", () => {
  for (const path of [
    "/assets/index-CuZ_jbgf.css",
    "/assets/site-header-CraTQDmW.css",
    "/assets/chunk-934faDC67.js",
    "/assets/nested/chunk-934faDC67.js",
  ]) {
    assert.equal(isEligibleImmutableBuildAsset(...get(path)), true, path);
  }
  for (const path of [
    "/",
    "/plemena/labrador",
    "/admin",
    "/api/admin/users",
    "/media/photo.webp",
    "/assets/index.css",
    "/assets/index-v1.css",
    "/assets/chunk-CuZ_jbgf.css?version=1",
    "/assets/chunk-CuZ_jbgf.css?private=1",
  ]) {
    assert.equal(isEligibleImmutableBuildAsset(...get(path)), false, path);
  }
  assert.equal(isEligibleImmutableBuildAsset(...get("/assets/chunk-CuZ_jbgf.css", { method: "POST" })), false);
  assert.equal(isEligibleImmutableBuildAsset(...get("/assets/chunk-CuZ_jbgf.css", { headers: { authorization: "Bearer secret" } })), false);
  assert.equal(isEligibleImmutableBuildAsset(...get("/assets/chunk-CuZ_jbgf.css", { headers: { range: "bytes=0-99" } })), false);
});

test("only successful clean responses with the correct asset MIME get a year of caching", () => {
  assert.equal(IMMUTABLE_BUILD_ASSET_CACHE_CONTROL, "public, max-age=31536000, immutable");
  assert.equal(isImmutableBuildAssetResponse(new Response("css", { status: 200, headers: { "content-type": "text/css; charset=utf-8" } }), "/assets/index-CuZ_jbgf.css"), true);
  assert.equal(isImmutableBuildAssetResponse(new Response("js", { status: 200, headers: { "content-type": "application/javascript" } }), "/assets/chunk-CuZ_jbgf.js"), true);
  assert.equal(isImmutableBuildAssetResponse(new Response("oops", { status: 404, headers: { "content-type": "text/css" } }), "/assets/index-CuZ_jbgf.css"), false);
  assert.equal(isImmutableBuildAssetResponse(new Response("html", { status: 200, headers: { "content-type": "text/html" } }), "/assets/index-CuZ_jbgf.css"), false);
  assert.equal(isImmutableBuildAssetResponse(new Response("secret", { status: 200, headers: { "content-type": "text/css", "set-cookie": "sid=secret" } }), "/assets/index-CuZ_jbgf.css"), false);
});
