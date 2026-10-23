import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildListingPageMetadata, resolveListingIndexPolicy } from "../lib/listing-seo.ts";
import { SITE_URL } from "../lib/seo.ts";

const directorySource = readFileSync(new URL("../app/adresar/page.tsx", import.meta.url), "utf8");
const sectionSource = readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
const articlesSource = readFileSync(new URL("../app/clanky/page.tsx", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");

test("SEO recovery: real directory pagination is indexable with its own canonical", () => {
  assert.match(directorySource, /path: "\/adresar",[\s\S]*?indexPagination: true/);
  assert.match(directorySource, /resolveListingIndexPolicy\("\/adresar", rawSearchParams, \{ indexPagination: true \}\)/);
  const page2 = buildListingPageMetadata({
    path: "/adresar",
    title: "Adresár",
    description: "Profily služieb",
    searchParams: { page: "2" },
    indexPagination: true,
  });
  assert.equal(page2.robots?.index, true);
  assert.equal(page2.alternates?.canonical, `${SITE_URL}/adresar?page=2`);
  assert.equal(resolveListingIndexPolicy("/adresar", { page: "2", q: "pes" }, { indexPagination: true }).index, false);
});

test("SEO recovery: events use their real strana pagination, not page", () => {
  assert.match(sectionSource, /paginationParam: "strana"/);
  assert.match(sectionSource, /slug !== "podujatia" \|\| listingPolicy.kind === "query"/);
  assert.match(sectionSource, /path: listingPolicy.canonicalPath/);
  const params = { strana: "2" };
  const policy = resolveListingIndexPolicy("/podujatia", params, { indexPagination: true, paginationParam: "strana" });
  assert.deepEqual([policy.kind, policy.index, policy.canonicalPath], ["pagination", true, "/podujatia?strana=2"]);
  const filters = resolveListingIndexPolicy("/podujatia", { ...params, region: "Nitra" }, { indexPagination: true, paginationParam: "strana" });
  assert.equal(filters.index, false);
});

test("SEO recovery: article listings without server pagination remain unindexed when page is requested", () => {
  assert.match(articlesSource, /getPublishedArticleSummaries\(\{ limit: 200 \}\)/);
  assert.doesNotMatch(articlesSource, /indexPagination:\s*true/);
  assert.equal(resolveListingIndexPolicy("/clanky", { page: "2" }).index, false);
});

test("SEO recovery: workers.dev previews get noindex and cannot enter the HTML cache", () => {
  assert.match(workerSource, /const isWorkersDevPreview = url.hostname.toLowerCase\(\).endsWith\("\.workers\.dev"\)/);
  assert.match(workerSource, /if \(eligiblePublicSitemapRequest\(request\)\) \{[\s\S]*?if \(isWorkersDevPreview\)/);
  assert.match(workerSource, /if \(isWorkersDevPreview\) \{[\s\S]*?"X-Robots-Tag": "noindex, nofollow",[\s\S]*?"Cache-Control": "private, no-store"/);
  assert.match(workerSource, /url.hostname.toLowerCase\(\) !== "psipedia.sk" \|\| !isExplicitAnonymousHtmlRoute\(url.pathname\)/);
});
