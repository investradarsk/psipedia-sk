import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const articleStore = readFileSync(new URL("../lib/article-store.ts", import.meta.url), "utf8");
const sectionListing = readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
const sectionDetail = readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
const legacyDetail = readFileSync(new URL("../app/clanky/[slug]/page.tsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const rootLayout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const breedStore = readFileSync(new URL("../lib/breed-store.ts", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = articleStore.indexOf(name);
  const end = nextName ? articleStore.indexOf(nextName, start + name.length) : articleStore.length;
  assert.ok(start >= 0, `missing ${name}`);
  return articleStore.slice(start, end < 0 ? articleStore.length : end);
}

test("public article listings use bounded lightweight SQL", () => {
  const source = functionSource("export async function getPublishedArticleSummaries", "/** Backwards-compatible");
  assert.match(source, /PUBLIC_ARTICLE_SUMMARY_COLUMNS/);
  assert.match(source, /LIMIT \?/);
  assert.doesNotMatch(source, /SELECT\s+\*/i);
  assert.doesNotMatch(source, /sections_json|blocks_json|sources_json|intro|takeaway/i);
  assert.match(sectionListing, /getPublishedArticleSummaries\(\{ portalSection:/);
  assert.doesNotMatch(sectionListing, /getPublishedArticles/);
});

test("article detail loads one body and related summaries with a database limit", () => {
  const detail = functionSource("const getPublishedArticleUncached", "/** React request memoization");
  const related = functionSource("export async function getRelatedPublishedArticles", "export async function listManagedArticleSummaries");
  assert.match(detail, /WHERE slug = \?/);
  assert.match(detail, /LIMIT 1/);
  assert.doesNotMatch(detail, /SELECT\s+\*/i);
  assert.match(articleStore, /cache\(getPublishedArticleUncached\)/);
  assert.match(related, /LIMIT \?/);
  assert.match(related, /Math\.min\(6/);
  assert.doesNotMatch(related, /getPublishedArticles/);
  assert.match(sectionDetail, /getRelatedPublishedArticles\(article, 3\)/);
  assert.match(legacyDetail, /getRelatedPublishedArticles\(article, 3\)/);
  assert.doesNotMatch(sectionDetail, /getPublishedArticles/);
  assert.doesNotMatch(legacyDetail, /getPublishedArticles/);
});

test("public HTML has a short edge cache while admin remains no-store", () => {
  assert.match(worker, /PUBLIC_HTML_CACHE_TTL_SECONDS = 45/);
  assert.match(worker, /caches\?\.default/);
  assert.match(worker, /X-Psipedia-Cache/);
  assert.match(worker, /Cloudflare-CDN-Cache-Control/);
  assert.match(worker, /private, no-store/);
  assert.match(worker, /request\.headers\.has\("cookie"\)/);
  assert.doesNotMatch(worker.slice(worker.indexOf("function isCacheableHtmlResponse"), worker.indexOf("function responseWithHeader")), /no-store/);
  assert.match(rootLayout, /navigation is D1-backed/);
});

test("breed detail uses a selective canonical query and avoids runtime image HEAD checks", () => {
  assert.match(breedStore, /WHERE slug=\? AND \$\{canonicalBreedWinnerSql\('managed_breeds'\)\} LIMIT 1/);
  const detailLoader = breedStore.match(/const getPublishedBreedUncached=[\s\S]*?export const getPublishedBreed=/)?.[0] ?? "";
  assert.doesNotMatch(detailLoader, /availableBreedImage/);
  assert.match(detailLoader, /ownedBreedImage/);
});
