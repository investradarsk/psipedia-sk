import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  articlePromoBlockAnchor,
  AUTOMATIC_ARTICLE_PROMO_ANCHOR,
  ARTICLE_LISTING_PROMO_ANCHOR,
  HOME_PROFILE_BANNER_ANCHOR,
  BREED_CLUBS_BANNER_ANCHOR,
  HELP_LOST_FOUND_BANNER_ANCHOR,
  HELP_CLOSING_BANNER_ANCHOR,
  helpOverviewBannerAnchor,
} from "../lib/visual-library-anchors.ts";

const read = (path) => readFileSync(path, "utf8");

test("visual-library banner jump links use stable unique DOM-safe ids", () => {
  const first = articlePromoBlockAnchor("notion-1/2");
  assert.equal(first, articlePromoBlockAnchor("notion-1/2"));
  assert.match(first, /^psipedia-promo-[a-zA-Z0-9_-]+$/);
  assert.notEqual(first, articlePromoBlockAnchor("notion-1?2"));
  assert.notEqual(first, articlePromoBlockAnchor("notion-2/1"));
  assert.notEqual(first, AUTOMATIC_ARTICLE_PROMO_ANCHOR);
  assert.equal(helpOverviewBannerAnchor(4), "psipedia-banner-help-section-4");
  assert.equal(new Set([
    AUTOMATIC_ARTICLE_PROMO_ANCHOR,
    ARTICLE_LISTING_PROMO_ANCHOR,
    HOME_PROFILE_BANNER_ANCHOR,
    BREED_CLUBS_BANNER_ANCHOR,
    HELP_LOST_FOUND_BANNER_ANCHOR,
    HELP_CLOSING_BANNER_ANCHOR,
    helpOverviewBannerAnchor(0),
    helpOverviewBannerAnchor(2),
    helpOverviewBannerAnchor(4),
  ]).size, 9);
});

test("public promo locations use the same anchors as the visual library URL inventory", () => {
  const promo = read("components/public-visual-system/public-magazine-banner.tsx");
  const articleBlocks = read("components/article-blocks.tsx");
  const articleDetail = read("components/article-detail.tsx");
  const articlesListing = read("app/clanky/page.tsx");
  const homepage = read("app/page.tsx");
  const breeds = read("app/plemena/page.tsx");
  const helpOverview = read("components/help-overview.tsx");
  const helpBanner = read("components/public-visual-system/public-help-banner.tsx");
  const store = read("lib/visual-library-usage-store.ts");
  const catalog = read("lib/visual-library-banners.ts");
  const preview = read("components/admin-visual-library.tsx");

  assert.match(promo, /id=\{anchorId\}/);
  assert.match(articleBlocks, /anchorId=\{articlePromoBlockAnchor\(block.id\)\}/);
  assert.match(articleDetail, /anchorId=\{AUTOMATIC_ARTICLE_PROMO_ANCHOR\}/);
  assert.match(articlesListing, /anchorId=\{ARTICLE_LISTING_PROMO_ANCHOR\}/);
  assert.match(homepage, /anchorId=\{HOME_PROFILE_BANNER_ANCHOR\}/);
  assert.match(breeds, /anchorId=\{BREED_CLUBS_BANNER_ANCHOR\}/);
  assert.match(helpOverview, /anchorId=\{HELP_LOST_FOUND_BANNER_ANCHOR\}/);
  assert.match(helpOverview, /anchorId=\{helpOverviewBannerAnchor\(index\)\}/);
  assert.match(helpBanner, /anchorId=\{HELP_CLOSING_BANNER_ANCHOR\}/);
  assert.match(store, /anchorId: articlePromoBlockAnchor\(block.id\)/);
  assert.match(store, /anchorId: AUTOMATIC_ARTICLE_PROMO_ANCHOR/);
  assert.match(catalog, /helpOverviewPromos/);
  assert.match(catalog, /helpClosingPromo/);
  assert.match(catalog, /lostFoundSubmitPromo/);
  assert.match(preview, /Otvoriť umiestnenie/);
  assert.match(preview, /use\.anchorId \? /);
});
