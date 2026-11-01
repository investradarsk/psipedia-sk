import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
// Navigation CSS cleanup is deferred: the 320px event baseline changed.
// Keep the approved mobile implementation untouched until a separately
// scoped migration has exact before/after screenshot evidence.
test("homepage uses only shared desktop search panel geometry", () => {
  const home = read("app/home-v2.module.css");
  const hero = read("components/public-visual-system/unified-section-hero.module.css");
  const prefix = home.slice(0, home.indexOf(".homeV2 :global(.home-services-entry)"));
  assert.doesNotMatch(prefix, /\.homeV2 :global\(\.home-search-panel\)/);
  assert.doesNotMatch(prefix, /\.homeV2 :global\(\.home-search-form\)/);
  assert.match(hero, /\.portalSearch :global\(\.home-search-panel\)/);
  assert.match(hero, /\.portalSearch :global\(\.home-search-form\)/);
  assert.match(home, /@media \(max-width: 620px\)[\s\S]*\.homeV2 :global\(\.home-search-panel\)/);
});

test("compact category navigation has one final desktop layout without dead horizontal-rail overrides", () => {
  const css = read("components/public-visual-system/public-subcategory-navigator.module.css");
  const base = css.slice(css.indexOf(".compactTrack {"), css.indexOf("}", css.indexOf(".compactTrack {")));
  assert.doesNotMatch(base, /display:\s*flex|overflow-x:\s*auto|scroll-snap-type:\s*x proximity/);
  const final = css.slice(css.indexOf("/* PUBLIC NAV:"));
  assert.match(final, /\.compactTrack\s*\{\s*display:\s*grid;/);
  assert.match(final, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(final, /@media \(max-width:\s*620px\)\s*\{\s*\.compactTrack\s*\{\s*display:\s*grid;/);
  assert.match(final, /@media \(max-width:\s*380px\)/);
  assert.match(css, /\.compactGridMobile \.compactTrack \{/);
});
