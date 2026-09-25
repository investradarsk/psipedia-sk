import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin navigation exposes Automations as a top-level admin destination", () => {
  const shell = read("components/admin-shell.tsx");
  assert.match(shell, /href="\/admin\/automatizacie">Automatizácie/);
});

test("automation overview is category-first and includes categories without configured sources", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  const page = read("app/admin/automatizacie/page.tsx");
  for (const label of ["Podujatia", "Veterinári", "Útulky a organizácie", "Psie služby", "Adopcie", "Dočasná opatera", "Stratené / nájdené"]) {
    assert.ok(presentation.includes(label), label);
  }
  assert.match(page, /automationUxCategories\.map/);
  assert.match(page, /Čaká na nastavenie/);
});

test("existing technical entity types are hidden behind UX category mapping", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  assert.match(presentation, /source\.entityType === "DIRECTORY"/);
  assert.match(presentation, /"veterinari"/);
  assert.match(presentation, /"psie-sluzby"/);
});

test("category detail keeps technical information secondary and source labels human readable", () => {
  const page = read("app/admin/automatizacie/[category]/page.tsx");
  assert.match(page, /<h2>Nálezy<\/h2>/);
  assert.match(page, /<h2>Zdroje<\/h2>/);
  assert.match(page, /<h2>História<\/h2>/);
  assert.match(page, /Nastavenia \/ technické údaje/);
  assert.match(page, /<details/);
  assert.doesNotMatch(page, /Google|Facebook|Instagram/);
});

test("automation unavailable schema has safe fallback and old overview redirects", () => {
  const overview = read("app/admin/automatizacie/page.tsx");
  const legacy = read("app/admin/operations/automation/page.tsx");
  assert.match(overview, /catch \{ unavailable = true; \}/);
  assert.match(legacy, /redirect\("\/admin\/automatizacie"\)/);
});

test("finding presentation translates known technical fields", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  const finding = read("app/admin/operations/automation/[id]/page.tsx");
  assert.match(presentation, /startDate: "Dátum začiatku"/);
  assert.match(presentation, /websiteUrl: "Web podujatia"/);
  assert.match(finding, /automationFieldLabel\(field\)/);
});

test("mobile admin navigation keeps existing nowrap behavior", () => {
  const shell = read("components/admin-shell.tsx");
  assert.match(shell, /max-\[760px\]:flex-nowrap/);
});
