import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Admin V5 mobile shell reserves menu space without masking document overflow", () => {
  const shell = read("components/admin-shell.module.css");
  const layout = read("components/admin-shell.tsx");
  assert.match(shell, /@media \(max-width: 1100px\)[\s\S]*?\.topbarSticky \{ min-height: 60px; padding: 8px 64px 8px 12px; \}/);
  assert.match(shell, /@media \(max-width: 760px\)[\s\S]*?\.topbarSticky \{ box-sizing: border-box; width: 100%; max-width: 100%; \}/);
  assert.match(shell, /\.workspacePage, \.contentArea \{ max-width: 100%; \}/);
  assert.match(shell, /\.contentArea :global\(\.admin-table-scroll\) \{[\s\S]*?overflow-x: auto/);
  assert.match(shell, /\.notificationLink \{[\s\S]*?min-width: 44px;[\s\S]*?height: 44px/);
  assert.match(layout, /data-admin-topbar/);
  assert.match(layout, /<AdminQuickNavigation \/>/);
  assert.doesNotMatch(shell, /overflow-x:\s*hidden/);
});

test("Admin V5 table controls remain touch accessible through the full-table tablet breakpoint", () => {
  const css = read("components/admin-record-table.module.css");
  const component = read("components/admin-record-table.tsx");
  const mobile = css.slice(css.lastIndexOf("/* Tablet-sized full-table mode"));
  assert.match(mobile, /@media \(max-width: 820px\)/);
  assert.match(mobile, /\.workspace \.heading button \{[\s\S]*?min-height: 44px;[\s\S]*?min-width: 44px/);
  assert.match(mobile, /\.columnPicker summary:focus-visible/);
  assert.match(mobile, /\.columnPickerMenu label \{[\s\S]*?min-height: 44px/);
  assert.match(mobile, /input\[type="checkbox"\] \{[\s\S]*?width: 20px;[\s\S]*?height: 20px/);
  assert.match(mobile, /td\[data-column-id="actions"\] :is\(button, a\) \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.workspace\[data-mobile-focus="true"\] \.scroll \{ overflow: visible; \}/);
  assert.match(css, /\.scroll \{ width: 100%; overflow-x: auto;/);
  assert.match(component, /setCompactView\(current => !current\)/);
  assert.match(component, /aria-sort=\{header\.column\.getIsSorted\(\)/);
  assert.match(component, /toggleAllPageRowsSelected\(checked\)/);
  assert.match(component, /role="region" aria-label=\{label \+ " – tabuľka"\} tabIndex=\{0\}/);
});

test("Admin V5 mobile section selectors prevent input zoom without changing navigation", () => {
  const workspace = read("components/admin-editor-workspace.module.css");
  const actions = read("components/admin-interaction-system.module.css");
  const editor = read("components/admin-editor-workspace.tsx");
  assert.match(workspace, /\.mobileSectionSelect select \{[\s\S]*?min-height: 44px;[\s\S]*?font-size: 16px/);
  assert.match(actions, /\.editorNavigationMobile select \{[\s\S]*?min-height: 44px;[\s\S]*?font-size: 16px/);
  assert.match(workspace, /MOBILE-STABILITY STEP 7:[\s\S]*?\.pageWorkspace:has\(/);
  assert.match(workspace, /\) \.pageActions \{[\s\S]*?position: static/);
  assert.match(editor, /useAdminEditorNavigationGuard/);
  assert.match(editor, /<EditorUnsavedChangesGuard/);
});

test("Admin V5 regressions track canonical 198px sidebar and 820px mobile pager", () => {
  const v3 = read("tests/admin-v3-compactness.test.mjs");
  const v5 = read("tests/admin-v5-shared-density.test.mjs");
  const shell = read("components/admin-shell.module.css");
  const pager = read("app/admin/admin-list-foundation.css");
  assert.match(v3, /if \(name === "shell"\) return source/);
  assert.match(v3, /grid-template-columns: 198px/);
  assert.match(shell, /grid-template-columns: 198px minmax\(0, 1fr\)/);
  assert.ok(v5.includes("max-width:\\s*820px"));
  assert.match(pager, /@media \(max-width: 820px\)/);
  assert.doesNotMatch(v3, /grid-template-columns: 210px/);
  assert.doesNotMatch(v5, /max-width:\\s\*760px/);
});
