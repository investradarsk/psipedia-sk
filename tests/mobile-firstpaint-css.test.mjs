import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("mobile homepage no longer carries the 25 KiB legacy directory section", () => {
  const globals = read("app/globals.css");
  const directory = read("public/styles/directory-146dc4e44713.css");
  const route = read("app/adresar/layout.tsx");
  const root = read("app/layout.tsx");
  assert.ok(globals.length < 200_000, "Shared CSS should be below the pre-PR 215 KiB source");
  assert.doesNotMatch(globals, /\/\* Directory \*\//);
  assert.doesNotMatch(globals, /\.directory-hero-grid\s*\{/);
  assert.doesNotMatch(globals, /\.directory-club-selects\s*\{/);
  assert.match(directory, /\/\* Directory \*\//);
  assert.match(directory, /\.directory-hero-grid\s*\{/);
  assert.match(directory, /\.directory-club-selects\s*\{/);
  assert.match(directory, /@media \(max-width: 620px\)/);
  assert.ok(directory.length > 25_000);
  assert.match(route, /href="\/styles\/directory-146dc4e44713\.css"/);
  assert.match(route, /precedence="high"/);
  assert.doesNotMatch(root, /directory-146dc4e44713\.css/);
});

test("admin inquiry styles are not removed with the public directory section", () => {
  const globals = read("app/globals.css");
  assert.match(globals, /\.admin-directory-flags\s*\{/);
  assert.match(globals, /\.admin-inquiry-body\s*\{/);
  assert.match(globals, /\.admin-inquiry-body aside/);
  assert.match(globals, /@media \(max-width: 820px\) \{\s*\.admin-inquiry-body \{\s*grid-template-columns: 1fr/);
});

test("homepage still provides priority image hints while transform cache remains opt-in", () => {
  const home = read("app/page.tsx");
  const worker = read("worker/index.ts");
  assert.match(home, /imageSrcSet=\{publicHeroImageSrcSet\(homeHero\.imageUrl\)\}/);
  assert.match(home, /fetchPriority="high"/);
  assert.match(worker, /publicHeroTransformEdgeCacheKey\(appRequest, env\.CF_VERSION_METADATA\?\.id\)/);
  assert.match(worker, /if \(heroCache && heroCacheKey && isCacheablePublicHeroTransformResponse\(optimized\)\)/);
});
