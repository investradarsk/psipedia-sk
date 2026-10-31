import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
test("compact category navigation has canonical desktop grid and no trailing override", () => {
  const css = read("components/public-visual-system/public-subcategory-navigator.module.css");
  const first = css.slice(css.indexOf(".compactTrack {"), css.indexOf("}", css.indexOf(".compactTrack {")));
  assert.match(first, /display: grid;/);
  assert.match(first, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(first, /overflow: visible;/);
  assert.doesNotMatch(first, /overflow-x: auto/);
  assert.doesNotMatch(css, /PUBLIC NAV: no hidden horizontal rails/);
  assert.match(css, /@media \(max-width: 900px\) \{ \.compactTrack/);
  assert.match(css, /@media \(max-width: 620px\) \{ \.compactTrack/);
  assert.match(css, /@media \(max-width: 380px\) \{ \.compactTrack/);
  assert.match(css, /\.compactGridMobile \.compactTrack \{/);
});
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
