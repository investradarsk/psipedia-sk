import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin navigation exposes Automations as a top-level admin destination", () => {
  const shell = read("components/admin-shell.tsx");
  assert.match(shell, /href="\/admin\/automatizacie">Automatizácie/);
});

test("automation overview is category-first and source-only", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  const page = read("app/admin/automatizacie/page.tsx");
  for (const label of ["Podujatia", "Veterinári", "Útulky a organizácie", "Psie služby", "Adopcie", "Dočasná opatera", "Stratené / nájdené"]) {
    assert.ok(presentation.includes(label), label);
  }
  assert.match(page, /automationUxCategories\.map/);
  assert.match(page, /newCount/);
  assert.match(page, /approvedCount/);
  assert.match(page, /rejectedCount/);
  assert.doesNotMatch(page, /Pripravené návrhy|Koncepty a nálezy/);
});

test("existing technical entity types are hidden behind the explicit product category contract", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  const product = read("lib/data-automation-product-model.ts");
  assert.match(presentation, /automationProductCategoryForEntity/);
  assert.match(product, /entityType === "DIRECTORY"/);
  assert.match(product, /"veterinari"/);
  assert.match(product, /"psie-sluzby"/);
  assert.match(presentation, /automationCategoryForCandidate/);
  assert.match(presentation, /automationCategoryForDiscoveryRoot/);
});

test("category detail separates direct entities from recurring feed sources", () => {
  const component = read("components/admin-automation-category-sources.tsx");
  assert.match(component, /category\.mode === "DIRECT_ENTITY"/);
  assert.match(component, /Hľadať nových veterinárov/);
  assert.match(component, /Nové koncepty/);
  assert.match(component, /Kontrolovať doplnenia a zmeny/);
  assert.match(component, /Hľadať nové zdroje/);
  assert.match(component, /Nové zdroje/);
  assert.match(component, /Schválené zdroje/);
  assert.match(component, /Zamietnuté zdroje/);
  assert.doesNotMatch(component, /História|Pokročilé|Pripravené návrhy|Koncepty a nálezy/);
});

test("category page filters candidates and sources locally", () => {
  const page = read("app/admin/automatizacie/[category]/page.tsx");
  assert.match(page, /automationCandidatesForCategory\(allCandidates, slug\)/);
  assert.match(page, /automationSourcesForCategory\(allSources, slug\)/);
  assert.match(page, /automationDiscoveryRootsForCategory\(allRoots, slug\)/);
  const component = read("components/admin-automation-category-sources.tsx");
  assert.match(component, /candidate\.reviewStatus === "NEW" && candidate\.lifecycle === "ACTIVE"/);
});

test("new source list exposes only approve and reject", () => {
  const category = read("components/admin-automation-category-sources.tsx");
  const route = read("app/api/admin/automation-source-candidates/[id]/route.ts");
  assert.match(category, /"Schváliť"/);
  assert.match(category, /"Zamietnuť"/);
  assert.doesNotMatch(category, /Odložiť|Skontrolovať|novy-zdroj/);
  assert.match(category, /\/api\/admin\/automation-source-candidates\//);
  assert.match(route, /\["approve", "reject", "suppress"\]/);
});

test("legacy candidate detail redirects into the category source list", () => {
  const detailPage = read("app/admin/automatizacie/[category]/novy-zdroj/[id]/page.tsx");
  assert.match(detailPage, /automationCategoryBySlug/);
  assert.match(detailPage, /redirect\("\/admin\/automatizacie\/" \+ category \+ "#nove-zdroje"\)/);
});

test("global source manager remains available but is explicitly advanced", () => {
  const page = read("app/admin/automatizacie/zdroje/page.tsx");
  assert.match(page, /Pokročilé — všetky zdroje a discovery/);
  assert.match(page, /AdminAutomationSourceManager/);
});

test("automation unavailable schema has safe fallback and old overview redirects", () => {
  const overview = read("app/admin/automatizacie/page.tsx");
  const legacy = read("app/admin/operations/automation/page.tsx");
  assert.match(overview, /\.catch\(\(\) => \[\]\)/);
  assert.match(legacy, /redirect\("\/admin\/automatizacie"\)/);
});

test("finding presentation translates known technical fields", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  const finding = read("app/admin/operations/automation/[id]/page.tsx");
  assert.match(presentation, /startDate: "Dátum začiatku"/);
  assert.match(presentation, /websiteUrl: "Web podujatia"/);
  assert.match(finding, /automationFieldLabel\(field\)/);
});

test("automation shell includes responsive layouts and labelled category list", () => {
  const css = read("components/admin-operations-ux.module.css");
  const overview = read("app/admin/automatizacie/page.tsx");
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(overview, /aria-label="Kategórie automatizácií"/);
});
