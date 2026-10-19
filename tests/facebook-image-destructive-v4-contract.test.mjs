import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../components/admin-facebook-images.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../components/admin-facebook-images.module.css",import.meta.url),"utf8");
const modal=readFileSync(new URL("../components/admin-interaction-system.tsx",import.meta.url),"utf8");

test("Facebook V4 reuses admin modal and danger semantics without native deletion confirmation",()=>{
  assert.match(source,/AdminModalDialog open=\{Boolean\(deleteTarget\)\} preferExplicitAutofocus/);
  assert.match(source,/variant="destructive"/);
  assert.match(source,/Natrvalé odstránenie/);
  assert.match(source,/Natrvalo odstrániť z Psipedie/);
  assert.doesNotMatch(source,/window\.confirm\(prompt\)/);
  assert.match(css,/\.deleteListAction\{[^}]*min-height:44px/s);
  assert.match(css,/\.dangerZone\{/);
});
test("V4 requires explicit safe focus without changing other destructive dialogs",()=>{
  assert.match(source,/variant="neutral" data-admin-autofocus="true"/);
  assert.match(modal,/function useAdminDialog\(open: boolean, preferExplicitAutofocus = false\)/);
  assert.match(modal,/querySelectorAll<HTMLElement>\('\[data-admin-autofocus="true"\]'\)/);
  assert.match(modal,/\(preferred \?\? fallback\)\?\.focus\(\)/);
  assert.match(modal,/preferExplicitAutofocus\?: boolean/);
  assert.match(modal,/\[data-admin-autofocus="true"\]/);
});
test("V4 deletion blocks dirty, sending and in-flight calls in handler and preserves CAS",()=>{
  assert.match(source,/function requestPermanentRemoval\(post:FacebookImagePost\)[\s\S]*?editor\?\.post\?\.id===post\.id&&dirty/);
  assert.match(source,/async function permanentlyRemove\(\)[\s\S]*?lock\.current\|\|notionBusy\|\|post\.publicationState==="SENDING"[\s\S]*?dirty/);
  assert.match(source,/lock\.current=true;setBusy\(true\)/);
  assert.match(source,/method:"DELETE"/);
  assert.match(source,/confirm:true,expectedVersion:post\.version/);
  assert.match(source,/disabled=\{busy\|\|notionBusy\|\|dirty\|\|editor\.post\.publicationState==="SENDING"\}/);
});
