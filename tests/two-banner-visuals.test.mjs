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

test("inline article banner shares the exact text-column width", () => {
  const css = read("components/article-detail.module.css");
  assert.match(css, /\.readingShell :global\(\.article-blocks > \[data-home-banner\^="article-"\]\) \{\s*width: 100%;\s*max-width: 100%;\s*margin-inline: 0;/);
  assert.match(read("components/public-visual-system/public-magazine-banner.tsx"), /compact \? "home-magazine-banner" : "shell home-magazine-banner"/,
    "homepage banners retain the shared shell");
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


test("approved editorial art reuses the soft framed brand palette and article rail scrolls naturally", () => {
  const css = read("app/banner-visuals.css");
  const sharedStart = css.indexOf(".ps-public-banner-frame[data-banner-visual][data-banner-size] {");
  const shared = css.slice(sharedStart, css.indexOf("}", sharedStart));
  // Admin preview retains its legacy fallback; public V9 overrides it.
  assert.match(shared, /border-radius:\s*0\s*!important/);
  const premium = css.slice(css.indexOf("/* V2-04"));
  assert.match(premium, /border-left-width:\s*var\(--ps-premium-accent-width\)\s*!important/);
  assert.match(premium, /border-left-color:\s*var\(--ps-premium-accent\)\s*!important/);
  assert.match(premium, /border-radius:\s*var\(--ps-bnr-radius\)\s*!important/);
  assert.match(premium, /--ps-bnr-gradient:\s*var\(--ps-premium-gradient\)/);
  assert.match(premium, /--ps-bnr-radius:\s*var\(--ps-radius-banner-small\)/);
  assert.match(premium, /--ps-bnr-radius:\s*var\(--ps-radius-banner-large\)/);
  assert.match(css, /psipedia-banner-dog-outline\.svg/);
  assert.match(css, /data-banner-semantic="urgent"/);
  const detailCss = read("components/article-detail.module.css");
  assert.match(detailCss, /\.sidebarSticky\s*\{[^}]*position:\s*static/);
  assert.doesNotMatch(detailCss, /\.sidebarSticky\s*\{[^}]*position:\s*sticky/);
  const detail = read("components/article-detail.tsx");
  assert.match(detail, /<ArticleReadTracker articleSlug=\{article.slug\}/);
  assert.doesNotMatch(detail, /<ArticleReadingProgress\s*\/>/);
  assert.match(read("app/home-v2.module.css"), /\.homeV2 :global\(\.home-services-wide\)\s*\{[^}]*border-radius:\s*0/);
});


test("all editorial hub callouts use the same S/M/L banner frame", () => {
  const section = read("components/editorial-section.tsx");
  const css = read("app/banner-visuals.css");
  const art = read("public/images/psipedia-banner-dog-outline.svg");
  assert.match(section, /<PublicBannerFrame[\s\S]*?as="section"/);
  assert.match(section, /size=\{subpage \? "medium" : "large"\}/);
  assert.match(section, /data-banner-semantic=\{config\.urgent \? "urgent" : undefined\}/);
  assert.match(section, /<PublicBannerContent[\s\S]*?actions=\{config\.actions\.map/);
  assert.match(css, /\[data-banner-size="small"\] \[data-ps-banner-art\]::after/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(art, /viewBox="0 0 772 545"/);
  assert.match(art, /fill-rule="evenodd"/);
});

test("banner artwork stays inside a real responsive child and outside CTA lanes", () => {
  const css = read("app/banner-visuals.css");
  const frame = read("components/public-visual-system/public-banner-frame.tsx");
  const light = read("public/images/psipedia-banner-waves-light.svg");
  const dark = read("public/images/psipedia-banner-waves-dark.svg");
  const dog = read("public/images/psipedia-banner-dog-outline.svg");

  assert.match(light, /viewBox="0 0 2172 724"/);
  assert.match(light, /stroke="#b44939"/, "terracotta arc remains in the wide design");
  assert.match(dark, /viewBox="0 0 2172 724"/);
  assert.match(dog, /viewBox="0 0 772 545"/);
  assert.match(frame, /<i data-ps-banner-art aria-hidden="true" \/>/, "art must be a descendant of the container");
  assert.match(css, /@container ps-editorial-banner \(min-width: 821px\)/);
  assert.match(css, /@container ps-editorial-banner \(max-width: 820px\)/);
  assert.match(css, /width: 72% !important;/, "CTA region excludes the illustrated right lane");
  assert.match(css, /\[data-banner-size="small"\] \[data-ps-banner-art\]::after\s*\{\s*display: none;/);
  assert.match(css, /\[data-banner-semantic="urgent"\] \[data-ps-banner-art\]\s*\{\s*display: none !important;/);
  assert.match(css, /psipedia-banner-waves-light\.svg/);
  assert.match(css, /psipedia-banner-waves-dark\.svg/);
  assert.match(css, /psipedia-banner-dog-outline\.svg/);
  assert.doesNotMatch(css, /padding-right: clamp\(85px, 20%, 180px\)/, "old padding-only fix removed");
  assert.doesNotMatch(css, /right: -19%;/, "no dog shifted outside the narrow sidebar");
});

test("original partner creatives are not restyled or rebuilt", () => {
  const ads = read("components/affiliate-rotating-banner.tsx");
  assert.doesNotMatch(ads, /PublicBannerFrame|data-banner-visual/);
  assert.match(ads, /original\.src/);
  assert.match(ads, /Reklama · affiliate/);
});

test("both themes and every banner size place CTA beneath copy, not in a right column", () => {
  const css = read("app/banner-visuals.css");
  assert.doesNotMatch(css, /fit-content\(36%\)/);
  assert.doesNotMatch(css, /justify-self:\s*end;/);
  const canonical = css.slice(css.indexOf("/* Canonical CTA position:"));
  assert.match(canonical, /\[data-public-banner-content\]\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) !important;/);
  assert.match(canonical, /\[data-public-banner-content\] > a\s*\{[^}]*justify-self:\s*start !important;/);
  assert.doesNotMatch(canonical, /calloutLayout|calloutActions/);
  assert.match(canonical, /justify-content:\s*flex-start !important;/);
  assert.match(read("components/content-hub-cta.tsx"), /data-public-banner-actions/);
  assert.match(read("components/public-visual-system/public-magazine-banner.tsx"), /data-public-banner-actions/);
});


test("internal editorial promotion adapters share the canonical copy and action structure", () => {
  const magazine = read("components/public-visual-system/public-magazine-banner.tsx");
  assert.match(magazine, /data-public-banner-content/);
  assert.match(magazine, /data-public-banner-copy/);
  assert.match(magazine, /data-public-banner-description/);
  assert.match(magazine, /data-public-banner-actions/);
  assert.match(magazine, /as=\{headingAs\}/);
  for (const file of [
    "components/public-visual-system/public-context-banner.tsx",
    "components/editorial-section.tsx",
    "components/content-hub-cta.tsx",
  ]) assert.match(read(file), /<PublicBannerContent/);
  const hub = read("components/content-hub-cta.tsx");
  assert.match(hub, /headingAs="h3"/);
  assert.match(hub, /\{urgent \? \(/);
  assert.match(hub, /data-banner-semantic=\{cta.key === "health-urgent" \? "urgent" : undefined\}/);
  assert.match(read("components/article-promo.tsx"), /<PublicMagazineBanner/);
  assert.match(read("components/public-visual-system/public-photo-callout.tsx"), /<PublicMagazineBanner/);
});
