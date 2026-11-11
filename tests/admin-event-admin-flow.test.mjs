import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("event editor protects unsaved changes against native reload and tab close", () => {
  const editor = source("components/admin-event-editor.tsx");
  const workspace = source("components/admin-editor-workspace.tsx");
  assert.doesNotMatch(editor, /<EditorUnsavedChangesGuard/);
  assert.match(workspace, /useAdminEditorNavigationGuard/);
  assert.match(workspace, /active=\{dirty && \(mode === "page" \|\| open\)\}/);
  assert.match(editor, /allowNativeExitRef=\{allowNavigationRef\}/);
  assert.match(workspace, /window\.addEventListener\("beforeunload", warn\)/);
  assert.match(editor, /allowNavigationRef\.current = true/);
});

test("successful event mutations do not turn a failed list refresh into a write failure", () => {
  const dashboard = source("components/admin-event-dashboard.tsx");
  const reload = dashboard.slice(dashboard.indexOf("async function reload()"), dashboard.indexOf("async function applyBulk("));
  assert.match(reload, /return !fresh\.error/);
  assert.doesNotMatch(reload, /throw fresh\.error/);

  const bulk = dashboard.slice(dashboard.indexOf("async function applyBulk("), dashboard.indexOf("function openQuickEdit("));
  const quick = dashboard.slice(dashboard.indexOf("async function saveQuickEdit("), dashboard.indexOf("async function removeEvent("));
  const removal = dashboard.slice(dashboard.indexOf("async function removeEvent("), dashboard.indexOf("const statusTargets"));
  for (const mutation of [bulk, quick, removal]) {
    assert.match(mutation, /const refreshed = await reload\(\)/);
    assert.match(mutation, /Zoznam sa nepodarilo obnoviť|zoznam sa nepodarilo obnoviť/);
  }
  assert.ok(quick.indexOf("setQuickEvent(null);\n      setInlineEventId(null);") < quick.indexOf("const refreshed = await reload()"));
  assert.ok(removal.indexOf("setDeleteTarget(null);") < removal.indexOf("const refreshed = await reload()"));
});

test("saving an unchanged quick edit skips a redundant PATCH request", () => {
  const dashboard = source("components/admin-event-dashboard.tsx");
  const quick = dashboard.slice(dashboard.indexOf("async function saveQuickEdit("), dashboard.indexOf("async function removeEvent("));
  assert.match(quick, /quickType === quickEvent\.eventType && quickCancelled === quickEvent\.cancelled/);
  assert.ok(quick.indexOf("Nie sú žiadne zmeny na uloženie.") < quick.indexOf('method: "PATCH"'));
});
