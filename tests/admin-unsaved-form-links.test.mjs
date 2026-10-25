import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("shared unsaved-link guard keeps safe navigation and excludes unpersisted file selections",()=>{
 const s=read("components/admin-unsaved-form-links.tsx");
 assert.match(s,/export function useAdminUnsavedFormLinks/);
 for(const token of ["event.ctrlKey","event.altKey","event.metaKey","event.shiftKey","anchor.hasAttribute(\"download\")","destination.origin!==current.origin","pendingAnchor.current=anchor","anchor.click()","markSavedBeforeRedirect","event.preventDefault()"])assert.ok(s.includes(token),token);
 assert.match(s,/event.target instanceof HTMLInputElement && event.target.type==="file"/);
 assert.doesNotMatch(s,/fetch\(|window\.confirm/);
});
test("beforeunload cancellation after confirmed save is controlled by an opt-in ref",()=>{
 const s=read("components/admin-editor-workspace.tsx");
 assert.match(s,/allowNativeExitRef\?: RefObject<boolean>/);
 assert.match(s,/if \(allowNativeExitRef\?\.current\) return/);
 assert.match(s,/window\.addEventListener\("beforeunload", warn\)/);
});

test("Help and Lost/Found use one shared guard with canonical save-state control",()=>{
 const help=read("components/admin-help-editor.tsx");
 const lost=read("components/admin-lost-found-editor.tsx");
 for(const src of [help,lost]){
  assert.match(src,/useAdminUnsavedFormLinks\(\)/);
  assert.match(src,/onChangeCapture=\{navigation\.captureChange\}/);
  assert.match(src,/onClickCapture=\{navigation\.captureLinkClick\}/);
  assert.match(src,/<EditorUnsavedChangesGuard active=\{navigation\.dirty\} open=\{navigation\.confirmOpen\}/);
  assert.match(src,/allowNativeExitRef=\{navigation\.allowNativeExitRef\}/);
  assert.match(src,/navigation\.markSavedBeforeRedirect\(\)/);
  assert.match(src,/navigation\.markSaved\(\)/);
  assert.match(src,/navigation\.markDirty\(\)/);
  assert.match(src,/<AdminFormFeedback message=\{message\} error=\{error\} pending=\{saving\}/);
 }
 assert.match(help,/mutationPending\.current/);
 assert.match(help,/status: nextStatus/);
 assert.match(lost,/allowedLostFoundTransitions\(state\.status\)/);
 assert.match(lost,/\/api\/admin\/lost-found/);
 assert.match(lost,/\/duplicate/);
 assert.match(lost,/<AdminPhotoGallery/);
});

test("Help Lexical text append and SEO edits explicitly mark the editor dirty",()=>{
 const src=read("components/admin-help-editor.tsx");
 assert.match(src,/onAppend=\{text=>\{ navigation\.markDirty\(\); setDescription\(appendLexicalPlainText/);
 assert.match(src,/onChange=\{nextSeo => \{ navigation\.markDirty\(\); setSeo\(nextSeo\); \}\}/);
});

test("Adoption canonical form shares unsaved-link protection and preserves CAS writes", () => {
 const src=read("components/admin-adoption-editor.tsx");
 const profile=read("components/admin-adoption-editor-profile.tsx");
 assert.match(src,/useAdminUnsavedFormLinks\(\)/);
 assert.match(src,/onChangeCapture=\{navigation\.captureChange\}/);
 assert.match(src,/onClickCapture=\{navigation\.captureLinkClick\}/);
 assert.match(src,/<EditorUnsavedChangesGuard active=\{navigation\.dirty\} open=\{navigation\.confirmOpen\}/);
 assert.match(src,/navigation\.markSavedBeforeRedirect\(\)/);
 assert.match(src,/navigation\.markSaved\(\)/);
 assert.match(src,/onGalleryChange=\{nextGallery => \{ navigation\.markDirty\(\); setGallery\(nextGallery\); \}\}/);
 assert.match(src,/onProgrammaticChange=\{navigation\.markDirty\}/);
 assert.match(src,/if \(Object\.keys\(values\)\.length\) navigation\.markDirty\(\)/);
 assert.match(src,/expectedUpdatedAt: version/);
 assert.match(src,/canTransitionAdoptionStatus\(persistedStatus, next\)/);
 assert.match(src,/status,\s*\n\s*sex: text\(data, "sex"\)/);
 assert.match(profile,/onProgrammaticChange\?\.\(\)/);
 assert.match(profile,/appendLexicalPlainText/);
});
