import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("shared hero has rounded desktop and full-bleed square mobile photography", () => {
  const css = source("components/public-visual-system/unified-section-hero.module.css");
  assert.match(css, /border-radius: var\(--ps-radius-card, 22px\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.visual \{[\s\S]*?border-radius: 0;/);
  assert.match(css, /width: 100dvw;/);
});
test("each public listing uses one scoped canonical hero search and retains secondary filters", () => {
  const portalSearch = source("components/home-portal-search.tsx");
  const directory = source("components/directory-page.tsx");
  const helpPage = source("components/help-page.tsx");
  const helpBrowser = source("components/help-browser.tsx");
  const events = source("components/events-page.tsx");
  const reviews = source("components/reviews-hub.tsx");

  // Primary search is one semantic GET form; separate filter forms may keep q hidden.
  assert.match(portalSearch, /<form action=\{action\} method="get"[^>]*role="search"[^>]*data-public-search-form=\{searchScope\}/);
  assert.match(portalSearch, /name=\{inputName\}/);
  for (const [scope, page] of [
    ["services", directory], ["help", helpPage], ["events", events], ["reviews", reviews],
  ]) {
    assert.equal((page.match(/<HomePortalSearch\b/g) ?? []).length, 1, scope + " has one canonical main search");
    assert.match(page, /portalSearchSlot=\{/);
    assert.match(page, new RegExp('searchScope="' + scope + '"'));
    assert.doesNotMatch(page, /<SectionHeroSearch\b/);
  }
  assert.match(directory, /hidden=\{directoryQueryFields\(filters, \["q", "page"\]\)\}/);
  assert.match(directory, /<DirectoryFilterForm\b/);
  assert.match(helpBrowser, /data-help-secondary-filters/);
  assert.match(reviews, /id="reviews-hub-query"/);
  assert.doesNotMatch(directory, /data-directory-main-search/);
});
test("breeds display the interactive atlas search before action cards and filters", () => {
  const browser = source("components/breed-browser.tsx");
  const page = source("app/plemena/page.tsx");
  assert.ok(browser.indexOf('className="browser-toolbar breed-search-wrap"') < browser.indexOf("{actions}"));
  assert.ok(browser.indexOf("{actions}") < browser.indexOf('className="fci-filter-panel"'));
  assert.match(page, /actions=\{breedSection \? \(/);
});
test("editorial hub and topic each render one canonical portal search", () => {
  const editorial = source("components/editorial-section.tsx");
  assert.match(editorial, /function SearchBox\(/);
  assert.equal((editorial.match(/portalSearchSlot=\{<SearchBox\b/g) ?? []).length, 2);
  assert.equal((editorial.match(/<HomePortalSearch\b/g) ?? []).length, 1);
  assert.match(editorial, /searchScope=\{sectionSlug\}/);
  assert.doesNotMatch(editorial, /searchSlot=\{<SearchBox/);
});
