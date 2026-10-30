import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const count = (source, value) => source.split(value).length - 1;

test("S01 homepage has one contextual sidebar for each topic", () => {
  const home = read("app/page.tsx");
  const selector = read("lib/homepage-content.ts");
  for (const title of ["Najbližšie podujatia", "Objav plemená", "Veterinári", "Tréneri a psie školy"]) {
    assert.equal(count(home, 'title="' + title + '"'), 1);
  }
  assert.doesNotMatch(home, /Plemeno dňa|HomeDogNameDayEntry|HomeProfileCategoryBand/);
  assert.ok(home.indexOf('testId="steniatka"') < home.indexOf('testId="starostlivost"'));
  assert.ok(home.indexOf('testId="starostlivost"') < home.indexOf('data-home-help'));
  assert.ok(home.indexOf('data-home-help') < home.indexOf('testId="aktivity"'));
  assert.match(selector, /const latest = ordered\.slice\(0, latestLimit\)/);
});

test("S02 archive loads initial 12, with filters and full-width continuation", () => {
  const browser = read("components/article-browser.tsx");
  const page = read("app/clanky/page.tsx");
  assert.match(browser, /INITIAL_COUNT = 12/);
  assert.match(browser, /NEXT_COUNT = 12/);
  assert.match(browser, /Načítať ďalšie články/);
  assert.match(browser, /displayed\.slice\(3\)/);
  assert.match(page, /sidebar=\{<aside/);
  assert.match(browser, /"Novinky", "Šteniatka"/);
});

test("S03 article contents is a permanently visible navigation list", () => {
  const detail = read("components/article-detail.tsx");
  assert.match(detail, /<nav className=\{styles\.toc\}/);
  assert.doesNotMatch(detail, /<details className=\{styles\.toc\}>/);
});

test("S04 canonical topic destinations replace legacy archives in all entry points", () => {
  const map = read("lib/article-category-routes.ts");
  const route = read("app/tema/[slug]/page.tsx");
  const cards = read("components/article-card.tsx");
  const detail = read("components/article-detail.tsx");
  const sitemap = read("app/sitemap.ts");
  for (const path of ["/starostlivost/zdravie", "/starostlivost/vyziva", "/clanky?tema=vycvik", "/clanky?tema=zivot-so-psom"]) {
    assert.ok(map.includes(path), path);
  }
  assert.match(route, /permanentRedirect\(destination\)/);
  assert.match(cards, /articleCategoryHref\(article\.category\)/);
  assert.match(detail, /articleCategoryHref\(article\.category\)/);
  assert.doesNotMatch(sitemap, /categories\.map\(\(category\) => sitemapEntry/);
  const editorial = read("components/editorial-section.tsx");
  assert.match(editorial, /contentHubLeadPair/);
  assert.match(editorial, /healthUrgent/);
});

test("S05 FCI atlas uses three cards per group without a redundant crawl index", () => {
  const browser = read("components/breed-browser.tsx");
  const page = read("app/plemena/page.tsx");
  const card = read("components/breed-card.tsx");
  assert.match(browser, /INITIAL_PER_GROUP = 3/);
  assert.match(browser, /expandedGroups/);
  assert.match(browser, /fciGroup: String\(group\.number\)/);
  assert.match(page, /buildCollectionPageJsonLd/);
  assert.doesNotMatch(page, /<BreedCrawlIndex/);
  assert.doesNotMatch(card, /FCI \{breed\.fciGroup\}\{breed\.fciSection/);
});
