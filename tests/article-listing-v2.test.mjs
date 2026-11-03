import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/clanky/page.tsx", "utf8");
const browser = readFileSync("components/article-browser.tsx", "utf8");
const card = readFileSync("components/article-card.tsx", "utf8");
const renderer = readFileSync("components/public-visual-system/public-article-card.tsx", "utf8");
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

test("ARTICLE-LISTING-V2 shares row cards and discovery in its responsive intro", () => {
  assert.match(route, /data-article-listing-layout/);
  assert.match(route, /ArticlePopularitySidebar/);
  assert.match(route, /ArticlePromo/);
  assert.match(browser, /ArticleListItem/);
  assert.match(styles, /minmax\(250px, 280px\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /max-width: 960px/);
  assert.match(styles, /grid-template-columns: 1fr/);
  assert.match(popularity, /\.slice\(0, 5\)/);
  assert.match(popularity, /item.title/);
});

test("ARTICLE-LISTING-V2 missing media and keyboard focus belong to the shared card", () => {
  assert.match(renderer, /props\.image \|\| !omitMissingImage/);
  assert.match(renderer, /PublicMediaFallback/);
  const sharedStyles = readFileSync(
    "components/public-visual-system/public-visual-system.module.css",
    "utf8",
  );
  assert.match(sharedStyles, /articleListItem:focus-visible/);
  assert.match(sharedStyles, /overflow-wrap: anywhere/);
});

test("ARTICLE-LISTING-PERF serializes only visible article cards, never editorial bodies", () => {
  const content = readFileSync("lib/content.ts", "utf8");
  const listItem = readFileSync("components/article-list-item.tsx", "utf8");
  const cardFields = content.slice(
    content.indexOf("export type ArticleListingCard = Pick<Article,"),
    content.indexOf("export const articles: Article[]"),
  );
  assert.match(cardFields, /"slug" \| "title" \| "excerpt"/);
  assert.doesNotMatch(cardFields, /"intro"|"takeaway"|"blocks"|"sections"|"sources"|"seo"/);
  const projection = route.slice(
    route.indexOf("articles={articles.map("),
    route.indexOf("hidePrimarySearch"),
  );
  assert.match(projection, /slug,title,excerpt,category,date,dateIso,image,imageAlt,accent/);
  assert.match(
    projection,
    /portalSection,newsCategory,imageDisplay,imageFocusX,imageFocusY,thumbnailImageDisplay/,
  );
  assert.doesNotMatch(
    projection,
    /\bblocks\b|\bsections\b|\bsources\b|\bintro\b|\btakeaway\b|\bseo\b/,
  );
  assert.match(browser, /articles: ArticleListingCard\[\]/);
  assert.match(card, /article: ArticleListingCard/);
  assert.match(listItem, /article: ArticleListingCard/);
  assert.match(route, /items: articles\.map\(/);
  assert.match(route, /getPublishedArticleSummaries\(\{ limit: 200 \}\)/);
});
