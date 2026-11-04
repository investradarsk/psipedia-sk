import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const visualStore = readFileSync(new URL("../lib/visual-library-edit-store.ts", import.meta.url), "utf8");
const overview = readFileSync(new URL("../components/help-overview.tsx", import.meta.url), "utf8");
const helpStore = readFileSync(new URL("../lib/help-landing-store.ts", import.meta.url), "utf8");
const helpPage = readFileSync(new URL("../app/pomoc-psom/page.tsx", import.meta.url), "utf8");
const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("help landing remains public-only with bounded D1 content reads", () => {
  assert.match(helpPage, /getHelpLandingSnapshot\(\)/);
  assert.match(helpStore, /getHelpLandingSnapshot/);
  assert.match(helpStore, /Promise\.all\(\[/);
  assert.match(helpStore, /WHERE h\.status = 'published'/);
  assert.match(helpStore, /WHERE d\.status IN \('ACTIVE','RESERVED'\)/);
  assert.match(helpStore, /WHERE r\.type IN \('LOST','FOUND'\) AND r\.status = 'ACTIVE'/);
});

test("five independent public banner lookups become one parameterized D1 read", () => {
  const body = visualStore.slice(visualStore.indexOf("export async function getPublishedDesktopBannerColorsBatch("));
  assert.match(body, /new Set\(ids\)/);
  assert.match(body, /ALLOWED_PUBLICATIONS\[id\]/);
  assert.match(body, /banner_id IN \(\$\{placeholders\}\)/);
  assert.match(body, /WHERE banner_id IN/);
  assert.match(body, /published_json IS NOT NULL/);
  assert.match(body, /SELECT banner_id,variant_index,published_json/);
  assert.doesNotMatch(body, /SELECT banner_id,variant_index,draft_json/);
  assert.match(body, /\.bind\(\.\.\.allowed\)\.all<Pick<EditRow/);
  assert.match(body, /defaultBannerDraft\(banner, target\.variant\)/);
  assert.match(body, /validatePublication\(row\.banner_id, target\.variant, published, target\.url\)/);
  assert.match(body, /result\[row\.banner_id\] = published/);
  assert.match(overview, /getPublishedDesktopBannerColorsBatch\(helpBannerIds\)/);
  assert.doesNotMatch(overview, /getPublishedDesktopBannerColors\(id\)/);
});

test("hero and banners launch concurrently without changing displayed banner anchors", () => {
  assert.match(overview, /await Promise\.all\(\[\s*getSectionHeroVisual\("section\.pomoc-psom"\),\s*getPublishedDesktopBannerColorsBatch\(helpBannerIds\)/);
  for (const id of ["help:lost-found", "help:overview:0", "help:overview:2", "help:overview:4", "help:closing"]) {
    assert.ok(overview.includes(`"${id}"`), id);
    assert.ok(visualStore.includes(`"${id}"`), id);
  }
});

test("homepage uses one lightweight public banner read and preserves both slots", () => {
  assert.match(homepage, /getPublishedDesktopBannerColorsBatch\(\["homepage:profil", "help:lost-found"\]\)/);
  assert.doesNotMatch(homepage, /getPublishedDesktopBannerColors\("homepage:profil"\)/);
  assert.doesNotMatch(homepage, /getPublishedDesktopBannerColors\("help:lost-found"\)/);
  assert.match(homepage, /const homeProfileBannerColors = publishedBannerColors\["homepage:profil"\]/);
  assert.match(homepage, /const lostFoundBannerColors = publishedBannerColors\["help:lost-found"\]/);
  const single = visualStore.slice(visualStore.indexOf("export async function getPublishedDesktopBannerColors(id:"));
  assert.match(single, /getPublishedDesktopBannerColorsBatch\(\[id\]\)/);
});
