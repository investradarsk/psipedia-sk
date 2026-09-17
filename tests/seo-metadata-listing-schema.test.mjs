import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCollectionPageJsonLd } from "../lib/listing-seo.ts";
import { buildPageMetadata, SITE_URL } from "../lib/seo.ts";

function graphEntity(schema, type) {
  const entity = schema["@graph"].find((item) => item["@type"] === type);
  assert.ok(entity, `${type} entity must exist`);
  return entity;
}

test("SEO-3 listing metadata keeps title, description, canonical, social and indexability aligned", () => {
  const metadata = buildPageMetadata({
    title: "Podujatia",
    description: "Kalendár verejných podujatí.",
    path: "/podujatia",
  });
  const canonical = `${SITE_URL}/podujatia`;
  assert.equal(metadata.title, "Podujatia");
  assert.equal(metadata.description, "Kalendár verejných podujatí.");
  assert.equal(metadata.alternates?.canonical, canonical);
  assert.equal(metadata.openGraph?.url, canonical);
  assert.equal(metadata.openGraph?.title, "Podujatia | Psipedia.sk");
  assert.equal(metadata.openGraph?.description, "Kalendár verejných podujatí.");
  assert.equal(metadata.twitter?.title, metadata.openGraph?.title);
  assert.equal(metadata.twitter?.description, metadata.openGraph?.description);
  assert.equal(metadata.robots?.index, true);
  assert.equal(metadata.robots?.follow, true);
});

test("SEO-3 CollectionPage graph is valid JSON with canonical ItemList URLs and one top-level entity per type", () => {
  const schema = buildCollectionPageJsonLd({
    name: "Testovací katalóg",
    description: "Iba verejné položky.",
    path: "/katalog",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Katalóg", path: "/katalog" },
    ],
    items: [
      { name: "Prvá verejná položka", path: "/katalog/prva" },
      { name: "Druhá verejná položka", path: "/katalog/druha" },
    ],
  });
  const serialized = JSON.stringify(schema);
  assert.deepEqual(JSON.parse(serialized), schema);
  const collection = graphEntity(schema, "CollectionPage");
  const itemList = graphEntity(schema, "ItemList");
  const breadcrumbs = graphEntity(schema, "BreadcrumbList");
  assert.equal(collection.url, `${SITE_URL}/katalog`);
  assert.equal(itemList.numberOfItems, 2);
  assert.deepEqual(itemList.itemListElement.map((item) => item.item), [
    `${SITE_URL}/katalog/prva`,
    `${SITE_URL}/katalog/druha`,
  ]);
  assert.deepEqual(breadcrumbs.itemListElement.map((item) => item.item), [
    `${SITE_URL}/`,
    `${SITE_URL}/katalog`,
  ]);
  assert.equal(schema["@graph"].filter((item) => item["@type"] === "CollectionPage").length, 1);
  assert.equal(schema["@graph"].filter((item) => item["@type"] === "ItemList").length, 1);
  assert.equal(schema["@graph"].filter((item) => item["@type"] === "BreadcrumbList").length, 1);
  assert.doesNotMatch(serialized, /aggregateRating|ratingValue|author|image/);
});

test("SEO-3 public listing routes source schema items only from public/published reads", () => {
  const articlePage = fs.readFileSync(new URL("../app/clanky/page.tsx", import.meta.url), "utf8");
  const breedPage = fs.readFileSync(new URL("../app/plemena/page.tsx", import.meta.url), "utf8");
  const sectionPage = fs.readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
  const directoryPage = fs.readFileSync(new URL("../app/adresar/[category]/page.tsx", import.meta.url), "utf8");
  const adoptionPage = fs.readFileSync(new URL("../app/pomoc-psom/adopcia/page.tsx", import.meta.url), "utf8");

  assert.match(articlePage, /getPublishedArticleSummaries/);
  assert.match(breedPage, /listPublishedCanonicalBreedIndex/);
  assert.match(sectionPage, /getPublishedEvents/);
  assert.match(directoryPage, /listPublishedDirectoryProfiles/);
  assert.match(adoptionPage, /getPublicAdoptions/);
  for (const source of [articlePage, breedPage, sectionPage, directoryPage, adoptionPage]) {
    assert.match(source, /buildCollectionPageJsonLd/);
    assert.doesNotMatch(source, /listManaged|status:\s*["']draft["']/i);
  }
});

test("SEO-3 section listing metadata delegates to shared social metadata contract", () => {
  const sectionPage = fs.readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
  assert.match(sectionPage, /buildPageMetadata\(\{/);
  assert.doesNotMatch(sectionPage, /openGraph:\s*\{/);
  assert.doesNotMatch(sectionPage, /twitter:\s*\{/);
});
