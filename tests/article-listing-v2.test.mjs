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


test("ARTICLE-LISTING-PERF serializes only visible article cards, never editorial bodies", () => {
  const content = readFileSync("lib/content.ts", "utf8");
  const listItem = readFileSync("components/article-list-item.tsx", "utf8");
  const cardFields = content.slice(content.indexOf("export type ArticleListingCard = Pick<Article,"), content.indexOf("export const articles: Article[]"));
  assert.match(cardFields, /"slug" \| "title" \| "excerpt"/);
  assert.doesNotMatch(cardFields, /"intro"|"takeaway"|"blocks"|"sections"|"sources"|"seo"/);
  const projection = route.slice(route.indexOf("articles={articles.map("), route.indexOf("hidePrimarySearch"));
  assert.match(projection, /slug,title,excerpt,category,date,dateIso,image,imageAlt,accent/);
  assert.match(projection, /portalSection,newsCategory,imageDisplay,imageFocusX,imageFocusY,thumbnailImageDisplay/);
  assert.doesNotMatch(projection, /\bblocks\b|\bsections\b|\bsources\b|\bintro\b|\btakeaway\b|\bseo\b/);
  assert.match(browser, /articles: ArticleListingCard\[\]/);
  assert.match(card, /article: ArticleListingCard/);
  assert.match(listItem, /article: ArticleListingCard/);
  assert.match(route, /items: articles\.map\(/);
  assert.match(route, /getPublishedArticleSummaries\(\{ limit: 200 \}\)/);
});
