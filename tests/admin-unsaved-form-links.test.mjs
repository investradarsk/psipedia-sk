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
