import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { defaultBannerDraft, validateBannerDraft } from "../lib/visual-library-drafts.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const banner = {
  id: "clanky:veterinari",
  group: "clanky",
  eyebrow: "Služby",
  title: "Hľadáte veterinára?",
  description: "Prehľad veterinárov",
  ctaLabel: "Nájsť veterinára",
  photoTone: undefined,
  variants: [],
};

test("two canonical banner visuals and three sizes are exposed at the shared frame", () => {
  const frame = read("components/public-visual-system/public-banner-frame.tsx");
  const styles = read("app/banner-visuals.css");
  assert.match(frame, /type PublicBannerVisual = "light" \| "dark"/);
  assert.match(frame, /type PublicBannerSize = "small" \| "medium" \| "large"/);
  assert.match(frame, /data-banner-visual=\{visual\}/);
  assert.match(frame, /data-banner-size=\{size\}/);
  for (const visual of ["light", "dark"]) {
    assert.ok(styles.includes('data-banner-visual="' + visual + '"'));
  }
  for (const size of ["small", "medium", "large"]) {
    assert.ok(styles.includes('data-banner-size="' + size + '"'));
  }
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(read("app/layout.tsx"), /import "\.\/banner-visuals\.css"/);
});

test("old draft rows receive safe defaults and size/visual values are allowlisted", () => {
  const initial = defaultBannerDraft(banner, 0);
  assert.equal(initial.visual, "light");
  assert.equal(initial.size, "small");
  const originalRow = { ...initial, visual: undefined, size: undefined };
  const backCompat = validateBannerDraft(originalRow, initial);
  assert.equal(backCompat.visual, "light");
  assert.equal(backCompat.size, "small");
  const adjusted = validateBannerDraft({ ...initial, visual: "dark", size: "large" }, initial);
  assert.equal(adjusted.visual, "dark");
  assert.equal(adjusted.size, "large");
  const invalid = validateBannerDraft({ ...initial, visual: "url(js)", size: "huge" }, initial);
  assert.equal(invalid.visual, "light");
  assert.equal(invalid.size, "small");
  const photoBanner = { ...banner, id: "help:closing", group: "stranky", photoTone: "closing" };
  assert.equal(defaultBannerDraft(photoBanner, 0).visual, "dark");
  assert.equal(defaultBannerDraft(photoBanner, 0).size, "large");
});

test("article, contextual, help and content CTA banners reuse the same frame", () => {
  for (const file of [
    "components/public-visual-system/public-magazine-banner.tsx",
    "components/public-visual-system/public-context-banner.tsx",
    "components/public-visual-system/public-help-banner.tsx",
    "components/public-visual-system/public-article-callout.tsx",
    "components/content-hub-cta.tsx",
  ]) {
    assert.match(read(file), /PublicBannerFrame/);
  }
  const magazine = read("components/public-visual-system/public-magazine-banner.tsx");
  assert.match(magazine, /visual=\{visual \?\? \(photoTone \? "dark" : "light"\)\}/);
  assert.match(magazine, /size=\{size \?\? \(compact \? "small" : "medium"\)\}/);
  assert.match(magazine, /data-banner-desktop-size=\{desktopColors\?\.size\}/);
  const editor = read("components/admin-visual-library-editor.tsx");
  assert.match(editor, /Vizuál banneru/);
  assert.match(editor, /Veľkosť banneru/);
  assert.match(editor, /visual=\{draft.visual\} size=\{draft.size\}/);
  assert.match(read("lib/visual-library-edit-store.ts"), /ALLOWED_PUBLICATIONS/);
});

test("shared banner sizing preserves centered site shell for all non-compact magazine banners", () => {
  const styles = read("app/banner-visuals.css");
  const start = styles.indexOf(".ps-public-banner-frame[data-banner-visual][data-banner-size] {");
  assert.ok(start >= 0, "shared banner rule exists");
  const rule = styles.slice(start, styles.indexOf("}", start));
  assert.doesNotMatch(rule, /(?:^|;)\s*width\s*:\s*100%/m,
    "a generic width: 100% overrides the narrower .shell rule at higher specificity");
  assert.ok(read("app/globals.css").includes("width: min(var(--ps-content-max)"),
    "canonical shell retains responsive centered gutters");
  assert.ok(read("components/public-visual-system/public-magazine-banner.tsx").includes(
    'compact ? "home-magazine-banner" : "shell home-magazine-banner"'
  ), "ordinary magazine banners opt into the shared shell");
  assert.ok(read("app/page.tsx").includes('<div className="home-desktop-interlude">'),
    "homepage lost/found banner is placed in the common shell layout");
});

test("banner CTA stacks in a narrow desktop sidebar based on its own width", () => {
  const styles = read("app/banner-visuals.css");
  const magazine = read("components/public-visual-system/public-magazine-banner.tsx");
  const article = read("components/article-detail.tsx");
  const promo = read("components/article-promo.tsx");

  assert.match(styles, /container:\s*ps-editorial-banner\s*\/\s*inline-size/);
  assert.match(styles, /@container ps-editorial-banner \(max-width: 520px\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/);
  assert.match(styles, /word-break:\s*normal/);
  assert.match(styles, /justify-self:\s*stretch/);
  assert.match(styles, /\.ps-public-banner-frame\[data-banner-size="small"\] \[data-public-banner-content\]/);

  assert.match(article, /<ArticlePromo[\s\S]*?\bcompact\s*\/>/);
  assert.match(promo, /compact=\{compact\}/);
  assert.match(magazine, /size=\{size \?\? \(compact \? "small" : "medium"\)\}/);
  assert.match(read("app/globals.css"), /\.shell\s*\{\s*width:\s*min\(var\(--ps-content-max\)/);
});


test("owner editorial accents use square quiet frames and article rail scrolls naturally", () => {
  const css = read("app/banner-visuals.css");
  const sharedStart = css.indexOf(".ps-public-banner-frame[data-banner-visual][data-banner-size] {");
  const shared = css.slice(sharedStart, css.indexOf("}", sharedStart));
  assert.match(shared, /border-left-width:\s*1px\s*!important/);
  assert.match(shared, /border-left-color:\s*var\(--ps-bnr-border\)\s*!important/);
  assert.match(shared, /border-radius:\s*0\s*!important/);
  assert.doesNotMatch(shared, /border-left:\s*3px solid #b44939/);
  const detailCss = read("components/article-detail.module.css");
  assert.match(detailCss, /\.sidebarSticky\s*\{[^}]*position:\s*static/);
  assert.doesNotMatch(detailCss, /\.sidebarSticky\s*\{[^}]*position:\s*sticky/);
  const detail = read("components/article-detail.tsx");
  assert.match(detail, /<ArticleReadTracker articleSlug=\{article.slug\}/);
  assert.doesNotMatch(detail, /<ArticleReadingProgress\s*\/>/);
  assert.match(read("app/home-v2.module.css"), /\.homeV2 :global\(\.home-services-wide\)\s*\{[^}]*border-radius:\s*0/);
});


test("original partner creatives are not restyled or rebuilt", () => {
  const ads = read("components/affiliate-rotating-banner.tsx");
  assert.doesNotMatch(ads, /PublicBannerFrame|data-banner-visual/);
  assert.match(ads, /original\.src/);
  assert.match(ads, /Reklama · affiliate/);
});
