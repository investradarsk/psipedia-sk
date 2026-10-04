import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { breedSeoFallback, buildContentMetadata, directorySeoFallback, eventSeoFallback, helpSeoFallback } from "../lib/content-seo.ts";
import { directoryCategories, directoryCategoryListingMetadata, getDirectoryCategory } from "../lib/directory.ts";
import { buildCollectionPageJsonLd, buildListingPageMetadata, coreLandingSeoFallback, resolveListingIndexPolicy } from "../lib/listing-seo.ts";
import { FALLBACK_PAGE_TITLE_MAX_LENGTH, PAGE_TITLE_BRAND_SUFFIX, SEARCH_DESCRIPTION_MAX_LENGTH, SEARCH_TITLE_MAX_LENGTH, buildPageMetadata, SITE_URL } from "../lib/seo.ts";

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

test("SEO-3 CollectionPage graph is valid JSON with canonical ItemList URLs and no duplicate detail entities", () => {
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
  for (const detailType of ["Article", "Event", "Organization"]) {
    assert.equal(schema["@graph"].filter((item) => item["@type"] === detailType).length, 0);
  }
  assert.doesNotMatch(serialized, /aggregateRating|ratingValue|author|image/);
});

test("SEO-3 public listing routes source schema items only from the confirmed public reads", () => {
  const articlePage = fs.readFileSync(new URL("../app/clanky/page.tsx", import.meta.url), "utf8");
  const breedPage = fs.readFileSync(new URL("../app/plemena/page.tsx", import.meta.url), "utf8");
  const sectionPage = fs.readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
  const directoryPage = fs.readFileSync(new URL("../app/adresar/[category]/page.tsx", import.meta.url), "utf8");
  const adoptionPage = fs.readFileSync(new URL("../app/pomoc-psom/adopcia/page.tsx", import.meta.url), "utf8");

  assert.match(articlePage, /getPublishedArticleSummaries\(\{ limit: 200 \}\)/);
  assert.match(articlePage, /items: articles\.map\(/);
  assert.match(breedPage, /listPublishedCanonicalBreedIndex\(\)/);
  assert.match(breedPage, /items: breeds\.map\(/);
  assert.match(sectionPage, /slug === "podujatia" \? getPublishedEvents\(\)/);
  assert.match(sectionPage, /items: eventList\.map\(/);
  assert.match(directoryPage, /listPublishedDirectoryProfiles\(\{/);
  assert.match(directoryPage, /items: result\.profiles\.map\(/);
  assert.match(adoptionPage, /getPublicAdoptions\(filters\)/);
  assert.match(adoptionPage, /items: result\.items\.map\(/);

  for (const source of [articlePage, breedPage, sectionPage, directoryPage, adoptionPage]) {
    assert.match(source, /buildCollectionPageJsonLd/);
    assert.doesNotMatch(source, /status:\s*["']draft["']/i);
  }
  for (const source of [articlePage, breedPage, sectionPage, directoryPage, adoptionPage]) {
    assert.match(source, /resolveListingIndexPolicy|policy\.kind|listingPolicy\.kind/);
  }
});

test("SEO-3 section listing metadata delegates to shared social metadata contract and preserves Novinky copy", () => {
  const sectionPage = fs.readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
  assert.match(sectionPage, /const NOVINKY_DESCRIPTION = "Výber príbehov, zaujímavostí, výskumu a užitočných tém zo sveta psov\.";/);
  assert.match(sectionPage, /const description = slug === "recenzie" \? REVIEWS_DESCRIPTION : section\.description;/);
  assert.match(sectionPage, /buildListingPageMetadata\(\{/);
  assert.doesNotMatch(sectionPage, /openGraph:\s*\{/);
  assert.doesNotMatch(sectionPage, /twitter:\s*\{/);
});


test("SEO-METADATA-QUALITY-2 profile fallback templates stay concise and category-specific", () => {
  const cases = [
    ["veterinari", "Veterina Nitra", "Nitra", /veterinárne služby/i],
    ["treneri", "Psia akadémia", "Bratislava", /tréning psov/i],
    ["salony-a-sluzby", "Salón Labka", "Trnava", /psí salón/i],
    ["hotely-a-opatrovanie", "Psí hotel Luna", "Žilina", /hotel a opatrovanie/i],
    ["kynologicke-kluby", "Kynologický klub Zobor", "Nitra", /kynologický klub/i],
    ["chovatelske-stanice", "Silver Meadow", "Senec", /chovateľská stanica/i],
    ["dalsie-sluzby", "Dog Taxi", "Košice", /služby pre psov/i],
  ];

  for (const [category, name, city, expected] of cases) {
    const fallback = directorySeoFallback(name, city, category);
    assert.ok(fallback.title.length <= FALLBACK_PAGE_TITLE_MAX_LENGTH, category);
    assert.ok((fallback.title + PAGE_TITLE_BRAND_SUFFIX).length <= SEARCH_TITLE_MAX_LENGTH, category);
    assert.ok(fallback.description.length <= SEARCH_DESCRIPTION_MAX_LENGTH, category);
    assert.match(fallback.title, expected, category);
    assert.match(fallback.description, new RegExp(name, "i"), category);
  }

  const veryLong = directorySeoFallback(
    "Veterinárne centrum pre malé zvieratá s mimoriadne dlhým obchodným názvom",
    "Bratislava",
    "veterinari",
  );
  assert.ok((veryLong.title + PAGE_TITLE_BRAND_SUFFIX).length <= SEARCH_TITLE_MAX_LENGTH);
  assert.ok(veryLong.description.length <= SEARCH_DESCRIPTION_MAX_LENGTH);
});

test("SEO-METADATA-QUALITY-2 event, help and breed fallbacks have bounded titles and descriptions", () => {
  const cases = [
    eventSeoFallback("Jesenné skúšky retrieverov", "Skúšky", "Nitra"),
    helpSeoFallback("Rex hľadá nový domov", "Adopcia", "Levice"),
    breedSeoFallback("Labradorský retriever"),
  ];

  for (const fallback of cases) {
    assert.ok(fallback.title.length <= FALLBACK_PAGE_TITLE_MAX_LENGTH);
    assert.ok((fallback.title + PAGE_TITLE_BRAND_SUFFIX).length <= SEARCH_TITLE_MAX_LENGTH);
    assert.ok(fallback.description.length >= 70);
    assert.ok(fallback.description.length <= SEARCH_DESCRIPTION_MAX_LENGTH);
  }
});

test("SEO-METADATA-QUALITY-2 core landing fallbacks are informative without double branding", () => {
  const paths = {
    directory: "/adresar",
    events: "/podujatia",
    help: "/pomoc-psom",
    breeds: "/plemena",
  };

  for (const key of Object.keys(paths)) {
    const fallback = coreLandingSeoFallback(key);
    assert.ok((fallback.title + PAGE_TITLE_BRAND_SUFFIX).length <= SEARCH_TITLE_MAX_LENGTH, key);
    assert.ok(fallback.description.length >= 80, key);
    assert.ok(fallback.description.length <= SEARCH_DESCRIPTION_MAX_LENGTH, key);
    assert.doesNotMatch(fallback.title, /Psipedia/i, key);

    const metadata = buildListingPageMetadata({
      ...fallback,
      path: paths[key],
    });
    assert.equal(metadata.alternates?.canonical, `${SITE_URL}${paths[key]}`, key);
    assert.equal(metadata.robots?.index, true, key);
    assert.equal(metadata.robots?.follow, true, key);
  }
});

test("SEO-METADATA-QUALITY-2 custom SEO stays authoritative over fallback metadata", () => {
  const fallback = directorySeoFallback("Fallback Veterina", "Nitra", "veterinari");
  const metadata = buildContentMetadata({
    seo: {
      title: "Vlastný SEO titulok",
      focusKeyword: "veterinár Nitra",
      description: "Vlastný SEO popis z Notion alebo databázy.",
      canonicalUrl: "",
      ogTitle: "",
      ogDescription: "",
      ogImage: "",
      noindex: false,
    },
    fallbackTitle: fallback.title,
    fallbackDescription: fallback.description,
    path: "/adresar/veterinari/vlastny-profil",
    imageAlt: "Vlastný profil",
  });

  assert.equal(metadata.title, "Vlastný SEO titulok");
  assert.equal(metadata.description, "Vlastný SEO popis z Notion alebo databázy.");
  assert.equal(metadata.alternates?.canonical, `${SITE_URL}/adresar/veterinari/vlastny-profil`);
  assert.equal(metadata.robots?.index, true);
  assert.equal(metadata.robots?.follow, true);
});

test("SEO-METADATA-QUALITY-2 public landing routes use the central fallback copy", () => {
  const directoryPage = fs.readFileSync(new URL("../app/adresar/page.tsx", import.meta.url), "utf8");
  const sectionPage = fs.readFileSync(new URL("../app/[section]/page.tsx", import.meta.url), "utf8");
  const helpPage = fs.readFileSync(new URL("../app/pomoc-psom/page.tsx", import.meta.url), "utf8");
  const breedsPage = fs.readFileSync(new URL("../app/plemena/page.tsx", import.meta.url), "utf8");

  assert.match(directoryPage, /coreLandingSeoFallback\("directory"\)/);
  assert.match(sectionPage, /coreLandingSeoFallback\("events"\)/);
  assert.match(helpPage, /coreLandingSeoFallback\("help"\)/);
  assert.match(breedsPage, /coreLandingSeoFallback\("breeds"\)/);
});


test("DIRECTORY-CATEGORY-INTENT-STRENGTHENING-1 central category contract separates navigation from page intent", () => {
  const expected = {
    veterinari: ["Veterinári", "Veterinári a veterinárne ambulancie", "Veterinári a veterinárne ambulancie"],
    treneri: ["Psí tréneri a psie školy", "Tréneri psov a psie školy", "Tréneri psov a psie školy – adresár"],
    "kynologicke-kluby": ["Kynologické kluby", "Kynologické kluby", "Kynologické kluby – adresár"],
    "chovatelske-kluby": ["Chovateľské kluby", "Chovateľské kluby", "Chovateľské kluby – adresár"],
    "chovatelske-stanice": ["Chovateľské stanice", "Chovateľské stanice", "Chovateľské stanice – adresár"],
    "salony-a-sluzby": ["Salóny", "Psie salóny", "Psie salóny na Slovensku – adresár"],
    "hotely-a-opatrovanie": ["Hotely a opatrovanie", "Hotely pre psov a opatrovanie", "Hotely pre psov a opatrovanie"],
    vencenie: ["Venčenie", "Venčenie psov", "Venčenie psov – adresár"],
    fyzioterapia: ["Fyzioterapia", "Fyzioterapia pre psov", "Fyzioterapia pre psov – adresár"],
    "dalsie-sluzby": ["Ďalšie služby", "Ďalšie služby pre psov", "Ďalšie služby pre psov – adresár"],
  };

  assert.equal(directoryCategories.length, 10);
  for (const category of directoryCategories) {
    assert.deepEqual(
      [category.label, category.heroTitle, category.seoTitle],
      expected[category.slug],
      category.slug,
    );
    assert.ok(category.intro.length >= 90, category.slug);
    assert.ok(category.intro.length <= SEARCH_DESCRIPTION_MAX_LENGTH, category.slug);
    assert.match(category.intro, /\./, category.slug);
    assert.ok(category.resultsTitle.startsWith("Zoznam "), category.slug);
    assert.doesNotMatch(category.seoTitle, /Psipedia/i, category.slug);

    const page2 = directoryCategoryListingMetadata(category, 2);
    assert.ok((page2.title + PAGE_TITLE_BRAND_SUFFIX).length <= SEARCH_TITLE_MAX_LENGTH, category.slug);
    assert.ok(page2.description.length <= SEARCH_DESCRIPTION_MAX_LENGTH, category.slug);
  }
});

test("DIRECTORY-CATEGORY-INTENT-STRENGTHENING-1 preserves clean, pagination and filter index policies", () => {
  const category = getDirectoryCategory("salony-a-sluzby");
  assert.ok(category);
  const path = "/adresar/salony-a-sluzby";

  const cleanPolicy = resolveListingIndexPolicy(path, {}, { indexPagination: true });
  const cleanCopy = directoryCategoryListingMetadata(category, cleanPolicy.page);
  const clean = buildListingPageMetadata({
    ...cleanCopy,
    path,
    searchParams: {},
    indexPagination: true,
  });
  assert.equal(cleanPolicy.kind, "clean");
  assert.equal(clean.title, "Psie salóny na Slovensku – adresár");
  assert.equal(clean.alternates?.canonical, `${SITE_URL}${path}`);
  assert.equal(clean.robots?.index, true);
  assert.equal(clean.robots?.follow, true);

  const page2Params = { page: "2" };
  const page2Policy = resolveListingIndexPolicy(path, page2Params, { indexPagination: true });
  const page2Copy = directoryCategoryListingMetadata(category, page2Policy.page);
  const page2 = buildListingPageMetadata({
    ...page2Copy,
    path,
    searchParams: page2Params,
    indexPagination: true,
  });
  assert.equal(page2Policy.kind, "pagination");
  assert.equal(page2.title, "Psie salóny na Slovensku – adresár, strana 2");
  assert.notEqual(page2.title, clean.title);
  assert.notEqual(page2.description, clean.description);
  assert.equal(page2.alternates?.canonical, `${SITE_URL}${path}?page=2`);
  assert.equal(page2.robots?.index, true);
  assert.equal(page2.robots?.follow, true);

  const filterParams = { q: "pudel", region: "Trnavský kraj" };
  const filterPolicy = resolveListingIndexPolicy(path, filterParams, { indexPagination: true });
  const filterCopy = directoryCategoryListingMetadata(category, filterPolicy.page);
  const filtered = buildListingPageMetadata({
    ...filterCopy,
    path,
    searchParams: filterParams,
    indexPagination: true,
  });
  assert.equal(filterPolicy.kind, "query");
  assert.equal(filtered.alternates?.canonical, `${SITE_URL}${path}`);
  assert.equal(filtered.robots?.index, false);
  assert.equal(filtered.robots?.follow, true);
});

test("DIRECTORY-CATEGORY-INTENT-STRENGTHENING-1 rendered source keeps H1, intro, results and crawlable link contracts", () => {
  const directoryPage = fs.readFileSync(new URL("../components/directory-page.tsx", import.meta.url), "utf8");
  const categoryPage = fs.readFileSync(new URL("../app/adresar/[category]/page.tsx", import.meta.url), "utf8");
  const results = fs.readFileSync(new URL("../components/directory-results.tsx", import.meta.url), "utf8");
  const card = fs.readFileSync(new URL("../components/directory-card.tsx", import.meta.url), "utf8");
  const detail = fs.readFileSync(new URL("../components/directory-profile-detail.tsx", import.meta.url), "utf8");

  assert.match(directoryPage, /title=\{active\?\.heroTitle \?\? "Služby pre psov"\}/);
  assert.match(directoryPage, /intro=\{active\?\.intro \?\?/);
  assert.match(directoryPage, /title=\{active \? active\.resultsTitle : "Výsledky vyhľadávania"\}/);

  assert.match(categoryPage, /directoryCategoryListingMetadata\(category, policy\.page\)/);
  assert.match(categoryPage, /name: category\.heroTitle/);
  assert.match(categoryPage, /description: category\.intro/);

  assert.match(card, /href=\{directoryProfileHref\(profile\)\}/);
  assert.match(results, /<Link href=\{pageHref\(basePath, filters, result\.page - 1\)\}>/);
  assert.match(results, /<Link href=\{pageHref\(basePath, filters, result\.page \+ 1\)\}>/);
  assert.match(directoryPage, /href=\{directoryCategoryHref\(category\)\}/);
  assert.match(detail, /href=\{\`\/adresar\/\$\{presentation\.category\}\`\}/);
});

test("DIRECTORY-CATEGORY-INTENT-STRENGTHENING-1 category schema stays canonical and points ItemList at detail URLs", () => {
  const category = getDirectoryCategory("salony-a-sluzby");
  assert.ok(category);
  const path = "/adresar/salony-a-sluzby";
  const schema = buildCollectionPageJsonLd({
    name: category.heroTitle,
    description: category.intro,
    path,
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Služby pre psov", path: "/adresar" },
      { name: category.label, path },
    ],
    items: [
      { name: "Psí salón Test", path: "/adresar/salony-a-sluzby/psi-salon-test" },
    ],
  });

  const collection = graphEntity(schema, "CollectionPage");
  const itemList = graphEntity(schema, "ItemList");
  const breadcrumbs = graphEntity(schema, "BreadcrumbList");

  assert.equal(collection.url, `${SITE_URL}${path}`);
  assert.equal(collection.name, "Psie salóny");
  assert.equal(itemList.itemListElement[0].item, `${SITE_URL}/adresar/salony-a-sluzby/psi-salon-test`);
  assert.equal(breadcrumbs.itemListElement[2].item, `${SITE_URL}${path}`);
});
