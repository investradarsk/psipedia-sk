import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("cluster list renders one logical entity with source count and legacy fallback", () => {
  const page = read("app/admin/automatizacie/[category]/page.tsx");
  assert.match(page, /listAutomationClusterSummaries/);
  assert.match(page, /cluster\.sourceCount/);
  assert.match(page, /logických entít/);
  assert.match(page, /Staršie nálezy bez cluster linkage/);
});

test("single-source clusters remain normal logical entities", () => {
  const page = read("app/admin/automatizacie/[category]/page.tsx");
  assert.match(page, /cluster\.sourceCount === 1/);
  assert.match(page, />1 zdroj</);
});

test("cluster detail exposes conflicts and high-impact emphasis", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  const css = read("components/admin-operations-ux.module.css");
  assert.match(page, /Konflikty/);
  assert.match(page, /conflict\.impact === "HIGH"/);
  assert.match(css, /\.conflictHigh/);
});

test("preferred evidence and supporting sources are visible", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  assert.match(page, /item\.isPreferred/);
  assert.match(page, /potvrdené \{sourceCount\} zdrojmi/);
  assert.match(page, /first seen/);
  assert.match(page, /last seen/);
  assert.match(page, /authority/);
  assert.match(page, /confidence/);
});

test("canonical cluster linkage renders an admin destination without auto publish", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  assert.match(page, /automationCanonicalAdminHref/);
  assert.match(page, /Canonical záznam ešte neexistuje/);
  assert.doesNotMatch(page, /publish|zverejni/i);
});

test("finding with cluster gets context link and finding without cluster stays valid", () => {
  const page = read("app/admin/operations/automation/[id]/page.tsx");
  assert.match(page, /getAutomationClusterIdForFinding/);
  assert.match(page, /Zobraziť kontext logickej entity/);
  assert.match(page, /clusterId && categorySlug/);
});

test("POSSIBLE match is read-only and never auto-merged", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  assert.match(page, /Možná zhoda \/ duplicita/);
  assert.match(page, /automaticky nespájajú/);
  assert.match(page, /rozhodnutie.*zatiaľ nie je implementované/i);
  assert.doesNotMatch(page, /approve.*match|merge.*cluster/i);
});

test("source authority is secondary and human readable", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  const presentation = read("lib/admin-automation-presentation.ts");
  assert.match(page, /Source authority je iba signál/);
  assert.match(presentation, /OFFICIAL_REGISTRY: "Register"/);
  assert.match(presentation, /SECONDARY_DIRECTORY: "Sekundárny zdroj"/);
});

test("read model uses bounded aggregate and batch loading instead of per-row N+1", () => {
  const store = read("lib/data-automation-cluster-admin.ts");
  assert.match(store, /LIMIT \?/);
  assert.match(store, /await db\.batch\(statements\)/);
  assert.match(store, /WHERE e\.cluster_id IN/);
});

test("cluster detail has responsive evidence layout and technical data remains collapsed", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  const css = read("components/admin-operations-ux.module.css");
  assert.match(page, /<details className=\{styles\.advanced\}><summary>Technické údaje<\/summary>/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.evidenceRow[\s\S]*grid-template-columns: 1fr/);
});
