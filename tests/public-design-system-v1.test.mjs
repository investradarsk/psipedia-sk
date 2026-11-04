import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public design V1: homepage uses managed section hero and its image crop", () => {
  const home = read("app/page.tsx");
  assert.match(home, /getSectionHeroVisual\("home\.hero"\)/);
  assert.match(home, /<UnifiedSectionHero/);
  assert.match(home, /portalSearchSlot=\{<HomePortalSearch \/>\}/);
  assert.doesNotMatch(home, /className="hero-card"/);
});

test("public design: desktop and mobile hero geometry is shared by every route", () => {
  const css = read("components/public-visual-system/unified-section-hero.module.css");
  assert.match(css, /\.hero\[data-unified-section-hero\] \.visual/);
  assert.match(css, /\.hero\[data-unified-section-hero\] \.copy/);
  assert.match(css, /min-height:\s*330px/);
  assert.match(css, /min-height:\s*318px/);
  assert.match(css, /justify-content:\s*flex-end/);
  assert.match(css, /width:\s*calc\(100% - 24px\)/);
  assert.doesNotMatch(css, /\.hero:not\(\[data-section-visual-key="home\.hero"\]\)/);
});

test("public detail and article surfaces reuse the homepage renderer instead of cloning it", () => {
  const universal = read("components/public-visual-system/universal-page-hero.tsx");
  const detail = read("components/detail-primitives/detail-primitives.tsx");
  const article = read("components/article-detail.tsx");
  assert.match(universal, /<UnifiedSectionHero/);
  assert.match(universal, /<UnifiedSectionHeroShell/);
  assert.match(universal, /<HomePortalSearch/);
  assert.match(detail, /<UniversalPageHero/);
  assert.match(article, /<UniversalPageHero/);
  assert.match(article, /title=\{article\.title\}/);
  assert.match(article, /imageUrl=\{article\.image\}/);
});

test("public design V1: canonical search retains route-scoped GET parameters", () => {
  const search = read("components/home-portal-search.tsx");
  assert.match(search, /<form action=\{action\} method="get"/);
  assert.match(search, /hidden\.map/);
  assert.match(search, /searchScope/);
});
