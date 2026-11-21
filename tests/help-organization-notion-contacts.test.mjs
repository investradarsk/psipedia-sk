import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Organization contacts participate in the existing Notion field-event contract", () => {
  const adapters=read("lib/notion-events-help-adapters.ts");
  const fields=adapters.split("organizations: [")[1].split("],")[0];
  for(const name of ["Verejný e-mail","Verejný telefón"]) {
    assert.ok(fields.includes('"' + name + '"'));
  }
  const authority=read("lib/notion-help-field-events.ts");
  assert.match(authority,/agendaEditableFields\[agenda\]/);
  const locks=read("lib/notion-events-help-sync.ts");
  assert.match(locks,/isAdminNotionSyncLocked\(input\.database, input\.definition\.key, entityId\)/);
});

test("Notion contacts map separately to canonical public email and phone", () => {
  const adapters=read("lib/notion-events-help-adapters.ts");
  const payload=adapters.split("function organizationPayload(")[1].split("async function reconcileOrganizationStatus(")[0];
  assert.match(payload,/publicEmail: Object\.hasOwn\(values, "Verejný e-mail"\)/);
  assert.match(payload,/publicPhone: Object\.hasOwn\(values, "Verejný telefón"\)/);
  assert.match(payload,/s\(values\["Verejný e-mail"\]\) \|\| null : existing\?\.publicEmail \?\? null/);
  assert.match(payload,/s\(values\["Verejný telefón"\]\) \|\| null : existing\?\.publicPhone \?\? null/);
  assert.doesNotMatch(payload,/publicEmailsRaw|publicPhonesRaw/);
});

test("Admin and Notion export the same canonical organization contact columns", () => {
  const bulk=read("lib/notion-bulk-sources.ts");
  const orgs=bulk.split("export async function loadNotionBulkOrganizations(")[1].split("export async function loadNotionBulkAdoptions(")[0];
  assert.match(orgs,/o\.public_email,o\.public_phone/);
  assert.match(orgs,/"Verejný e-mail": s\(row\.public_email\)/);
  assert.match(orgs,/"Verejný telefón": s\(row\.public_phone\)/);
  assert.doesNotMatch(orgs,/publicEmailsRaw|publicPhonesRaw/);
});

test("Public organization email accepts plain text without format enforcement", () => {
  const code=read("lib/help-organization-admin-input.ts");
  const email=code.split("function nullableEmail(")[1].split("function nullableImageKey(")[0];
  assert.match(email,/return nullableString\(object, "publicEmail", "Verejný e-mail", 320\)/);
  assert.doesNotMatch(email,/Nemá platný formát|nemá platný formát|@.*@/);
});

test("Existing Help writeback outbox and field-level echo guards remain in use",()=>{
  const save=read("lib/notion-targeted-admin-save.ts");
  const outbox=read("lib/notion-help-admin-outbox.ts");
  assert.match(save,/changedAdminHelpFields\(/);
  assert.match(save,/queueHelpNotionAdminChange\(/);
  assert.match(outbox,/NOTION_FIELD_CHANGED/);
  assert.match(outbox,/ADMIN_FIELD_CHANGED/);
});
