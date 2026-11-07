import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("EDITOR-6: one save footer preserves each editor's own callbacks and form semantics", () => {
  const footer = read("components/admin-editor-footer.tsx");
  const css = read("components/admin-editor-footer.module.css");
  const workspace = read("components/admin-editor-workspace.tsx");
  const pilot = read("components/admin-unified-editor-workspace.tsx");
  assert.match(footer, /export function AdminEditorFooter/);
  assert.match(footer, /data-admin-editor-footer/);
  assert.match(footer, /data-editor-save-pending/);
  assert.match(footer, /role="status"/);
  assert.match(footer, /aria-live="polite"/);
  assert.match(footer, /aria-busy=\{pending\}/);
  assert.doesNotMatch(footer, /fetch\s*\(|onSubmit|router\.push|window\.location|notion|database\.prepare/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(workspace, /<AdminEditorFooter/);
  assert.match(workspace, /data-editor-actionbar/);
  assert.match(pilot, /<AdminEditorFooter data-unified-editor-actions>/);
});

test("EDITOR-6: directory, organization, help, adoption and lost/found opt into shared footer", () => {
  const variants = [
    ["components/admin-directory-editor.tsx", /dirty=\{formDirty\}/, /pending=\{saving\}/],
    ["components/admin-organization-editor.tsx", /dirty=\{dirty\}/, /pending=\{saving\}/],
    ["components/admin-help-editor.tsx", /dirty=\{navigation\.dirty\}/, /pending=\{saving \|\| uploading\}/],
    ["components/admin-adoption-editor.tsx", /dirty=\{navigation\.dirty\}/, /pending=\{saving \|\| uploading \|\| galleryUploading\}/],
    ["components/admin-lost-found-editor.tsx", /dirty=\{navigation\.dirty\}/, /pending=\{saving \|\| uploading \|\| galleryUploading\}/],
  ];
  for (const [path, dirty, pending] of variants) {
    const src = read(path);
    assert.match(src, /<AdminEditorFooter/, path);
    assert.match(src, /<\/AdminEditorFooter>/, path);
    assert.match(src, dirty, path);
    assert.match(src, pending, path);
    assert.match(src, /<EditorUnsavedChangesGuard/, path);
    assert.match(src, /<AdminFormFeedback/, path);
  }
});

test("EDITOR-6: publish, unpublish and return still belong to canonical code", () => {
  const directory = read("components/admin-directory-editor.tsx");
  assert.match(directory, /void save\("published"\)/);
  assert.match(directory, /void save\("draft"\)/);
  assert.match(directory, /notionReadOnly/);
  assert.match(directory, /setConfirmDirectoryExit\(true\)/);
  assert.match(directory, /onNotionSaved\?/);
  const help = read("components/admin-help-editor.tsx");
  assert.match(help, /setConfirmUnpublish\(true\)/);
  assert.match(help, /void save\("published"\)/);
  const lost = read("components/admin-lost-found-editor.tsx");
  assert.match(lost, /allowedTransitions\.map/);
  const org = read("components/admin-organization-editor.tsx");
  assert.match(org, /useCallback/);
  assert.match(org, /requestNavigation\(/);
  const guard = read("components/admin-editor-workspace.tsx");
  assert.match(guard, /window\.addEventListener\("beforeunload", warn\)/);
  assert.match(guard, /Neuložené zmeny/);
  assert.match(guard, /Zahodiť zmeny a zavrieť/);
  assert.match(read("components/admin-shadcn-editor-preview.tsx"), /Simulovať publikovanie/);
});
