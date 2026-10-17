import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("workspace composes canonical admin primitives without another modal implementation", () => {
  const source = read("components/admin-editor-workspace.tsx");
  assert.match(source, /AdminModalDialog/);
  assert.match(source, /AdminActionButton/);
  assert.match(source, /AdminEditorSection as EditorSection/);
  for (const name of ["EditorWorkspace","EditorHeader","EditorSectionNavigation","EditorContent","EditorPreview","EditorActionBar","EditorStatus","EditorUnsavedChangesGuard"])
    assert.match(source, new RegExp("export function " + name));
  assert.doesNotMatch(source, /fetch\s*\(|DATABASE_URL|notion\.pages|db\.prepare|publishArticle/i);
});
test("caller owns save and publish while dirty close remains guarded", () => {
  const source = read("components/admin-editor-workspace.tsx");
  assert.match(source, /actions\?: ReactNode/);
  assert.match(source, /dirty\?: boolean/);
  assert.match(source, /beforeunload/);
  assert.match(source, /Neuložené zmeny/);
  assert.match(source, /Zahodiť zmeny a zavrieť/);
  assert.match(source, /type="button"/);
  assert.match(source, /querySelectorAll<HTMLElement>/);
});
test("responsive CSS supports desktop preview, mobile section switch and visible actions", () => {
  const css = read("components/admin-editor-workspace.module.css");
  assert.match(css, /dialog\.workspaceModal\[open\]/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.1fr\) minmax\(0, 0\.9fr\)/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /data-mobile-panel="preview"/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /:focus-visible/);
});
test("fixture stays development-only and requires confirmation before local publish", () => {
  const demo = read("components/admin-editor-workspace-demo.tsx");
  const route = read("app/admin/editor-workspace-preview/page.tsx");
  assert.match(route, /process\.env\.NODE_ENV !== "development"/);
  assert.match(route, /notFound\(\)/);
  assert.doesNotMatch(demo, /fetch\s*\(|\/api\/|indexedDB|localStorage/i);
  assert.match(demo, /setPublishConfirm\(true\)/);
  assert.match(demo, /Potvrdiť lokálne publikovanie/);
  assert.match(demo, /setSaved\(\{ \.\.\.draft \}\)/);
});
