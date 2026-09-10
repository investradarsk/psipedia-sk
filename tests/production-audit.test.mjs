import assert from "node:assert/strict";
import test from "node:test";

import {
  auditProductionSite,
  extractHtmlReferences,
  extractSitemapLocations,
  fetchWithRedirectTrace,
  normalizeUrl,
  parseArguments,
} from "../scripts/audit-production-site.mjs";

test("production audit arguments have safe independent defaults", () => {
  const options = parseArguments([]);
  assert.equal(options.baseUrl, "https://psipedia.sk");
  assert.equal(options.sitemapUrl, "https://psipedia.sk/sitemap.xml");
  assert.equal(options.maxPages, 2_000);
  assert.equal(options.concurrency, 4);
  assert.equal(options.retries, 1);
  assert.equal(options.skipImages, false);
});

test("production audit can skip images for a link-graph-only pass", () => {
  assert.equal(parseArguments(["--skip-images"]).skipImages, true);
});

test("URL normalization removes fragments but preserves filters for checking", () => {
  assert.equal(normalizeUrl("/plemena?fciGroup=1#results", "https://psipedia.sk/clanky"), "https://psipedia.sk/plemena?fciGroup=1");
  assert.equal(normalizeUrl("mailto:test@example.com", "https://psipedia.sk"), null);
});

test("sitemap parser retains duplicates so the audit can report them", () => {
  const xml = "<urlset><url><loc>https://psipedia.sk/a</loc></url><url><loc>https://psipedia.sk/a</loc></url><url><loc>https://psipedia.sk/b?a=1&amp;b=2</loc></url></urlset>";
  assert.deepEqual(extractSitemapLocations(xml, "https://psipedia.sk/sitemap.xml"), [
    "https://psipedia.sk/a",
    "https://psipedia.sk/a",
    "https://psipedia.sk/b?a=1&b=2",
  ]);
});

test("HTML parser extracts links, images and absolute canonical", () => {
  const html = `<a href="/clanky">Články</a><img src='/dog.webp'><source src="https://cdn.example/dog.avif"><link rel="canonical" href="https://psipedia.sk/plemena">`;
  assert.deepEqual(extractHtmlReferences(html, "https://psipedia.sk/plemena?group=1"), {
    links: ["https://psipedia.sk/clanky"],
    images: ["https://psipedia.sk/dog.webp", "https://cdn.example/dog.avif"],
    canonicals: [{ raw: "https://psipedia.sk/plemena", normalized: "https://psipedia.sk/plemena", absolute: true }],
    noindex: false,
  });
});

test("HTML parser identifies noindex pages so canonical warnings can be suppressed", () => {
  const references = extractHtmlReferences('<meta name="robots" content="noindex, follow"><a href="/plemena">Atlas</a>', "https://psipedia.sk/hladat?q=pes");
  assert.equal(references.noindex, true);
  assert.deepEqual(references.links, ["https://psipedia.sk/plemena"]);
});

test("redirect tracer detects chains and loops without automatic redirects", async () => {
  const responses = new Map([
    ["https://psipedia.sk/old", new Response(null, { status: 301, headers: { location: "/new" } })],
    ["https://psipedia.sk/new", new Response("ok", { status: 200, headers: { "content-type": "text/html" } })],
    ["https://psipedia.sk/loop", new Response(null, { status: 302, headers: { location: "/loop" } })],
  ]);
  const fetchImpl = async (url, init) => {
    assert.equal(init.redirect, "manual");
    return responses.get(url);
  };
  const redirected = await fetchWithRedirectTrace("https://psipedia.sk/old", { fetchImpl, readBody: true });
  assert.equal(redirected.history.length, 2);
  assert.equal(redirected.finalUrl, "https://psipedia.sk/new");
  const loop = await fetchWithRedirectTrace("https://psipedia.sk/loop", { fetchImpl });
  assert.equal(loop.loop, true);
});

test("full audit marks broken internal URLs, images and canonical targets as critical", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url === "https://psipedia.sk/sitemap.xml") {
      return new Response("<urlset><url><loc>https://psipedia.sk/</loc></url></urlset>", { status: 200, headers: { "content-type": "application/xml" } });
    }
    if (url === "https://psipedia.sk/") {
      return new Response(`<link rel="canonical" href="https://psipedia.sk/"><a href="/missing">Chýba</a><img src="/broken.jpg">`, { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response("missing", { status: 404 });
  };
  const options = parseArguments(["--max-pages", "10", "--concurrency", "2"]);
  const report = await auditProductionSite(options, { fetchImpl });
  assert.equal(report.sitemapUrlCount, 1);
  assert.equal(report.brokenInternalUrls.items.length, 1);
  assert.equal(report.brokenImages.items.length, 1);
  assert.equal(report.critical, true);
});

test("full audit retries a transient 5xx and does not report it after recovery", async () => {
  let pageAttempts = 0;
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith("/sitemap.xml")) return new Response("<urlset><url><loc>https://psipedia.sk/</loc></url></urlset>", { status: 200 });
    pageAttempts += 1;
    if (pageAttempts === 1) return new Response("busy", { status: 500 });
    return new Response('<meta name="robots" content="noindex">', { status: 200, headers: { "content-type": "text/html" } });
  };
  const report = await auditProductionSite(parseArguments(["--max-pages", "1"]), { fetchImpl });
  assert.equal(pageAttempts, 2);
  assert.equal(report.serverErrors.items.length, 0);
  assert.equal(report.canonicalIssues.items.length, 0);
  assert.equal(report.critical, false);
});

test("full audit reports sitemap orphans, weak links and homepage crawl depth", async () => {
  const pages = new Map([
    ["https://psipedia.sk/", '<link rel="canonical" href="https://psipedia.sk/"><a href="/a">A</a>'],
    ["https://psipedia.sk/a", '<link rel="canonical" href="https://psipedia.sk/a"><a href="/b">B</a>'],
    ["https://psipedia.sk/b", '<link rel="canonical" href="https://psipedia.sk/b">'],
    ["https://psipedia.sk/orphan", '<link rel="canonical" href="https://psipedia.sk/orphan">'],
  ]);
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith("/sitemap.xml")) {
      return new Response(`<urlset>${[...pages.keys()].map((page) => `<url><loc>${page}</loc></url>`).join("")}</urlset>`, { status: 200 });
    }
    return new Response(pages.get(url) ?? "missing", {
      status: pages.has(url) ? 200 : 404,
      headers: { "content-type": "text/html" },
    });
  };
  const report = await auditProductionSite(parseArguments(["--max-pages", "10"]), { fetchImpl });
  assert.deepEqual(report.orphanSitemapUrls.items, [{ url: "https://psipedia.sk/orphan" }]);
  assert.deepEqual(report.lowLinkedSitemapUrls.items, [
    { url: "https://psipedia.sk/a", source: "https://psipedia.sk/" },
    { url: "https://psipedia.sk/b", source: "https://psipedia.sk/a" },
  ]);
  assert.deepEqual(report.unreachableSitemapUrls.items, [{ url: "https://psipedia.sk/orphan" }]);
  assert.deepEqual(report.crawlDepth, { maximum: 2, distribution: { 0: 1, 1: 1, 2: 1 } });
  assert.equal(report.critical, false);
});
