import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const disclosure = read("components/public-filter-disclosure.tsx");
const services = read("components/directory-filter-form.tsx");
const directory = read("components/directory-page.tsx");
const portalSearch = read("components/home-portal-search.tsx");
const directoryQuery = read("lib/directory-query.ts");
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

test("Services preserve one canonical GET search, secondary filters and URL state", () => {
  assert.equal((directory.match(/<HomePortalSearch\b/g) ?? []).length, 1);
  assert.match(directory, /portalSearchSlot=\{/);
  assert.match(directory, /searchScope="services"/);
  assert.match(directory, /action=\{basePath\}/);
  assert.match(directory, /hidden=\{directoryQueryFields\(filters, \["q", "page"\]\)\}/);
  assert.match(portalSearch, /<form action=\{action\} method="get"[^>]*role="search"[^>]*data-public-search-form=\{searchScope\}/);
  assert.match(portalSearch, /name=\{inputName\}/);
  assert.match(portalSearch, /<button type="submit">/);
  assert.match(services, /method="get"/);
  assert.match(services, /data-directory-filter-form/);
  assert.match(services, /directoryQueryFields\(filters,/);
  assert.doesNotMatch(services, /data-public-search-form=|<PublicFilterDisclosure\b/);
  for (const name of ["region", "district", "city", "service", "breed", "fci", "organization", "type", "sort"]) {
    assert.match(services, new RegExp('name="' + name + '"'));
  }
  assert.match(directoryQuery, /export function directoryQueryFields/);
  assert.match(directoryQuery, /export function directoryPageHref/);
  assert.match(directoryQuery, /export function directoryEmptyQueryRedirect/);
  assert.match(servicesResults, /directoryPageHref\(basePath, filters, result\.page/);
  assert.match(servicesStore, /page: Math\.max\(1,/);
  assert.match(servicesStore, /query: firstParam\(params\.q\)\.slice\(0, 100\)/);
});
test("Events use URL-backed server rendering instead of client dataset filtering", () => {
  assert.doesNotMatch(events, /"use client"|useState|useMemo|window\.history/);
  const results = read("components/event-listing-results.tsx");
  const page = read("components/events-page.tsx");
  assert.match(results, /method="get"/);
  assert.match(page, /searchScope="events"/);
  assert.match(results, /name="region"/);
  assert.match(results, /name="mesiac"/);
  assert.match(results, /eventListingParams/);
  assert.match(results, /<details/);
  assert.match(events, /function timeHref/);
  assert.match(results, /Vymazať filtre/);
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
  assert.match(helpPage, /searchScope="help"/);
  assert.match(helpBrowser, /data-help-secondary-filters/);
  assert.doesNotMatch(helpBrowser, /<input[^>]*name="q"[^>]*placeholder/);
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


test("DS-3 main search shares one visual contract without changing GET destinations or scopes", () => {
  const header = read("components/site-header.tsx");
  const results = read("app/hladat/page.tsx");
  const help = read("components/help-overview.tsx");
  const eventPage = read("components/events-page.tsx");
  const reviews = read("components/reviews-hub.tsx");
  const hero = read("components/public-visual-system/unified-section-hero.tsx");
  for (const source of [portalSearch, header, results]) {
    assert.match(source, /data-public-search-ui="main"/);
    assert.match(source, /className="public-search-entry"/);
    assert.match(source, /className="public-search-icon" aria-hidden="true"/);
    assert.match(source, /<button type="submit">/);
  }
  assert.match(portalSearch, /<form action=\{action\} method="get"[^>]*role="search"[^>]*data-public-search-form=\{searchScope\}/);
  assert.match(portalSearch, /name=\{inputName\}/);
  assert.match(portalSearch, /minLength=\{allowEmpty \? undefined : 2\}/);
  assert.match(portalSearch, /hidden\.map\(\(field\) => <input type="hidden" name=\{field.name\}/);
  assert.match(directory, /action=\{basePath\}/);
  assert.match(directory, /hidden=\{directoryQueryFields\(filters, \["q", "page"\]\)\}/);
  assert.match(help, /hidden=\{\[\{ name: "sekcia", value: "pomoc-psom" \}\]\}/);
  assert.match(eventPage, /action=\{categoryHref \?\? "\/podujatia"\}/);
  assert.match(eventPage, /hidden=\{searchHidden\}/);
  assert.match(reviews, /hidden=\{\[\{ name: "sekcia", value: "recenzie" \}\]\}/);
  assert.match(results, /<form action="\/hladat" method="get"[^>]*role="search"/);
  assert.match(results, /name="q"/);
  assert.match(results, /name="sekcia"/);
  assert.match(results, /name="podsekcia"/);
  assert.match(header, /window\.location\.href = `\/hladat\?q=\$\{encodeURIComponent\(clean\)\}`/);
  assert.match(header, /if \(event\.key === "Escape"\)/);
  assert.match(header, /aria-modal="true"/);
  assert.match(hero, /portalSearchSlot \? null : managedSearch\(searchSlot/);
});

test("DS-3 keeps contextual section search separate from secondary filters", () => {
  const sectionSearch = read("components/section-hero-search.tsx");
  assert.match(sectionSearch, /method="get"/);
  assert.match(sectionSearch, /data-public-search-ui="section"/);
  assert.match(sectionSearch, /name=\{inputName\}/);
  assert.match(sectionSearch, /beforeInput/);
  assert.match(sectionSearch, /hidden\.map\(/);
  assert.match(sectionSearch, /className="public-search-entry"/);
  assert.doesNotMatch(services, /data-public-search-ui=/);
  assert.doesNotMatch(services, /public-search-entry/);
});

test("DS-3 desktop and mobile search controls are token-based, scoped and keyboard accessible", () => {
  const css = read("app/design-system.css");
  const section = css.split("/* DS-3 PUBLIC SEARCH")[1];
  assert.ok(section, "Shared public search styles missing");
  assert.match(section, /\[data-public-search-ui="main"\]/);
  assert.match(section, /grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(section, /min-height: 52px;/);
  assert.match(section, /--ps-color-action-primary/);
  assert.match(section, /--ps-color-action-primary-hover/);
  assert.match(section, /--ps-color-text-primary/);
  assert.match(section, /--ps-radius-control/);
  assert.match(section, /:focus-within/);
  assert.match(section, /:focus-visible/);
  assert.match(section, /@media \(max-width: 620px\)/);
  assert.match(section, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(section, /min-height: 48px;/);
  assert.match(section, /min-height: 46px;/);
  assert.match(section, /@media \(forced-colors: active\)/);
  assert.doesNotMatch(section, /\.admin[-_\w]+\s*\{/);
  assert.doesNotMatch(section, /!important/);
});
