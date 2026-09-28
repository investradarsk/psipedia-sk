import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("cluster internals are not rendered in the primary source-management category", () => {
  const page = read("app/admin/automatizacie/[category]/page.tsx");
  assert.doesNotMatch(page, /listAutomationClusterSummaries|cluster\.sourceCount|Staršie nálezy bez cluster linkage/);
  assert.doesNotMatch(page, /Pokročilé|cluster\//);
});

test("cluster technical detail route remains available for debugging", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  assert.match(page, /sourceCount|Zdroj/);
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

test("canonical cluster linkage renders an admin destination and routes publishing through manual review", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  assert.match(page, /automationCanonicalAdminHref/);
  assert.match(page, /Záznam je prepojený s Psipediou/);
  assert.match(page, /\/admin\/operations\/automation\//);
  assert.match(page, /public publication zostáva manuálna/);
  assert.doesNotMatch(page, /setAutomationSourceEnabled|publishAutomation|auto.?publish/i);
});

test("finding with cluster gets context link and finding without cluster stays valid", () => {
  const page = read("app/admin/operations/automation/[id]/page.tsx");
  assert.match(page, /getAutomationClusterIdForFinding/);
  assert.match(page, /Pokročilé: technický kontext/);
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
  assert.match(page, /<details className=\{styles\.advanced\}>[\s\S]*<summary>Pokročilé<\/summary>/);
  assert.match(page, /<strong>Observations<\/strong>/);
  assert.ok(page.indexOf("<summary>Pokročilé</summary>") < page.indexOf("<strong>Observations</strong>"));
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.evidenceRow[\s\S]*grid-template-columns: 1fr/);
});
