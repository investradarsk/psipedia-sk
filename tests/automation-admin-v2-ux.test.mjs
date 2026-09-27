import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin navigation exposes Automations as a top-level admin destination", () => {
  const shell = read("components/admin-shell.tsx");
  assert.match(shell, /href="\/admin\/automatizacie">Automatizácie/);
});

test("automation overview is category-first and attention-first", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  const page = read("app/admin/automatizacie/page.tsx");
  for (const label of ["Podujatia", "Veterinári", "Útulky a organizácie", "Psie služby", "Adopcie", "Dočasná opatera", "Stratené / nájdené"]) {
    assert.ok(presentation.includes(label), label);
  }
  assert.match(page, /automationUxCategories\.map/);
  assert.match(page, /na rozhodnutie/);
  assert.match(page, /automationCandidateAttentionCount/);
  assert.match(page, /automationSourceAttentionCount/);
  assert.match(page, /nové zdroje/);
  assert.doesNotMatch(page, /Pripravené návrhy|Koncepty a nálezy/);
});

test("existing technical entity types are hidden behind UX category mapping", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  assert.match(presentation, /entityType === "DIRECTORY"/);
  assert.match(presentation, /"veterinari"/);
  assert.match(presentation, /"psie-sluzby"/);
  assert.match(presentation, /automationCategoryForCandidate/);
  assert.match(presentation, /automationCategoryForDiscoveryRoot/);
});

test("category detail follows final product order and keeps technical information secondary", () => {
  const page = read("app/admin/automatizacie/[category]/page.tsx");
  const newSources = page.indexOf("<h2>Našli sa nové zdroje</h2>");
  const sources = page.indexOf("<h2>Zdroje</h2>");
  const history = page.indexOf("<h2>História</h2>");
  const advanced = page.indexOf("<summary>Pokročilé</summary>");
  assert.ok(newSources >= 0 && sources > newSources && history > sources && advanced > history);
  assert.doesNotMatch(page, /Pripravené návrhy|Koncepty a nálezy/);
  assert.match(page, /Automatické hľadanie zdrojov/);
  assert.match(page, /technickú správu zdrojov a automatického hľadania/);
  assert.doesNotMatch(page, /<h2>Hotové koncepty<\/h2>/);
});

test("category page filters candidates and sources locally", () => {
  const page = read("app/admin/automatizacie/[category]/page.tsx");
  assert.match(page, /automationCandidatesForCategory\(allCandidates, slug\)/);
  assert.match(page, /automationSourcesForCategory\(allSources, slug\)/);
  assert.match(page, /automationDiscoveryRootsForCategory\(allRoots, slug\)/);
  assert.match(page, /candidate\.reviewStatus === "NEW" && candidate\.lifecycle === "ACTIVE"/);
});

test("new source list has one review CTA and detail reuses existing candidate API semantics", () => {
  const category = read("app/admin/automatizacie/[category]/page.tsx");
  const detail = read("components/admin-automation-candidate-review.tsx");
  const route = read("app/api/admin/automation-source-candidates/[id]/route.ts");
  assert.match(category, />Skontrolovať<\/Link>/);
  assert.match(category, /\/novy-zdroj\//);
  assert.match(detail, />ÁNO — používať<\/button>/);
  assert.match(detail, />NIE — nepoužívať<\/button>/);
  assert.match(detail, />Odložiť 30 dní<\/button>/);
  assert.match(detail, /\/api\/admin\/automation-source-candidates\//);
  assert.match(route, /\["approve", "reject", "suppress"\]/);
});

test("candidate detail is guarded by category mapping and uses a read-only selector", () => {
  const detailPage = read("app/admin/automatizacie/[category]/novy-zdroj/[id]/page.tsx");
  const store = read("lib/data-automation-source-store.ts");
  assert.match(detailPage, /getAutomationSourceCandidate/);
  assert.match(detailPage, /automationCategoryForCandidate\(candidate\) !== slug/);
  assert.match(store, /export async function getAutomationSourceCandidate/);
  assert.match(store, /SELECT \* FROM automation_source_candidates WHERE id=\? LIMIT 1/);
});

test("global source manager remains available but is explicitly advanced", () => {
  const page = read("app/admin/automatizacie/zdroje/page.tsx");
  assert.match(page, /Pokročilé — všetky zdroje a discovery/);
  assert.match(page, /AdminAutomationSourceManager/);
});

test("automation unavailable schema has safe fallback and old overview redirects", () => {
  const overview = read("app/admin/automatizacie/page.tsx");
  const legacy = read("app/admin/operations/automation/page.tsx");
  assert.match(overview, /catch \{\s+unavailable = true;\s+\}/);
  assert.match(legacy, /redirect\("\/admin\/automatizacie"\)/);
});

test("finding presentation translates known technical fields", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  const finding = read("app/admin/operations/automation/[id]/page.tsx");
  assert.match(presentation, /startDate: "Dátum začiatku"/);
  assert.match(presentation, /websiteUrl: "Web podujatia"/);
  assert.match(finding, /automationFieldLabel\(field\)/);
});

test("automation shell includes responsive and accessible navigation states", () => {
  const css = read("components/admin-operations-ux.module.css");
  const category = read("app/admin/automatizacie/[category]/page.tsx");
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(category, /aria-label="Sekcie automatizácie"/);
});
