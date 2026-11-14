import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 4: one compact spacing scale owns the admin presentation", () => {
  const foundation = read("app/admin/admin-editorial-foundation.css");
  const legacy = read("app/admin/admin-workspace.css");
  const layout = read("app/admin/layout.tsx");
  assert.match(layout, /import "\.\/admin-editorial-foundation\.css";/);
  assert.match(foundation, /\[data-admin-workspace\]\s*\{/);
  assert.match(foundation, /--admin-ui-section-gap:\s*0\.625rem;/);
  assert.match(foundation, /--admin-ui-editor-field-gap:\s*0\.5rem;/);
  assert.match(foundation, /--admin-ui-panel-padding:\s*0\.75rem;/);
  assert.match(foundation, /--admin-ui-panel-padding:\s*0\.65rem;/);
  assert.match(legacy, /--admin-v3-card-padding:\s*var\(--admin-ui-panel-padding,/);
  assert.match(legacy, /--admin-v3-compact-gap:\s*var\(--admin-ui-section-gap,/);
  assert.doesNotMatch(foundation, /overflow-x:\s*hidden/);
});

test("step 4: unified V4 form cards and fields use the compact tokens", () => {
  const forms = read("app/admin/admin-unified-forms.css");
  const foundation = read("app/admin/admin-editorial-foundation.css");
  assert.match(forms, /\.admin-field-grid\s*\{[^}]*gap:\s*var\(--admin-ui-space-sm,[^;]*\) var\(--admin-ui-space-md,/s);
  assert.match(forms, /\[data-admin-editor-section\] > \.admin-form-card/);
  assert.match(forms, /padding:\s*var\(--admin-ui-panel-padding, 0\.75rem\)/);
  assert.match(forms, /border-radius:\s*var\(--admin-ui-radius, 12px\)/);
  assert.match(forms, /padding:\s*var\(--admin-ui-panel-padding, 0\.65rem\)/);
  assert.match(foundation, /\.admin-form-card\s*\{\s*padding:\s*var\(--admin-ui-panel-padding\);\s*\}/);
  // Choice and upload controls retain their native presentation.
  assert.match(forms, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\)/);
  assert.match(forms, /min-height: 44px/);
  assert.match(forms, /font-size: 16px/);
});

test("step 4: EditorWorkspace and dashboard share card density", () => {
  const workspace = read("components/admin-editor-workspace.module.css");
  const overview = read("components/admin-workspace-dashboard.module.css");
  const shell = read("components/admin-shell.module.css");
  assert.match(workspace, /\.content, \.preview \{ padding: var\(--admin-ui-panel-padding,/);
  assert.match(workspace, /\.content \{ gap: var\(--admin-ui-section-gap,/);
  assert.match(workspace, /\.content \[data-admin-editor-section\] \{ gap: var\(--admin-ui-editor-field-gap,/);
  assert.match(workspace, /env\(safe-area-inset-bottom\)/);
  assert.match(workspace, /\.pageWorkspace\[data-editor-section-mode="switch"\]/);
  assert.match(overview, /\.metricCard \{ min-height: 132px;[^\n]*padding: var\(--admin-ui-panel-padding,/);
  assert.match(overview, /\.queueLink \{ min-height: 56px/);
  assert.match(overview, /\.panel \{ padding: var\(--admin-ui-panel-padding,/);
  assert.match(shell, /\.workspaceMain \{ padding: var\(--admin-ui-space-md,/);
  assert.match(overview, /\.actionRow a, \.quickLinks a \{ min-height: 44px; \}/);
});

test("step 4: keep special editors, server state and public CSS outside visual changes", () => {
  const foundation = read("app/admin/admin-editorial-foundation.css");
  const forms = read("app/admin/admin-unified-forms.css");
  const workspace = read("components/admin-editor-workspace.module.css");
  assert.match(forms, /:not\(\[data-editor-layout="article"\]\)/);
  assert.match(workspace, /Dialog-mode EditorWorkspace keeps its own bounded pane/);
  assert.doesNotMatch(foundation, /(?:position:\s*(?:fixed|sticky)|overflow-x:\s*hidden)/);
  assert.doesNotMatch(forms, /(?:data-admin-form-system="v5"|D1_MIGRATION|NOTION_SYNC)/);
});
