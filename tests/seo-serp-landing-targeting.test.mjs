import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  directoryCategories,
  directoryCategoryListingMetadata,
  directoryCategoryHref,
  getDirectoryCategory,
} from "../lib/directory.ts";
import { helpCategories, helpCategoryHref } from "../lib/help.ts";
import { buildCollectionPageJsonLd, buildListingPageMetadata } from "../lib/listing-seo.ts";
import { SITE_URL } from "../lib/seo.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("SEO-SERP homepage has a brand-level title, distinct metadata and an explanatory SSR lead", () => {
  const source = read("app/page.tsx");
  assert.match(
    source,
    /title:\s*\{\s*absolute:\s*"Psipedia\s*\.sk\s*–\s*rozumej\s*svojmu\s*psovi"\s*\}/,
  );
  assert.match(source, /description:\s*homepageSearchDescription/);
  assert.match(source, /Psipedia\s*\.sk\s*je\s*slovenský\s*portál\s*o\s*psoch/);
  assert.match(source, /path:\s*"\/"/);
  // Homepage delegates the semantic H1 to the shared managed hero renderer.
  assert.match(source, /<UnifiedSectionHero[\s\S]*?title=\{\s*<>\s*Všetko\s*dôležité/);
  assert.match(
    read("components/public-visual-system/unified-section-hero.tsx"),
    /<PublicHeading[^>]*as="h1"[^>]*data-section-hero-title>\s*\{managedTitle\}\s*<\/PublicHeading>/,
  );
  assert.match(source, /pre\s*život\s*so\s*psom\s*\./);
  assert.doesNotMatch(source, /data-nosnippet|noindex/i);
  // The root layout already emits one site identity graph.
  assert.match(
    read("app/layout.tsx"),
    /<StructuredData\s*value=\{\s*buildSiteIdentityJsonLd\(\s*\)\s*\}/,
  );
  assert.doesNotMatch(source, /buildSiteIdentityJsonLd|serializeJsonLd/);
});

test("SEO-SERP homepage links directly to contextual directory categories without duplicate service cards", () => {
  const source = read("app/page.tsx");
  assert.match(source, /title="Veterinári"/);
  assert.match(source, /href="\/adresar\/veterinari"/);
  assert.match(source, /title="Tréneri\s*a\s*psie\s*školy"/);
  assert.match(source, /href="\/adresar\/treneri"/);
  assert.match(source, /directoryProfileHref\(\s*profile\s*\)/);
  assert.match(source, /testId="starostlivost"/);
  assert.match(source, /testId="aktivity"/);
  assert.doesNotMatch(source, /HomeProfileCategoryBand|home-service-card-icon/);
});

test("SEO-SERP main directory categories have a unique indexable page title, meta description, and unchanged self-canonical", () => {
  const titles = new Set();
  for (const category of directoryCategories) {
    const path = directoryCategoryHref(category);
    assert.equal(path, "/adresar/" + category.slug);
    const copy = directoryCategoryListingMetadata(category, null);
    assert.ok(copy.title.length >= 12, path);
    assert.ok(copy.description.length >= 65, path);
    assert.equal(titles.has(copy.title), false, "duplicate SEO title " + copy.title);
    titles.add(copy.title);
    const metadata = buildListingPageMetadata({ ...copy, path, indexPagination: true });
    assert.equal(metadata.title, copy.title);
    assert.equal(metadata.description, copy.description);
    assert.equal(metadata.alternates?.canonical, SITE_URL + path);
    assert.equal(metadata.robots?.index, true);
    assert.equal(metadata.robots?.follow, true);
    assert.equal(metadata.openGraph?.url, SITE_URL + path);
  }
});

test("SEO-SERP query-to-landing routes are established directory categories, not the homepage", () => {
  const intents = {
    "psie salóny": "salony-a-sluzby",
    veterinári: "veterinari",
    "tréneri psov": "treneri",
    "psie školy": "treneri",
    "kynologické kluby": "kynologicke-kluby",
    "chovateľské kluby": "chovatelske-kluby",
    "chovateľské stanice": "chovatelske-stanice",
    "hotely pre psov": "hotely-a-opatrovanie",
    "opatrovanie psov": "hotely-a-opatrovanie",
    "venčenie psov": "vencenie",
    "fyzioterapia psov": "fyzioterapia",
    "ďalšie služby pre psov": "dalsie-sluzby",
  };
  for (const [intent, slug] of Object.entries(intents)) {
    const category = getDirectoryCategory(slug);
    assert.ok(category, intent);
    assert.notEqual(directoryCategoryHref(category), "/");
  }
});

test("SEO-SERP help category mapping uses real existing URLs", () => {
  for (const category of helpCategories) {
    const href = helpCategoryHref(category);
    assert.equal(href, "/pomoc-psom/" + category.slug);
  }
  assert.match(read("app/pomoc-psom/page.tsx"), /categoryDestination\(\s*category\s*\.slug\s*\)/);
  assert.match(
    read("app/pomoc-psom/stratene-a-najdene/page.tsx"),
    /path:\s*"\/pomoc-psom\/stratene-a-najdene"/,
  );
  assert.match(read("app/pomoc-psom/adopcia/page.tsx"), /path:\s*"\/pomoc-psom\/adopcia"/);
});

test("SEO-SERP SSR listing H1 remains route-specific even if managed hero text changes", () => {
  const source = read("components/directory-page.tsx");
  assert.match(source, /const\s*seoHeroVisual\s*=\s*active/);
  assert.match(source, /title:\s*active\s*\.heroTitle,\s*intro:\s*active\s*\.intro/);
  assert.match(source, /visual=\{\s*seoHeroVisual\s*\}/);
  assert.match(source, /<UnifiedSectionHero/);
  const overview = read("components/directory-category-overview.tsx");
  assert.match(
    overview,
    /<Link\s*href=\{\s*directoryCategoryHref\(\s*category\s*\)\s*\}>\{\s*category\s*\.heroTitle\s*\}<\/Link>/,
  );
  const route = read("app/adresar/[category]/page.tsx");
  assert.match(route, /directoryCategoryListingMetadata\(\s*category,\s*policy\s*\.page\s*\)/);
  assert.match(route, /<StructuredData\s*value=\{\s*schema\s*\}/);
});

test("SEO-SERP breadcrumbs/CollectionPage schema point at the canonical category and preserve existing query policy", () => {
  const category = getDirectoryCategory("salony-a-sluzby");
  const path = directoryCategoryHref(category);
  const schema = buildCollectionPageJsonLd({
    name: category.heroTitle,
    description: category.intro,
    path,
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Služby pre psov", path: "/adresar" },
      { name: category.label, path },
    ],
    items: [],
  });
  const breadcrumbs = schema["@graph"].find((value) => value["@type"] === "BreadcrumbList");
  assert.deepEqual(
    breadcrumbs.itemListElement.map((item) => item.item),
    [SITE_URL + "/", SITE_URL + "/adresar", SITE_URL + path],
  );
  const filtered = buildListingPageMetadata({
    ...directoryCategoryListingMetadata(category, null),
    path,
    searchParams: { q: "Nitra" },
    indexPagination: true,
  });
  assert.equal(filtered.robots?.index, false);
  assert.equal(filtered.robots?.follow, true);
  assert.equal(filtered.alternates?.canonical, SITE_URL + path);
  const nextPage = buildListingPageMetadata({
    ...directoryCategoryListingMetadata(category, 2),
    path,
    searchParams: { page: "2" },
    indexPagination: true,
  });
  assert.equal(nextPage.robots?.index, true);
  assert.equal(nextPage.alternates?.canonical, SITE_URL + path + "?page=2");
});

test("SEO-SERP guard: no routing, sitewide robots, sitemap or profile layout edits", () => {
  const categoryRoute = read("app/adresar/[category]/page.tsx");
  assert.match(categoryRoute, /listPublishedDirectoryProfiles/);
  assert.match(categoryRoute, /resolveListingIndexPolicy/);
  assert.match(categoryRoute, /breadcrumbs:/);
  assert.doesNotMatch(read("app/page.tsx"), /data-nosnippet/);
});
