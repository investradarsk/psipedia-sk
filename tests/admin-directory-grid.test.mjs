import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("services opens category navigation and the paginated canonical profile loader", () => {
  const page = read("app/admin/sluzby-pre-psov/page.tsx");
  const hub = read("components/admin-directory-module-nav.tsx");
  assert.match(page, /getManagedDirectoryAdminPage\(filters\)/);
  assert.match(page, /<AdminDirectoryCategoryNav selected=\{filters.category\}/);
  assert.match(hub, /allDirectoryCategories\.map/);
  assert.match(hub, /\/admin\/sluzby-pre-psov\/katalog/);
  assert.match(hub, /\/admin\/adresar\/navrhy/);
});

test("directory, help and events all use the same read-first TanStack grid", () => {
  const grid = read("components/admin-record-table.tsx");
  assert.match(grid, /@tanstack\/react-table/);
  assert.match(grid, /getSortedRowModel/);
  assert.match(grid, /getToggleVisibilityHandler/);
  assert.match(grid, /getResizeHandler/);
  assert.doesNotMatch(grid, /contentEditable|fetch\(|method=["'](?:PUT|POST|PATCH|DELETE)/);
  for (const dashboardName of ["admin-directory-dashboard", "admin-help-dashboard", "admin-event-dashboard"]) {
    const ui = read("components/" + dashboardName + ".tsx");
    assert.match(ui, /<AdminRecordTable/);
  }
});

test("all canonical actions and versioned mutation endpoints stay owned by existing modules", () => {
  const directory = read("components/admin-directory-dashboard.tsx");
  const help = read("components/admin-help-dashboard.tsx");
  const events = read("components/admin-event-dashboard.tsx");
  assert.match(directory, /changeReviewed\(profile/);
  assert.match(directory, /removeProfile\(profile/);
  const editorLink = read("components/admin-directory-editor-link.tsx");
  assert.match(directory, /<AdminDirectoryEditorLink profileId=\{profile.id\}/);
  assert.match(editorLink, /\/admin\/adresar\/\$\{profileId\}/);
  assert.match(editorLink, /<a href=\{`\/admin\/adresar\/\$\{profileId\}`\}/);
  assert.doesNotMatch(editorLink, /onClick|window\.location\.assign/);
  assert.match(help, /prepareBulk\("published"\)/);
  assert.match(help, /\/api\/admin\/help\/bulk/);
  assert.match(events, /fetchAdminEventPage\(filters, page/);
  assert.match(events, /\/api\/admin\/events\/bulk/);
  assert.match(events, /\/admin\/podujatia\/\$\{event.id\}/);
});

test("the sidebar groups all three modules within Adresár", () => {
  const nav = read("lib/admin-navigation.ts");
  const start = nav.indexOf('{ label: "Adresár", items: [');
  const end = nav.indexOf('] },', start);
  const group = nav.slice(start, end);
  for (const path of ["/admin/sluzby-pre-psov", "/admin/pomoc-psom", "/admin/podujatia"]) {
    assert.ok(group.includes(path), path);
  }
});
