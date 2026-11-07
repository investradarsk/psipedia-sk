import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 2 imports MIT shadcn-admin primitives without taking over the admin router", () => {
  const primitives = read("components/admin-shadcn-editor-primitives.tsx");
  const license = read("third_party/shadcn-admin/LICENSE");
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2024 Sat Naing/);
  for (const slot of ["card", "card-header", "card-content", "input", "textarea"])
    assert.match(primitives, new RegExp('data-slot="' + slot + '"'));
  assert.match(primitives, /satnaing\/shadcn-admin/);
  assert.doesNotMatch(primitives, /@tanstack\/react-router|@clerk|import.*vite/);
});

test("step 2 workspace uses one visible section and document scroll, preserving inactive fields", () => {
  const src = read("components/admin-unified-editor-workspace.tsx");
  const css = read("components/admin-shadcn-editor.module.css");
  assert.match(src, /data-editor-scroll="document"/);
  assert.match(src, /hidden=\{section\.id !== currentId\}/);
  assert.match(src, /aria-current=\{section\.id === currentId/);
  assert.match(src, /aria-label="Sekcie editora"/);
  assert.match(src, /AdminUiCard/);
  assert.match(css, /\.section\[hidden\]/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.doesNotMatch(css, /overflow:\s*auto|overflow-y:\s*scroll|max-height:\s*\d+vh/);
  assert.doesNotMatch(src, /fetch\s*\(|notion|database\.prepare|useRouter/);
});

test("step 2 preview is admin-only and cannot mutate production", () => {
  const route = read("app/admin/unified-editor-preview/page.tsx");
  const demo = read("components/admin-shadcn-editor-preview.tsx");
  assert.match(route, /requireAdminPageUser\("/);
  assert.match(route, /<AdminShell/);
  assert.match(route, /<AdminShadcnEditorPreview/);
  for (const kind of ['breed', 'article', 'directory', 'event'])
    assert.match(demo, new RegExp(' ' + kind + ': \\{'));
  assert.match(demo, /<AdminUnifiedEditorWorkspace/);
  assert.match(demo, /type="date"/);
  assert.match(demo, /type="time"/);
  assert.match(demo, /Zahodiť zmeny/);
  assert.match(demo, /Simulovať publikovanie/);
  assert.doesNotMatch(demo, /fetch\s*\(|axios|localStorage|indexedDB|\/api\/|useRouter/);
});
