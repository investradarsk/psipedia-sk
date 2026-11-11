import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("one safe unsaved-navigation modal is reused",()=>{
 const modal=read("components/admin-unsaved-navigation-dialog.tsx");
 assert.match(modal,/AdminModalDialog/);
 assert.match(modal,/preferExplicitAutofocus/);
 assert.match(modal,/data-admin-autofocus="true"/);
 assert.match(modal,/onClose=\{onStay\}/);
 assert.match(modal,/type="button"/);
});
test("Gemini category navigation opens the shared guard without AI side effects",()=>{
 const src=read("components/admin-gemini-category-prompt-editor.tsx");
 assert.match(src,/AdminUnsavedNavigationDialog/);
 assert.match(src,/setPendingHref\(/);
 assert.match(src,/router\.push\(next\)/);
 assert.doesNotMatch(src,/window\.confirm/);
 assert.match(src,/Gemini sa nespustilo/);
});
test("e-shop navigation uses same guard and keeps existing persistence",()=>{
 const src=read("components/admin-eshop-editor.tsx");
 assert.match(src,/AdminUnsavedNavigationDialog/);
 assert.match(src,/setConfirmLeave\(true\)/);
 assert.match(src,/router\.push\("\/admin\/recenzie\/eshopy"\)/);
 assert.doesNotMatch(src,/window\.confirm/);
 assert.match(src,/uploadAdminImage\(file, "eshops"\)/);
});

test("Directory back navigation uses shared guard and keeps existing canonical or Notion saves", () => {
  const source = read("components/admin-directory-editor.tsx");
  assert.match(source, /useAdminEditorNavigationGuard/);
  assert.match(source, /open=\{navigation\.confirmOpen\}/);
  assert.match(source, /onStay=\{navigation\.stay\}/);
  assert.match(source, /onDiscard=\{navigation\.discard\}/);
  assert.match(source, /allowNativeExitRef=\{navigation\.allowNativeExitRef\}/);
  assert.doesNotMatch(source, /confirmDirectoryExit|directoryBackLinkRef|allowDirectoryExitRef/);
  assert.doesNotMatch(source, /useRouter\(\)/);
  assert.doesNotMatch(source, /window\.confirm\("Zahodiť neuložené zmeny profilu/);
  assert.match(source, /setFilterSourceData\(savedProfile\.importData/);
  assert.match(source, /onNotionSaved\?/);
});

test("All EditorUnsavedChangesGuard instances have cancel-focused accessible confirmation", () => {
  const source = read("components/admin-editor-workspace.tsx");
  assert.match(source, /export function EditorUnsavedChangesGuard/);
  assert.match(source, /preferExplicitAutofocus/);
  assert.match(source, /data-admin-autofocus="true" onClick=\{onStay\}/);
  assert.match(source, /window\.addEventListener\("beforeunload", warn\)/);
  assert.match(source, /onDiscard/);
});
