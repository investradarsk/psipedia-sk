import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("all main content lists have a mobile advanced-filter disclosure", () => {
  for (const [path, id] of [
    ["components/admin-dashboard.tsx", "admin-article-advanced-filters"],
    ["components/admin-directory-dashboard.tsx", "admin-directory-advanced-filters"],
    ["components/admin-event-dashboard.tsx", "admin-event-advanced-filters"],
    ["components/admin-breed-dashboard.tsx", "admin-breed-advanced-filters"],
    ["components/admin-adoption-dashboard.tsx", "admin-adoption-advanced-filters"],
  ]) {
    const source = read(path);
    assert.ok(source.includes('id="' + id + '"'), path);
    assert.match(source, /aria-expanded=\{advancedFiltersOpen\}/, path);
    assert.match(source, /setAdvancedFiltersOpen/, path);
    assert.match(source, /data-expanded=\{advancedFiltersOpen\}/, path);
  }
});

test("mobile filter disclosure is optional and does not remove form inputs", () => {
  for (const path of [
    "components/admin-article-dashboard.module.css",
    "components/admin-directory-dashboard.module.css",
    "components/admin-event-dashboard.module.css",
    "components/admin-breed-dashboard.module.css",
    "components/admin-lost-found.module.css",
  ]) {
    const css = read(path);
    assert.match(css, /\.advancedFilters/, path);
    assert.match(css, /\[data-expanded="true"\]/, path);
    assert.match(css, /min-height:\s*44px/, path);
  }
  const adoption = read("components/admin-adoption-dashboard.tsx");
  assert.match(adoption, /<button type="submit">Filtrovať<\/button>/);
  const directory = read("components/admin-directory-dashboard.tsx");
  assert.match(directory, /name="category"/);
  assert.match(directory, /name="verification"/);
});

test("shared record tables keep their full-column fallback and mobile selection", () => {
  const table = read("components/admin-record-table.tsx");
  const css = read("components/admin-record-table.module.css");
  assert.match(table, /useSyncExternalStore/);
  assert.match(table, /getServerNarrowTableSnapshot/);
  assert.match(table, /data-mobile-focus=\{mobileFocus\}/);
  assert.match(table, /Všetky stĺpce/);
  assert.match(table, /className=\{styles\.mobileSelectAll\}/);
  assert.match(table, /"completeness"/);
  assert.match(table, /!mobileFocus && <thead>/);
  assert.match(table, /setCompactView/);
  assert.match(table, /onColumnVisibilityChange: setVisibility/);
  assert.match(table, /onRowSelectionChange:/);
  assert.match(table, /manualSorting:/);
  assert.match(css, /data-mobile-focus="true"/);
  assert.match(css, /data-column-label/);
});

test("the service editor does not keep a full-height sticky top or save overlay on mobile", () => {
  const directory = read("components/admin-directory-editor.module.css");
  const service = read("components/admin-service-catalog.module.css");
  const topFix = directory.split("ADMIN-UNIFIED-UI 5+7/10")[1];
  assert.match(topFix, /position:\s*static/);
  assert.match(topFix, /\.toplineActions/);
  assert.match(service, /max-height:\s*none/);
  assert.match(service, /\.profileCard :global\(\[data-editor-actionbar\]\) \{[\s\S]*?position:\s*static/);
  const values = read("components/admin-service-profile-values.tsx");
  assert.match(values, /Technické informácie o ukladaní/);
  assert.match(values, /<EditorActionBar/);
  assert.match(values, /<EditorUnsavedChangesGuard/);
});

test("technical sync messages have compact disclosures without hiding their data", () => {
  const ops = read("app/admin/operations/page.tsx");
  assert.match(ops, /<details className=\{styles\.notionAlerts\}>/);
  assert.match(ops, /notionAlerts\.map/);
  const css = read("components/admin-operations-ux.module.css");
  assert.match(css, /\.notionAlertMessage/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  const breeds = read("components/admin-breed-workcopy-live-status.tsx");
  assert.match(breeds, /admin-sync-disclosure/);
  assert.match(breeds, /Obnoviť živý stav D1/);
});


test("article names remain accessible headings and admin slug contrast meets WCAG AA", () => {
  const article = read("components/admin-dashboard.tsx");
  assert.match(article, /<h2 className=\{styles\.gridTitle\}>/);
  assert.match(article, /advancedFiltersOpen, setAdvancedFiltersOpen\] = useState\(true\)/);
  const breed = read("components/admin-breed-dashboard.tsx");
  assert.match(breed, /advancedFiltersOpen, setAdvancedFiltersOpen\] = useState\(true\)/);
  const organization = read("components/admin-organization-publication.module.css");
  assert.match(organization, /\.gridIdentity small \{ color: #52695c/);
  assert.doesNotMatch(organization, /\.gridIdentity small \{ color: #728379/);
});

test("local Vite watcher ignores Playwright output so admin hydration is not interrupted", () => {
  const config = read("vite.config.ts");
  assert.match(config, /watch:\s*\{/);
  assert.match(config, /ignored:\s*\[/);
  for (const directory of [".e2e-artifacts", "playwright-report", "test-results"]) {
    assert.ok(
      config.includes(`"**/${directory}/**"`),
      `Vite must not trigger a full-page reload when ${directory} changes`,
    );
  }
  // Keep the existing Seatbelt polling configuration while ignoring reports.
  assert.match(config, /isCodexSeatbeltSandbox[\s\S]{0,120}useFsEvents: false, usePolling: true/);
});
