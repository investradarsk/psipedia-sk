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
