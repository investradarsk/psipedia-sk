import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {breedFieldsFromNotionEvent} from "../lib/notion-breed-event-fields.ts";
import {explicitBreedFieldPatch} from "../lib/notion-breed-field-delta.ts";

test("signed Notion page Deti property ID maps to children only",()=>{
  const page={properties:{
    "Deti":{id:"abc123",number:4},
    "Rodina":{id:"qRxy",number:3},
    "Sync stav":{id:"status",select:{name:"Synchronizované"}},
  }};
  assert.deepEqual(breedFieldsFromNotionEvent(page,["abc123"]),["children"]);
  assert.deepEqual(breedFieldsFromNotionEvent(page,["Deti"]),["children"]);
  assert.deepEqual(breedFieldsFromNotionEvent(page,["status"]),[]);
  assert.deepEqual(breedFieldsFromNotionEvent(page,[]),[]);
  assert.deepEqual(breedFieldsFromNotionEvent(page,["abc123","qRxy"]),["family","children"]);
});
test("first event imports only Deti 4, does not alter family, status, images or FCI",()=>{
  const incoming={slug:"beauceron",fciNumber:44,
    name:"Beauceron",children:4,family:1,health:"Old history",
    image:"notion.jpg",status:"draft",seo:{ogTitle:"Notion OG"}};
  const patch=explicitBreedFieldPatch(incoming,["children"]);
  assert.deepEqual(patch.accepted,["children"]);
  assert.deepEqual(patch.patch,{children:4});
  assert.deepEqual(patch.conflicts,[]);
});
test("explicit clearing of rating uses neutral score, empty name refuses",()=>{
  const patch=explicitBreedFieldPatch({children:undefined,name:""},["children","name"]);
  assert.deepEqual(patch.patch,{children:3});
  assert.deepEqual(patch.conflicts,["name"]);
});
test("webhook passes property IDs into targeted breed sync",async()=>{
  const dispatch=await readFile(new URL("../lib/notion-webhook-dispatch.ts",import.meta.url),"utf8");
  const sync=await readFile(new URL("../lib/notion-breed-sync.ts",import.meta.url),"utf8");
  assert.match(dispatch,/changedPropertyIds: event\.data\?\.updated_properties/);
  assert.match(sync,/breedFieldsFromNotionEvent\(page, options\.changedPropertyIds\)/);
  assert.match(sync,/BREED_LEGACY_FIELD_OWNER_REVIEW_REQUIRED/);
  assert.match(sync,/BREED_EXPLICIT_FIELD_UPDATE_FAILED/);
  assert.match(sync,/forceFields:args\.forceFields/);
  assert.match(sync,/BREED_PSID_CONFLICT/);
  assert.match(sync,/status:existing\.status/);
  assert.match(sync,/image:existing\.image,imageKey:existing\.imageKey/);
});
test("authenticated per-breed check exposes queue status and one-field retry",async()=>{
  const api=await readFile(new URL("../app/api/admin/breeds/[id]/notion-check/route.ts",import.meta.url),"utf8");
  const widget=await readFile(new URL("../components/admin-breed-notion-check.tsx",import.meta.url),"utf8");
  const page=await readFile(new URL("../app/admin/plemena/[id]/page.tsx",import.meta.url),"utf8");
  assert.match(api,/getAdminApiUser\(\)/);
  assert.match(api,/requireAdminMutation\(request,\{strictProvenance:true\}\)/);
  assert.match(api,/body\?\.field!=="children"/);
  assert.match(api,/forceFields:\["children"\]/);
  assert.match(api,/notionPageBelongsToDataSource\(/);
  assert.match(api,/FROM notion_webhook_inbox WHERE page_id=/);
  assert.match(widget,/Preniesť Deti z Notionu/);
  assert.match(page,/<AdminBreedNotionCheck breedId=\{breed\.id\}\/>/);
});
