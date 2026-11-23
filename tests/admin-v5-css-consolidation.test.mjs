import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Admin V5 stage 6: shell has one shared gap owner while keeping the mobile menu slot", () => {
  const css = source("components/admin-shell.module.css");
  const shell = source("components/admin-shell.tsx");
  assert.equal((css.match(/\.topbarActions \{ gap: var\(--admin-ui-space-xs, 6px\); \}/g) ?? []).length, 1);
  assert.doesNotMatch(css, /\.topbarActions \{ gap: (?:2|5|10)px/);
  assert.match(css, /grid-template-columns: 198px minmax\(0, 1fr\)/);
  assert.match(css, /\.topbarSticky \{ min-height: 60px; padding: 8px 64px 8px 12px; \}/);
  assert.match(css, /\.topbarSticky \{ box-sizing: border-box; width: 100%; max-width: 100%; \}/);
  assert.match(css, /\.notificationLink \{[\s\S]*?min-width: 44px;[\s\S]*?height: 44px;/);
  assert.match(shell, /<AdminQuickNavigation \/>/);
  assert.match(shell, /<AdminNotificationBell count=/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
});

test("Admin V5 stage 6: table geometry and toolbar have one final owner", () => {
  const css = source("components/admin-record-table.module.css");
  const table = source("components/admin-record-table.tsx");
  assert.equal((css.match(/^\.workspace \{/gm) ?? []).length, 1);
  assert.match(css, /\.workspace \{[\s\S]*?box-sizing: border-box;[\s\S]*?max-width: 100%/);
  assert.doesNotMatch(css, /\.toolbar \{ display: flex; gap: 12px/);
  assert.doesNotMatch(css, /\.toolbar \{ gap: 0\.4rem; padding: 0\.6rem; \}/);
  assert.match(css, /\.toolbar \{[\s\S]*?gap: var\(--admin-list-filter-gap, 0\.55rem\)/);
  assert.match(css, /\.workspace\[data-density="compact"\] \.table th,[\s\S]*?height: 38px/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.workspace \.heading button \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.workspace\[data-mobile-focus="true"\] \.scroll \{ overflow: visible; \}/);
  assert.match(css, /\.columnPickerMenu label \{[\s\S]*?white-space: normal/);
  for (const contract of ["toggleAllPageRowsSelected(checked)", "setCompactView(current => !current)", "getSortedRowModel", "onColumnVisibilityChange: setVisibility"]) {
    assert.ok(table.includes(contract), contract);
  }
});

test("Admin V5 stage 6: page editors retain document scrolling and modals retain bounded panes", () => {
  const css = source("components/admin-editor-workspace.module.css");
  const workspace = source("components/admin-editor-workspace.tsx");
  assert.doesNotMatch(css, /min-height: (?:32|34|38)rem/);
  assert.doesNotMatch(css, /max-height: 75dvh/);
  assert.match(css, /\.pageWorkspace \{\s*overflow: visible;\s*min-height: 0;/);
  assert.match(css, /\.pageWorkspace > \.workspace \{\s*min-height: 0;\s*max-height: none;/);
  assert.match(css, /dialog\.workspaceModal\[open\] > div:nth-child\(2\) \{[\s\S]*?overflow: hidden/);
  assert.match(css, /MOBILE-STABILITY STEP 7:[\s\S]*?\.pageWorkspace:has\(/);
  assert.match(css, /\.content, \.preview \{ padding: var\(--admin-ui-panel-padding, 0\.55rem\); \}/);
  assert.match(css, /\.navigation button \{ min-height: 44px; padding: 0\.45rem 0\.6rem; \}/);
  assert.match(workspace, /useAdminEditorNavigationGuard/);
  assert.match(workspace, /<EditorUnsavedChangesGuard/);
  assert.match(workspace, /if \(dirty\) setConfirmClose\(true\)/);
});

test("Admin V5 stage 6: footer uses one mobile safe-area spacing and keeps save feedback", () => {
  const css = source("components/admin-editor-footer.module.css");
  const footer = source("components/admin-editor-footer.tsx");
  assert.equal((css.match(/padding: 0\.45rem max\(0\.55rem, env\(safe-area-inset-right\)\)/g) ?? []).length, 1);
  assert.match(css, /\.footer :is\(button, a\) \{ min-height: var\(--admin-ui-control-height, 44px\); \}/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.footer :is\(button, a\) \{ min-height: 44px; \}/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /max-width: 100%/);
  assert.match(footer, /data-editor-save-pending/);
  assert.match(footer, /role="status" aria-live="polite"/);
  assert.match(footer, /aria-busy=\{pending\}/);
});

test("Admin V5 stage 6: shared section navigation retains focus and mobile 16px controls", () => {
  const css = source("components/admin-shared-editor-navigation.module.css");
  const nav = source("components/admin-shared-editor-navigation.tsx");
  assert.equal((css.match(/padding: var\(--admin-ui-space-sm, 0\.375rem\);/g) ?? []).length, 1);
  assert.match(css, /\.sidebar \{[\s\S]*?position: sticky/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.sidebar \{[\s\S]*?position: static/);
  assert.match(css, /\.mobile select \{[\s\S]*?min-height: 44px/);
  assert.match(css, /font-size: 16px/);
  assert.match(css, /\.sidebar \.links \{ display: none; \}/);
  assert.match(css, /:focus-visible/);
  assert.match(nav, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(nav, /aria-controls=/);
});

test("Admin V5 stage 6 does not add replacement CSS layers or touch source handlers", () => {
  const layout = source("app/admin/layout.tsx");
  const compact = source("app/admin/admin-compact-global.css");
  const table = source("components/admin-record-table.tsx");
  assert.match(layout, /import "\.\/admin-list-foundation\.css"/);
  assert.match(layout, /import "\.\/admin-compact-global\.css"/);
  assert.match(compact, /--admin-ui-control-height: 38px/);
  assert.match(compact, /--admin-ui-control-height: 44px/);
  assert.doesNotMatch(compact, /overflow-x:\s*hidden/);
  assert.doesNotMatch(table, /fetch\(|DELETE|PATCH|POST/);
});
