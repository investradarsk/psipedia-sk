import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Admin V5 reuses the admin-only CSS layer and centralizes compact table density", () => {
  const layout = source("app/admin/layout.tsx");
  const global = source("app/admin/admin-compact-global.css");
  const records = source("components/admin-record-table.module.css");

  assert.match(layout, /import "\.\/admin-compact-global\.css";/);
  assert.match(global, /--admin-ui-control-height:\s*38px/);
  assert.match(global, /--admin-ui-panel-padding:\s*\.55rem/);
  assert.match(global, /box-shadow:\s*none/);
  assert.match(records, /@media \(min-width:\s*821px\)/);
  assert.match(records, /height:\s*38px/);
  assert.match(records, /\.workspace\[data-density="compact"\] \.table td/);
  assert.doesNotMatch(global, /\[data-density="compact"\] table\[class\]/);
});

test("Admin V5 retains comfortable mobile touch targets and prevents text-input zoom", () => {
  const global = source("app/admin/admin-compact-global.css");
  const records = source("components/admin-record-table.module.css");
  const forms = source("app/admin/admin-unified-forms.css");
  const pagination = source("app/admin/admin-list-foundation.css");

  assert.match(global, /@media \(max-width:\s*820px\)[\s\S]*--admin-ui-control-height:\s*44px/);
  assert.match(global, /font-size:\s*16px/);
  assert.match(records, /\.mobileViewToggle[\s\S]*?min-height:\s*44px/);
  assert.match(records, /\.mobileSelectAll[\s\S]*?min-height:\s*44px/);
  assert.match(records, /data-mobile-focus="true"/);
  assert.match(pagination, /@media \(max-width:\s*820px\)[\s\S]*min-width:\s*44px/);
  assert.match(forms, /@media \(max-width:\s*820px\)[\s\S]*font-size:\s*16px/);
});

test("Admin V5 preserves TanStack sorting, selection, resize, sticky actions and exit guards", () => {
  const records = source("components/admin-record-table.tsx");
  const shell = source("components/admin-shell.tsx");
  const guard = source("components/admin-editor-navigation-guard.tsx");
  const workspace = source("components/admin-editor-workspace.tsx");
  const shellCss = source("components/admin-shell.module.css");

  for (const contract of [
    "toggleAllPageRowsSelected", "toggleSelected",
    "manualSorting: serverSorted || Boolean(serverSorting)",
    "onColumnVisibilityChange: setVisibility", 'columnResizeMode: "onEnd"',
    'data-sticky-actions={stickyActions ? "true" : undefined}',
    "data-mobile-focus={mobileFocus}",
  ]) assert.ok(records.includes(contract), contract);

  assert.match(records, /getRowId:\s*recordRowId/);
  assert.match(shell, /<AdminBreadcrumbs \/>/);
  assert.match(shell, /<AdminQuickNavigation \/>/);
  assert.match(shell, /data-admin-topbar/);
  assert.match(guard, /data-admin-unsaved-editor/);
  assert.match(workspace, /useAdminEditorNavigationGuard/);
  assert.match(shellCss, /\.topbarSticky \{ min-height: 60px; padding: 8px 64px 8px 12px; \}/);
  assert.doesNotMatch(shellCss, /overflow-x:\s*hidden/);
});

test("Admin V5 inventory covers existing list consumers and representative AdminShell routes", () => {
  assert.match(source("components/admin-shell.tsx"), /export function AdminShell/);
  assert.match(source("components/admin-record-table.tsx"), /export function AdminRecordTable/);
  for (const file of [
    "admin-dashboard", "admin-breed-dashboard", "admin-directory-dashboard",
    "admin-event-dashboard", "admin-help-dashboard", "admin-help-unified-table",
    "admin-adoption-dashboard", "admin-lost-found-dashboard",
    "admin-organization-publication-dashboard",
  ]) assert.match(source("components/" + file + ".tsx"), /<AdminRecordTable/, file);
  for (const name of [
    "clanky", "plemena", "adresar", "podujatia", "pomoc", "adopcie",
    "stratene-najdene", "kvalita", "organizacie",
  ]) assert.match(source("app/admin/" + name + "/page.tsx"), /<AdminShell/, name);
});
