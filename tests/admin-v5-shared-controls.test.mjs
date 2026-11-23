import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("V5 step 2: canonical actions use shared desktop density and mobile touch sizes", () => {
  const actions = source("components/admin-interaction-system.module.css");
  const actionLogic = source("components/admin-interaction-system.tsx");
  const global = source("app/admin/admin-compact-global.css");
  assert.match(actions, /min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(actions, /min-width: var\(--admin-ui-control-height, 44px\)/);
  assert.match(actions, /@media \(max-width: 820px\)[\s\S]*?\.action \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px/);
  assert.match(global, /--admin-ui-control-height: 38px/);
  assert.match(global, /--admin-ui-control-height: 44px/);
  for (const variant of [".primary", ".secondary", ".neutral", ".destructive", ".link"]) {
    assert.ok(actions.includes(variant + " {"), variant);
  }
  assert.match(actionLogic, /disabled=\{disabled \|\| loading\}/);
  assert.match(actionLogic, /aria-busy=\{loading \? true : props\["aria-busy"\]\}/);
  assert.match(actions, /\.action:focus-visible/);
  assert.match(actions, /\.action:disabled/);
  assert.match(actions, /\.action\[data-loading="true"\]::after/);
  assert.match(actions, /prefers-reduced-motion: reduce/);
});

test("V5 step 2: legacy Admin buttons share one action geometry without extra hover motion", () => {
  const css = source("app/admin/admin-legacy-scoped.css");
  const block = css.slice(css.indexOf("/* ADMIN-BUTTONS-1:"), css.indexOf("@media (max-width: 640px)", css.indexOf("/* ADMIN-BUTTONS-1:")));
  assert.match(block, /min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(block, /border-radius: var\(--admin-ui-field-radius, 9px\)/);
  assert.match(block, /padding: var\(--admin-ui-control-padding-block, 0\.55rem\) var\(--admin-ui-control-padding-inline, 0\.75rem\)/);
  assert.match(block, /button\.is-primary/);
  assert.match(block, /button\.is-danger/);
  assert.match(block, /:focus-visible/);
  assert.match(block, /cursor: not-allowed/);
  assert.doesNotMatch(block, /translateY\(-1px\)/);
  assert.doesNotMatch(block, /0 7px 18px/);
});

test("V5 step 2: shared V4 and adapted form fields reuse tokens but retain native inputs", () => {
  const forms = source("app/admin/admin-unified-forms.css");
  const shadcn = source("components/admin-shadcn-editor.module.css");
  const primitives = source("components/admin-shadcn-editor-primitives.tsx");
  assert.match(forms, /min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(forms, /font-size: var\(--admin-ui-type-body, 0\.875rem\)/);
  assert.match(forms, /:not\(\[type="file"\]\)/);
  assert.match(forms, /:not\(\[type="checkbox"\]\)/);
  assert.match(shadcn, /\.input, \.select \{ min-height: var\(--admin-ui-control-height, 44px\); \}/);
  assert.match(shadcn, /@media \(max-width: 820px\)[\s\S]*?\.input, \.textarea, \.select \{ font-size: 16px; \}/);
  for (const slot of ['data-slot="input"', 'data-slot="textarea"', 'data-slot="select"', 'data-slot="checkbox"']) {
    assert.ok(primitives.includes(slot), slot);
  }
  assert.match(forms, /:focus-visible/);
  assert.match(forms, /aria-invalid="true"/);
});

test("V5 step 2: inline editors fit desktop table rows while preserving phone targets", () => {
  const css = source("components/admin-inline-edit-controls.module.css");
  const tsx = source("components/admin-inline-edit-controls.tsx");
  assert.match(css, /min-height: 32px/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?min-height: 44px/);
  assert.match(css, /\.input \{ font-size: 16px; \}/);
  assert.match(css, /\.input:focus-visible/);
  assert.match(css, /actions button:disabled/);
  assert.match(css, /--admin-v3-green/);
  assert.doesNotMatch(css, /!important/);
  assert.match(tsx, /onSave/);
  assert.match(tsx, /onCancel/);
  assert.match(tsx, /onEdit/);
  assert.match(tsx, /aria-label=\{label\}/);
});

test("V5 step 2: shared confirmation and dirty-state logic remain unchanged", () => {
  const actions = source("components/admin-interaction-system.tsx");
  const form = source("components/admin-form-feedback.tsx");
  const workspace = source("components/admin-editor-workspace.tsx");
  assert.match(actions, /onKeyDown=\{keepAdminDialogFocus\}/);
  assert.match(actions, /onClose=\{restoreFocus\}/);
  assert.match(actions, /dialog\.showModal\(\)/);
  assert.match(form, /aria-live=\{state === "error" \? "assertive" : "polite"\}/);
  assert.match(workspace, /useAdminEditorNavigationGuard/);
  assert.match(workspace, /EditorUnsavedChangesGuard/);
});
