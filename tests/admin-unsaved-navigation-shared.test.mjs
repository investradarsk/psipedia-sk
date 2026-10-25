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
