import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  internalPublicUrl, isAllowedPublicPath, classifyPublicLink, uniquePublicLinks,
  LINK_HEALTH_SEED_PATHS, MAX_LINK_SOURCE_PAGES, MAX_LINK_TARGETS, LINK_CHECK_CONCURRENCY,
} from "../lib/link-health.ts";
import {
  LINK_HEALTH_MAX_PAGES, LINK_HEALTH_BASE_URL, LINK_HEALTH_SAMPLED_PREFIXES,
  sitemapUrls, sampleLinkHealthPages, allowedPage, summarizeLinkinatorResult,
  markdownLinkHealthReport,
} from "../scripts/link-health-weekly.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public checker rejects external, internal admin, API, assets and unsafe references", () => {
  const base = "https://psipedia.sk";
  const valid = [
    ["/clanky", base + "/clanky"],
    ["https://psipedia.sk/plemena/?utm=x#abc", base + "/plemena"],
    ["/podujatia/november#kedy", base + "/podujatia/november"],
  ];
  for (const [raw, expected] of valid) assert.equal(internalPublicUrl(raw, base), expected);
  for (const raw of [
    "https://evil.example/", "https://psipedia.sk.evil.example/",
    "//evil.example/path", "mailto:hi@example.com", "tel:+421902",
    "javascript:alert(1)", "data:text/plain,hello",
    "#section", "/api/admin/content-history", "/admin/sekcie",
    "/_next/static/image.png", "/auth/signout", "/cdn-cgi/anything",
    "/hladat", "/.env", "/something/file.pdf",
  ]) assert.equal(internalPublicUrl(raw, base), null, raw);
  assert.equal(isAllowedPublicPath("/clanky/novinka"), true);
  assert.equal(isAllowedPublicPath("/admin"), false);
  assert.equal(isAllowedPublicPath("/api/test"), false);
});

test("broken 404/410 and 5xx are distinct from private/blocked/temporary 403/429", () => {
  assert.equal(classifyPublicLink(200), "ok");
  assert.equal(classifyPublicLink(301), "ok");
  assert.equal(classifyPublicLink(404), "broken");
  assert.equal(classifyPublicLink(410), "broken");
  assert.equal(classifyPublicLink(503), "server-error");
  for (const status of [null, 401, 403, 405, 429]) assert.equal(classifyPublicLink(status), "unverified");
});

test("bounded internal checking de-duplicates and respects a strict URL budget", () => {
  const origin = "https://psipedia.sk";
  assert.ok(LINK_HEALTH_SEED_PATHS.length < MAX_LINK_SOURCE_PAGES);
  assert.equal(LINK_CHECK_CONCURRENCY, 2);
  assert.equal(MAX_LINK_TARGETS, 60);
  assert.deepEqual(uniquePublicLinks(["/clanky", "/clanky#x", "/admin", "https://example.com", "/plemena"], origin), [
    origin + "/clanky", origin + "/plemena",
  ]);
  assert.deepEqual(uniquePublicLinks(["/clanky", "/plemena"], origin, 1), [origin + "/clanky"]);
  assert.throws(() => uniquePublicLinks(["/clanky"], origin, MAX_LINK_TARGETS + 1), /budget/);
});

test("weekly sitemap sample is same-site, rotational, representative and capped", () => {
  const xml = "<urlset><url><loc>https://psipedia.sk/clanky/abc</loc></url>" +
    "<url><loc>https://psipedia.sk/clanky/def</loc></url>" +
    "<url><loc>https://psipedia.sk/adresar/veterinari/test</loc></url>" +
    "<url><loc>https://psipedia.sk/plemena/labrador</loc></url>" +
    "<url><loc>https://evil.example/page</loc></url>" +
    "<url><loc>https://psipedia.sk/admin</loc></url></urlset>";
  const urls = sitemapUrls(xml);
  assert.equal(urls.length, 4);
  const first = sampleLinkHealthPages(urls, 0);
  const second = sampleLinkHealthPages(urls, 1);
  assert.equal(first[0], LINK_HEALTH_BASE_URL + "/");
  assert.equal(first.length, 9);
  assert.equal(first.includes("https://psipedia.sk/clanky/abc"), true);
  assert.equal(second.includes("https://psipedia.sk/clanky/def"), true);
  assert.ok(first.length <= LINK_HEALTH_MAX_PAGES);
  assert.ok(LINK_HEALTH_SAMPLED_PREFIXES.length <= 6);
  assert.equal(allowedPage("https://psipedia.sk/api/search"), null);
  assert.equal(allowedPage("https://psipedia.sk.evil.example/"), null);
});

test("report preserves exact broken target, source page, status and anchor label", () => {
  const normalized = summarizeLinkinatorResult({
    links: [
      { url: "https://psipedia.sk/missing", parent: "https://psipedia.sk/clanky/post", status: 404, state: "BROKEN", displayText: "Starý profil" },
      { url: "https://psipedia.sk/service", parent: "https://psipedia.sk/adresar", status: 502, state: "BROKEN" },
      { url: "https://psipedia.sk/block", parent: "https://psipedia.sk/", status: 403, state: "SKIPPED" },
      { url: "https://offsite.example/missing", parent: "https://psipedia.sk/", status: 404, state: "BROKEN" },
      { url: "https://psipedia.sk/ok", parent: "https://psipedia.sk/", status: 200, state: "OK" },
    ],
  });
  assert.equal(normalized.counts.checkedLinks, 5);
  assert.equal(normalized.counts.broken, 1);
  assert.equal(normalized.counts.serverErrors, 1);
  assert.equal(normalized.findings[0].source, "https://psipedia.sk/clanky/post");
  assert.equal(normalized.findings[0].target, "https://psipedia.sk/missing");
  assert.equal(normalized.findings[0].anchor, "Starý profil");
  const md = markdownLinkHealthReport(normalized, [LINK_HEALTH_BASE_URL + "/"]);
  assert.match(md, /\/clanky\/post/);
  assert.match(md, /\/missing/);
  assert.match(md, /Žiadne odkazy neboli automaticky opravené/);
  assert.throws(() => summarizeLinkinatorResult({ links: null }), /links array/);
});

test("admin and scheduled workflows both remain read-only and limited", () => {
  const ui = read("components/admin-link-health-checker.tsx");
  const page = read("app/admin/kontrola-odkazov/page.tsx");
  const nav = read("lib/admin-navigation.ts");
  const yml = read(".github/workflows/link-health-audit.yml");
  assert.match(ui, /MAX_LINK_TARGETS/);
  assert.match(ui, /AbortSignal\.timeout\(9000\)/);
  assert.match(ui, /method: "POST"/m) === false; // no mutating requests
  assert.doesNotMatch(ui, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.match(ui, /credentials: "omit"/);
  assert.match(page, /requireAdminPageUser/);
  assert.match(nav, /\/admin\/kontrola-odkazov/);
  assert.match(yml, /cron: '17 3 \* \* 1'/);
  assert.match(yml, /permissions:\s*\n  contents: read/);
  assert.match(yml, /linkinator-v8\.1\.0/);
  assert.match(yml, /sha256sum -c -/);
  assert.match(yml, /mapfile -t PAGES/);
  assert.match(yml, /--concurrency 1 --timeout 8000/);
  assert.doesNotMatch(yml, /wrangler deploy|--remote|api\/admin/);
});
