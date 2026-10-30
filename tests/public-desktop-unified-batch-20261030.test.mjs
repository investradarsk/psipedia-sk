import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("mobile menu Contact opens the dedicated contact page", () => {
  const header = src("components/site-header.tsx");
  assert.match(header, /href="\/kontakt" className="mobile-contact-link"/);
  assert.doesNotMatch(header, /href="\/o-nas#kontakt"/);
});

test("complete-list CTA follows event recommendations and home magazine sidebar cards", () => {
  const event = src("components/event-detail.tsx");
  assert.ok(event.indexOf("data-event-related-grid") > -1);
  assert.ok(event.indexOf("Všetky podujatia") > event.indexOf("data-event-related-grid"));
  const home = src("components/home-editorial.tsx");
  const sidebar = home.slice(home.indexOf("export function HomeMagazineSidebar"), home.indexOf("export function HomeMagazineBanner"));
  assert.ok(sidebar.indexOf("{children}") < sidebar.indexOf("className=\"home-magazine-sidebar-action\""));
});

test("popular articles display their real thumbnails or the standard media fallback", () => {
  const article = src("lib/article-discovery.ts");
  const sidebar = src("components/article-popularity-sidebar.tsx");
  assert.match(article, /image: article\.image/);
  assert.match(sidebar, /className=\{styles\.thumbnail\}/);
  assert.match(sidebar, /<PublicMediaFallback/);
});

test("all FCI groups show three breed cards before selective expansion", () => {
  const browser = src("components/breed-browser.tsx");
  const page = src("app/plemena/page.tsx");
  assert.match(browser, /INITIAL_PER_GROUP = 3/);
  assert.match(browser, /expandedGroups/);
  assert.match(browser, /toggleGroup\(group\.number\)/);
  assert.match(browser, /fciGroup: String\(group\.number\)/);
  assert.doesNotMatch(page, /<BreedCrawlIndex/);
  assert.match(page, /listPublishedCanonicalBreedAtlasCards/);
});

test("breed utility links and editorial promos reuse the public magazine banner", () => {
  const breed = src("app/plemena/[slug]/page.tsx");
  const promo = src("components/article-promo.tsx");
  const shared = src("components/public-visual-system/public-magazine-banner.tsx");
  assert.match(breed, /<PublicMagazineBanner/);
  assert.match(breed, /testId="breed-utility"/);
  assert.match(promo, /<PublicMagazineBanner/);
  assert.match(shared, /links\?\.length/);
});

test("puppy landing groups all eleven original topics into four stable life stages", () => {
  const editorial = src("components/editorial-section.tsx");
  const portal = src("lib/portal.ts");
  for (const label of ["Pred príchodom psa", "Prvé mesiace doma", "Zdravie a rast", "Výchova a dospievanie"]) {
    assert.ok(editorial.includes(label));
  }
  for (const slug of ["pred-kupou-psa", "vyber-plemena", "vyber-chovatela", "prve-dni", "socializacia", "hygiena", "krmenie", "ockovanie-a-zdravie", "vycvik-steniatka", "rast-a-vyvoj", "puberta"]) {
    assert.ok(editorial.includes(slug));
    assert.ok(portal.includes(slug));
  }
});

test("mobile map can be snapped to map, preview or list without gesture-only UX", () => {
  const map = src("components/map/map-experience.tsx");
  assert.match(map, /className=\{styles\.sheetSnapControls\}/);
  assert.match(map, /\["peek", "Mapa"\]/);
  assert.match(map, /\["preview", "Náhľad"\]/);
  assert.match(map, /\["expanded", "Zoznam"\]/);
  assert.match(map, /onSheetStateChange\(state\)/);
});

test("shop detail is compact, full description remains readable and review email is contextual", () => {
  const detail = src("app/recenzie/eshopy/[slug]/page.tsx");
  const login = src("app/recenzia/prihlasenie/page.tsx");
  assert.match(detail, /profileExcerpt\(shop\.description\)/);
  assert.match(detail, /O e-shope/);
  assert.match(login, /Overenie e-mailu/);
  assert.match(login, /getPublishedEshopBySlug/);
  assert.match(src("components/review-author-auth-form.tsx"), /button button--dark review-auth-submit/);
});

test("shared compact subcategory navigator never hides unmarked horizontal overflow", () => {
  const css = src("components/public-visual-system/public-subcategory-navigator.module.css");
  assert.match(css, /PUBLIC NAV: no hidden horizontal rails/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});
