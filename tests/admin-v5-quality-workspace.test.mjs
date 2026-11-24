import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("V5-05 renders the same compact tabs on all quality routes", () => {
  const nav = read("components/admin-quality-workspace-tabs.tsx");
  const registry = read("lib/admin-quality-workspace.ts");
  for (const href of [
    "/admin/kvalita", "/admin/kvalita/prehlad", "/admin/kvalita/seo", "/admin/kontrola-odkazov",
  ]) assert.ok(registry.includes('"' + href + '"'), href);
  assert.ok(nav.includes('aria-current={active === section.id ? "page" : undefined}'));
  assert.ok(nav.includes("prefetch={false}"));
  for (const [path, active] of [
    ["app/admin/kvalita/page.tsx", "findings"],
    ["app/admin/kvalita/prehlad/page.tsx", "missing"],
    ["app/admin/kvalita/seo/page.tsx", "seo"],
    ["app/admin/kontrola-odkazov/page.tsx", "links"],
  ]) {
    const page = read(path);
    assert.ok(page.includes('<AdminQualityWorkspaceTabs active="' + active + '" />'), path);
    assert.ok(page.includes("requireAdminPageUser("), path);
  }
  const css = read("components/admin-quality-workspace-tabs.module.css");
  assert.ok(css.includes("min-height: 44px"));
  assert.ok(css.includes("flex-wrap: wrap"));
});

test("V5-05 keeps proposals, manual review, history and cursor pagination intact", () => {
  const page = read("app/admin/kvalita/page.tsx");
  const dashboard = read("components/admin-missing-quality-dashboard.tsx");
  assert.ok(page.includes("loadMissingQualityDashboard(getQualityMissingDatabase(), { before })"));
  for (const fragment of [
    "data.manualHistory", "data.nextBefore", 'decide(p,"accept")', 'decide(p,"reject")',
    "runManualSearch()", 'method:"POST"',
  ]) assert.ok(dashboard.includes(fragment), fragment);
});

test("V5-05 preserves missing-data and SEO query filters and pagination", () => {
  const missing = read("app/admin/kvalita/prehlad/page.tsx");
  const seo = read("app/admin/kvalita/seo/page.tsx");
  assert.ok(missing.includes("loadMissingDataOverview(getQualityMissingDatabase(),filters)"));
  assert.ok(missing.includes('action="/admin/kvalita/prehlad"'));
  for (const key of ["area", "category", "field", "state", "q"]) {
    assert.ok(missing.includes('name="' + key + '"'), key);
  }
  assert.ok(missing.includes("overviewHref(filters,{page:result.page+1})"));
  assert.ok(seo.includes("loadAdminSeoQualityAudit("));
  assert.ok(seo.includes('action="/admin/kvalita/seo"'));
  for (const key of ["q", "agenda", "scope", "issue"]) {
    assert.ok(seo.includes('name="' + key + '"'), key);
  }
  assert.ok(seo.includes("auditHref(filterState, { page: report.pagination.page + 1 })"));
});

test("V5-05 link scan runs only on click and retains JSON export", () => {
  const checker = read("components/admin-link-health-checker.tsx");
  const page = read("app/admin/kontrola-odkazov/page.tsx");
  assert.ok(page.includes("<AdminLinkHealthChecker />"));
  assert.ok(checker.includes("onClick={() => void runScan()}"));
  assert.ok(checker.includes("onClick={saveReport}"));
  assert.ok(!page.includes("runScan("));
});

test("V5-05 Mapy remain independent and advanced links do not trigger paid operations", () => {
  const mapPage = read("app/admin/mapy/page.tsx");
  const toolsPage = read("app/admin/nastroje/page.tsx");
  const dashboard = read("components/admin-geo-operator-dashboard.tsx");
  for (const key of ["group", "category", "q", "page", "pageSize"]) {
    assert.ok(mapPage.includes("params." + key), key);
  }
  assert.ok(mapPage.includes("loadGeoAdminOperatorProfiles("));
  assert.ok(mapPage.includes("data-admin-maps-advanced"));
  assert.ok(mapPage.includes("<AdminGooglePlacesApiLink compact />"));
  assert.ok(dashboard.includes("<AdminGooglePlacePicker"));
  assert.ok(dashboard.includes("onClick={() => void runBulk()}"));
  assert.ok(toolsPage.includes('data-admin-content-module="technical-tools"'));
  assert.ok(toolsPage.includes("data-admin-advanced-tools"));
  for (const href of [
    "/admin/import", "/admin/nastroje/notion-audit", "/admin/operations/outreach",
    "/admin/nastroje/geo", "/admin/nastroje/google-places",
    "/admin/nastroje/address-enrichment", "/admin/nastroje/address-research-import",
  ]) assert.ok(toolsPage.includes('href="' + href + '"'), href);
  for (const source of [mapPage, toolsPage]) {
    assert.ok(!source.includes("fetch("));
    assert.ok(!source.includes("runBulk("));
    assert.ok(!source.includes("geocode("));
  }
});
