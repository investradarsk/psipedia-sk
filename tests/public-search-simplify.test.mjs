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
  assert.match(disclosure, /aria-expanded=\{\s*open\s*\}/);
  assert.match(disclosure, /aria-controls=\{\s*contentId\s*\}/);
  assert.match(disclosure, /data-public-filter-count/);
  assert.match(disclosure, /Ďalšie\s*filtre/);
});

test("Services preserve one canonical GET search, secondary filters and URL state", () => {
  assert.equal((directory.match(/<HomePortalSearch\b/g) ?? []).length, 1);
  assert.match(directory, /portalSearchSlot=\{\s*/);
  assert.match(directory, /searchScope="services"/);
  assert.match(directory, /action=\{\s*basePath\s*\}/);
  assert.match(
    directory,
    /hidden=\{\s*directoryQueryFields\(\s*filters,\s*\[\s*"q",\s*"page"\s*\]\s*\)\s*\}/,
  );
  assert.match(
    portalSearch,
    /<form\s*action=\{\s*action\s*\}\s*method="get"[^>]*role="search"[^>]*data-public-search-form=\{\s*searchScope\s*\}/,
  );
  assert.match(portalSearch, /name=\{\s*inputName\s*\}/);
  assert.match(portalSearch, /<button\s*type="submit">/);
  assert.match(services, /method="get"/);
  assert.match(services, /data-directory-filter-form/);
  assert.match(services, /directoryQueryFields\(\s*filters,\s*/);
  assert.doesNotMatch(services, /data-public-search-form=|<PublicFilterDisclosure\b/);
  for (const name of [
    "region",
    "district",
    "city",
    "svc",
    "breed",
    "fci",
    "organization",
    "sort",
  ]) {
    assert.match(services, new RegExp('name="' + name + '"'));
  }
  assert.match(directoryQuery, /export\s*function\s*directoryQueryFields/);
  assert.match(directoryQuery, /export\s*function\s*directoryPageHref/);
  assert.match(directoryQuery, /export\s*function\s*directoryEmptyQueryRedirect/);
  assert.match(servicesResults, /directoryPageHref\(\s*basePath,\s*filters,\s*result\s*\.page/);
  assert.match(servicesStore, /page:\s*Math\s*\.max\(\s*1,\s*/);
  assert.match(
    servicesStore,
    /query:\s*firstParam\(\s*params\s*\.q\s*\)\s*\.slice\(\s*0,\s*100\s*\)/,
  );
});
test("Events keep server-backed search while calendar navigation updates in place", () => {
  assert.match(events, /"use\s*client"/);
  assert.match(events, /window\s*\.history\s*\.pushState/);
  assert.match(events, /fetch\(\s*endpoint\s*\.toString\(\s*\)/);
  assert.match(events, /\/api\/public\/events\/calendar/);
  const results = read("components/event-listing-results.tsx");
  const page = read("components/events-page.tsx");
  assert.match(results, /method="get"/);
  assert.match(page, /searchScope="events"/);
  assert.match(results, /name="region"/);
  assert.match(results, /name="mesiac"/);
  assert.match(results, /eventListingParams/);
  assert.match(results, /<details/);
  assert.match(events, /function\s*timeHref/);
  assert.match(results, /Vymazať\s*filtre/);
  assert.match(eventsLib, /eventSearchQueryFromParam/);
  assert.match(eventsLib, /eventRegionFilterFromParam/);
  assert.match(eventsLib, /eventMonthFilterFromParam/);
  assert.match(
    eventsRoot,
    /initialQuery=\{\s*eventSearchQueryFromParam\(\s*rawSearchParams\s*\.q\s*\)\s*\}/,
  );
  assert.match(
    eventsType,
    /initialRegion=\{\s*eventRegionFilterFromParam\(\s*rawSearchParams\s*\.region\s*\)\s*\}/,
  );
});

test("Help category pages have one primary search and URL-backed SSR filters", () => {
  assert.doesNotMatch(helpPage, /SectionHeroSearch/);
  assert.doesNotMatch(helpBrowser, /"use\s*client"|useState|useMemo|window\s*\.history/);
  assert.match(helpBrowser, /method="get"/);
  assert.match(helpPage, /searchScope="help"/);
  assert.match(helpBrowser, /data-help-secondary-filters/);
  assert.doesNotMatch(helpBrowser, /<input[^>]*name="q"[^>]*placeholder/);
  assert.match(helpBrowser, /name="q"/);
  assert.match(helpBrowser, /name="region"/);
  assert.match(helpBrowser, /name="stav"/);
  assert.match(helpBrowser, /<PublicFilterDisclosure/);
  assert.match(helpBrowser, /Zobraziť\s*celý\s*zoznam/);
  assert.match(
    helpCategory,
    /initialQuery\s*=\s*scalar\(\s*rawSearchParams\s*\.q\s*\)\s*\.trim\(\s*\)\s*\.slice\(\s*0,\s*120\s*\)/,
  );
  assert.match(
    helpCategory,
    /initialRegion\s*=\s*regionFilter\(\s*rawSearchParams\s*\.region\s*\)/,
  );
  assert.match(
    helpCategory,
    /initialActiveOnly\s*=\s*scalar\(\s*rawSearchParams\s*\.stav\s*\)\s*!==\s*"vsetky"/,
  );
});

test("public search simplification does not introduce persistence or routing redesign hooks", () => {
  for (const source of [services, events, helpBrowser, helpPage]) {
    assert.doesNotMatch(source, /notion|automation|gemini|drizzle|migration|JSON-LD|sitemap/i);
  }
});

test("DS-3 main search shares one visual contract without changing GET destinations or scopes", () => {
  const header = read("components/site-header.tsx");
  const results = read("app/hladat/page.tsx").replace(/\s+/g, " ");
  const help = read("components/help-overview.tsx");
  const eventPage = read("components/events-page.tsx");
  const reviews = read("components/reviews-hub.tsx");
  const hero = read("components/public-visual-system/unified-section-hero.tsx");
  for (const source of [portalSearch, header]) {
    assert.match(source, /data-public-search-ui="main"/);
    assert.match(source, /className="public-search-entry"/);
    assert.match(source, /className="public-search-icon"\s*aria-hidden="true"/);
    assert.match(source, /<button\s*type="submit">/);
  }
  assert.match(results, /<UniversalPageHero/);
  assert.match(results, /searchDefaultValue=\{query\}/);
  assert.match(results, /searchHidden=\{/);
  assert.match(read("components/public-visual-system/universal-page-hero.tsx"), /<HomePortalSearch/);
  assert.match(
    portalSearch,
    /<form\s*action=\{\s*action\s*\}\s*method="get"[^>]*role="search"[^>]*data-public-search-form=\{\s*searchScope\s*\}/,
  );
  assert.match(portalSearch, /name=\{\s*inputName\s*\}/);
  assert.match(portalSearch, /minLength=\{\s*allowEmpty\s*\?\s*undefined\s*:\s*2\s*\}/);
  assert.match(
    portalSearch,
    /hidden\s*\.map\(\s*\(\s*field\s*\)\s*=>\s*<input\s*type="hidden"\s*name=\{\s*field.name\s*\}/,
  );
  assert.match(directory, /action=\{\s*basePath\s*\}/);
  assert.match(
    directory,
    /hidden=\{\s*directoryQueryFields\(\s*filters,\s*\[\s*"q",\s*"page"\s*\]\s*\)\s*\}/,
  );
  assert.match(
    help,
    /hidden=\{\s*\[\s*\{\s*name:\s*"sekcia",\s*value:\s*"pomoc-psom"\s*\}\s*\]\s*\}/,
  );
  assert.match(eventPage, /action=\{\s*categoryHref\s*\?\?\s*"\/podujatia"\s*\}/);
  assert.match(eventPage, /hidden=\{\s*searchHidden\s*\}/);
  assert.match(
    reviews,
    /hidden=\{\s*\[\s*\{\s*name:\s*"sekcia",\s*value:\s*"recenzie"\s*\}\s*\]\s*\}/,
  );
  assert.match(results, /name: "sekcia", value: section/);
  assert.match(results, /name: "podsekcia", value: subsection/);
  assert.match(read("components/home-portal-search.tsx"), /<form action=\{action\} method="get"/);
  assert.match(
    header,
    /window\s*\.location\s*\.href\s*=\s*`\/hladat\?q=\$\{\s*encodeURIComponent\(\s*clean\s*\)\s*\}`/,
  );
  assert.match(header, /if\s*\(\s*event\s*\.key\s*===\s*"Escape"\s*\)/);
  assert.match(header, /aria-modal="true"/);
  assert.match(hero, /portalSearchSlot\s*\?\s*null\s*:\s*managedSearch\(\s*searchSlot/);
});

test("DS-3 keeps contextual section search separate from secondary filters", () => {
  const sectionSearch = read("components/section-hero-search.tsx");
  assert.match(sectionSearch, /method="get"/);
  assert.match(sectionSearch, /data-public-search-ui="section"/);
  assert.match(sectionSearch, /name=\{\s*inputName\s*\}/);
  assert.match(sectionSearch, /beforeInput/);
  assert.match(sectionSearch, /hidden\s*\.map\(\s*/);
  assert.match(sectionSearch, /className="public-search-entry"/);
  assert.doesNotMatch(services, /data-public-search-ui=/);
  assert.doesNotMatch(services, /public-search-entry/);
});

test("DS-3 desktop and mobile search controls are token-based, scoped and keyboard accessible", () => {
  const css = read("app/design-system.css");
  const section = css.split("/* DS-3 PUBLIC SEARCH")[1];
  assert.ok(section, "Shared public search styles missing");
  assert.match(section, /\[\s*data-public-search-ui="main"\s*\]/);
  assert.match(section, /grid-template-columns:\s*minmax\(\s*0,\s*1fr\s*\)\s*auto;/);
  assert.match(section, /min-height:\s*52px;/);
  assert.match(section, /--ps-color-action-primary/);
  assert.match(section, /--ps-color-action-primary-hover/);
  assert.match(section, /--ps-color-text-primary/);
  assert.match(section, /--ps-radius-control/);
  assert.match(section, /:focus-within/);
  assert.match(section, /:focus-visible/);
  assert.match(section, /@media\s*\(\s*max-width:\s*620px\s*\)/);
  assert.match(section, /grid-template-columns:\s*minmax\(\s*0,\s*1fr\s*\);/);
  assert.match(section, /min-height:\s*48px;/);
  assert.match(section, /min-height:\s*46px;/);
  assert.match(section, /@media\s*\(\s*forced-colors:\s*active\s*\)/);
  assert.doesNotMatch(section, /\s*\.admin[-_\w]+\s*\{\s*/);
  assert.doesNotMatch(section, /!important/);
});
