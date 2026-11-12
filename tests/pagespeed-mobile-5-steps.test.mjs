import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("homepage reserves visible layout while editorial sections stream", () => {
  const page = read("app/page.tsx");
  const css = read("app/home-v2.module.css");
  assert.match(page, /<Suspense\s+fallback=\{/);
  assert.match(page, /data-home-stream-fallback/);
  assert.match(page, /<HomeBelowHero contentPromise=\{contentPromise\}/);
  assert.doesNotMatch(page, /<Suspense fallback=\{null\}>/);
  assert.match(css, /\.homeStreamFallback\s*\{[\s\S]*?min-height: max\(150vh, 1040px\)/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.homeStreamFallback\s*\{[\s\S]*?min-height: max\(185vh, 1600px\)/);
  // Avoid replacing the streamed content with a fixed-height box.
  assert.doesNotMatch(css, /\.homeStreamFallback\s*\{[^}]*height:/);
});

test("homepage still overlaps hero and below-fold data reads", () => {
  const page = read("app/page.tsx");
  const layout = read("app/layout.tsx");
  assert.match(page, /const heroPromise = getSectionHeroVisual\("home\.hero"\)/);
  assert.match(page, /const contentPromise = loadHomepageContent\(\)/);
  assert.match(page, /const homeHero = await heroPromise/);
  assert.match(page, /<UnifiedSectionHero/);
  assert.match(layout, /\{children\}\s*<SiteFooter \/>/);
});

test("large breed-specific CSS is route scoped, preserving public global guards", () => {
  const global = read("app/globals.css");
  const breed = read("app/plemena/breed-reference.css");
  const nested = read("app/plemena/layout.tsx");
  assert.match(nested, /import "\.\/breed-reference\.css"/);
  assert.match(breed, /\/\* Breed encyclopedia UI \*\//);
  assert.match(breed, /\/\* Editorial breed profile/);
  assert.match(breed, /\.breed-search-wrap/);
  assert.match(breed, /\.breed-detail-hero/);
  assert.doesNotMatch(global, /\/\* Breed encyclopedia UI \*\//);
  assert.doesNotMatch(global, /\/\* Editorial breed profile/);
  assert.match(global, /\/\* PUBLIC-POLISH-2 photo contract/);
  assert.match(global, /@media \(max-width: 760px\) \{\s*html,\s*body \{\s*max-width: 100%/);
  assert.match(global, /#fci-standard,\s*#suvisiaci-obsah \{\s*scroll-margin-top: 92px/);
  assert.ok(global.length < 240_000);
  assert.ok(breed.length > 65_000);
});
