import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const code = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("four Help agendas use explicit property events, not whole-profile replay", async () => {
  const [contract, sync, dispatcher] = await Promise.all([
    code("lib/notion-help-field-events.ts"),
    code("lib/notion-events-help-sync.ts"),
    code("lib/notion-webhook-dispatch.ts"),
  ]);
  for (const agenda of ['"organizations"', '"adoptions"', '"help-cases"', '"lost-found"'])
    assert.ok(contract.includes(agenda), agenda);
  assert.match(contract, /changedNotionHelpFields\(/);
  assert.match(contract, /changedAdminHelpFields\(/);
  assert.match(contract, /ids\.has\(name\).*ids\.has\(id\)/s);
  assert.match(contract, /"Latitude", "Longitude"/);
  assert.match(contract, /"Verejný kontakt"/);
  assert.match(sync, /changedPropertyIds\?: readonly string\[\]/);
  assert.match(sync, /adminChangedFields\?: readonly string\[\]/);
  assert.match(sync, /helpFieldSnapshot\(live, notionSnapshot, field\)/);
  assert.match(sync, /HELP_FIELD_EVENTS_PENDING/);
  assert.match(sync, /isHelpFieldEventAgenda\(input\.definition\.key\)/);
  assert.match(dispatcher, /changedPropertyIds: event\.data\?\.updated_properties \?\? \[\]/);
});

test("Admin Help edits use a before/after canonical field delta", async () => {
  const [bridge, runner, target] = await Promise.all([
    code("lib/notion-targeted-admin-save.ts"),
    code("lib/notion-events-help-sync.ts"),
    code("lib/notion-targeted-admin-help.ts"),
  ]);
  assert.match(bridge, /captureHelpNotionSnapshot/);
  assert.match(bridge, /changedAdminHelpFields/);
  assert.match(bridge, /currentHelpSnapshot\(bindings\.DB, agenda, entityId\)/);
  assert.match(target, /adminChangedFields: input\.changedHelpFields/);
  assert.match(runner, /selectiveNotionProperties\(page\.properties \?\? \{\}, patch\)/);
  assert.match(runner, /HELP_ADMIN_FIELD_ECHO_MISMATCH/);
  assert.match(runner, /fields\.includes\("Slug"\)/);
  for (const path of [
    "app/api/admin/organizations/[id]/route.ts",
    "app/api/admin/adoptions/[id]/route.ts",
    "app/api/admin/help/[id]/route.ts",
    "app/api/admin/lost-found/[id]/route.ts",
  ]) {
    const source = await code(path);
    assert.match(source, /const beforeHelpSnapshot = await captureHelpNotionSnapshot/);
    assert.match(source, /syncSavedNotionRecord/);
  }
});

test("e-shops receive per-property webhook edits, with separate Admin rating mirror", async () => {
  const [sync, editor, dispatcher] = await Promise.all([
    code("lib/notion-eshop-sync.ts"),
    code("app/api/admin/eshops/[id]/route.ts"),
    code("lib/notion-webhook-dispatch.ts"),
  ]);
  assert.match(sync, /eshopNotionEditedFields\(page, input\.webhookChangedPropertyIds\)/);
  assert.match(sync, /adminChangedFields\?: readonly EshopAdminField\[\]/);
  assert.match(sync, /ESHOP_FIELD_EVENTS_PENDING/);
  assert.match(sync, /ESHOP_ADMIN_FIELD_ECHO_MISMATCH/);
  assert.match(sync, /mirrorEshopSystemFields\(/);
  assert.match(sync, /"Počet hodnotení", "Celkové hodnotenie"/);
  assert.match(sync, /if \(path === "logoUrl"\)/);
  assert.match(editor, /beforeEshop: before/);
  assert.match(dispatcher, /changedPropertyIds: event\.data\?\.updated_properties \?\? \[\]/);
});
