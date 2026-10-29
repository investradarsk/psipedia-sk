import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Help categories reuse the public subcategory navigator, not custom chips", () => {
  const help = read("components/public-visual-system/public-help-category-nav.tsx");
  assert.match(help, /<PublicSubcategoryNavigator/);
  assert.match(help, /mode="compact"/);
  assert.match(help, /data-public-category-navigation/);
  assert.doesNotMatch(help, /<Link\b/);
});

test("Help photo promos reuse the exact homepage magazine banner markup", () => {
  const callout = read("components/public-visual-system/public-photo-callout.tsx");
  const magazine = read("components/public-visual-system/public-magazine-banner.tsx");
  const styles = read("components/public-visual-system/public-magazine-banner.module.css");
  assert.match(callout, /<PublicMagazineBanner/);
  assert.match(magazine, /data-public-photo-callout/);
  assert.match(magazine, /photoTone/);
  assert.match(styles, /object-fit: contain/);
  assert.match(styles, /filter: blur\(18px\)/);
  assert.match(styles, /@media \(max-width: 620px\)/);
});

test("Help overview falls back to shared automatic thumbnail fit", () => {
  const overview = read("components/help-overview.tsx");
  const image = read("components/image-display.tsx");
  assert.match(overview, /config=\{item\.thumbnailImageDisplay\}/);
  assert.doesNotMatch(overview, /thumbnailImageDisplay \?\? \{ mode: "crop"/);
  assert.match(image, /automaticThumbnailFit/);
  assert.match(image, /styles\.blurBackground/);
});

test("Help categories use the existing navigator in a compact, accessible two-column mobile grid", () => {
  const nav = read("components/public-visual-system/public-subcategory-navigator.tsx");
  const css = read("components/public-visual-system/public-subcategory-navigator.module.css");
  const help = read("components/public-visual-system/public-help-category-nav.tsx");
  assert.match(help, /mobileLayout="grid"/);
  assert.match(help, /mode="compact"/);
  assert.match(nav, /mobileLayout\?: "wrap" \| "grid"/);
  assert.match(nav, /styles\.compactGridMobile/);
  assert.match(css, /\.compactGridMobile \.compactTrack\s*\{/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 52px/);
  assert.match(css, /@media \(max-width: 360px\)/);
});

test("Services show one mobile category control, not duplicated shortcuts in hero and category picker", () => {
  const directory = read("components/directory-page.tsx");
  const switcher = read("components/directory-category-navigation.tsx");
  const css = read("components/directory-public.module.css");
  assert.match(directory, /shortcuts=\{\[\]\}/);
  assert.match(directory, /<DirectoryCategoryNavigation items=\{categoryItems\}/);
  assert.match(switcher, /aria-label="Vyber kategóriu služby"/);
  assert.match(switcher, /router\.push\(event\.target\.value\)/);
  assert.match(css, /\.categoryDesktopTabs\s*\{\s*display: none;\s*\}/);
  assert.match(css, /\.categoryMobileSelect\s*\{[\s\S]*min-height: 46px/);
});
