import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("directory website save uses canonical persisted D1 column, not stale legacy Web alias", () => {
  const editor = source("components/admin-directory-editor.tsx");
  assert.match(editor, /unconfirmedWebsite[\s\S]*data\.profile\.websiteUrl/);
  assert.doesNotMatch(editor, /readDirectoryPublicContacts\(data\.profile\.importData/);
  assert.match(editor, /setWebsiteUrl\(savedProfile\.websiteUrl \?\? ""\)/);
  assert.match(editor, /pendingNotionFields/);
  assert.match(editor, /prenos do Notionu zatiaľ nie je potvrdený/);
});

test("explicit dirty fields are sent from the committed directory save to Notion", () => {
  const route = source("app/api/admin/directory/[id]/route.ts");
  assert.match(route, /breederAdminFields: isDirectoryFieldEventCategory\(before\.category\)[\s\S]*?\(editedPaths \?\? breederEditedFields\(before, profile\)\)/);
  assert.match(route, /updateManagedDirectoryProfile\(id, payload, user\.email, before\)/);
});

test("targeted Notion writeback confirms field echoes before marking synchronization complete", () => {
  const sync = source("lib/notion-directory-sync.ts");
  const start = sync.indexOf('  const fields = (input.adminChangedFields ?? []).filter(');
  const end = sync.indexOf('/**\n * Admin relation choices', start);
  assert.ok(start >= 0 && end > start);
  const writeback = sync.slice(start, end);
  assert.match(writeback, /const echoed = await patchNotionPage\(bindings, page\.id, patch\)/);
  assert.match(writeback, /fields\.every\(path =>/);
  assert.match(writeback, /DIRECTORY_ADMIN_TO_NOTION_FIELD_ECHO_MISMATCH/);
  assert.ok(writeback.indexOf("DIRECTORY_ADMIN_TO_NOTION_FIELD_ECHO_MISMATCH") <
    writeback.indexOf('"Sync stav": select("Synchronizované")'));
  assert.match(sync, /DIRECTORY_TARGETED_NOTION_SYNC_FAILED/);
});
