import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { POST } from "../app/api/analytics/pageview/route.ts";

const url = "https://psipedia.sk/api/analytics/pageview";
const payload = {
  path: "/",
  source: "google",
  visitorToken: "550e8400-e29b-41d4-a716-446655440000",
  sessionToken: "550e8400-e29b-41d4-a716-446655440001",
};
const browser = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
function request(value = payload, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "origin": "https://psipedia.sk",
      "content-type": "application/json",
      "user-agent": browser,
      "cf-connecting-ip": "203.0.113.10",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(value),
  });
}

test("sitewide write endpoint is POST-only and rejects a different origin", async () => {
  const response = await POST(request(payload, { origin: "https://evil.example" }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("sitewide write endpoint rejects admin and sensitive pages and malformed tokens", async () => {
  assert.equal((await POST(request({ ...payload, path: "/admin" }))).status, 400);
  assert.equal((await POST(request({ ...payload, path: "/api/secret" }))).status, 400);
  assert.equal((await POST(request({ ...payload, path: "/?utm_source=x" }))).status, 400);
  assert.equal((await POST(request({ ...payload, sessionToken: "bad" }))).status, 400);
  assert.equal((await POST(request({ ...payload, source: "secret-personal-referrer" }))).status, 400);
});

test("internal browsers and known crawlers never trigger D1 reads or writes", async () => {
  assert.equal((await POST(request(payload, { cookie: "psipedia_internal=1" }))).status, 204);
  assert.equal((await POST(request(payload, { "user-agent": "Googlebot/2.1" }))).status, 204);
  assert.equal((await POST(request(payload, { "user-agent": "curl/8.0" }))).status, 204);
});

test("missing D1 binding or HMAC key is a 503, never a fabricated success", async () => {
  const res = await POST(request());
  assert.equal(res.status, 503);
});

test("endpoint is not a general-purpose GET analytics API", async () => {
  const route = await readFile(
    new URL("../app/api/analytics/pageview/route.ts", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("../components/site-analytics-tracker.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /export async function POST\(/);
  assert.doesNotMatch(route, /export async function GET\(/);
  assert.match(route, /isLikelyCrawlerRequest/);
  assert.match(route, /enforceRateLimit/);
  assert.match(route, /PII_HASH_KEY/);
  assert.match(client, /isInternalArticleReadBrowser/);
  assert.match(client, /hasQualifiedAnalyticsConsent/);
});
