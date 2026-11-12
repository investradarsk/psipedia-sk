import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { breedCategorySlug, breedProfileHref, breedFciStandardHref, isBreedSelfCanonicalSeo } from "../lib/breed-canonical.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("all ten FCI groups have stable category URLs including /durice/", () => {
  const content = read("lib/content.ts");
  for (let group = 1; group <= 10; group += 1) {
    const category = breedCategorySlug(group);
    assert.ok(category, "FCI group " + group + " must have URL category");
    assert.match(content, new RegExp("number: " + group + ', slug: "' + category + '"'));
  }
  assert.equal(breedProfileHref("bigl", 6), "/plemena/durice/bigl");
  assert.equal(breedProfileHref("labradorsky-retriever", 8), "/plemena/retrievery-sliedice-vodne/labradorsky-retriever");
  assert.equal(breedFciStandardHref("bigl", 6), "/plemena/durice/bigl/fci-standard");
  assert.equal(breedCategorySlug(11), null);
});

test("old and migrated saved canonical values remain eligible, noindex stays excluded", () => {
  const slug = "bigl", fciGroup = 6;
  assert.ok(isBreedSelfCanonicalSeo({ canonicalUrl: "/plemena/bigl" }, slug, fciGroup));
  assert.ok(isBreedSelfCanonicalSeo({ canonicalUrl: "https://psipedia.sk/plemena/durice/bigl" }, slug, fciGroup));
  assert.ok(isBreedSelfCanonicalSeo({}, slug, fciGroup));
  assert.equal(isBreedSelfCanonicalSeo({ noindex: true }, slug, fciGroup), false);
  assert.equal(isBreedSelfCanonicalSeo({ canonicalUrl: "/plemena/teriery/bigl" }, slug, fciGroup), false);
});

test("public route, Worker 301, sitemap, sharing and Notion URLs follow category path", () => {
  const detail = read("app/plemena/[slug]/page.tsx");
  const categoryRoute = read("app/plemena/[slug]/[breed]/page.tsx");
  const standard = read("app/plemena/[slug]/fci-standard/page.tsx");
  const worker = read("worker/index.ts");
  const sitemap = read("app/sitemap.ts");
  const notion = read("lib/notion-breed-sync.ts");
  assert.match(detail, /permanentRedirect\(breedProfileHref/);
  assert.match(categoryRoute, /breedMetadata\(/);
  assert.match(standard, /breedFciStandardHref/);
  assert.match(worker, /cachedCanonicalBreedRedirect/);
  assert.match(worker, /Response\.redirect\(url, 301\)/);
  assert.match(sitemap, /sitemapEntry\(breedProfileHref/);
  assert.match(notion, /breedProfileHref\(args\.breed\.slug, args\.breed\.fciGroup\)/);
  for (const path of [
    "components/breed-card.tsx",
    "components/breed-crawl-index.tsx",
    "components/home-editorial.tsx",
    "lib/portal-search.ts",
    "lib/visual-library-dynamic-urls.ts",
  ]) assert.match(read(path), /breedProfileHref/);
});
