import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CATEGORY-BANNERS reuses one shared hero and category-tile system", () => {
  const shared = read("components/public-visual-system/public-visual-system.tsx");
  const sharedCss = read("components/public-visual-system/public-visual-system.module.css");
  const events = read("components/events-page.tsx");
  const directory = read("components/directory-page.tsx");
  const reviews = read("components/reviews-hub.tsx");
  const help = read("components/help-overview.tsx");

  assert.match(shared, /export function PublicLandingHero/);
  assert.match(shared, /export function PublicCategoryTiles/);
  assert.match(shared, /data-public-landing-hero/);
  assert.match(shared, /data-public-category-tiles/);
  assert.match(sharedCss, /\.landingHero_events/);
  assert.match(sharedCss, /\.landingHero_services/);
  assert.match(sharedCss, /\.landingHero_reviews/);
  assert.match(sharedCss, /\.categoryTiles\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);

  assert.match(events, /<UnifiedSectionHero/);
  assert.match(events, /"section\.podujatia"/);
  assert.match(events, /<PublicCategoryTiles/);
  assert.match(directory, /<UnifiedSectionHero/);
  assert.match(directory, /"section\.adresar"/);
  assert.match(directory, /<PublicSubcategoryNavigator/);
  assert.match(directory, /mode="landing"/);
  assert.match(reviews, /<UnifiedSectionHero/);
  assert.match(reviews, /"section\.recenzie"/);
  assert.match(reviews, /<PublicCategoryTiles/);

  assert.match(help, /<UnifiedSectionHero/);
  assert.match(help, /"section\.pomoc-psom"/);
  assert.match(help, /data-help-category-nav/);
});

test("CATEGORY-BANNERS uses existing project taxonomies and canonical links", () => {
  const events = read("components/events-page.tsx");
  const eventDomain = read("lib/events.ts");
  const directory = read("components/directory-page.tsx");
  const reviews = read("components/reviews-hub.tsx");

  assert.match(events, /eventTypes\.flatMap/);
  assert.match(events, /eventTypePortalHref\(eventType\)/);
  assert.match(eventDomain, /"Výstava", "Preteky", "Seminár", "Tréning", "Stretnutie", "Iné"/);

  assert.match(directory, /directoryCategories\.map/);
  assert.match(directory, /directoryCategoryHref\(category\)/);

  for (const label of ["Všetko", "Produkty", "Služby", "E-shopy"]) {
    assert.match(reviews, new RegExp(`title: "${label}"`));
  }
  assert.match(reviews, /viewHref\("products"\)/);
  assert.match(reviews, /viewHref\("services"\)/);
  assert.match(reviews, /viewHref\("eshops"\)/);
  assert.match(reviews, /rel: "nofollow"/);
});

test("CATEGORY-BANNERS preserves functional search, filter and content contracts", () => {
  const events = read("components/events-page.tsx");
  const directory = read("components/directory-page.tsx");
  const reviews = read("components/reviews-hub.tsx");
  const help = read("components/help-overview.tsx");

  assert.match(events, /<EventCalendar events=\{events\}/);
  assert.match(events, /href="\/podujatia\/pridat-podujatie"/);

  assert.match(directory, /action="\/adresar"/);
  assert.match(directory, /method="get"/);
  assert.match(directory, /name="category"/);
  assert.match(directory, /name="q"/);
  assert.match(directory, /<DirectoryResults/);

  assert.match(reviews, /action="\/hladat"/);
  assert.match(reviews, /name="sekcia" value="recenzie"/);
  assert.match(reviews, /<ArticleCard/);
  assert.match(reviews, /profileReviews\.map/);
  assert.match(reviews, /eshops\.map/);

  assert.match(help, /\/pomoc-psom\/stratene-a-najdene\/nahlasit/);
});

test("CATEGORY-BANNERS keeps semantic and responsive shared contracts", () => {
  const shared = read("components/public-visual-system/public-visual-system.tsx");
  const css = read("components/public-visual-system/public-visual-system.module.css");

  assert.match(shared, /<h1>\{title\}<\/h1>/);
  assert.match(shared, /<nav className=\{cx\(styles\.categoryTiles/);
  assert.match(shared, /aria-current=\{item\.current \? "page"/);
  assert.match(css, /\.categoryTile:focus-visible/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.categoryTiles[\s\S]*?repeat\(2/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.categoryTiles[\s\S]*?minmax\(0, 1fr\)/);
  assert.match(css, /\.landingHero\s*\{[\s\S]*?overflow:\s*hidden/);
});
