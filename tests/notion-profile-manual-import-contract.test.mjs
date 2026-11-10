import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { breederApplyNotionChanges } from "../lib/notion-breeder-field-events.ts";
import { workCopyNonblankChangedFields } from "../lib/notion-breed-workcopy-field-events.mjs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("an explicitly cleared Directory field transfers, but a missing field never does", () => {
  const old = { websiteUrl: "https://old.example", facebookUrl: "https://fb.example",
    qualifications: ["old"], name: "Salon" };
  const updated = breederApplyNotionChanges(old,
    { websiteUrl: "", qualifications: [] }, ["websiteUrl", "qualifications"]);
  assert.equal(updated.websiteUrl, "");
  assert.deepEqual(updated.qualifications, []);
  assert.equal(updated.facebookUrl, old.facebookUrl);
  assert.equal(updated.name, old.name);
  assert.deepEqual(breederApplyNotionChanges(old, {}, ["websiteUrl"]), old);
});

test("a signed work-copy breed edit may clear text, never use absent values as deletion", () => {
  const selected = workCopyNonblankChangedFields({
    allowed: ["intro", "history", "health"], changed: ["intro", "history", "health"],
    accepted: ["intro", "history", "health"],
    values: { intro: "", history: null },
  });
  assert.deepEqual(selected, ["intro", "history"]);
});

test("one-profile Notion import is authenticated, mapped, and scoped to the proper adapter", () => {
  const route = read("app/api/admin/notion-profile-import/route.ts");
  const button = read("components/admin-notion-profile-import-button.tsx");
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /Object\.keys\(args\)\.some/);
  assert.match(route, /manualDirection: "NOTION_TO_ADMIN"/);
  assert.match(route, /manualImport: true/);
  assert.match(route, /directory_notion_sync/);
  assert.match(route, /event_notion_sync/);
  assert.match(route, /breed_notion_workcopy_links/);
  assert.match(route, /status='ACTIVE'/);
  assert.doesNotMatch(route, /INSERT INTO/);
  assert.match(button, /dirty/);
  assert.match(button, /window\.confirm/);
  assert.match(button, /window\.location\.reload/);
  for (const [file, scope] of [
    ["components/admin-directory-editor.tsx", "directory"],
    ["components/admin-event-editor.tsx", "events"],
    ["components/admin-breed-editor.tsx", "breeds"],
  ]) {
    assert.match(read(file), new RegExp('AdminNotionProfileImportButton scope="' + scope + '"'));
  }
});

test("Admin main-image writeback is narrowly scoped to mapped directory images", () => {
  const sync = read("lib/notion-directory-sync.ts");
  const route = read("app/api/admin/directory/[id]/route.ts");
  const eventsSync = read("lib/notion-events-help-sync.ts");
  assert.match(sync, /export async function mirrorDirectoryMainImageToNotion/);
  assert.match(sync, /notionDirectoryPageBelongsToSource\(page, dataSourceId\)/);
  assert.match(sync, /DIRECTORY_IMAGE_NOTION_TARGET_INVALID/);
  assert.match(sync, /const imageField = "Obrázok Psipedia"/);
  assert.match(sync, /const keyField = "Obrázok key"/);
  assert.match(sync, /DIRECTORY_IMAGE_NOTION_WRITEBACK_UNVERIFIED/);
  assert.match(route, /mainImageChanged/);
  assert.match(route, /await mirrorDirectoryMainImageToNotion/);
  assert.match(eventsSync, /if \(missingNotionImage\) protectedFields\.add/);
  assert.match(eventsSync, /!plan\.changes\.length && !missingNotionImage/);
});

test("event field webhook distinguishes explicitly cleared optional values from missing properties", () => {
  const handler = read("lib/notion-event-field-sync.ts");
  assert.match(handler, /Object\.hasOwn\(input\.page\.properties\?\?\{\},property\)/);
  assert.match(handler, /value\?\?""/);
  assert.match(handler, /EVENT_REQUIRED_FIELD/);
  const eventEditor = read("components/admin-event-editor.tsx");
  const directoryEditor = read("components/admin-directory-editor.tsx");
  assert.doesNotMatch(eventEditor, /Skontroluj URL adresu: \$\{label\}/);
  assert.doesNotMatch(directoryEditor, /Verejný web sa po uložení nepotvrdil\. Skontroluj novú hodnotu v Admine/);
});
