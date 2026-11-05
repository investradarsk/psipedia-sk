import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isEligiblePublicMediaEdgeRequest,
  isCacheablePublicMediaEdgeResponse,
  PUBLIC_MEDIA_EDGE_TTL_SECONDS,
} from "../lib/public-media-edge-cache.ts";

const media = "https://psipedia.sk/media/breeds/labrador-123.webp";

function request(url = media, init = {}) {
  return new Request(url, init);
}

function imageResponse(init = {}) {
  return new Response("image-bytes", {
    status: init.status ?? 200,
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      ...(init.headers ?? {}),
    },
  });
}

test("only canonical anonymous public R2 raster images get edge cache keys", () => {
  assert.equal(PUBLIC_MEDIA_EDGE_TTL_SECONDS, 300);
  assert.equal(isEligiblePublicMediaEdgeRequest(request()), true);
  assert.equal(isEligiblePublicMediaEdgeRequest(request(media + "?w=320")), true);
  assert.equal(isEligiblePublicMediaEdgeRequest(request("https://psipedia.sk/media/events/a-1.jpg?w=1280")), true);
  assert.equal(isEligiblePublicMediaEdgeRequest(request(media + "?w=999")), false);
  assert.equal(isEligiblePublicMediaEdgeRequest(request(media + "?w=0320")), false);
  assert.equal(isEligiblePublicMediaEdgeRequest(request(media + "?w=320&token=abc")), false);
  assert.equal(isEligiblePublicMediaEdgeRequest(request(media + "?download=1")), false);
  assert.equal(isEligiblePublicMediaEdgeRequest(request("https://psipedia.sk/media/safe/private.webp")), false);
  assert.equal(isEligiblePublicMediaEdgeRequest(request("https://psipedia.sk/media/quarantine/private.webp")), false);
  assert.equal(isEligiblePublicMediaEdgeRequest(request("https://psipedia.sk/media/quality-missing-candidates/draft.jpg")), false);
  assert.equal(isEligiblePublicMediaEdgeRequest(request("https://psipedia.sk/media/file.pdf")), false);
  assert.equal(isEligiblePublicMediaEdgeRequest(request("https://example.sk/media/breeds/labrador-123.webp")), false);
});

test("any credential, byte range, or cache-bypass request avoids the shared cache", () => {
  for (const headers of [
    { cookie: "partner_session=abc" },
    { authorization: "Bearer secret" },
    { "cf-access-jwt-assertion": "jwt" },
    { "x-psipedia-admin-authorized": "1" },
    { "oai-authenticated-user-email": "user@example.sk" },
    { range: "bytes=0-100" },
    { "if-none-match": "etag-1" },
    { "cache-control": "no-cache" },
  ]) assert.equal(isEligiblePublicMediaEdgeRequest(request(media, { headers })), false);
  assert.equal(isEligiblePublicMediaEdgeRequest(request(media, { method: "POST" })), false);
});

test("edge store accepts successful public images and rejects private or mismatched responses", () => {
  assert.equal(isCacheablePublicMediaEdgeResponse(imageResponse()), true);
  assert.equal(isCacheablePublicMediaEdgeResponse(imageResponse({ status: 404 })), false);
  assert.equal(isCacheablePublicMediaEdgeResponse(imageResponse({ status: 206 })), false);
  assert.equal(isCacheablePublicMediaEdgeResponse(imageResponse({ headers: { "set-cookie": "session=1" } })), false);
  assert.equal(isCacheablePublicMediaEdgeResponse(imageResponse({ headers: { "content-type": "text/html" } })), false);
  assert.equal(isCacheablePublicMediaEdgeResponse(imageResponse({ headers: { "cache-control": "private, no-store" } })), false);
  assert.equal(isCacheablePublicMediaEdgeResponse(imageResponse({ headers: { "cache-control": "public, max-age=60" } })), false);
  assert.equal(isCacheablePublicMediaEdgeResponse(imageResponse({ headers: { vary: "Cookie" } })), false);
  assert.equal(isCacheablePublicMediaEdgeResponse(imageResponse({ headers: { "cdn-cache-control": "no-store" } })), false);
});

test("worker short-circuits warm media responses and only stores eligible origin images", () => {
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /isEligiblePublicMediaEdgeRequest\(request, url\)/);
  assert.match(worker, /await mediaStorage\.match\(mediaCacheKey\)/);
  assert.match(worker, /isCacheablePublicMediaEdgeResponse\(response\)/);
  assert.match(worker, /ctx\.waitUntil\(mediaStorage\.put\(mediaCacheKey, edgeCopy\)\)/);
  assert.match(worker, /"X-Psipedia-Media-Cache": "HIT"/);
  assert.match(worker, /"X-Psipedia-Media-Cache", "MISS"/);
});
