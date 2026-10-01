import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizeCanonical } from "../lib/content-seo.ts";
import {
  buildListingPageMetadata,
  resolveListingIndexPolicy,
} from "../lib/listing-seo.ts";
import { SITE_URL } from "../lib/seo.ts";

function canonical(metadata) {
  return metadata.alternates?.canonical;
}

test("SEO-RECOVERY-1 clean listing is index/follow with a self canonical", () => {
  const metadata = buildListingPageMetadata({
    title: "Veterinári",
    description: "Veterinári na Slovensku.",
    path: "/adresar/veterinari",
  });
  assert.equal(metadata.robots?.index, true);
  assert.equal(metadata.robots?.follow, true);
  assert.equal(canonical(metadata), `${SITE_URL}/adresar/veterinari`);
});

test("SEO-RECOVERY-1 filter, search and sort URLs are noindex/follow with a clean canonical", () => {
  const cases = [
    ["/adresar/veterinari", { region: "Nitriansky kraj" }],
    ["/clanky", { hladat: "labrador" }],
    ["/podujatia", { termin: "vsetky" }],
    ["/plemena", { fciGroup: "8" }],
    ["/recenzie", { typ: "produkty" }],
    ["/pomoc-psom/adopcia", { kraj: "Nitriansky kraj" }],
    ["/pomoc-psom/stratene-psy", { region: "Nitriansky kraj" }],
    ["/pomoc-psom/najdene-psy", { q: "labrador" }],
    ["/mapa", { category: "services", region: "Nitriansky kraj" }],
    ["/adresar/veterinari", { sort: "name-asc" }],
  ];
  for (const [path, searchParams] of cases) {
    const metadata = buildListingPageMetadata({
      title: "Listing",
      description: "Listing description.",
      path,
      searchParams,
    });
    assert.equal(metadata.robots?.index, false, path);
    assert.equal(metadata.robots?.follow, true, path);
    assert.equal(canonical(metadata), `${SITE_URL}${path}`, path);
  }
});

test("SEO-RECOVERY-1 directory page-only pagination keeps stable indexable discovery", () => {
  const clean = resolveListingIndexPolicy("/adresar/veterinari", { page: "1" }, { indexPagination: true });
  assert.equal(clean.kind, "clean");
  assert.equal(clean.canonicalPath, "/adresar/veterinari");

  const pageTwo = resolveListingIndexPolicy("/adresar/veterinari", { page: "2" }, { indexPagination: true });
  assert.deepEqual(pageTwo, {
    kind: "pagination",
    index: true,
    follow: true,
    canonicalPath: "/adresar/veterinari?page=2",
    page: 2,
  });
  const metadata = buildListingPageMetadata({
    title: "Veterinári",
    description: "Veterinári na Slovensku.",
    path: "/adresar/veterinari",
    searchParams: { page: "2" },
    indexPagination: true,
  });
  assert.equal(metadata.robots?.index, true);
  assert.equal(metadata.robots?.follow, true);
  assert.equal(canonical(metadata), `${SITE_URL}/adresar/veterinari?page=2`);

  const mixed = resolveListingIndexPolicy(
    "/adresar/veterinari",
    { page: "2", region: "Nitriansky kraj" },
    { indexPagination: true },
  );
  assert.equal(mixed.kind, "query");
  assert.equal(mixed.index, false);
  assert.equal(mixed.canonicalPath, "/adresar/veterinari");
});

test("SEO-RECOVERY-1 alternate pagination parameter supports adoption catalog discovery", () => {
  const pageTwo = resolveListingIndexPolicy(
    "/pomoc-psom/adopcia",
    { strana: "2" },
    { indexPagination: true, paginationParam: "strana" },
  );
  assert.equal(pageTwo.kind, "pagination");
  assert.equal(pageTwo.canonicalPath, "/pomoc-psom/adopcia?strana=2");
  const filteredPage = resolveListingIndexPolicy(
    "/pomoc-psom/adopcia",
    { strana: "2", kraj: "Nitriansky kraj" },
    { indexPagination: true, paginationParam: "strana" },
  );
  assert.equal(filteredPage.kind, "query");
  assert.equal(filteredPage.canonicalPath, "/pomoc-psom/adopcia");
});

test("SEO-RECOVERY-1 manual content canonical strips query and fragment", () => {
  assert.equal(
    normalizeCanonical("https://psipedia.sk/clanky/test?utm_source=spam#fragment"),
    "https://psipedia.sk/clanky/test",
  );
  assert.equal(
    normalizeCanonical("/podujatia/test?termin=vsetky#detail"),
    "https://psipedia.sk/podujatia/test",
  );
});

test("SEO-RECOVERY-1 listing routes delegate query indexability to the shared policy", () => {
  const sources = [
    "../app/adresar/page.tsx",
    "../app/adresar/[category]/page.tsx",
    "../app/plemena/page.tsx",
    "../app/clanky/page.tsx",
    "../app/[section]/page.tsx",
    "../app/[section]/[slug]/page.tsx",
    "../app/pomoc-psom/adopcia/page.tsx",
    "../app/pomoc-psom/stratene-psy/page.tsx",
    "../app/pomoc-psom/najdene-psy/page.tsx",
    "../app/mapa/page.tsx",
  ].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));
  for (const source of sources) {
    assert.match(source, /buildListingPageMetadata|resolveListingIndexPolicy/);
  }
});

test("SEO-RECOVERY-1 event filter controls do not emit crawlable query anchors", () => {
  const source = fs.readFileSync(new URL("../components/event-calendar.tsx", import.meta.url), "utf8");
  assert.match(source, /type="button"[\s\S]*selectTime\(value\)/);
  assert.doesNotMatch(source, /href=\{eventTimeFilterHref\(value,/);
  assert.match(source, /href=\{pathname\}/);
});

test("SEO-RECOVERY-1 crawler access remains open for filtered URLs and named search bots", () => {
  const source = fs.readFileSync(new URL("../app/robots.ts", import.meta.url), "utf8");
  for (const crawler of ["Googlebot", "OAI-SearchBot", "ChatGPT-User", "GPTBot"]) {
    assert.match(source, new RegExp(crawler));
  }
  assert.doesNotMatch(source, /region|district|city|termin|fciGroup|sort|order/);
});

test("SEO-RECOVERY-1 topic metadata uses the central metadata contract", () => {
  const source = fs.readFileSync(new URL("../app/tema/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /buildPageMetadata\(\{/);
  assert.doesNotMatch(source, /openGraph:\s*\{/);
});

test("SEO-RECOVERY-1 preserves sitemap runtime safety and >1000 corpus coverage regression", () => {
  const runtime = fs.readFileSync(new URL("../lib/sitemap-runtime.ts", import.meta.url), "utf8");
  const sitemapTest = fs.readFileSync(new URL("./sitemap-seo.test.mjs", import.meta.url), "utf8");
  assert.match(runtime, /SITEMAP_MAX_D1_CONCURRENCY = 1/);
  assert.match(runtime, /for \(const item of stages\)/);
  assert.doesNotMatch(runtime, /Promise\.all/);
  assert.match(sitemapTest, /not capped at 500 or 1000/);
  assert.match(sitemapTest, /profil-1205/);
  assert.match(sitemapTest, /beyond 1000 rows/);
});
