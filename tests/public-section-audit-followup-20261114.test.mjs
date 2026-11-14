import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("homepage dog age uses Slovak decimal formatting and fractional grammar", () => {
  const calculator = read("components/dog-age-calculator.tsx");
  assert.match(calculator, /age\.toLocaleString\("sk-SK"/);
  assert.match(calculator, /!Number\.isInteger\(age\) \? "roka"/);
  assert.match(calculator, /\{formatDogAge\(age\)\}/);
});

test("article tags resolve their editorial section and archive remains the all-articles route", () => {
  const article = read("lib/article-card-presentation.ts");
  const archive = read("app/clanky/page.tsx");
  for (const section of ["steniatka", "starostlivost", "aktivity"]) {
    assert.match(article, new RegExp(`${section}: "/${section}"`));
  }
  assert.match(article, /section in editorialSectionHrefs/);
  assert.match(archive, /<UnifiedSectionHero\s+contentSource="route"/);
});

test("news guide is collapsible and date disclaimer depends on the visible update", () => {
  const news = read("components/news-hub.tsx");
  const detail = read("components/article-detail.tsx");
  assert.match(news, /<details className=\{styles\.guidance\} data-news-category-guidance>/);
  assert.match(news, /<summary>Čo tu nájdeš<\/summary>/);
  assert.match(detail, /\$\{showUpdated \? " Dátum poslednej úpravy je uvedený pri titulku\." : ""\}/);
});

test("most-read counts are derived from the actual qualified-read database field, not estimated", () => {
  const backend = read("lib/article-popularity.ts");
  const discovery = read("lib/article-discovery.ts");
  const sidebar = read("components/article-popularity-sidebar.tsx");
  assert.match(backend, /SUM\(h\.qualified_reads\) AS qualified_reads/);
  assert.match(discovery, /qualifiedReads: article\.qualifiedReads/);
  assert.match(sidebar, /typeof item\.qualifiedReads === "number"/);
  assert.match(sidebar, /Počet prečítaní:/);
});

test("breed details reuse expandable comparison explanations, without masking stored data", () => {
  const profile = read("app/plemena/[slug]/page.tsx");
  const fact = read("components/breed-measurement-fact.tsx");
  assert.match(profile, /<BreedMeasurementFact kind="weight"/);
  assert.match(profile, /<BreedMeasurementFact kind="lifespan"/);
  assert.match(fact, /breedComparisonValue\(value, kind\)/);
  assert.match(fact, /<summary>Zobraziť celú poznámku<\/summary>/);
  assert.match(fact, /\{display\.explanation\}/);
});
