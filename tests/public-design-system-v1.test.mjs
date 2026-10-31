import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public design V1: homepage uses managed section hero and its image crop", () => {
  const home = read("app/page.tsx");
  assert.match(home, /getSectionHeroVisual\\("home\\.hero"\\)/);
  assert.match(home, /<UnifiedSectionHero/);
  assert.match(home, /portalSearchSlot=\\{<HomePortalSearch \\/>\\}/);
  assert.doesNotMatch(home, /className="hero-card"/);
});

test("public design V1: existing mobile home geometry is scoped to home.hero", () => {
  const css = read("components/public-visual-system/unified-section-hero.module.css");
  assert.match(css, /data-section-visual-key="home\\.hero"/);
  assert.match(css, /min-height: 318px/);
  assert.match(css, /justify-content: flex-end/);
  assert.match(css, /width: calc\\(100% - 24px\\)/);
});

test("public design V1: canonical search retains route-scoped GET parameters", () => {
  const search = read("components/home-portal-search.tsx");
  assert.match(search, /<form action=\\{action\\} method="get"/);
  assert.match(search, /hidden\\.map/);
  assert.match(search, /searchScope/);
});
