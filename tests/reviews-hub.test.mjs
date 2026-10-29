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
  // The landing offers three categories; "all" is a return link, not a fourth tile.
  assert.match(hub, /return "\/recenzie#obsah-recenzie"/);
  assert.match(hub, /view !== "all" \? \(/);
  assert.match(hub, /<Link href=\{viewHref\("all"\)\} rel="nofollow">Zobraziť všetko<\/Link>/);
  assert.match(hub, /Produkty/);
  assert.match(hub, /Služby/);
  assert.match(hub, /E-shopy/);
  assert.match(hub, /Tri hlavné vstupy do recenzií/);
  assert.match(hub, /Zobraziť všetko|Všetko je zobrazené/);
  assert.match(hub, /<UnifiedSectionHero/);
  assert.match(hub, /getSectionHeroVisual\("section\.recenzie"\)/);
  assert.match(hub, /<PublicCategoryTiles/);
  assert.match(hub, /<PublicSubcategoryNavigator/);
  assert.match(hub, /label="Kategórie produktových recenzií"/);
  assert.match(hub, /Najnovšie testy Psipedia/);
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

test("reviews hub styling stays isolated and shared landing tiles live in the public visual system", () => {
  const hub = read("components/reviews-hub.tsx");
  const css = read("components/reviews-hub.module.css");
  const sharedCss = read("components/public-visual-system/public-visual-system.module.css");
  assert.match(hub, /reviews-hub\.module\.css/);
  assert.match(sharedCss, /\.categoryTiles/);
  assert.match(sharedCss, /\.categoryTile/);
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
  assert.match(hub, /<PublicCategoryTiles/);
  assert.match(hub, /<PublicSubcategoryNavigator/);
  assert.match(shared, /export function PublicContentListItem/);
  assert.match(shared, /export function PublicDataCard/);
  assert.doesNotMatch(css, /\.eshopCard\s*\{|\.eshopMiniRatings\s*\{|\.serviceLinks a\s*\{/);
  assert.match(css, /\.methodGrid article/);
});
