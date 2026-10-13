import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  directoryEmptyQueryRedirect,
  directoryPageHref,
  directoryQueryFields,
} from "../lib/directory-query.ts";

const read = (name) => readFileSync(name, "utf8");
const filters = {
  query: "Nitra", category: "", region: "Nitriansky kraj", district: "Nitra",
  city: "Nitra", service: "Vyšetrenie", breed: "", fciGroup: "",
  organization: "", profileType: "", sort: "recommended", page: 3,
};

test("directory GET serializer preserves named filters, normalizes defaults and never duplicates page", () => {
  const entries = directoryQueryFields(filters);
  assert.equal(entries.filter((entry) => entry.name === "q").length, 1);
  assert.ok(entries.some((entry) => entry.name === "region" && entry.value === "Nitriansky kraj"));
  assert.ok(entries.some((entry) => entry.name === "page" && entry.value === "3"));
  assert.ok(!entries.some((entry) => entry.name === "sort"));
  assert.equal(directoryQueryFields(filters, ["q", "page"]).length, entries.length - 2);
  const nextUrl = new URL("https://psipedia.sk" + directoryPageHref("/adresar/veterinari", filters, 4));
  assert.equal(nextUrl.searchParams.get("page"), "4");
  assert.equal(nextUrl.searchParams.get("q"), "Nitra");
  assert.equal(nextUrl.searchParams.get("region"), "Nitriansky kraj");
  assert.equal(nextUrl.searchParams.get("service"), "Vyšetrenie");
  assert.equal(directoryPageHref("/adresar", { ...filters, query: "", region: "", district: "", city: "", service: "", page: 1 }, 1), "/adresar");
});

test("empty search has a canonical clean URL with JavaScript disabled", () => {
  assert.equal(directoryEmptyQueryRedirect("/adresar", {q:""}, {...filters,query:"",page:1}), "/adresar?region=Nitriansky+kraj&district=Nitra&city=Nitra&service=Vy%C5%A1etrenie");
  assert.equal(directoryEmptyQueryRedirect("/adresar/veterinari", {q:[" "]}, {...filters,query:"",page:1}).startsWith("/adresar/veterinari?"), true);
  assert.equal(directoryEmptyQueryRedirect("/adresar", {q:"Nitra"}, filters), null);
  assert.equal(directoryEmptyQueryRedirect("/adresar", {}, filters), null);
});

test("one search above categories and three-column layout reuse existing public hero, map and popularity", () => {
  const page = read("components/directory-page.tsx");
  const root = read("app/adresar/page.tsx");
  const card = read("components/directory-card.tsx");
  const filter = read("components/directory-filter-form.tsx");
  const css = read("components/directory-public.module.css");
  assert.ok(page.indexOf("<UnifiedSectionHero") < page.indexOf("<SectionHeroSearch"));
  assert.ok(page.indexOf("<SectionHeroSearch") < page.indexOf("<DirectoryCategoryNavigation"));
  assert.ok(page.indexOf("<DirectoryCategoryNavigation") < page.indexOf("<DirectoryResults"));
  assert.match(page, /data-directory-columns/);
  assert.match(page, /serializeMapUiFilters/);
  assert.match(page, /ArticlePopularitySidebar/);
  assert.match(page, /data-directory-provider-cta/);
  assert.match(css, /grid-template-columns:\s*220px minmax\(0,1fr\) 255px/);
  assert.match(filter, /data-directory-filter-disclosure/);
  assert.doesNotMatch(filter, /<input[^>]*name="q"/);
  assert.doesNotMatch(root, /getDirectoryCategoryPreviews|showOverview/);
  assert.match(card, /directoryProfileHref\(profile\)/);
  assert.match(card, /profile\.imageUrl &&/);
});

test("publication SQL remains bounded to 24 profiles and retains deterministic featured order", () => {
  const store = read("lib/directory-store.ts");
  assert.match(store, /options\.pageSize \?\? 24/);
  assert.match(store, /featured DESC, name ASC, id ASC/);
  assert.match(store, /ORDER BY \$\{orderBy\} LIMIT \? OFFSET \?/);
  assert.doesNotMatch(read("app/adresar/page.tsx"), /getDirectoryCategoryCounts/);
});
