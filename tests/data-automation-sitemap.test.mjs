import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseSitemapDocument, rssDiscoveryAdapter } from "../lib/data-automation-discovery.ts";
import { discoverSitemapCandidates, discoveryEvidenceContext } from "../lib/data-automation-discovery-runner.ts";

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

test("DISCOVERY-3A traverses nested indexes, terminates loops, preserves duplicate evidence paths and lastmod", async () => {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://example.sk/robots.txt") return text("User-agent: *\nSitemap: https://example.sk/sitemap.xml");
    if (url === "https://example.sk/sitemap.xml") return xml(`<sitemapindex>
      <sitemap><loc>https://example.sk/a.xml</loc></sitemap>
      <sitemap><loc>https://example.sk/b.xml</loc></sitemap>
    </sitemapindex>`);
    if (url === "https://example.sk/a.xml") return xml(`<sitemapindex>
      <sitemap><loc>https://example.sk/sitemap.xml</loc></sitemap>
      <sitemap><loc>https://example.sk/a-leaf.xml</loc></sitemap>
    </sitemapindex>`);
    if (url === "https://example.sk/a-leaf.xml") return xml(`<urlset>
      <url><loc>https://example.sk/events/shared</loc><lastmod>2026-09-24</lastmod></url>
    </urlset>`);
    if (url === "https://example.sk/b.xml") return xml(`<urlset>
      <url><loc>https://example.sk/events/shared</loc><lastmod>2026-09-25</lastmod></url>
      <url><loc>https://example.sk/events/unique</loc></url>
    </urlset>`);
    throw new Error("unexpected URL " + url);
  };

  const result = await discoverSitemapCandidates(
    root({ maxDepth: 2, maxCandidates: 20, pathIncludes: ["/events/"] }),
    { fetchImpl, sleep: async () => {} },
    20,
  );
  assert.equal(result.candidates.length, 2);
  const shared = result.candidates.find((item) => item.sourceUrl.endsWith("/shared"));
  assert.ok(shared);
  assert.equal(shared.metadata.lastmod, "2026-09-24");
  assert.equal(shared.metadata.discoveryPaths.length, 2);
  assert.equal(calls.filter((url) => url === "https://example.sk/sitemap.xml").length, 1);

  const contexts = shared.metadata.discoveryPaths.map((path) =>
    discoveryEvidenceContext(root(), { ...shared, metadata: { ...shared.metadata, ...path } }).discoveryContextKey
  );
  assert.equal(new Set(contexts).size, 2);
});

test("DISCOVERY-3A enforces same-domain by default and exact explicit allowedHosts", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url === "https://example.sk/robots.txt") return text("User-agent: *");
    if (url === "https://example.sk/sitemap.xml") return xml(`<sitemapindex>
      <sitemap><loc>https://cdn.example.net/child.xml</loc></sitemap>
      <sitemap><loc>https://evil.example/child.xml</loc></sitemap>
    </sitemapindex>`);
    if (url === "https://cdn.example.net/child.xml") return xml(`<urlset><url><loc>https://cdn.example.net/page</loc></url></urlset>`);
    throw new Error("unexpected URL " + url);
  };

  const blocked = await discoverSitemapCandidates(root(), { fetchImpl, sleep: async () => {} }, 20);
  assert.equal(blocked.candidates.length, 0);
  assert.ok(blocked.warnings.includes("sitemap_host_blocked"));

  const allowed = await discoverSitemapCandidates(
    root({ allowedHosts: ["cdn.example.net"] }),
    { fetchImpl, sleep: async () => {} },
    20,
  );
  assert.deepEqual(allowed.candidates.map((item) => item.sourceUrl), ["https://cdn.example.net/page"]);
});

test("DISCOVERY-3A honors robots 404, explicit disallow and bounded Sitemap directives", async () => {
  const noRobotsFetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) return text("", 404);
    if (url.endsWith("/sitemap.xml")) return xml("<urlset><url><loc>https://example.sk/ok</loc></url></urlset>");
    throw new Error("unexpected");
  };
  const ok = await discoverSitemapCandidates(root(), { fetchImpl: noRobotsFetch, sleep: async () => {} }, 10);
  assert.equal(ok.candidates.length, 1);

  const disallowFetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) return text("User-agent: *\nDisallow: /sitemap.xml");
    throw new Error("sitemap must not be fetched");
  };
  await assert.rejects(
    () => discoverSitemapCandidates(root(), { fetchImpl: disallowFetch, sleep: async () => {} }, 10),
    /robots_disallowed/,
  );
});

test("DISCOVERY-3A marks URL/depth bounds and never follows off-domain redirects", async () => {
  const limitFetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) return text("User-agent: *");
    if (url.endsWith("/sitemap.xml")) return xml(`<urlset>
      <url><loc>https://example.sk/1</loc></url>
      <url><loc>https://example.sk/2</loc></url>
      <url><loc>https://example.sk/3</loc></url>
    </urlset>`);
    throw new Error("unexpected");
  };
  const limited = await discoverSitemapCandidates(
    root({ maxSitemapUrls: 2 }),
    { fetchImpl: limitFetch, sleep: async () => {} },
    10,
  );
  assert.equal(limited.candidates.length, 2);
  assert.ok(limited.warnings.includes("sitemap_url_limit"));

  const redirectFetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) return text("User-agent: *");
    if (url.endsWith("/sitemap.xml")) return new Response("", { status: 302, headers: { location: "https://evil.example/x.xml" } });
    throw new Error("off-domain target must not be fetched");
  };
  await assert.rejects(
    () => discoverSitemapCandidates(root(), { fetchImpl: redirectFetch, sleep: async () => {} }, 10),
    /discovery_redirect_blocked/,
  );
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

test("DISCOVERY-3A does not change RSS behavior", () => {
  const items = rssDiscoveryAdapter({
    payload: "<rss><channel><link>https://example.sk/feed-item</link></channel></rss>",
    baseUrl: "https://example.sk/feed.xml",
    entityType: "EVENT",
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].discoveryType, "RSS");
});
