import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("scrollable mobile menu does not dereference nullable drawer inside swipe handlers", () => {
  const header = read("components/site-header.tsx");
  assert.match(header, /if \(!menu \|\| !nav \|\| !grip\) return;\s*const drawer = menu/);
  assert.match(header, /drawer\.style\.transform/);
  assert.doesNotMatch(header, /menu!\.style/);
  assert.match(header, /menuReturnFocusRef\.current\?\.focus\(\)/);
});

test("directory pagination preserves filters and returns to results at every page", () => {
  const list = read("components/directory-results.tsx");
  const contract = read("tests/seo-metadata-listing-schema.test.mjs");
  assert.match(list, /pageHref=\{\(page\) => directoryPageHref\(basePath, filters, page\) \+ "#directory-results-heading"\}/);
  assert.match(list, /previousHref=\{/);
  assert.match(list, /nextHref=\{/);
  assert.match(contract, /#directory-results-heading/);
});

test("news category navigation retains real links and active selection without redundant combobox", () => {
  const hub = read("components/news-hub.tsx");
  const e2e = read("tests/e2e/article-reading-experience.spec.ts");
  assert.match(hub, /mobileLayout="grid"/);
  assert.match(hub, /label="Novinky podľa kategórie"/);
  assert.match(e2e, /a\[href="\/novinky\/veda-a-zdravie"\]/);
  assert.doesNotMatch(e2e.slice(e2e.indexOf('test("ARTICLE-PUBLIC canonical news'), e2e.indexOf('test("PUBLIC-GLOBAL search')), /combobox/);
});

test("linked adoption breed uses the canonical FCI group with one existing SQL join", () => {
  const store = read("lib/adoption-store.ts");
  const ui = read("components/adoption-detail.tsx");
  const breed = read("lib/breed-canonical.ts");
  assert.match(store, /b\.fci_group AS breed_fci_group/);
  assert.match(store, /breedFciGroup: Number\.isInteger\(row\.breed_fci_group\)/);
  assert.match(ui, /breedProfileHref\(dog\.breedSlug, dog\.breedFciGroup \?\? undefined\)/);
  assert.match(breed, /return category \? `\/plemena\/\$\{category\}\/\$\{slug\}` : `\/plemena\/\$\{slug\}`/);
  assert.doesNotMatch(ui, /href=\{\`\/plemena\/\$\{dog\.breedSlug\}\`\}/);
});
