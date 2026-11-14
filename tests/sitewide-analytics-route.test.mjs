import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { env } from "cloudflare:workers";
import { POST } from "../app/api/analytics/pageview/route.ts";

const url = "https://psipedia.sk/api/analytics/pageview";
const browser = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";

function request(body = { path: "/" }, overrides = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      origin: "https://psipedia.sk",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      "user-agent": browser,
      ...overrides,
    },
    body: JSON.stringify(body),
  });
}

test("analytics feature is opt-in to deploy and does no writes while disabled", async () => {
  env.SITE_ANALYTICS_ENABLED = "false";
  assert.equal((await POST(request())).status, 204);
});

test("only one public page path is admissible, never personal metadata", async () => {
  env.SITE_ANALYTICS_ENABLED = "true";
  for (const body of [
    { path: "/admin" },
    { path: "/api/articles/read" },
    { path: "/?email=private" },
    { path: "/", visitorToken: randomUUID() },
    { path: "/", source: "facebook" },
    { path: "/", device: "mobile" },
    { path: "/", referrer: "https://other.site/secret" },
    { path: "/", ip: "198.51.100.1" },
    { path: "/", sessionToken: "abc" },
    {},
  ]) {
    assert.equal((await POST(request(body))).status, 400, JSON.stringify(body));
  }
});

test("cross-origin requests and crawlers are rejected without storing visitor data", async () => {
  env.SITE_ANALYTICS_ENABLED = "true";
  const foreign = await POST(request({ path: "/" }, { origin: "https://evil.example" }));
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get("cache-control"), "private, no-store");
  assert.equal((await POST(request({ path: "/" }, { "user-agent": "Googlebot/2.1" }))).status, 204);
});

test("valid pathname reaches aggregate writer; missing D1 returns an unavailable state", async () => {
  env.SITE_ANALYTICS_ENABLED = "true";
  assert.equal((await POST(request({ path: "/" }))).status, 503);
  assert.equal((await POST(request({ path: "/plemena/labradorsky-retriever" }))).status, 503);
});

test("sitewide analytics contains no user-identity or source classification in storage", async () => {
  const api = await readFile(
    new URL("../app/api/analytics/pageview/route.ts", import.meta.url), "utf8",
  );
  const writer = await readFile(
    new URL("../lib/site-analytics.ts", import.meta.url), "utf8",
  );
  const tracker = await readFile(
    new URL("../components/site-analytics-tracker.tsx", import.meta.url), "utf8",
  );

  assert.match(api, /recordSitePageView\(\{ path, database: bindings\.DB \}\)/);
  assert.doesNotMatch(api, /cf-connecting-ip|deriveRateLimitKey|PROFILE_VISIT_TOKEN|PII_HASH_KEY/);
  assert.doesNotMatch(writer, /deriveRateLimitKey|localStorage|session_hash|visitor_hash|INSERT INTO security_rate_limits/);
  assert.doesNotMatch(tracker, /localStorage|sessionStorage|visitorToken|sessionToken|document\.referrer/);
  assert.match(tracker, /JSON\.stringify\(\{ path: pathname \}\)/);
});
