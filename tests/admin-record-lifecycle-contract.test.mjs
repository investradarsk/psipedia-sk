import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (path) => readFileSync(root + path, "utf8");
const core = source("lib/admin-record-lifecycle.ts");
const route = source("app/api/admin/record-lifecycle/[kind]/[id]/route.ts");
const dialog = source("components/admin-record-lifecycle-actions.tsx");
const migration = source("drizzle/0164_admin_record_lifecycle.sql");

test("status-only operation cannot serialize editor payload, and records a Notion retry guard", () => {
  const body = core.split("export async function unpublishRecord(")[1]?.split("/** Called only AFTER")[0];
  assert.ok(body, "unpublish function must exist");
  assert.match(body, /SET status=\?,updated_at=\? WHERE id=\?/);
  assert.match(body, /db\.batch\(\[guard,update\]\)/);
  assert.match(body, /hideResult\.meta\?\.changes/);
  assert.match(body, /RECORD_HIDE_NOT_CONFIRMED/);
  assert.match(body, /await mirrorDraft\(db,bindings,kind,id,targets\)/);
  assert.doesNotMatch(body, /JSON\.stringify\(row\)|updateManaged|save\("draft"\)|\.imageKey\s*=/);
});

test("deletion never proceeds without a verified Notion GET-in-trash or explicit local-only consent", () => {
  assert.match(core, /LOCAL_ONLY_CONFIRMATION_REQUIRED/);
  assert.match(core, /notionText\(page,"Psipedia ID"\)!==String\(id\)/);
  assert.match(core, /parent\?\.type!=="data_source_id"/);
  assert.match(core, /method:"PATCH",body:JSON\.stringify\(\{in_trash:true\}\)/);
  assert.match(core, /const confirmed=await requireOwnedNotionPage\(bindings,target,id,true\)/);
  assert.match(core, /confirmed\.in_trash!==true/);
  const verify = core.indexOf("for(const target of targets)await verifyTrash");
  const cleanup = core.indexOf("await completeLocalRemoval(db,kind,id,targets)");
  assert.ok(verify >= 0 && cleanup > verify, "remote Notion trash must precede D1 deletion");
});

test("failed remote delete stays hidden and durable, with retryable error exposed in Admin", () => {
  assert.match(core, /await db\.batch\(\[insert,hide\]\)/);
  assert.match(core, /state='ERROR_NOTION'/);
  assert.match(core, /state='READY_LOCAL'/);
  assert.match(dialog, /Zopakovať odstránenie/);
  assert.match(dialog, /value\.removalState/);
  assert.match(dialog, /confirmed:true/);
  assert.match(route, /body\.confirmed!==true/);
  assert.doesNotMatch(dialog, /confirmation!==|"VYMAZAŤ"|Druhé potvrdenie/);
  assert.match(route, /strictProvenance:true/);
  assert.match(route, /body\.confirmed!==true/);
  assert.match(route, /body\.localOnly===true/);
});

test("shared UI is present in all 8 editors; old direct DELETE endpoints are blocked", () => {
  const editors = [
    "directory","event","help","breed","article","adoption","lost-found","organization",
  ];
  for (const name of editors) {
    const content = source("components/admin-" + name + "-editor.tsx");
    assert.match(content, /AdminRecordLifecycleActions/, name + " must use shared component");
  }
  for (const kind of ["events","help","breeds","articles"]) {
    const file = source("app/api/admin/"+kind+"/[id]/route.ts");
    assert.match(file, /export async function DELETE/);
    assert.match(file, /record-lifecycle/);
    assert.match(file, /status:409/);
  }
});

test("tombstones block exact slug reinsertion and forbid direct hard-delete without READY_LOCAL", () => {
  assert.equal((migration.match(/BEFORE INSERT ON /g)||[]).length,8);
  assert.equal((migration.match(/BEFORE UPDATE OF status, slug ON /g)||[]).length,8);
  assert.equal((migration.match(/BEFORE DELETE ON /g)||[]).length,8);
  assert.match(migration, /USE_VERIFIED_LIFECYCLE_DELETE/);
  assert.match(core, /triggerNames=recordKinds\.flatMap/);
});

test("image files are deleted only after D1 deletion and a separate reference check", () => {
  assert.match(core, /keyStillReferenced\(db,key\)/);
  assert.match(core, /await bucket\.delete\(key\)/);
  const done = core.lastIndexOf("await completeLocalRemoval(db,kind,id,targets)");
  const media = core.lastIndexOf("await removeExclusiveMedia(db,bindings,row)");
  assert.ok(media > done);
});

test("every Notion inbound sweep honors unpublished guards and pre-migration workers remain compatible", () => {
  assert.match(core, /export async function notionPageMustSkipInboundSync/);
  assert.match(core, /notionPageHasAdminUnpublishGuard\(db,pageId\)/);
  assert.match(core, /no such table: admin_record_publication_guards/);
  for (const adapter of [
    "notion-directory-sync", "notion-events-help-sync",
    "notion-event-sync", "notion-breed-sync", "notion-article-sync",
  ]) {
    const content = source("lib/" + adapter + ".ts");
    assert.match(content, /await notionPageMustSkipInboundSync\(/,
      adapter + " must not replay a hidden Admin record");
  }
  // A breed draft still receives content edits; only tombstones stop replay.
  const breeds = source("lib/notion-breed-workcopy-sync.ts");
  assert.match(breeds, /await notionPageIsTombstoned\(args.database,link.work_notion_page_id\)/);
  assert.doesNotMatch(breeds, /notionPageMustSkipInboundSync\(/);
  assert.match(breeds, /status: canonical.status/);
  for (const mapping of ["directory_notion_sync","event_notion_sync","breed_notion_sync",
    "breed_notion_workcopy_links","article_notion_sync","notion_agenda_sync"]) {
    assert.ok(core.includes(mapping), "guard must recognize " + mapping);
  }
});

test("unpublish mirrors the exact existing Notion status enums and tolerates unmigrated schemas", () => {
  const adapters = source("lib/notion-events-help-adapters.ts");
  assert.match(adapters, /normalized === "draft"/);
  assert.match(adapters, /const normalized = value\.toUpperCase\(\) \|\| "DRAFT"/);
  const propertyMap = core.split("function notionDraftProperties(")[1]?.split("async function mirrorDraft")[0];
  assert.ok(propertyMap, "must resolve exact Notion status selection per agenda");
  assert.match(propertyMap, /kind==="help"\?"draft"/);
  assert.match(propertyMap, /kind==="lost-found"\?"DRAFT"/);
  assert.match(propertyMap, /kind==="articles"\?"Ready"/);
  const guard = core.split("export async function notionPageHasAdminUnpublishGuard")[1]
    ?.split("export async function notionPageMustSkipInboundSync")[0];
  assert.ok(guard);
  assert.match(guard, /sqlite_master/);
  assert.match(guard, /if\(!present\.has\("admin_record_publication_guards"\)\)return false/);
  assert.match(guard, /if\(!present\.has\(table\)\)return/);
});

test("archived records are not silently converted into drafts by the unpublish action", () => {
  const body = core.split("export async function unpublishRecord(")[1]
    ?.split("/** Called only AFTER")[0];
  assert.ok(body);
  assert.match(body, /!spec\.publicStatuses\.includes\(clean\(row\.status\)\)/);
  assert.match(body, /throw Error\("RECORD_NOT_PUBLIC"\)/);
  const route = source("app/api/admin/record-lifecycle/[kind]/[id]/route.ts");
  assert.match(route, /code==="RECORD_NOT_PUBLIC"\|\|/);
  assert.match(dialog, /preview\?preview\.published:publicStates\.has\(status\)/);
  assert.doesNotMatch(dialog.split("const publicStates=new Set(")[1]?.split(");")[0]??"", /ARCHIVED/);
});

test("remote Notion deletion cannot begin unless the canonical D1 row was hidden", () => {
  const removal = core.split("export async function removeRecord(")[1] ?? "";
  assert.match(removal, /const \[,hideResult\]=await db\.batch\(\[insert,hide\]\)/);
  assert.match(removal, /hideResult\.meta\?\.changes/);
  const hidden = removal.indexOf("RECORD_HIDE_NOT_CONFIRMED");
  const remote = removal.indexOf("for(const target of targets)await verifyTrash");
  assert.ok(hidden >= 0 && remote > hidden);
  assert.match(removal, /WHERE id=\?"/);
});

test("READY_LOCAL retries D1 only; the verified Notion-trash receipt is durable", () => {
  const removal = core.split("export async function removeRecord(")[1] ?? "";
  const skip = removal.indexOf('if(prior?.state!=="READY_LOCAL")');
  const remote = removal.indexOf("for(const target of targets)await verifyTrash");
  const cleanup = removal.indexOf("await completeLocalRemoval(db,kind,id,targets)");
  assert.ok(skip >= 0 && remote > skip && cleanup > remote,
    "remote trash must be skipped after an existing READY_LOCAL receipt");
  assert.match(removal, /notionTrash:targets\.length\?"confirmed":"unlinked"/);
});

test("verified breed removal clears exact work-copy identity and typed receipts", () => {
  const cleanup = core.split("async function completeLocalRemoval(")[1]
    ?.split("export async function removeRecord(")[0] ?? "";
  assert.match(cleanup, /DELETE FROM breed_notion_workcopy_links WHERE breed_id=\?/);
  assert.match(cleanup, /DELETE FROM breed_notion_controlled_values WHERE breed_id=\?/);
  assert.match(cleanup, /DELETE FROM notion_agenda_sync WHERE agenda=\? AND entity_id=\?/);
  assert.match(cleanup, /if\(mapping && present\.has\(mapping\.table\)\)/);
});

test("optional relation cleanup is schema-gated and never removes linked entities", () => {
  const cleanup = core.split("async function completeLocalRemoval(")[1]
    ?.split("export async function removeRecord(")[0] ?? "";
  assert.match(cleanup, /present\.has\("breed_article_relations"\)/);
  assert.match(cleanup, /present\.has\("breed_directory_relations"\)/);
  assert.doesNotMatch(cleanup, /DELETE FROM managed_breeds|DELETE FROM managed_articles WHERE.*breed_id|DELETE FROM directory_profiles WHERE.*breed_id/);
});

test("destructive confirmation is bound to the exact record displayed in Admin", () => {
  const removal = core.split("export async function removeRecord(")[1] ?? "";
  assert.match(removal, /expected:\{slug:string;name:string;category:string\}/);
  assert.match(removal, /if\(!matches\(meta\)\)throw Error\("RECORD_CONFIRMATION_MISMATCH"\)/);
  assert.match(removal, /if\(!matches\(\{slug:prior\.record_slug,name:prior\.record_name,category:prior\.record_category\}\)\)/);
  assert.match(route, /DELETE_IDENTITY_REQUIRED/);
  assert.match(route, /body\.expectedSlug/);
  assert.match(route, /body\.expectedName/);
  assert.match(route, /body\.expectedCategory/);
  assert.match(dialog, /expectedSlug:preview\.slug/);
  assert.match(dialog, /expectedName:preview\.name/);
  assert.match(dialog, /expectedCategory:preview\.category/);
});

test("event deletion protects both legacy and generic Notion mapping identities", () => {
  const mapping = core.split("async function mappedTargets(")[1]?.split("async function tombstone(")[0] ?? "";
  assert.match(mapping, /SELECT notion_page_id FROM event_notion_sync WHERE event_id=\?/);
  assert.match(mapping, /SELECT notion_page_id FROM notion_agenda_sync WHERE agenda='events' AND entity_id=\?/);
  assert.match(mapping, /NOTION_MAPPING_AMBIGUOUS/);
  assert.match(mapping, /const unique=new Map<string,NotionTarget>\(\)/);
  const guard = core.split("export async function notionPageHasAdminUnpublishGuard")[1]
    ?.split("export async function notionPageMustSkipInboundSync")[0] ?? "";
  assert.match(guard, /WHEN 'events' THEN 'events'/);
  assert.match(route, /code==="NOTION_MAPPING_AMBIGUOUS"\|\|/);
});

test("unpublished breeds cannot be revived from any Notion work-copy migration stage", () => {
  const guard = core.split("export async function notionPageHasAdminUnpublishGuard")[1]
    ?.split("export async function notionPageMustSkipInboundSync")[0] ?? "";
  assert.match(guard, /w\.original_notion_page_id IN \(\?,\?\) OR w\.work_notion_page_id IN \(\?,\?\)/);
  assert.doesNotMatch(guard, /w\.status='ACTIVE'/);
});

test("Notion UUID spellings and remote provenance are checked before destructive D1 writes", () => {
  assert.match(core, /function notionPageIdVariants\(pageId:string\)/);
  assert.match(core, /notion_page_id IN \(\?,\?\)/);
  assert.match(core, /json_extract\(json_each\.value,'\$\.pageId'\) IN \(\?,\?\)/);
  const deletion = core.split("export async function removeRecord(")[1] ?? "";
  const firstProvenance=deletion.indexOf("assertNotionTargetsConfigured(targets)");
  const firstTombstoneInsert=deletion.indexOf("INSERT INTO admin_record_tombstones");
  assert.ok(firstProvenance>=0 && firstProvenance<firstTombstoneInsert);
  assert.match(deletion, /assertNotionTargetsConfigured\(targets\)/);
  assert.match(route, /NOTION_MAPPING_INVALID/);
  assert.match(dialog, /NOTION_DATA_SOURCE_UNCONFIGURED/);
});
