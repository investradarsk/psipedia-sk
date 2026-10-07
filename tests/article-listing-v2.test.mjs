import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/clanky/page.tsx", "utf8");
const browser = readFileSync("components/article-browser.tsx", "utf8");
const card = readFileSync("components/article-card.tsx", "utf8");
const styles = readFileSync("app/clanky/article-listing.module.css", "utf8");
const popularity = readFileSync("components/article-popularity-sidebar.tsx", "utf8");

test("ARTICLE-LISTING-V2 retains listing data, SEO, and URL filters", () => {
  assert.match(route, /getPublishedArticleSummaries\(\{ limit: 200 \}\)/);
  assert.match(route, /resolveListingIndexPolicy/);
  assert.match(route, /buildCollectionPageJsonLd/);
  assert.match(route, /scalar\(params\.hladat\)/);
  assert.match(route, /scalar\(params\.tema\)/);
  assert.match(browser, /articles\.filter/);
});

test("ARTICLE-LISTING-V2 uses two cards beside shared discovery on desktop", () => {
  assert.match(route, /data-article-listing-layout/);
  assert.match(route, /ArticlePopularitySidebar/);
  assert.match(route, /ArticlePromo/);
  assert.match(route, /initialWindow="24h"/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) 280px/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(popularity, /\.slice\(0, 5\)/);
  assert.match(popularity, /7 dní/);
  assert.doesNotMatch(popularity, /<img\b/);
});

test("ARTICLE-LISTING-V2 handles mobile, missing media, and keyboard focus", () => {
  assert.match(browser, /omitMissingImage/);
  assert.match(card, /article\.image \|\| !omitMissingImage/);
  assert.match(styles, /max-width: 1120px/);
  assert.match(styles, /\.sidebar \{ display: none; \}/);
  assert.match(styles, /max-width: 680px/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /overflow-wrap: anywhere/);
});
