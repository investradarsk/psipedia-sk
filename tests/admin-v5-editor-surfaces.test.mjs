import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Admin V5 stage 4 keeps one shared editor layout and compact section rhythm", () => {
  const css = source("components/admin-editor-workspace.module.css");
  const workspaceComponent = source("components/admin-editor-workspace.tsx");
  assert.match(css, /\/\* ADMIN-V3-COMPACT-01/);
  assert.match(css, /\.content, \.preview \{ padding: var\(--admin-ui-panel-padding, 0\.55rem\); \}/);
  assert.match(css, /\.content \{ gap: var\(--admin-ui-section-gap, 0\.4rem\); \}/);
  assert.match(css, /\.content \[data-admin-editor-section\] \{ gap: var\(--admin-ui-editor-field-gap, 0\.375rem\); \}/);
  assert.match(css, /grid-template-columns: var\(--admin-profile-sidebar, minmax\(160px, 192px\)\) minmax\(0, 1fr\)/);
  assert.match(css, /box-shadow: 0 -1px 5px rgb\(23 53 43 \/ 5%\)/);
  assert.match(css, /\.pageWorkspace\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(css, /Dialog-mode EditorWorkspace keeps its own bounded pane/);
  assert.match(workspaceComponent, /sectionMode\?: "scroll" \| "switch"/);
  assert.match(workspaceComponent, /data-editor-page/);
  assert.doesNotMatch(workspaceComponent, /DATABASE_URL|notion\.pages|db\.prepare/);
});

test("Admin V5 stage 4 scopes editable controls without styling file/choice/hidden inputs", () => {
  const css = source("components/admin-editor-workspace.module.css");
  assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\):not\(\[type="hidden"\]\):not\(\[type="color"\]\):not\(\[type="range"\]\)/);
  assert.match(css, /min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(css, /padding: var\(--admin-ui-control-padding-block, 0\.3rem\) var\(--admin-ui-control-padding-inline, 0\.65rem\)/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?min-height: 44px; font-size: 16px/);
  assert.match(css, /\.content \[data-admin-editor-section\] textarea \{ font-size: 16px; \}/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\[aria-invalid="true"\]/);
});

test("Admin V5 stage 4 footer follows desktop token, mobile safe areas and retains status semantics", () => {
  const footer = source("components/admin-editor-footer.module.css");
  const component = source("components/admin-editor-footer.tsx");
  const workspace = source("components/admin-editor-workspace.module.css");

  assert.match(footer, /\.footer :is\(button, a\) \{ min-height: var\(--admin-ui-control-height, 44px\); \}/);
  assert.match(footer, /@media \(max-width: 820px\)[\s\S]*?\.footer :is\(button, a\) \{ min-height: 44px; \}/);
  assert.equal((footer.match(/padding: 0\.45rem max\(0\.55rem, env\(safe-area-inset-right\)\)/g) ?? []).length, 1);
  assert.match(footer, /env\(safe-area-inset-bottom\)/);
  assert.match(footer, /\.end > :global\(\.admin-editor-actions\)/);
  assert.match(component, /role="status" aria-live="polite"/);
  assert.match(component, /aria-busy=\{busy\}/);
  assert.match(workspace, /MOBILE-STABILITY STEP 7/);
  assert.match(workspace, /\) \.pageActions \{[\s\S]*?position: static/);
});

test("Admin V5 stage 4 preserves section navigation accessibility and tool-specific controls", () => {
  const nav = source("components/admin-shared-editor-navigation.module.css");
  const navSource = source("components/admin-shared-editor-navigation.tsx");
  const toolCss = source("components/admin-editor-tool-frame.module.css");
  const tool = source("components/admin-editor-tool-frame.tsx");

  assert.match(nav, /min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(nav, /\.mobile select \{[\s\S]*?min-height: 44px/);
  assert.match(nav, /font-size: 16px/);
  assert.match(nav, /:focus-visible/);
  assert.match(navSource, /aria-controls=/);
  assert.match(navSource, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(toolCss, /gap: var\(--admin-ui-section-gap, 0\.4rem\)/);
  assert.match(toolCss, /\.frame :global\(\.admin-upload-button\) \{ min-height: 44px; \}/);
  assert.match(toolCss, /\.frame :global\(button\) \{ min-height: var\(--admin-ui-control-height, 44px\); \}/);
  assert.match(toolCss, /@media \(max-width: 820px\)[\s\S]*?\.frame :global\(button\) \{ min-height: 44px; \}/);
  assert.match(tool, /data-admin-editor-tool=\{kind\}/);
  assert.doesNotMatch(tool, /fetch\(|onSubmit|onClick|DATABASE_URL/);
});

test("Admin V5 stage 4 retains V4 profile cards without impacting article editor or save guards", () => {
  const css = source("app/admin/admin-unified-forms.css");
  const workspace = source("components/admin-editor-workspace.tsx");
  const guard = source("components/admin-editor-navigation-guard.tsx");

  assert.match(css, /:not\(\[data-editor-layout="article"\]\)/);
  assert.match(css, /box-shadow: none/);
  assert.match(css, /font-size: 1rem/);
  assert.match(css, /\[data-admin-editor-pager\] :is\(button, a\) \{ min-height: 44px; \}/);
  assert.match(css, /min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(workspace, /useAdminEditorNavigationGuard/);
  assert.match(workspace, /EditorUnsavedChangesGuard/);
  assert.match(workspace, /if \(dirty\) setConfirmClose\(true\)/);
  assert.match(guard, /data-admin-unsaved-editor/);
});

test("4/10 profile fields share existing geometry and keep article content and tool internals separate", () => {
  const forms = source("app/admin/admin-unified-forms.css");
  const compact = source("app/admin/admin-compact-global.css");
  for (const token of ["--admin-ui-type-label", "--admin-ui-type-body", "--admin-ui-type-section", "--admin-ui-field-radius", "--admin-ui-control-height", "--admin-ui-editor-field-gap"]) {
    assert.ok(forms.includes(token), token);
    assert.ok(compact.includes(token), token);
  }
  const step = forms.slice(forms.indexOf("/* 4/10"));
  assert.match(step, /\[data-admin-profile-editor-content\]/);
  assert.match(step, /textarea:not\(\[data-lexical-value\]\)/);
  assert.match(step, /:not\(\[data-admin-editor-tool\] \*\)/);
  assert.match(step, /@media \(max-width: 820px\), \(pointer: coarse\)/);
  assert.match(step, /min-height: 44px;\s*font-size: 16px/);
  for (const name of ["eshop", "lost-found"]) {
    const editor = source("components/admin-" + name + "-editor.tsx");
    assert.match(editor, /data-admin-profile-field/);
    assert.match(editor, /data-admin-profile-field-grid/);
  }
  assert.match(source("components/admin-breed-editor.tsx"), /data-admin-profile-heading/);
  const lexical = source("components/admin-lexical-text-field.module.css");
  assert.match(lexical, /:global\(\[data-admin-profile-editor-content\]\) \.surface/);
  assert.match(lexical, /font-size: 16px/);
  assert.doesNotMatch(source("components/admin-article-editor.tsx"), /data-admin-profile-field/);
});

test("6/10 preview toggle remains reachable at tablet widths and profiles use separate panes", () => {
  const css = source("components/admin-editor-workspace.module.css");
  const tail = css.slice(css.indexOf("/* 6/10"));
  assert.match(tail, /@media \(max-width: 1180px\)/);
  assert.match(tail, /\.navigation \.previewToggle \{ display: inline-flex/);
  assert.match(tail, /data-mobile-panel="preview"/);
  assert.match(tail, /:not\(\[data-editor-layout="article"\]\)/);
  assert.match(source("tests/e2e/admin-ux-unification.spec.ts"), /\[1024, 390, 320\]/);
});
