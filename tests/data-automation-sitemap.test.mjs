import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseSitemapDocument, rssDiscoveryAdapter } from "../lib/data-automation-discovery.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function root(config = {}, sourceUrl = "https://example.sk/sitemap.xml") {
  return {
    id: 91,
    rootKey: "test-sitemap",
    discoveryType: "SITEMAP",
    sourceUrl,
    entityType: "EVENT",
    suggestedConnectorType: "CONTROLLED_HTML",
    config,
  };
}

function xml(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "content-type": "application/xml", ...headers } });
}

function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "content-type": "text/plain", ...headers } });
}

test("DISCOVERY-3A parser distinguishes namespaced urlset and sitemapindex, dedupes loc and keeps valid lastmod", () => {
  const leaf = parseSitemapDocument(`<?xml version="1.0"?>
    <sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sm:url><sm:loc>https://example.sk/a?utm_source=x</sm:loc><sm:lastmod>2026-09-20</sm:lastmod></sm:url>
      <sm:url><sm:loc>https://example.sk/a</sm:loc><sm:lastmod>bad-date</sm:lastmod></sm:url>
      <sm:url><sm:loc>https://example.sk/b</sm:loc><sm:lastmod>bad-date</sm:lastmod></sm:url>
    </sm:urlset>`, "https://example.sk/sitemap.xml");
  assert.equal(leaf.type, "urlset");
  assert.equal(leaf.entries.length, 2);
  assert.equal(leaf.entries[0].loc, "https://example.sk/a");
  assert.equal(leaf.entries[0].lastmod, "2026-09-20");
  assert.equal(leaf.entries[1].lastmod, undefined);

  const index = parseSitemapDocument(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap><loc>/child.xml</loc></sitemap>
  </sitemapindex>`, "https://example.sk/root.xml");
  assert.equal(index.type, "sitemapindex");
  assert.deepEqual(index.entries.map((entry) => entry.loc), ["https://example.sk/child.xml"]);
  assert.throws(() => parseSitemapDocument("<html>no sitemap</html>", "https://example.sk/sitemap.xml"));
});

test("DISCOVERY-3A runner contains bounded nested traversal, loop detection and multiple evidence paths", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /export async function discoverSitemapCandidates/);
  assert.match(runner, /SITEMAP_MAX_DEPTH = 2/);
  assert.match(runner, /SITEMAP_MAX_CHILDREN_PER_INDEX = 50/);
  assert.match(runner, /SITEMAP_MAX_DOCUMENTS = 50/);
  assert.match(runner, /SITEMAP_HARD_MAX_URLS = 2000/);
  assert.match(runner, /const visited = new Set<string>\(\)/);
  assert.match(runner, /visited\.has\(canonicalSitemap\)/);
  assert.match(runner, /parsed\.type === "sitemapindex"/);
  assert.match(runner, /current\.depth >= maxDepth/);
  assert.match(runner, /discoveryPaths/);
  assert.match(runner, /evidenceCandidates/);
});

test("DISCOVERY-3A runner enforces same-domain by default and exact explicit allowedHosts", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /normalizedConfiguredHosts/);
  assert.match(runner, /configStrings\(root, "allowedHosts"\)/);
  assert.match(runner, /host === rootHost \|\| allowed\.has\(host\)/);
  assert.doesNotMatch(runner, /includes\(host\).*allowedHosts|host\.includes/);
});

test("DISCOVERY-3A runner has conservative robots handling and bounded Sitemap directives", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /fetchRobotsPolicy/);
  assert.match(runner, /discovery_http_404/);
  assert.match(runner, /robots_fetch_failed/);
  assert.match(runner, /robots_disallowed/);
  assert.match(runner, /key === "sitemap"/);
  assert.match(runner, /urlAllowed\(canonical\)/);
});

test("DISCOVERY-3A runner enforces URL limits and redirect host revalidation", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /maxSitemapUrls/);
  assert.match(runner, /sitemap_url_limit/);
  assert.match(runner, /urlAllowed && !urlAllowed\(target\.toString\(\)\)/);
  assert.match(runner, /discovery_redirect_blocked/);
});

test("DISCOVERY-3A preserves 1 MB response cap, retry/timeout controls and governance boundaries", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /MAX_DISCOVERY_BYTES = 1_000_000/);
  assert.match(runner, /retryMaxAttempts/);
  assert.match(runner, /timeoutMs/);
  assert.match(runner, /SITEMAP_MAX_DEPTH = 2/);
  assert.match(runner, /SITEMAP_MAX_CHILDREN_PER_INDEX = 50/);
  assert.match(runner, /SITEMAP_MAX_DOCUMENTS = 50/);
  assert.match(runner, /SITEMAP_HARD_MAX_URLS = 2000/);
  assert.doesNotMatch(runner, /setAutomationSourceEnabled|INSERT INTO automation_sources/i);
  assert.doesNotMatch(runner, /INSERT INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
});

test("DISCOVERY-3A sitemap hardening remains compatible with item-level RSS discovery", () => {
  const items = rssDiscoveryAdapter({
    payload: "<rss><channel><item><link>https://example.sk/feed-item</link></item></channel></rss>",
    baseUrl: "https://example.sk/feed.xml",
    entityType: "EVENT",
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceUrl, "https://example.sk/feed-item");
  assert.equal(items[0].discoveryType, "RSS");
});
