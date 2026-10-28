import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("all public portal hubs render one concise hero introduction", () => {
  const portal = read("components/portal-hub.tsx");
  const editorial = read("components/editorial-section.tsx");
  const unified = read("components/public-visual-system/unified-section-hero.tsx");
  // A duplicate description+intro produces two visually redundant paragraphs,
  // especially on the mobile homepage-style hero.
  assert.match(portal, /intro=\{section\.description\}/);
  assert.doesNotMatch(portal, /<p>\{section\.description\}<\/p>[\s\S]*?<p>\{section\.intro\}<\/p>/);
  assert.match(editorial, /intro=\{section\.description\}/);
  // The centrally managed copy takes precedence; source metadata remains intact.
  assert.match(unified, /conciseHeroIntro\(visual\.heroContent\?\.intro \|\| intro\)/);
});

test("banner variants share one reusable public frame without merging their meanings", () => {
  const context = read("components/public-visual-system/public-context-banner.tsx");
  const magazine = read("components/public-visual-system/public-magazine-banner.tsx");
  const promo = read("components/article-promo.tsx");
  const help = read("components/public-visual-system/public-help-banner.tsx");
  const foundation = read("app/design-system.css");
  for (const source of [context, magazine, promo, help]) {
    assert.match(source, /ps-public-banner-frame/);
  }
  assert.match(foundation, /\.ps-public-banner-frame \{/);
  assert.match(help, /Rýchla pomoc pri nájdenom psovi/);
  assert.match(promo, /data-promo-variant=\{variantKey\}/);
});
