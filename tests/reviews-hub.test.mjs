import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("reviews landing route uses the dedicated unified hub and keeps failures non-fatal", () => {
  const route = read("app/[section]/page.tsx");
  assert.match(route, /ReviewsHub, normalizeReviewsHubView/);
  assert.match(route, /listLatestPublicProfileReviews\(database, 8\)/);
  assert.match(route, /listPublishedEshops\(\)/);
  assert.match(route, /Public e-shop review hub read failed/);
  assert.match(route, /Public reviews hub feed read failed/);
  assert.match(route, /return \[\]/);
  assert.match(route, /slug === "recenzie"/);
  assert.match(route, /REVIEWS_DESCRIPTION/);
});

test("reviews hub separates editorial products, user service reviews and verified e-shop ratings", () => {
  const hub = read("components/reviews-hub.tsx");
  // "Všetko" is the already-supported overview, not an invented review category.
  assert.match(hub, /return "\/recenzie#obsah-recenzie"/);
  assert.match(hub, /href: viewHref\("all"\)/);
  assert.match(hub, /current: view === "all"/);
  assert.match(hub, /Produkty/);
  assert.match(hub, /Služby/);
  assert.match(hub, /E-shopy/);
  assert.match(hub, /Vyberte, čo chcete pozrieť/);
  assert.match(hub, /Zobraziť všetky články/);
  assert.match(hub, /Zobraziť recenzie služieb/);
  assert.match(hub, /Zobraziť všetky e-shopy/);
  assert.match(hub, /<UnifiedSectionHero/);
  assert.match(hub, /getSectionHeroVisual\("section\.recenzie"\)/);
  assert.match(hub, /<PublicSubcategoryNavigator/);
  assert.match(hub, /mode="compact"/);
  assert.match(hub, /mobileLayout="grid"/);
  assert.match(hub, /columns=\{4\}/);
  // No second category taxonomy or automatically labeled physical tests.
  assert.doesNotMatch(hub, /<PublicCategoryTiles/);
  assert.doesNotMatch(hub, /Čo chceš porovnať\?/);
  assert.match(hub, /<ArticleCard/);
  assert.match(hub, /portalSubpageHref\(section, category\)/);
  assert.match(hub, /Najnovšie články o produktoch/);
  assert.match(hub, /productArticleKind\(article\)/);
  assert.match(hub, /lizacia-podlozka-pre-psa-vyber-pouzivanie/);
  assert.match(hub, /Čítať návod/);
  assert.match(hub, /Najnovšie recenzie služieb/);
  assert.match(hub, /Hodnotenia nákupnej skúsenosti/);
  assert.match(hub, /overený e-mail/);
  assert.match(hub, /\/recenzie\/eshopy\/\$\{shop\.slug\}/);
  assert.match(hub, /shop\.logoUrl/);
  assert.match(hub, /shop\.focusTags/);
  assert.match(hub, /Google ani iné externé skóre nikdy nemiešame do priemeru Psipedia/);
  assert.match(hub, /Affiliate a sponzorovaný obsah musí byť označený/);
});

test("latest public review feed exposes only visible reviews of public canonical targets", () => {
  const source = read("lib/profile-review-read.ts");
  assert.match(source, /export async function listLatestPublicProfileReviews/);
  assert.match(source, /review\.status='VISIBLE'/);
  assert.match(source, /directory\.status='published'/);
  assert.match(source, /directory\.archived_at IS NULL/);
  assert.match(source, /organization\.status='PUBLISHED'/);
  assert.match(source, /organization\.published_at IS NOT NULL/);
  assert.match(source, /organization\.archived_at IS NULL/);
  assert.match(source, /\/adresar\/\$\{row\.directory_category\}\/\$\{row\.directory_slug\}/);
  assert.match(source, /\/organizacie\/\$\{row\.organization_slug\}/);
  assert.doesNotMatch(source, /email_ciphertext|email_hash/);
});

test("reviews hub styling stays isolated and category links reuse the Help public navigator", () => {
  const hub = read("components/reviews-hub.tsx");
  const css = read("components/reviews-hub.module.css");
  const sharedCss = read("components/public-visual-system/public-subcategory-navigator.module.css");
  assert.match(hub, /reviews-hub\.module\.css/);
  assert.match(sharedCss, /\.compactGridMobile \.compactTrack/);
  assert.match(sharedCss, /\.compactFour \.compactTrack/);
  assert.match(css, /\.reviewGrid/);
  assert.match(css, /\.categoryGrid/);
  assert.match(css, /\.eshopGrid/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test("S-29 reuses the established compact cards instead of standalone oversized article and e-shop layouts", () => {
  const hub = read("components/reviews-hub.tsx");
  const css = read("components/reviews-hub.module.css");
  const shared = read("components/public-visual-system/public-visual-system.tsx");
  assert.match(hub, /<PublicContentList className=\{styles\.articleGrid\}/);
  assert.match(hub, /<ArticleCard[\s\S]*?variant="compact"/);
  assert.doesNotMatch(hub, /\s+large\s*\n\s+topicHref=/);
  assert.match(hub, /<PublicContentList className=\{styles\.eshopGrid\}/);
  assert.match(hub, /<PublicContentListItem[\s\S]*?title=\{shop\.name\}/);
  assert.match(hub, /shop\.averages\.overall/);
  assert.match(hub, /shop\.ratingCount/);
  assert.match(hub, /shop\.logoUrl/);
  assert.match(hub, /<PublicDataCard/);
  assert.match(hub, /<PublicSubcategoryNavigator/);
  assert.doesNotMatch(hub, /<PublicCategoryTiles/);
  assert.match(shared, /export function PublicContentListItem/);
  assert.match(shared, /export function PublicDataCard/);
  assert.doesNotMatch(css, /\.eshopCard\s*\{|\.eshopMiniRatings\s*\{|\.serviceLinks a\s*\{/);
  assert.match(css, /\.methodGrid article/);
});
