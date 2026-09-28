import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SEARCH_MAX_PAGE,
  SEARCH_MAX_VISIBLE_RESULTS,
  SEARCH_PAGE_SIZE,
  normalizePortalSearch,
  parsePortalSearchQuery,
  scorePortalSearchItem,
  stablePortalSearchSort,
  tokenizePortalSearch,
} from "../lib/portal-search-query.ts";
import { filterPortalSearch, portalSearchFallbacks } from "../lib/portal-search.ts";

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

test("pagination is explicitly bounded and keeps a stable page contract", () => {
  assert.equal(SEARCH_PAGE_SIZE, 24);
  assert.equal(SEARCH_MAX_PAGE, 20);
  assert.equal(SEARCH_MAX_VISIBLE_RESULTS, 480);
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
