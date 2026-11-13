import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("NEWS-LANDING-2 keeps /novinky distinct from the general /clanky archive", () => {
  const archive = read("app/clanky/page.tsx");
  const sectionRoot = read("app/[section]/page.tsx");
  const navigation = read("lib/navigation.ts");
  const navigationStore = read("lib/navigation-store.ts");
  const headerNavigation = read("lib/public-header-navigation.ts");
  const footer = read("components/site-footer.tsx");

  assert.match(archive, /title: "Všetky články"/);
  assert.match(archive, /<UnifiedSectionHero/);
  assert.match(archive, /title="Všetky články"/);
  assert.match(archive, /getSectionHeroVisual\("section\.novinky"\)/);
  assert.match(sectionRoot, /if \(slug === "novinky"\) return <NewsHub/);
  assert.match(navigation, /id: "novinky", label: "Novinky", href: "\/novinky"/);
  assert.match(navigationStore, /item\.id === "novinky" && item\.href === "\/clanky"/);
  assert.match(navigationStore, /href: "\/novinky"/);
  assert.match(headerNavigation, /item\.id === "novinky" \? "novinky"/);
  assert.match(footer, /href="\/novinky">Novinky<\/Link>/);
});

test("NEWS-LANDING-2 uses shared category navigation instead of custom full-width pills", () => {
  const newsHub = read("components/news-hub.tsx");
  const newsStyles = read("components/news-hub.module.css");
  assert.match(newsHub, /mobileLayout="grid"/);
  assert.doesNotMatch(newsHub, /<PortalMobileCategorySelect/);
  assert.match(newsHub, /<PublicSubcategoryNavigator/);
  assert.match(newsHub, /data-news-category-navigation/);
  assert.doesNotMatch(newsHub, /meta=\{\x60\$\{newsArticles\.length\}/);
  assert.doesNotMatch(newsStyles, /\.filters\s*\{/);
});

test("NEWS-LANDING-2 keeps /novinky indexable in the canonical sitemap", () => {
  const sitemapSeo = read("lib/sitemap-seo.ts");
  const sitemap = read("app/sitemap.ts");
  assert.doesNotMatch(sitemapSeo.split("export const NEWS_SITEMAP_WINDOW_MS")[0], /"\/novinky"/);
  assert.match(sitemap, /const sectionPath = `\/\$\{section\.slug\}`/);
  assert.match(sitemap, /SITEMAP_REDIRECT_SOURCES\.has\(sectionPath\)/);
  assert.match(sitemap, /portalSubpageHref\(section, subpage\)/);
});
