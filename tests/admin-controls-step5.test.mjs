import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 5: shared control and error tokens stay scoped to admin", () => {
  const css = read("app/admin/admin-editorial-foundation.css");
  assert.match(css, /\[data-admin-workspace\]\s*\{/);
  for (const token of [
    "--admin-ui-control-padding-block",
    "--admin-ui-control-padding-inline",
    "--admin-ui-control-height",
    "--admin-ui-field-radius",
    "--admin-ui-error-text",
    "--admin-ui-error-border",
    "--admin-ui-error-background",
  ]) {
    assert.ok(css.includes(token + ":"), token);
  }
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
  assert.doesNotMatch(css, /position:\s*(?:fixed|sticky)/);
});

test("step 5: canonical buttons preserve all semantic variants and interaction states", () => {
  const src = read("components/admin-interaction-system.tsx");
  const css = read("components/admin-interaction-system.module.css");
  assert.match(src, /type AdminActionVariant = "primary" \| "secondary" \| "neutral" \| "destructive" \| "link"/);
  assert.match(src, /disabled=\{disabled \|\| loading\}/);
  assert.match(src, /aria-busy=\{loading \? true : props\["aria-busy"\]\}/);
  assert.match(css, /\.action\s*\{[\s\S]*?min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(css, /\.action\s*\{[\s\S]*?min-width: 44px/);
  assert.match(css, /\.action\s*\{[\s\S]*?border-radius: var\(--admin-ui-field-radius, 9px\)/);
  assert.match(css, /\.action:focus-visible/);
  assert.match(css, /\.action:disabled/);
  assert.match(css, /\.action\[data-loading="true"\]/);
  for (const variant of [".primary", ".secondary", ".neutral", ".destructive", ".link"]) {
    assert.match(css, new RegExp("\\n" + variant.replace(".", "\\.") + " \\{"), variant);
  }
});

test("step 5: V4 and adapted shadcn fields use the same sizing without restyling uploads", () => {
  const forms = read("app/admin/admin-unified-forms.css");
  const primitives = read("components/admin-shadcn-editor.module.css");
  for (const css of [forms, primitives]) {
    assert.match(css, /min-height: var\(--admin-ui-control-height, 44px\)/);
    assert.match(css, /border-radius: var\(--admin-ui-field-radius, 9px\)/);
    assert.match(css, /padding: var\(--admin-ui-control-padding-block, 0\.55rem\) var\(--admin-ui-control-padding-inline, 0\.75rem\)/);
  }
  assert.match(forms, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\):not\(\[type="hidden"\]\)/);
  assert.match(forms, /\.admin-field input\[type="checkbox"\]/);
  assert.match(primitives, /\.checkbox\s*\{/);
  assert.match(primitives, /\.select \{ appearance: auto; \}/);
  assert.match(forms, /font-size: 16px/);
});

test("step 5: save/error feedback keeps accessible roles and consistent presentation", () => {
  const source = read("components/admin-form-feedback.tsx");
  const css = read("components/admin-form-feedback.module.css");
  const interaction = read("components/admin-interaction-system.module.css");
  assert.match(source, /role=\{state === "error" \? "alert" : "status"\}/);
  assert.match(source, /aria-live=\{state === "error" \? "assertive" : "polite"\}/);
  assert.match(source, /data-admin-form-feedback=\{state\}/);
  assert.match(source, /data-admin-field-feedback=\{invalid\?"error":"hint"\}/);
  assert.match(css, /margin-block: var\(--admin-ui-feedback-space, 0\.55rem\)/);
  assert.match(css, /border-radius: var\(--admin-ui-field-radius, 9px\)/);
  assert.match(css, /color: var\(--admin-ui-error-text, #842f35\)/);
  assert.match(css, /background: var\(--admin-ui-error-background, #fff3f2\)/);
  assert.match(css, /border-color: var\(--admin-ui-error-border, #e9b5b2\)/);
  assert.match(interaction, /\.validation\s*\{[\s\S]*?border: 1px solid var\(--admin-ui-error-border, #e9b5b2\)/);
  assert.match(interaction, /\.bulkEditStep textarea\s*\{[\s\S]*?min-height: 7rem/);
});
