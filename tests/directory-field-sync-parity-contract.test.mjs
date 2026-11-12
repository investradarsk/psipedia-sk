import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DIRECTORY_FIELD_EVENT_CATEGORIES, directoryPropertyEventMissingChangedIds, isDirectoryFieldEventCategory, isDirectoryEventPilotCategory } from "../lib/notion-directory-field-event-scope.ts";
import { breederNotionChangedFields, breederApplyNotionChanges, breederAdminChangedFields } from "../lib/notion-breeder-field-events.ts";
import { directoryFilterRegistry, serviceFiltersForCategory } from "../lib/directory-filter-contract.ts";

const repoFile = path => readFile(new URL("../" + path, import.meta.url), "utf8");

const directoryCategories = [
  "chovatelske-stanice",
  "treneri",
  "chovatelske-kluby",
  "kynologicke-kluby",
  "veterinari",
  "fyzioterapia",
  "dalsie-sluzby",
  "salony-a-sluzby",
  "hotely-a-opatrovanie",
  "vencenie",
];

test("all 10 Directory categories are included in the same signed field-event dispatch", async () => {
  const [webhook, sync, scope] = await Promise.all([
    repoFile("app/api/integrations/notion/webhook/route.ts"),
    repoFile("lib/notion-directory-sync.ts"),
    repoFile("lib/notion-directory-field-event-scope.ts"),
  ]);
  assert.deepEqual(DIRECTORY_FIELD_EVENT_CATEGORIES, directoryCategories);
  assert.match(webhook, /import \{ DIRECTORY_FIELD_EVENT_CATEGORIES \}/);
  assert.match(webhook, /dp\.category IN \("/);
  assert.match(webhook, /\.bind\(data\.entity!\.id, \.\.\.DIRECTORY_FIELD_EVENT_CATEGORIES\)/);
  for (const category of directoryCategories) {
    assert.equal(isDirectoryFieldEventCategory(category), true, category + " omitted by the field-event engine");
  }
  assert.equal(isDirectoryFieldEventCategory("unknown"), false);
  assert.ok(scope.includes("Explicit blank edits are real clears"));
  assert.match(sync, /breederWebhookPropertyIds: input\.changedPropertyIds/);
  assert.match(sync, /return syncBreederEvent\(\{/);
});

test("Popis, contacts and SEO use the same per-field Notion property ID mapping for every category", () => {
  const props = {
    Popis: { id: "prop-description" },
    "Telefón": { id: "prop-phone" },
    "SEO title": { id: "prop-seo" },
    "Sync chyba": { id: "prop-synchronization-metadata" },
  };
  assert.deepEqual(breederNotionChangedFields(props, ["prop-description"]), ["description"]);
  assert.deepEqual(breederNotionChangedFields(props, ["prop-phone", "prop-seo"]),
    ["publicPhone", "seo.title"]);
  assert.deepEqual(breederNotionChangedFields(props, ["prop-synchronization-metadata"]), []);
});

test("a signed explicit empty description only clears that field (Tarabora regression)", () => {
  const before = {
    name: "Psia škola Tarabora", category: "treneri", status: "draft",
    description: "Original popis", excerpt: "Keep excerpt",
    services: ["Keep independent service"],
    seo: { title: "Keep SEO" },
  };
  const incoming = {
    ...before, description: "", excerpt: "Unrelated remote change",
    services: [], seo: { title: "Unrelated remote SEO" },
  };
  const next = breederApplyNotionChanges(before, incoming, ["description"]);
  assert.equal(next.description, "");
  assert.equal(next.excerpt, before.excerpt);
  assert.deepEqual(next.services, before.services);
  assert.deepEqual(next.seo, before.seo);
  assert.deepEqual(breederAdminChangedFields(before, next), ["description"]);
});

test("legacy trainer services are independent of canonical V3 and veterinary pilot legacy services", async () => {
  const [sync, scope, store] = await Promise.all([
    repoFile("lib/notion-directory-sync.ts"),
    repoFile("lib/notion-directory-field-event-scope.ts"),
    repoFile("lib/directory-profile-metadata.ts"),
  ]);
  assert.equal(isDirectoryEventPilotCategory("treneri"), false);
  assert.equal(isDirectoryEventPilotCategory("veterinari"), true);
  assert.match(sync, /path === "services" && current\.category === "treneri"/);
  assert.match(sync, /TRAINER_SERVICES_TEXT_METADATA_KEY, text/);
  assert.match(sync, /DIRECTORY_PILOT_LEGACY_SERVICES_READ_ONLY/);
  assert.match(sync, /const relationChanged = changedIds\.some/);
  assert.match(store, /_psipedia_trainer_services_text/);
  assert.match(scope, /"veterinari"/);
});

test("one field failure must be diagnosed without marking an unrelated service relation successful", async () => {
  const [sync, dispatch, inbox] = await Promise.all([
    repoFile("lib/notion-directory-sync.ts"),
    repoFile("lib/notion-webhook-dispatch.ts"),
    repoFile("lib/notion-webhook-inbox.ts"),
  ]);
  assert.match(sync, /BREEDER_EDITORIAL_FIELD_WRITE_FAILED/);
  assert.match(sync, /BREEDER_FIELD_SAVE_FAILED/);
  assert.match(sync, /directoryServiceSuccessCanClear\(propertyText\(page,"Sync chyba"\)\)/);
  assert.match(dispatch, /NOTION_TARGETED_RECONCILIATION_FAILED/);
  assert.match(inbox, /"REVIEW"/);
  assert.match(inbox, /"PENDING"/);
});

test("Directory property events missing changed IDs must retry rather than falsely confirming a no-op", async () => {
  const [dispatcher, webhook] = await Promise.all([
    repoFile("lib/notion-webhook-dispatch.ts"),
    repoFile("app/api/integrations/notion/webhook/route.ts"),
  ]);
  assert.equal(directoryPropertyEventMissingChangedIds("page.properties_updated", undefined), true);
  assert.equal(directoryPropertyEventMissingChangedIds("page.properties_updated", []), true);
  assert.equal(directoryPropertyEventMissingChangedIds("page.properties_updated", ["  "]), true);
  assert.equal(directoryPropertyEventMissingChangedIds("page.properties_updated", ["Popis"]), false);
  assert.equal(directoryPropertyEventMissingChangedIds("page.properties_updated", ["opq8"]), false);
  assert.equal(directoryPropertyEventMissingChangedIds("page.content_updated", undefined), false);
  assert.equal(directoryPropertyEventMissingChangedIds("page.created", undefined), false);
  const marker = dispatcher.indexOf("directoryPropertyEventMissingChangedIds(event.type, event.data?.updated_properties)");
  const runner = dispatcher.indexOf("summary = await runNotionDirectorySyncSweep({");
  assert.ok(marker > 0 && runner > marker, "incomplete Directory event must be checked before its field sync");
  assert.match(dispatcher.slice(marker, runner), /return "deferred"/);
  assert.match(webhook, /result === "not-configured" \|\| result === "deferred"/);
  assert.match(webhook, /status: 503/);
});

test("Admin field writeback confirms each selected field and leaves failed fields pending",async()=>{
 const [sync,admin] = await Promise.all([
  repoFile("lib/notion-directory-sync.ts"),
  repoFile("app/api/admin/directory/[id]/route.ts"),
 ]);
 const from=sync.indexOf("async function syncBreederEvent(");
 const to=sync.indexOf("export async function mirrorBreederCategoryFiltersToNotion(",from);
 const source=sync.slice(from,to);
 assert.match(source,/for \(const path of fields\) \{/);
 assert.match(source,/const echoed = await patchNotionPage\(bindings, page\.id, patch\)/);
 assert.match(source,/Object\.hasOwn\(candidate\.properties \?\? \{\}, key\)/,
  "an absent property must not confirm an empty deletion");
 assert.match(source,/const fresh = await fetchNotionPage\(bindings, page\.id\)/);
 assert.match(source,/failedFields\.push\(path\)/);
 assert.match(source,/DIRECTORY_ADMIN_TO_NOTION_FIELDS_PENDING/);
 assert.match(source,/directoryEditorialEventMayClearError/);
 assert.match(admin,/breederAdminFields: isDirectoryFieldEventCategory\(before\.category\)/);
 assert.match(admin,/breederAdminFields: breederBefore && isDirectoryFieldEventCategory\(breederBefore\.category\)/);
 assert.match(admin,/isDirectoryFieldEventCategory\(profile\.category\)/);
});

test("category select fields use one registry for all ten categories and explicit blanks",async()=>{
 const [sync,route]=await Promise.all([
  repoFile("lib/notion-directory-sync.ts"),
  repoFile("app/api/admin/directory/[id]/route.ts"),
 ]);
 assert.equal(directoryFilterRegistry.length,21);
 for(const category of directoryCategories){
   assert.ok(serviceFiltersForCategory(category).length>0,category+" missing configured selection fields");
 }
 assert.match(sync,/\.\.\.Object\.fromEntries\(directoryFilterRegistry\.map\(def => \[def\.id, def\.notion\.property\]\)\)/);
 assert.match(sync,/const facetFields = isDirectoryFieldEventCategory\(input\.profile\.category\)/);
 assert.match(sync,/delete source\[def\.d1\.key\]/);
 assert.match(sync,/!Object\.hasOwn\(page\.properties \?\? \{\}, key\)/);
 assert.match(sync,/\[key\]: expectedLabel \? select\(expectedLabel\) : \{ select: null \}/);
 assert.match(sync,/for \(const id of new Set\(input\.fields\)\)/);
 assert.match(sync,/DIRECTORY_FACET_FIELDS_PENDING/);
 assert.match(route,/isDirectoryFieldEventCategory\(row\.category\) && Object\.keys\(requested\.updates\)\.length/);
});

test("Services V3 remains independent of prose, trust, GEO and editorial webhook writes",async()=>{
 const [sync,v3,store]=await Promise.all([
  repoFile("lib/notion-directory-sync.ts"),
  repoFile("lib/service-catalog-notion-relations.ts"),
  repoFile("lib/directory-profile-metadata.ts"),
 ]);
 const editorial=sync.slice(sync.indexOf("async function syncBreederEvent("),
  sync.indexOf("export async function mirrorBreederCategoryFiltersToNotion("));
 assert.doesNotMatch(editorial,/syncProfileCatalogRelation\(|importNotionServiceIds\(/);
 assert.match(sync,/TRAINER_SERVICES_TEXT_METADATA_KEY, text/);
 assert.match(sync,/DIRECTORY_PILOT_LEGACY_SERVICES_READ_ONLY/);
 assert.match(store,/_psipedia_trainer_services_text/);
 assert.match(v3,/directory_service_notion_relation_sync/);
 assert.match(v3,/SERVICES_RELATION_UNVERIFIED_DELETE/);
 assert.match(v3,/confirmed_ids_json/);
});

test("profile-specific read-only diagnostics distinguish legacy mapping, editorial baseline and V3",async()=>{
 const [data,component,page,hook]=await Promise.all([
  repoFile("lib/directory-notion-sync-diagnostics.ts"),
  repoFile("components/admin-directory-notion-sync-status.tsx"),
  repoFile("app/admin/adresar/[id]/page.tsx"),
  repoFile("app/api/integrations/notion/webhook/route.ts"),
 ]);
 assert.match(data,/readDirectoryNotionSyncDiagnostic/);
 assert.match(data,/WHERE directory_profile_id=\? LIMIT 1/);
 assert.match(data,/notion_profile_field_baselines/);
 assert.match(data,/directory_service_notion_relation_sync/);
 assert.match(data,/notion_webhook_inbox/);
 assert.match(data,/service_profile_option_choices/);
 assert.match(data,/optional\(\(\) => db\.prepare/);
 assert.match(component,/AdminDirectoryNotionSyncStatus/);
 assert.match(component,/môžu obísť front/);
 assert.match(page,/AdminDirectoryNotionSyncStatus profileId=\{profile\.id\}/);
 assert.match(hook,/event: "directory_notion_webhook"/);
 assert.match(hook,/changedPropertyCount:/);
 assert.doesNotMatch(hook,/console\.info\(JSON\.stringify\(data\)/);
});

test("a missing Notion GET property never clears unrelated Directory D1 data",async()=>{
 const source=await repoFile("lib/notion-directory-sync.ts");
 const event=source.slice(source.indexOf("async function syncBreederEvent("),
  source.indexOf("export async function mirrorBreederCategoryFiltersToNotion("));
 assert.match(event,/const notionKey = BREEDER_NOTION_EDITORIAL_FIELDS\[path\]/);
 assert.match(event,/!Object\.hasOwn\(page\.properties \?\? \{\}, notionKey\)/);
 assert.match(event,/failures\.push\(path\)/);
 assert.match(event,/!Object\.hasOwn\(page\.properties \?\? \{\}, field\)/);
 assert.match(event,/failures\.push\(field\)/);
 assert.match(event,/BREEDER_FIELD_SAVE_FAILED/);
});
