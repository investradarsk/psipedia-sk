import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const dashboards = [
  "components/admin-dashboard.tsx",
  "components/admin-breed-dashboard.tsx",
  "components/admin-event-dashboard.tsx",
  "components/admin-directory-dashboard.tsx",
];

test("Step 8: admin-only list tokens are imported after the canonical editorial foundation", () => {
  const layout = read("app/admin/layout.tsx");
  const foundation = read("app/admin/admin-list-foundation.css");
  assert.match(layout, /import "\.\/admin-editorial-foundation\.css";\s*import "\.\/admin-list-foundation\.css";/);
  assert.match(foundation, /\[data-admin-workspace\]\s*\{/);
  assert.match(foundation, /--admin-list-filter-gap:/);
  assert.match(foundation, /--admin-list-pager-gap:/);
  assert.match(foundation, /--admin-list-control-height:\s*var\(--admin-ui-control-height, 44px\)/);
  assert.doesNotMatch(foundation, /overflow-x:\s*hidden/);
  assert.doesNotMatch(foundation, /(?:body|html)\s*\{[^}]*overflow/s);
});

test("Step 8: all four canonical lists share filter, advanced and result styling without replacing their data models", () => {
  for (const path of dashboards) {
    const src = read(path);
    assert.match(src, /data-admin-list-filters/, path);
    assert.match(src, /data-admin-list-advanced/, path);
    assert.match(src, /data-admin-list-results/, path);
    assert.match(src, /aria-expanded=\{advancedFiltersOpen\}/, path);
  }
  const breeds = read("components/admin-breed-dashboard.tsx");
  const events = read("components/admin-event-dashboard.tsx");
  const directory = read("components/admin-directory-dashboard.tsx");
  const articles = read("components/admin-dashboard.tsx");
  assert.match(breeds, /role="search" aria-label="Filtre plemien"/);
  assert.match(events, /data-admin-list-filters disabled=\{!hydrated \|\| busy\}/);
  assert.match(events, /setSettledSearch\(filters\.query\)/);
  assert.match(directory, /action=\{basePath\} method="get" role="search" data-admin-list-filters/);
  assert.match(articles, /method="get" action=\{routePath\} role="search" data-admin-article-filters data-admin-list-filters/);
});

test("Step 8: URL pagers stay link-based and client pagers stay button-based", () => {
  const shared = read("components/admin-pagination.tsx");
  const breeds = read("components/admin-breed-dashboard.tsx");
  const events = read("components/admin-event-dashboard.tsx");
  const directory = read("components/admin-directory-dashboard.tsx");
  const articles = read("components/admin-dashboard.tsx");
  assert.match(shared, /data-admin-list-pagination/g);
  assert.match(shared, /prefetch=\{false\}/);
  assert.match(shared, /aria-current="page" aria-live="polite" aria-atomic="true"/);
  assert.match(shared, /href=\{pageHref\(basePath, next\)\}/);
  assert.match(breeds, /data-admin-list-pagination/);
  assert.match(breeds, /onClick=\{\(\) => changePage\(pageData\.page \+ 1\)\}/);
  assert.match(breeds, /aria-live="polite" aria-atomic="true"/);
  assert.match(events, /data-admin-list-pagination/);
  assert.match(events, /setPage\(currentPage \+ 1\)/);
  assert.match(events, /disabled=\{!hydrated \|\| busy \|\| loading \|\| currentPage === pages\}/);
  assert.match(directory, /<AdminPagination pagination=\{pagination\}/);
  assert.match(articles, /<AdminPagination pagination=\{pagination\}/);
});

test("Step 8: pagination actions remain accessible and never shrink below 44px", () => {
  const css = read("app/admin/admin-list-foundation.css");
  assert.match(css, /\[data-admin-list-pagination\] \:where\(a, button, span\[aria-disabled="true"\]/);
  assert.match(css, /min-height:\s*var\(--admin-list-control-height\)/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /\:where\(button:disabled, span\[aria-disabled="true"\]\)/);
  assert.match(css, /\:where\(a, button\):focus-visible/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /font-size:\s*16px/);
});

test("Step 8: table toolbar cannot widen document and card/table switching remains intact", () => {
  const table = read("components/admin-record-table.tsx");
  const css = read("components/admin-record-table.module.css");
  assert.match(table, /data-density=\{density\} data-mobile-focus=\{mobileFocus\}/);
  assert.match(table, /role="region" aria-label=\{label \+ " – tabuľka"\} tabIndex=\{0\}/);
  assert.match(table, /setCompactView\(current => !current\)/);
  assert.match(table, /data-column-id=\{cell\.column\.id\}/);
  assert.match(css, /ADMIN-LISTS STEP 8/);
  assert.match(css, /\.columnPickerMenu\s*\{[\s\S]*?max-width: min\(320px, calc\(100dvw - 32px\)\)/);
  assert.match(css, /\.scroll\s*\{[\s\S]*?max-width: 100%/);
  assert.match(css, /\.workspace\[data-mobile-focus="true"\] \.scroll \{ overflow: visible; \}/);
  assert.match(css, /\.workspace\[data-sticky-actions="true"\]/);
});
