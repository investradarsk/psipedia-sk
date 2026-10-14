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
test("each public listing preserves its main search and filter wiring", () => {
  const directory = source("components/directory-page.tsx");
  const help = source("components/help-browser.tsx");
  const events = source("components/events-page.tsx");
  const reviews = source("components/reviews-hub.tsx");
  assert.match(directory, /data-directory-main-search/);
  assert.match(help, /data-public-search-form="help"/);
  assert.match(events, /searchScope="events"/);
  assert.match(reviews, /id="reviews-hub-query"/);
  assert.equal((directory.match(/<SectionHeroSearch/g) ?? []).length, 1);
  assert.equal((events.match(/<HomePortalSearch/g) ?? []).length, 1);
  assert.equal((reviews.match(/<SectionHeroSearch/g) ?? []).length, 1);
});
test("breeds display the interactive atlas search before action cards and filters", () => {
  const browser = source("components/breed-browser.tsx");
  const page = source("app/plemena/page.tsx");
  assert.ok(browser.indexOf('className="browser-toolbar breed-search-wrap"') < browser.indexOf("{actions}"));
  assert.ok(browser.indexOf("{actions}") < browser.indexOf('className="fci-filter-panel"'));
  assert.match(page, /actions=\{breedSection \? \(/);
});
test("editorial hubs and topics retain a single shared hero search each", () => {
  const editorial = source("components/editorial-section.tsx");
  assert.equal((editorial.match(/searchSlot=\{<SearchBox/g) ?? []).length, 2);
});
