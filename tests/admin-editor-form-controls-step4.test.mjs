import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("EDITOR-4: all canonical editing surfaces opt into shared admin form styles", () => {
  const layout = read("app/admin/layout.tsx");
  const css = read("app/admin/admin-unified-forms.css");
  assert.match(layout, /import "\.\/admin-unified-forms\.css"/);
  assert.match(css, /\[data-admin-workspace\] \[data-admin-form-system="v4"\]/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 260px\), 1fr\)\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /field-sizing: content/);
  assert.match(css, /:not\(\[type="file"\]\)/);
  assert.match(css, /:not\(\[type="checkbox"\]\)/);
  assert.match(css, /\[data-admin-lexical-text\]/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 820px\)/);
  const editors = [
    "components/admin-editor-workspace.tsx",
    "components/admin-directory-editor.tsx",
    "components/admin-organization-editor.tsx",
    "components/admin-help-editor.tsx",
    "components/admin-adoption-editor.tsx",
    "components/admin-lost-found-editor.tsx",
  ];
  for (const path of editors) assert.match(read(path), /data-admin-form-system="v4"/, path);
});

test("EDITOR-4: shadcn field primitives preserve native form semantics", () => {
  const src = read("components/admin-shadcn-editor-primitives.tsx");
  const css = read("components/admin-shadcn-editor.module.css");
  const workspace = read("components/admin-unified-editor-workspace.tsx");
  for (const primitive of ["AdminUiInput", "AdminUiTextarea", "AdminUiSelect", "AdminUiCheckbox"]) {
    assert.match(src, new RegExp("export function " + primitive));
  }
  for (const slot of ["input", "textarea", "select", "checkbox"]) {
    assert.match(src, new RegExp('data-slot="' + slot + '"'));
  }
  assert.match(src, /ComponentProps<"select">/);
  assert.match(src, /Omit<ComponentProps<"input">, "type">/);
  assert.match(src, /type="checkbox"/);
  assert.match(src, /data-editor-text-length=\{length\}/);
  assert.match(css, /\.checkbox\s*\{/);
  assert.match(css, /\.textarea\[data-editor-text-length="long"\]/);
  assert.match(workspace, /cloneElement\(children/);
  assert.match(workspace, /"aria-describedby"/);
  assert.match(workspace, /"aria-invalid"/);
  assert.match(workspace, /data-columns=\{columns\}/);
  assert.match(workspace, /role="alert"/);
});

test("EDITOR-4: preview exercises varying fields without changing canonical field contracts", () => {
  const demo = read("components/admin-shadcn-editor-preview.tsx");
  assert.match(demo, /<AdminUiSelect id="demo-category"/);
  assert.match(demo, /<AdminUiCheckbox checked=\{draft.featured\}/);
  assert.match(demo, /length="short"/);
  assert.match(demo, /length="long"/);
  assert.match(demo, /type="date"/);
  assert.match(demo, /type="time"/);
  assert.match(demo, /type="tel"/);
  assert.doesNotMatch(demo, /fetch\s*\(|\/api\/|indexedDB|localStorage|database\.prepare/i);
});
