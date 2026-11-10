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
  assert.match(body, /SET status=\?,updated_at=\? WHERE id=\? AND status=\?/);
  assert.match(body, /db\.batch\(\[guard,update\]\)/);
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
  assert.match(dialog, /confirmation!=="VYMAZAŤ"/);
  assert.match(route, /strictProvenance:true/);
  assert.match(route, /body\.confirmation!=="VYMAZAŤ"/);
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
    "notion-breed-workcopy-sync",
  ]) {
    const content = source("lib/" + adapter + ".ts");
    assert.match(content, /await notionPageMustSkipInboundSync\(/,
      adapter + " must not replay a hidden Admin record");
  }
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
