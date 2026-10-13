import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("news desk contains only image-backed articles explicitly marked as news", async () => {
  const [selection, articleStore] = await Promise.all([
    source("lib/homepage-content.ts"),
    source("app/page.tsx"),
  ]);
  assert.match(selection, /articles\.filter\(\(article\) => Boolean\(article\.image\?\.trim\(\)\)\)/);
  assert.match(selection, /\.filter\(\(article\) => articlePortalSection\(article\) === "novinky"\)/);
  assert.match(selection, /articlePortalSection\(article\) === section/);
  assert.match(articleStore, /selectHomepageArticles\(publishedArticles, \{ latestLimit: 5, sectionLimit: 5/);
  assert.doesNotMatch(articleStore, /getHomepageArticles\(|getPublishedArticles\(/);
});

test("editorial cards are one lead and a vertical secondary list, with a real news empty state", async () => {
  const [editorial, css] = await Promise.all([
    source("components/home-editorial.tsx"),
    source("app/home-v2.module.css"),
  ]);
  assert.match(editorial, /const \[lead, \.\.\.secondary\] = articles/);
  assert.match(editorial, /variant="featured" headingLevel=\{3\} omitMissingImage/);
  assert.match(editorial, /variant="compact" listItem=\{false\}/);
  assert.match(editorial, /data-home-latest-empty/);
  assert.match(css, /\.home-magazine-main \.home-latest-list\)\s*\{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\);/s);
  assert.match(css, /\.home-magazine-grid\)\s*\{\s*display: grid;\s*grid-template-columns: minmax\(0, 2\.45fr\) minmax\(260px, 1fr\);/s);
});

test("homepage reuses bounded parallel published reads, never invented sidebar items", async () => {
  const home = await source("app/page.tsx");
  assert.match(home, /Promise\.all\(\[/);
  assert.match(home, /getPublishedArticleSummaries\(\{ limit: 120 \}\)/);
  assert.match(home, /getHomepageUpcomingEventsWithImages\(3\)/);
  assert.match(home, /getHomepageHighlightedHelpCasesWithImages\(3\)/);
  assert.match(home, /getHomepageDirectoryProfilesWithImages\("veterinari", 3\)/);
  assert.match(home, /listFeaturedBreeds\(6\)/);
  assert.match(home, /nextEvents\.map\(\(event\)/);
  assert.match(home, /veterinarians\.map\(\(profile\)/);
  assert.match(home, /activeHelpCases\.map\(\(item\)/);
  assert.match(home, /\.filter\(\(breed\) => Boolean\(breed\.image\?\.trim\(\)\)\)/);
});

test("banners point to protected existing partner paths, hero stays high priority and mobile full bleed", async () => {
  const [home, css, profiles, events] = await Promise.all([
    source("app/page.tsx"),
    source("app/home-v2.module.css"),
    source("app/partner/profily/novy/page.tsx"),
    source("app/partner/podujatia/nove/page.tsx"),
  ]);
  assert.match(home, /href="\/partner\/profily\/novy"/);
  assert.match(home, /href="\/partner\/podujatia\/nove"/);
  assert.match(profiles, /requirePartnerPageIdentity\(\)/);
  assert.match(events, /requirePartnerPageIdentity\(\)/);
  assert.match(home, /fetchPriority="high"/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hero-section\.shell\)[\s\S]*width: 100vw;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hero-card\)[\s\S]*border-radius: 0;/);
});
