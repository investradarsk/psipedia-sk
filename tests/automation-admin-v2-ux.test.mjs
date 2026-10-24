import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin navigation exposes Automations as a top-level admin destination — po vyradení starého systému", () => {
  const navigation=read("lib/admin-navigation.ts");
  assert.match(navigation, /label: "Automatizácie", href: "\/admin\/automatizacie-gemini"/);
  assert.doesNotMatch(navigation, /href: "\/admin\/automatizacie",/);
});

test("automation overview is category-first and source-only — po vyradení starého systému", () => {
  const page = read("app/admin/automatizacie/page.tsx");
  assert.match(page, /redirect\("\/admin\/automatizacie-gemini"\)/);
  assert.doesNotMatch(page, /automationUxCategories\.map|newCount|approvedCount|rejectedCount/);
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

test("category page filters candidates and sources locally — po vyradení starého systému", () => {
  const page=read("app/admin/automatizacie/[category]/page.tsx");
  assert.match(page,/redirect\("\/admin\/automatizacie-gemini"\)/);
  assert.doesNotMatch(page,/listAutomationSourcesAdmin|automationCandidatesForCategory/);
});

test("new source list exposes only approve and reject — po vyradení starého systému", () => {
  const route=read("app/api/admin/automation-source-candidates/[id]/route.ts");
  const helper=read("lib/legacy-automation-retired.ts");
  assert.match(route,/legacyAutomationRetiredResponse/);
  assert.match(helper,/status: 410/);
  assert.doesNotMatch(route,/reviewAutomationSourceCandidate|reviewAutomationSource/);
});

test("legacy candidate detail redirects into the category source list — po vyradení starého systému", () => {
  const detail=read("app/admin/automatizacie/[category]/novy-zdroj/[id]/page.tsx");
  assert.match(detail,/redirect\("\/admin\/automatizacie-gemini"\)/);
});

test("global source manager remains available but is explicitly advanced — po vyradení starého systému", () => {
  const page=read("app/admin/automatizacie/zdroje/page.tsx");
  assert.match(page,/redirect\("\/admin\/automatizacie-gemini"\)/);
  assert.doesNotMatch(page,/AdminAutomationSourceManager/);
});

test("automation unavailable reads use explicit reliability state and old overview redirects — po vyradení starého systému", () => {
  const overview=read("app/admin/automatizacie/page.tsx");
  const reliability=read("lib/admin-automation-reliability.ts");
  const old=read("app/admin/operations/automation/page.tsx");
  assert.match(overview,/redirect\("\/admin\/automatizacie-gemini"\)/);
  assert.match(old,/redirect\("\/admin\/automatizacie-gemini"\)/);
  assert.match(reliability,/"OK", "EMPTY", "PARTIAL", "UNAVAILABLE"/);
});

test("finding presentation translates known technical fields — po vyradení starého systému", () => {
  const presentation=read("lib/admin-automation-presentation.ts");
  const detail=read("app/admin/operations/automation/[id]/page.tsx");
  assert.match(presentation,/startDate: "Dátum začiatku"/);
  assert.match(presentation,/websiteUrl: "Web podujatia"/);
  assert.match(detail,/redirect\("\/admin\/automatizacie-gemini"\)/);
});

test("automation shell includes responsive layouts and labelled category list — po vyradení starého systému", () => {
  const css=read("components/admin-operations-ux.module.css");
  const overview=read("app/admin/automatizacie/page.tsx");
  assert.match(css,/@media \(max-width: 860px\)/);
  assert.match(css,/@media \(max-width: 640px\)/);
  assert.match(overview,/redirect\("\/admin\/automatizacie-gemini"\)/);
});

