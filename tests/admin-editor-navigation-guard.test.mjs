import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ADMIN_NAVIGATION_INTENT_EVENT, isEditorExit } from "../lib/admin-editor-navigation.ts";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const current = "https://psipedia.sk/admin/organizacie/novy?draft=1";

test("same-origin path/query changes need confirmation; hash and new-tab are separate", () => {
  assert.equal(isEditorExit("/admin/plemena", current), true);
  assert.equal(isEditorExit("/admin/organizacie/novy?draft=2", current), true);
  assert.equal(isEditorExit("/admin/organizacie/novy?draft=1#media", current), false);
  assert.equal(isEditorExit("https://psipedia.sk/admin/organizacie/novy?draft=1", current), false);
  assert.equal(isEditorExit("https://other.example/admin/plemena", current), false);
  assert.equal(isEditorExit("javascript:alert(1)", current), false);
  assert.equal(isEditorExit("http://[", current), false);
  assert.equal(ADMIN_NAVIGATION_INTENT_EVENT, "psipedia:admin-navigation-intent");
});

test("canonical editors share one document capture and one native beforeunload owner", () => {
  const gate = read("components/admin-editor-navigation-guard.tsx");
  const workspace = read("components/admin-editor-workspace.tsx");
  const event = read("components/admin-event-editor.tsx");
  const organization = read("components/admin-organization-editor.tsx");
  const directory = read("components/admin-directory-editor.tsx");
  const article = read("components/admin-article-editor.tsx");
  const formLinks = read("components/admin-unsaved-form-links.tsx");
  const ios = read("components/admin-mobile-document-navigation.tsx");
  const palette = read("components/admin-quick-navigation-dialog.tsx");

  assert.match(gate, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(gate, /document\.removeEventListener\("click", onClick, true\)/);
  assert.match(gate, /navigationApi\?\.addEventListener\("navigate", onNativeNavigate\)/);
  assert.match(gate, /navigationApi\?\.removeEventListener\("navigate", onNativeNavigate\)/);
  assert.match(gate, /data-admin-unsaved-editor/);
  assert.match(ios, /data-admin-unsaved-editor/);
  assert.match(workspace, /useAdminEditorNavigationGuard/);
  assert.match(workspace, /allowNativeExitRef=\{navigation\.allowNativeExitRef\}/);
  assert.match(organization, /useAdminEditorNavigationGuard/);
  assert.match(directory, /useAdminEditorNavigationGuard/);
  assert.match(formLinks, /useAdminEditorNavigationGuard/);
  assert.match(palette, /ADMIN_NAVIGATION_INTENT_EVENT/);
  assert.doesNotMatch(event, /document\.addEventListener\("click"/);
  assert.doesNotMatch(event, /<EditorUnsavedChangesGuard/);
  assert.doesNotMatch(article, /addEventListener\("beforeunload"/);
  assert.match(workspace, /window\.addEventListener\("beforeunload", warn\)/);
  assert.match(event, /allowNativeExitRef=\{allowNavigationRef\}/);
});
