import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const disclosure = read("components/public-filter-disclosure.tsx");
const services = read("components/directory-filter-form.tsx");
const servicesResults = read("components/directory-results.tsx");
const servicesStore = read("lib/directory-store.ts");
const events = read("components/event-calendar.tsx");
const eventsLib = read("lib/events.ts");
const eventsRoot = read("app/[section]/page.tsx");
const eventsType = read("app/[section]/[slug]/page.tsx");
const helpPage = read("components/help-page.tsx");
const helpBrowser = read("components/help-browser.tsx");
const helpCategory = read("app/pomoc-psom/[category]/page.tsx");

test("shared public disclosure is keyboard-native and reports active secondary filters", () => {
  assert.match(disclosure, /type="button"/);
  assert.match(disclosure, /aria-expanded=\{open\}/);
  assert.match(disclosure, /aria-controls=\{contentId\}/);
  assert.match(disclosure, /data-public-filter-count/);
  assert.match(disclosure, /Ďalšie filtre/);
});

test("Services keep the existing server-backed query contract behind one primary search", () => {
  assert.match(services, /method="get"/);
  assert.match(services, /data-public-search-form="services"/);
  assert.match(services, /name="q"/);
  for (const name of ["category", "region", "district", "city", "service", "breed", "fci", "organization", "type", "sort"]) {
    assert.match(services, new RegExp(`name="${name}"`));
  }
  assert.match(services, /<PublicFilterDisclosure/);
  assert.match(servicesResults, /if \(page > 1\) params\.set\("page"/);
  assert.match(servicesStore, /page: Math\.max\(1,/);
  assert.match(servicesStore, /query: firstParam\(params\.q\)\.slice\(0, 100\)/);
});

test("Events use URL-backed server rendering instead of client dataset filtering", () => {
  assert.doesNotMatch(events, /"use client"|useState|useMemo|window\.history/);
  assert.match(events, /method="get"/);
  assert.match(events, /data-public-search-form="events"/);
  assert.match(events, /name="q"/);
  assert.match(events, /name="region"/);
  assert.match(events, /name="mesiac"/);
  assert.match(events, /name="termin"/);
  assert.match(events, /<PublicFilterDisclosure/);
  assert.match(events, /function timeHref/);
  assert.match(events, /Zobraziť celý zoznam/);
  assert.match(eventsLib, /eventSearchQueryFromParam/);
  assert.match(eventsLib, /eventRegionFilterFromParam/);
  assert.match(eventsLib, /eventMonthFilterFromParam/);
  assert.match(eventsRoot, /initialQuery=\{eventSearchQueryFromParam\(rawSearchParams\.q\)\}/);
  assert.match(eventsType, /initialRegion=\{eventRegionFilterFromParam\(rawSearchParams\.region\)\}/);
});

test("Help category pages have one primary search and URL-backed SSR filters", () => {
  assert.doesNotMatch(helpPage, /SectionHeroSearch/);
  assert.doesNotMatch(helpBrowser, /"use client"|useState|useMemo|window\.history/);
  assert.match(helpBrowser, /method="get"/);
  assert.match(helpBrowser, /data-public-search-form="help"/);
  assert.match(helpBrowser, /name="q"/);
  assert.match(helpBrowser, /name="region"/);
  assert.match(helpBrowser, /name="stav"/);
  assert.match(helpBrowser, /<PublicFilterDisclosure/);
  assert.match(helpBrowser, /Zobraziť celý zoznam/);
  assert.match(helpCategory, /initialQuery = scalar\(rawSearchParams\.q\)\.trim\(\)\.slice\(0, 120\)/);
  assert.match(helpCategory, /initialRegion = regionFilter\(rawSearchParams\.region\)/);
  assert.match(helpCategory, /initialActiveOnly = scalar\(rawSearchParams\.stav\) !== "vsetky"/);
});

test("public search simplification does not introduce persistence or routing redesign hooks", () => {
  for (const source of [services, events, helpBrowser, helpPage]) {
    assert.doesNotMatch(source, /notion|automation|gemini|drizzle|migration|JSON-LD|sitemap/i);
  }
});
