import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { geminiAutomationCatalog, geminiAutomationSections } from "../lib/gemini-automation-catalog.ts";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const dashboard = source("components/admin-gemini-automation-settings.tsx");
const dashboardPage = source("app/admin/automatizacie-gemini/page.tsx");
const overview = source("components/admin-gemini-all-concepts.tsx");
const overviewPage = source("app/admin/automatizacie-gemini/koncepty/page.tsx");
const css = source("components/admin-gemini-all-concepts.module.css");

test("Gemini V4 central list uses existing canonical catalog (10/6/6) and only category review endpoints", () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  assert.deepEqual(geminiAutomationSections.map(section =>
    geminiAutomationCatalog.filter(item => item.section === section.key).length), [10, 6, 6]);
  assert.match(overview, /geminiAutomationCatalog\.map\(\(item\) => item\.stableKey\)/);
  assert.match(overview, /\/api\/admin\/gemini-automation\/notion-drafts\?stable_key=/);
  assert.match(overview, /Promise\.all\(\[loadNext\(\), loadNext\(\)\]\)/);
  assert.match(overview, /credentials: "same-origin", cache: "no-store"/);
  assert.doesNotMatch(overview, /\/api\/admin\/gemini-automation\/run/);
  assert.doesNotMatch(overview, /method: "(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(overviewPage, /listPendingGeminiDirectoryConcepts|listPendingGeminiEventConcepts/);
  assert.match(overviewPage, /requireAdminPageUser/);
});

test("approved B presentation uses three compact sections and responsive rows", () => {
  assert.match(overview, /geminiAutomationSections\.map\(section/);
  assert.match(overview, /visible\.filter\(entry => entry\.item\.section === section\.key\)/);
  assert.match(overview, /styles\.rows/);
  assert.match(overview, /styles\.row/);
  assert.match(overview, /<input type="search"/);
  assert.match(overview, /<select value=\{category\}/);
  assert.match(overview, /<select value=\{status\}/);
  assert.match(css, /\.row \{ display: grid;/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(dashboard, /className=\{styles\.allConceptsCta\}/);
  assert.match(dashboard, /<strong>Všetky koncepty<\/strong>/);
});

test("overview never invents D1 editor IDs and communicates incomplete sources", () => {
  assert.match(overview, /geminiCanonicalEditorUrl\(draft\)/);
  assert.match(overview, /encodeURIComponent\(item\.stableKey\)/);
  assert.match(overview, /Object\.keys\(errors\)\.length/);
  assert.match(overview, /Zoznam nie je úplný/);
  assert.match(overview, /Načítavam kategórie/);
  assert.match(overview, /const complete = finished === keys\.length/);
  assert.match(dashboardPage, /getGeminiCatalogItem\(key\)/);
  assert.match(dashboardPage, /initialSelectedKey=\{initialSelectedKey\}/);
  assert.match(dashboard, /useState\(initialSelectedKey \?\? settings\[0\]\?\.stableKey/);
  assert.match(dashboard, /<AdminGeminiNotionDrafts key=\{selected\.stableKey\} stableKey=\{selected\.stableKey\}/);
});
