import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Admin V5 stage 3 centralizes compact filter and pager rules in the existing stylesheet", () => {
  const layout = read("app/admin/layout.tsx");
  const lists = read("app/admin/admin-list-foundation.css");
  const global = read("app/admin/admin-compact-global.css");

  assert.match(layout, /import "\.\/admin-list-foundation\.css"/);
  assert.match(layout, /import "\.\/admin-compact-global\.css"/);
  assert.match(lists, /--admin-list-control-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(lists, /min-height: var\(--admin-list-control-height\)/);
  assert.match(lists, /min-width: var\(--admin-list-control-height\)/);
  assert.match(lists, /@media \(max-width: 820px\)/);
  assert.match(lists, /font-size: 16px/);
  assert.match(lists, /span\[aria-current="page"\]/);
  assert.match(lists, /min-height: 44px/);
  assert.match(lists, /min-width: 44px/);
  assert.doesNotMatch(global, /\[data-admin-list-pagination\]\s*\n\s*:is\(a, button/);
});

test("Admin V5 stage 3 preserves accessible table sorting, selection and mobile card switching", () => {
  const src = read("components/admin-record-table.tsx");
  const css = read("components/admin-record-table.module.css");
  for (const contract of [
    "getIsAllPageRowsSelected()", "toggleAllPageRowsSelected(checked)",
    "row.toggleSelected(checked)", "onColumnVisibilityChange: setVisibility",
    "manualSorting: serverSorted || Boolean(serverSorting)",
    "getSortedRowModel: serverSorted || serverSorting ? undefined : clientSortedRowModel",
    "setCompactView(current => !current)",
    'data-sticky-actions={stickyActions ? "true" : undefined}',
  ]) assert.ok(src.includes(contract), contract);
  assert.match(src, /aria-sort=\{header\.column\.getIsSorted\(\)/);
  assert.match(src, /role="region" aria-label=\{label \+ " – tabuľka"\} tabIndex=\{0\}/);
  assert.match(css, /height: 38px/);
  assert.match(css, /\.workspace\[data-mobile-focus="true"\] \.scroll \{ overflow: visible; \}/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.columnPickerMenu label \{[\s\S]*?min-height: 44px;/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.workspace \.heading button \{[\s\S]*?min-height: 44px;/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
});

test("Admin V5 stage 3 retains server and client pagination with original filter URLs", () => {
  const pager = read("components/admin-pagination.tsx");
  const article = read("components/admin-dashboard.tsx");
  const breed = read("components/admin-breed-dashboard.tsx");
  const event = read("components/admin-event-dashboard.tsx");
  const directory = read("components/admin-directory-dashboard.tsx");
  const help = read("components/admin-help-dashboard.tsx");

  assert.equal((pager.match(/prefetch=\{false\}/g) ?? []).length, 5);
  assert.match(pager, /href=\{pageHref\(basePath, next\)\}/);
  assert.match(pager, /hrefForPage\(page \+ 1\)/);
  assert.match(article, /method="get" action=\{routePath\} role="search" data-admin-article-filters data-admin-list-filters/);
  assert.match(directory, /action=\{basePath\} method="get" role="search" data-admin-list-filters/);
  assert.match(breed, /onClick=\{\(\) => changePage\(pageData\.page \+ 1\)\}/);
  assert.match(event, /setPage\(currentPage \+ 1\)/);
  assert.match(help, /data-admin-list-pagination/);
});
