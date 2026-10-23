import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const pages = [
  "app/admin/automatizacie/page.tsx",
  "app/admin/automatizacie/[category]/page.tsx",
  "app/admin/automatizacie/[category]/cluster/[id]/page.tsx",
  "app/admin/automatizacie/[category]/discovery/[id]/page.tsx",
  "app/admin/automatizacie/[category]/novy-zdroj/[id]/page.tsx",
  "app/admin/automatizacie/adresy/page.tsx",
  "app/admin/automatizacie/adresy/[id]/page.tsx",
  "app/admin/automatizacie/prehlad/page.tsx",
  "app/admin/automatizacie/zdroje/page.tsx",
  "app/admin/automatizacie/zdroje/[id]/page.tsx",
  "app/admin/automatizacie/zmeny-stavu/page.tsx",
  "app/admin/operations/automation/page.tsx",
  "app/admin/operations/automation/sources/page.tsx",
  "app/admin/operations/automation/sources/[id]/page.tsx"
];
const endpoints = [
  "app/api/admin/automation-categories/[category]/route.ts",
  "app/api/admin/automation-categories/[category]/search/route.ts",
  "app/api/admin/automation-discovery-roots/[id]/route.ts",
  "app/api/admin/automation-findings/[id]/route.ts",
  "app/api/admin/automation-lifecycle/[id]/route.ts",
  "app/api/admin/automation-match-reviews/[observationId]/[candidateClusterId]/route.ts",
  "app/api/admin/automation-match-reviews/[observationId]/[candidateClusterId]/apply/route.ts",
  "app/api/admin/automation-source-candidates/[id]/route.ts",
  "app/api/admin/automation-sources/route.ts",
  "app/api/admin/automation-sources/[id]/route.ts",
  "app/api/admin/automation-sources/[id]/run/route.ts",
  "app/api/admin/automation-sources/[id]/test/route.ts",
  "app/api/admin/automation-update-suggestions/[origin]/[id]/fields/[field]/route.ts",
  "app/api/admin/automation-address-reviews/[id]/route.ts"
];

test("legacy admin UI only redirects to approved replacement workflows", () => {
  for (const path of pages) {
    const content = read(path);
    assert.match(content, /redirect\("\/admin\/(automatizacie-gemini|kvalita)"\)/, path);
    assert.doesNotMatch(content, /runAutomation|listAutomation|TavilyAutomationSearchProvider/, path);
  }
});

test("legacy manual API cannot create, start, update or apply old automation runs", () => {
  const helper = read("lib/legacy-automation-retired.ts");
  assert.match(helper, /status: 410/);
  assert.match(helper, /private, no-store/);
  for (const path of endpoints) {
    const content = read(path);
    assert.match(content, /legacyAutomationRetiredResponse/, path);
    assert.doesNotMatch(content, /runAutomation|runDataAutomation|waitUntil|\.prepare\(/, path);
    for (const method of ["GET","POST","PUT","PATCH","DELETE"]) {
      assert.match(content, new RegExp("export async function " + method + "\\("), path);
    }
  }
});

test("single canonical Gemini navigation and new quality cron survive retirement", () => {
  const navigation = read("lib/admin-navigation.ts");
  const worker = read("worker/index.ts");
  const quality = read("lib/data-quality-missing-hourly.ts");
  assert.match(navigation, /label: "Automatizácie", href: "\/admin\/automatizacie-gemini"/);
  assert.doesNotMatch(navigation, /href: "\/admin\/automatizacie",/);
  assert.match(worker, /runQualityMissingHourly\(/);
  assert.match(worker, /runGeminiManualBackgroundSweep\(/);
  assert.doesNotMatch(worker, /runDataAutomationSweep\(/);
  assert.doesNotMatch(worker, /runDataAutomationDiscoverySweep\(/);
  assert.match(quality, /TavilyAutomationSearchProvider/);
  assert.match(quality, /isSafeAutomationSourceUrl/);
});
