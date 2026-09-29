import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SEARCH_MAX_PAGE,
  SEARCH_MAX_VISIBLE_RESULTS,
  SEARCH_PAGE_SIZE,
  applyPortalSearchFilterOverrides,
  normalizePortalSearch,
  parsePortalSearchLocationFilter,
  parsePortalSearchQuery,
  parsePortalSearchTypeFilter,
  portalSearchTypeFilterFromParsed,
  scorePortalSearchItem,
  stablePortalSearchSort,
  tokenizePortalSearch,
} from "../lib/portal-search-query.ts";
import {
  buildPortalSearchQuerySpecsForTest,
  filterPortalSearch,
  portalSearchFallbacks,
  portalSearchMapHref,
} from "../lib/portal-search.ts";

test("normalization removes Slovak diacritics, case and repeated whitespace", () => {
  assert.equal(normalizePortalSearch("  VETERINÁR   v   TRNAVE  "), "veterinar v trnave");
  assert.deepEqual(tokenizePortalSearch("  Psí   hotel Nitra  "), ["psi", "hotel", "nitra"]);
});

test("directory service synonyms are centralized and parse required variants", () => {
  for (const query of ["veterinár Trnava", "veterinar trnava", "veterina Trnava", "veterinárna klinika Trnava", "veterinárna ambulancia Trnava"]) {
    const parsed = parsePortalSearchQuery(query);
    assert.equal(parsed.directoryCategory, "veterinari", query);
    assert.equal(parsed.entityIntent, "directory", query);
    assert.equal(parsed.location?.city, "Trnava", query);
  }
  assert.equal(parsePortalSearchQuery("psí hotel Nitra").directoryCategory, "hotely-a-opatrovanie");
  assert.equal(parsePortalSearchQuery("tréner psov Bratislava").directoryCategory, "treneri");
});

test("location parser understands Slovak prepositions and common locatives", () => {
  const trnava = parsePortalSearchQuery("veterinár v Trnave");
  assert.equal(trnava.directoryCategory, "veterinari");
  assert.equal(trnava.location?.city, "Trnava");
  assert.equal(trnava.location?.district, "Trnava");
  assert.equal(trnava.location?.region, "Trnavský kraj");
  assert.deepEqual(trnava.residualTokens, []);

  assert.equal(parsePortalSearchQuery("tréner psov v Bratislave").location?.city, "Bratislava");
  assert.equal(parsePortalSearchQuery("výstava psov v Košiciach").location?.city, "Košice");
  assert.equal(parsePortalSearchQuery("psí hotel v Nitre").location?.city, "Nitra");
});

test("URL filter overrides are canonical, clearable and stable across reloads", () => {
  const inferred = parsePortalSearchQuery("veterinár v Trnave");
  assert.equal(portalSearchTypeFilterFromParsed(inferred), "veterinari");

  const changed = applyPortalSearchFilterOverrides(inferred, {
    typeProvided: true,
    type: "treneri",
    locationProvided: true,
    location: "mesto:Nitra",
  });
  assert.equal(changed.directoryCategory, "treneri");
  assert.equal(changed.entityIntent, "directory");
  assert.equal(changed.location?.level, "city");
  assert.equal(changed.location?.city, "Nitra");
  assert.deepEqual(changed.contentTokens, ["trener"]);

  const clearedLocation = applyPortalSearchFilterOverrides(inferred, {
    locationProvided: true,
    location: "",
  });
  assert.equal(clearedLocation.location, null);
  assert.equal(clearedLocation.directoryCategory, "veterinari");

  const clearedType = applyPortalSearchFilterOverrides(inferred, {
    typeProvided: true,
    type: "",
  });
  assert.equal(clearedType.directoryCategory, null);
  assert.equal(clearedType.entityIntent, null);
  assert.equal(clearedType.location?.city, "Trnava");
  assert.deepEqual(clearedType.contentTokens, ["veterinar"]);

  assert.equal(parsePortalSearchTypeFilter("event:Výstava")?.eventType, "Výstava");
  assert.equal(parsePortalSearchTypeFilter("unknown"), null);
  assert.equal(parsePortalSearchLocationFilter("okres Trnava")?.level, "district");
  assert.equal(parsePortalSearchLocationFilter("okres:Trnava")?.level, "district");
  assert.equal(parsePortalSearchLocationFilter("kraj Trnavský kraj")?.level, "region");
  assert.equal(parsePortalSearchLocationFilter("mesto:Trnava")?.level, "city");
});

test("search hands local intent to the existing map query contract only for supported entities", () => {
  const vet = portalSearchMapHref(parsePortalSearchQuery("veterinár v Trnave"));
  assert.equal(
    vet,
    "/mapa?category=services&subcategory=veterinari&region=Trnavsk%C3%BD+kraj&district=Trnava&city=Trnava",
  );

  const event = portalSearchMapHref(parsePortalSearchQuery("výstava psov v Košiciach"));
  assert.equal(
    event,
    "/mapa?category=events&eventType=V%C3%BDstava&region=Ko%C5%A1ick%C3%BD+kraj&city=Ko%C5%A1ice",
  );

  assert.equal(portalSearchMapHref(parsePortalSearchQuery("pes na adopciu Trnava")), null);
});

test("event, breed and article-shaped queries preserve useful residual text", () => {
  const event = parsePortalSearchQuery("výstava psov Košice");
  assert.equal(event.entityIntent, "event");
  assert.equal(event.eventType, "Výstava");
  assert.equal(event.location?.city, "Košice");

  const breed = parsePortalSearchQuery("labradorský retriever");
  assert.equal(breed.entityIntent, null);
  assert.deepEqual(breed.contentTokens, ["labradorsky", "retriever"]);

  const article = parsePortalSearchQuery("ako čistiť psovi zuby");
  assert.equal(article.entityIntent, null);
  assert.deepEqual(article.contentTokens, ["ako", "cistit", "psovi", "zuby"]);
});

test("ranking follows exact title, local service, wider location, prefix, service and content order", () => {
  const exactParsed = parsePortalSearchQuery("VetPoint Trnava");
  assert.equal(scorePortalSearchItem({ title: "VetPoint Trnava", kind: "directory", category: "veterinari", city: "Trnava" }, exactParsed), 0);

  const localParsed = parsePortalSearchQuery("veterinár Trnava");
  assert.equal(scorePortalSearchItem({ title: "Ambulancia Alfa", kind: "directory", category: "veterinari", city: "Trnava", region: "Trnavský kraj" }, localParsed), 10);
  assert.equal(scorePortalSearchItem({ title: "Ambulancia Beta", kind: "directory", category: "veterinari", city: "Piešťany", region: "Trnavský kraj" }, localParsed), 20);
  assert.equal(scorePortalSearchItem({ title: "Veterinár Trnava nonstop", kind: "article", haystack: "poradňa" }, localParsed), 30);

  const serviceParsed = parsePortalSearchQuery("pohotovosť Nitra");
  assert.equal(scorePortalSearchItem({ title: "Klinika Nitra", kind: "directory", city: "Nitra", services: "Pohotovosť chirurgia", haystack: "Nitra" }, serviceParsed), 40);

  const contentParsed = parsePortalSearchQuery("ako čistiť psovi zuby");
  assert.equal(scorePortalSearchItem({ title: "Dentálna hygiena psa", kind: "article", haystack: "Ako čistiť psovi zuby bezpečne" }, contentParsed), 70);
});

test("stable ranking never uses commercial or verification state", () => {
  const parsed = parsePortalSearchQuery("veterinár Trnava");
  const organic = [
    { href: "/b", title: "Beta", score: scorePortalSearchItem({ title: "Beta", kind: "directory", category: "veterinari", city: "Trnava" }, parsed) },
    { href: "/a", title: "Alfa", score: scorePortalSearchItem({ title: "Alfa", kind: "directory", category: "veterinari", city: "Trnava" }, parsed) },
  ];
  assert.deepEqual(stablePortalSearchSort(organic).map((item) => item.title), ["Alfa", "Beta"]);

  const source = readFileSync(new URL("../lib/portal-search.ts", import.meta.url), "utf8");
  assert.equal(source.includes("getPublishedDirectoryProfiles"), false);
  assert.equal(/\bfeatured\b/.test(source), false);
  assert.equal(/\bverified\b/.test(source), false);
});

test("an exact profile remains eligible beyond an old 500-item corpus boundary", () => {
  const filler = Array.from({ length: 1_800 }, (_, index) => ({
    href: `/adresar/veterinari/filler-${index}`,
    title: `Ambulancia ${String(index).padStart(4, "0")}`,
    type: "Veterinár",
    description: "Trnava",
    keywords: "veterinar trnava",
  }));
  const target = {
    href: "/adresar/veterinari/search-target",
    title: "SEARCH Target 1801",
    type: "Veterinár",
    description: "Trnava",
    keywords: "veterinar trnava",
  };
  const result = filterPortalSearch([...filler, target], "SEARCH Target 1801", 24);
  assert.equal(result[0]?.href, target.href);
});


test("required breed, article and nonsense scenarios produce deterministic outcomes", () => {
  const items = [
    { href: "/plemena/labradorsky-retriever", title: "Labradorský retriever", type: "Plemeno", description: "Retríver", keywords: "FCI retriever" },
    { href: "/starostlivost/ako-cistit-psovi-zuby", title: "Ako čistiť psovi zuby", type: "Článok", description: "Praktický návod", keywords: "dentálna hygiena zuby" },
  ];
  assert.equal(filterPortalSearch(items, "labradorský retriever", 24)[0]?.href, "/plemena/labradorsky-retriever");
  assert.equal(filterPortalSearch(items, "ako čistiť psovi zuby", 24)[0]?.href, "/starostlivost/ako-cistit-psovi-zuby");
  assert.deepEqual(filterPortalSearch(items, "zzzxxyy-no-search-result", 24), []);
});

test("pagination is explicitly bounded and keeps a stable page contract", () => {
  assert.equal(SEARCH_PAGE_SIZE, 24);
  assert.equal(SEARCH_MAX_PAGE, 20);
  assert.equal(SEARCH_MAX_VISIBLE_RESULTS, 480);
});


test("bounded D1 query specs stay below platform bind and SQL-size limits", () => {
  const specs = buildPortalSearchQuerySpecsForTest("jeden dva tri styri pat sest sedem osem", SEARCH_MAX_VISIBLE_RESULTS);
  assert.ok(specs.length >= 6);
  for (const spec of specs) {
    assert.ok(spec.bindingCount <= 100, `binding count ${spec.bindingCount}`);
    assert.ok(new TextEncoder().encode(spec.sql).byteLength <= 100_000, `SQL bytes ${new TextEncoder().encode(spec.sql).byteLength}`);
    assert.match(spec.sql, /LIMIT 480$/);
  }
});

test("URL-filtered query specs keep SEARCH-1 SQL, binding and visibility caps", () => {
  const specs = buildPortalSearchQuerySpecsForTest(
    "pohotovosť",
    SEARCH_MAX_VISIBLE_RESULTS,
    {
      typeProvided: true,
      type: "veterinari",
      locationProvided: true,
      location: "mesto:Trnava",
    },
  );
  assert.ok(specs.length >= 1);
  for (const spec of specs) {
    assert.ok(spec.bindingCount <= 100, `binding count ${spec.bindingCount}`);
    assert.ok(new TextEncoder().encode(spec.sql).byteLength <= 100_000);
    assert.match(spec.sql, /LIMIT 480$/);
  }
});

test("zero-result local service fallback broadens only to relevant directory scope", () => {
  const parsed = parsePortalSearchQuery("veterinár v Trnave");
  const fallbacks = portalSearchFallbacks(parsed);
  assert.equal(fallbacks[0]?.href, "/adresar/veterinari?region=Trnavsk%C3%BD+kraj&district=Trnava");
  assert.equal(fallbacks[1]?.href, "/adresar/veterinari");
  assert.equal(fallbacks.some((item) => item.href === "/clanky"), false);
});

test("search page keeps noindex, follow and does not add a canonical", () => {
  const source = readFileSync(new URL("../app/hladat/page.tsx", import.meta.url), "utf8");
  assert.match(source, /robots:\s*\{\s*index:\s*false,\s*follow:\s*true\s*\}/);
  assert.equal(source.includes("canonical:"), false);
});
