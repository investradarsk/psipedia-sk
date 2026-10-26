import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  verifyNotionWebhook, metadataOnlyChange, sameSource,
} from "../lib/notion-webhook-contract.ts";
import {
  sameNotionProperty, selectiveNotionProperties,
} from "../lib/notion-selective-property-patch.ts";

const text = value => ({ rich_text: value ? [{ type: "text", text: { content: value } }] : [] });
const remoteText = value => ({ rich_text: value ? [{ type: "text", plain_text: value }] : [] });

test("Notion HMAC signs the exact raw body, rejects altered bytes and missing signatures", async () => {
  const body = '{"type":"page.properties_updated","entity":{"id":"00000000-0000-0000-0000-000000000001","type":"page"}}';
  const secret = "secret_example_test_only";
  const signed = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(await verifyNotionWebhook(body, signed, secret), true);
  assert.equal(await verifyNotionWebhook(body + " ", signed, secret), false);
  assert.equal(await verifyNotionWebhook(body, signed, "wrong"), false);
  assert.equal(await verifyNotionWebhook(body, null, secret), false);
  assert.equal(await verifyNotionWebhook(body, "sha256=abc", secret), false);
});

test("metadata only echoes are ignored even for Notion opaque property IDs", () => {
  const page = { properties: {
    "Sync stav": { id: "abCD", select: { name: "Synchronizované" } },
    "Telefón": { id: "pqRS", phone_number: "0900" },
    "Posledný sync": { id: "last", date: { start: "2026-10-25" } },
  } };
  assert.equal(metadataOnlyChange({
    type: "page.properties_updated", data: { updated_properties: ["abCD", "last"] },
  }, page), true);
  assert.equal(metadataOnlyChange({
    type: "page.properties_updated", data: { updated_properties: ["pqRS"] },
  }, page), false);
  assert.equal(metadataOnlyChange({
    type: "page.properties_updated", data: { updated_properties: ["unknown"] },
  }, page), false);
  assert.equal(metadataOnlyChange({ type: "page.content_updated" }, page), false);
  assert.equal(metadataOnlyChange({ type: "page.properties_updated",
    data: { updated_properties: ["Dátum publikácie"] } }, page), false);
  assert.equal(sameSource("ABCD-1234", "abcd1234"), true);
  assert.equal(sameSource(undefined, "abcd1234"), false);
});

test("minimal PATCH contains the one changed phone, not other unchanged fields", () => {
  const remote = {
    "Názov": remoteText("Vet ABC"),
    "Telefón": { phone_number: "0900" },
    "Web": { url: "https://example.sk" },
    "Sync stav": { select: { name: "Synchronizované" } },
    "Sync hash": remoteText("oldhash"),
    "Posledný sync": { date: { start: "2026-10-24" } },
  };
  const desired = {
    "Názov": text("Vet ABC"), "Telefón": { phone_number: "0999" },
    "Web": { url: "https://example.sk" },
    "Sync stav": { select: { name: "Synchronizované" } },
    "Sync hash": text("newhash"),
    "Posledný sync": { date: { start: "2026-10-25" } },
  };
  const patch = selectiveNotionProperties(remote, desired);
  assert.deepEqual(Object.keys(patch).sort(), ["Telefón", "Sync hash", "Posledný sync"].sort());
  assert.equal(sameNotionProperty(remote["Názov"], desired["Názov"]), true);
});

test("no-op saves and metadata clock alone cause no Notion write", () => {
  const remote = { "Intro": remoteText("A"), "Posledný sync": { date: { start: "2026-10-24" } } };
  const desired = { "Intro": text("A"), "Posledný sync": { date: { start: "2026-10-25" } } };
  assert.equal(selectiveNotionProperties(remote, desired), null);
});

test("explicit empty value is a real change, omitted API property is not deletion", () => {
  assert.equal(sameNotionProperty(remoteText("ABC"), text("")), false);
  assert.deepEqual(selectiveNotionProperties({ "Intro": remoteText("ABC") }, { "Intro": text("") }), {
    "Intro": text(""),
  });
  assert.throws(
    () => selectiveNotionProperties({}, { "Intro": text("") }),
    /NOTION_PROPERTY_MISSING_IN_RESPONSE/,
  );
  assert.throws(() => selectiveNotionProperties({
    "Intro": { rich_text: Array.from({ length: 25 }, () => ({ plain_text: "x" })) },
  }, { "Intro": text("new") }), /NOTION_LONG_PROPERTY_REQUIRES_COMPLETE_READ/);
  assert.equal(sameNotionProperty({ multi_select: [{ name: "B" }, { name: "A" }] }, {
    multi_select: [{ name: "A" }, { name: "B" }],
  }), true);
});

test("targeted runners are scoped, do not turn into full scheduled sweeps", async () => {
  for (const path of ["../lib/notion-directory-sync.ts", "../lib/notion-breed-sync.ts",
    "../lib/notion-article-sync.ts", "../lib/notion-eshop-sync.ts"]) {
    const code = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(code, /targetPageId\?: string/);
  }
  const directory = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  assert.match(directory, /targetProfileId\?: number/);
  assert.match(directory, /if \(input\.targetProfileId !== undefined\)/);
  const webhook = await readFile(new URL("../app/api/integrations/notion/webhook/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /verifyNotionWebhook\(/);
  assert.match(webhook, /notionPageBelongsToDataSource\(/);
  assert.match(webhook, /NOTION_WEBHOOK_SYNC_ENABLED/);
  assert.doesNotMatch(webhook, /runNotionFacebookImagesSync|runServicesV3CatalogAutoSweep/);
  assert.match(webhook, /runNotionEventsHelpSyncSweep\(/);
  assert.match(webhook, /webhookMappedOnly: true/);
  assert.match(webhook, /targetPageId: id/);
  assert.doesNotMatch(webhook, /event\.type === "page\.content_updated"\) return "ignored"/);
  const help = await readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.match(help, /if \(input\.webhookMappedOnly && input\.targetPageId\)/);
  assert.match(help, /pages = \[page\]/);
  assert.match(help, /targetEntityId = Number\(mapping\.entity_id\)/);
  assert.match(help, /input\.definition\.load\(input\.database, targetEntityId\)/);
  const loaders = await readFile(new URL("../lib/notion-bulk-sources.ts", import.meta.url), "utf8");
  assert.match(loaders, /WHERE managed_events\.id = \?/);
  assert.match(loaders, /FROM help_cases WHERE .*AND id = \?/);
});

test("Admin save hooks target only one prelinked record after canonical save", async () => {
  const cases = [
    ["app/api/admin/eshops/[id]/route.ts", "eshops", "updateManagedEshop("],
    ["app/api/admin/events/[id]/route.ts", "events", "updateManagedEvent("],
    ["app/api/admin/organizations/[id]/route.ts", "organizations", "updateOrganizationFromAdmin("],
    ["app/api/admin/adoptions/[id]/route.ts", "adoptions", "updateAdoptionFromAdmin("],
    ["app/api/admin/help/[id]/route.ts", "help-cases", "updateManagedHelpCase("],
    ["app/api/admin/lost-found/[id]/route.ts", "lost-found", "updateAdminDogReport("],
  ];
  for (const [path, agenda, save] of cases) {
    const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
    const put = source.slice(source.indexOf("export async function PUT("));
    assert.ok(put.indexOf(save) >= 0, path + " must save canonically");
    assert.ok(put.indexOf("syncSavedNotionRecord({") > put.indexOf(save),
      path + " must write only after successful canonical persistence");
    assert.ok(put.includes('agenda: "' + agenda + '"'), path + " must target its own agenda");
    assert.ok(put.includes("notionFieldSync"), path + " must expose nonsecret sync status");
    const get = source.slice(source.indexOf("export async function GET("),
      source.indexOf("export async function PUT("));
    assert.equal(get.includes("syncSavedNotionRecord({"), false, path + " GET must not sync");
    const deleteAt = source.indexOf("export async function DELETE(");
    if (deleteAt >= 0) assert.equal(source.slice(deleteAt).includes("syncSavedNotionRecord({"), false,
      path + " DELETE must not sync or resurrect a removed profile");
  }
  const events = await readFile(
    new URL("../app/api/admin/events/[id]/route.ts", import.meta.url), "utf8");
  assert.ok(events.includes("quickEditManagedEvent(") &&
    events.includes('agenda: "events", entityId: event.id'),
    "Event quick-edit must also synchronize its saved record");
});

test("Admin-save E-shop reconciliation is one-mapping only, without creating pages or full scans", async () => {
  const source = await readFile(new URL("../lib/notion-eshop-sync.ts", import.meta.url), "utf8");
  const runner = source.slice(source.indexOf("export async function runNotionEshopSyncSweep"));
  assert.ok(runner.includes("targetShopId?: number;"));
  const one = runner.slice(
    runner.indexOf("if (input.targetShopId !== undefined) {"),
    runner.indexOf("if (!input.targetPageId) {"),
  );
  assert.ok(one.includes("loadMappingByShop(input.database, input.targetShopId)"));
  assert.ok(one.includes("if (!mapping) return summary"));
  assert.ok(one.includes("await syncMapped("));
  assert.ok(one.includes("return summary"));
  for (const prohibited of ["runNotionEshopBootstrapSweep(", "recentPages(",
    "changedIds(", "createFromNotion(", "writeShopToNotion("]) {
    assert.equal(one.includes(prohibited), false, "fast path must not call " + prohibited);
  }
  assert.ok(runner.includes("NOTION_ESHOP_TARGET_SCOPE_AMBIGUOUS"));
  assert.ok(runner.includes("NOTION_ESHOP_TARGET_SHOP_INVALID"));
});

test("Admin save sync fails closed and never reports unconfigured or unmapped as synchronized", async () => {
  const source = await readFile(
    new URL("../lib/notion-targeted-admin-save.ts", import.meta.url), "utf8");
  const help = await readFile(
    new URL("../lib/notion-targeted-admin-help.ts", import.meta.url), "utf8");
  assert.ok(source.includes('NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED !== "true"'));
  assert.ok(source.includes('if (!bindings.DB) return "pending"'));
  assert.ok(source.includes("targetShopId: entityId"));
  assert.ok(source.includes('return "pending"'));
  assert.ok(source.includes(' ? "synced" : "unlinked"'));
  assert.ok(source.includes("syncOneAdminHelpRecord("));
  assert.ok(help.includes("if (!summary.enabled || !summary.schemaReady) return \"pending\";"));
  assert.ok(help.includes("webhookMappedOnly: true"));
  assert.ok(help.includes("agendas: [input.agenda]"));
});

test("Events and Help targeted writes avoid reading unrelated agenda mappings", async () => {
  const source = await readFile(
    new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  const mappings = source.slice(source.indexOf("async function loadMappings("),
    source.indexOf("async function saveMapping("));
  assert.ok(mappings.includes("targetPageId?: string"));
  assert.ok(mappings.includes(' WHERE notion_page_id=?'));
  assert.ok(mappings.includes(' AND notion_page_id=?'));
  assert.ok(source.includes("input.webhookMappedOnly ? input.targetPageId : undefined"));
  assert.ok(source.includes('input.definition.key === "help-cases" && !input.webhookMappedOnly'),
    "global Help diagnostics must not turn an unrelated conflict into a failed one-record save");
  const hook = await readFile(
    new URL("../lib/notion-targeted-admin-help.ts", import.meta.url), "utf8");
  assert.ok(hook.includes("webhookMappedOnly: true"));
  assert.ok(hook.includes("targetPageId: mapping.notion_page_id"));
});

test("unmapped Events/Help Notion webhook pages are imported through existing review gates", async () => {
  const webhook = await readFile(
    new URL("../app/api/integrations/notion/webhook/route.ts", import.meta.url), "utf8");
  const sync = await readFile(
    new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.ok(webhook.includes("verifyNotionWebhook("));
  assert.ok(webhook.includes("notionPageBelongsToDataSource(page,"));
  assert.ok(webhook.includes("webhookMappedOnly: true,"));
  assert.ok(webhook.includes("webhookImportUnmapped: true,"));
  assert.equal(webhook.includes("runNotionFacebookImagesSync("), false);
  assert.equal(webhook.includes("runServicesV3CatalogAutoSweep("), false);
  const mapped = sync.slice(sync.indexOf("// Webhook fast path:"),
    sync.indexOf("let sources = await input.definition.load("));
  assert.ok(mapped.includes("if (!mapping && !input.webhookImportUnmapped) return summary"),
    "Admin writeback must continue to skip unknown Notion pages");
  assert.ok(mapped.includes("if (mapping) {"), "mapped webhook pages still use their verified ID");
  assert.ok(mapped.includes("const webhookNewPage ="));
  assert.ok(mapped.includes("pages = [page]"), "new page path must not enumerate the whole Notion source");
  assert.ok(mapped.includes("if (clean(pageProperty(page, \"Psipedia ID\"))) return summary"),
    "a Notion-claimed canonical ID is never imported as a new identity");
  assert.ok(mapped.includes("readyForCreate(input.definition.key, preview)"));
  assert.ok(mapped.includes("gemini_notion_created_pages"),
    "only signed worker provenance may bypass human Ready");
  const loop = sync.slice(sync.indexOf("for (const source of sources)"),
    sync.indexOf("// Import new Notion rows"));
  assert.ok(loop.includes("if (webhookNewPage) break"),
    "new-page delivery must NEVER bootstrap unrelated canonical profiles");
  assert.ok(sync.includes("trustedGeminiSourceIsPrivateDraft("));
  assert.ok(sync.includes("helpCaseMayEnterCanonicalSync("));
  assert.ok(sync.includes("sourceDuplicateCandidate("));
  assert.ok(sync.includes("createCanonicalFromNotion(input.definition.key, draftValues"));
});

test("new-page webhook mode requires one signed-target scope and cannot bypass review", async () => {
  const sync = await readFile(
    new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  const runner = sync.slice(sync.indexOf("export async function runNotionEventsHelpSyncSweep"));
  assert.ok(runner.includes('throw new Error("NOTION_WEBHOOK_NEW_PAGE_SCOPE_INVALID")'));
  assert.ok(runner.includes('input.mode !== "sync" || input.reviewedLegacy'));
  assert.ok(runner.includes("input.agendas?.length !== 1"));
  assert.ok(runner.includes("input.webhookMappedOnly"));
  assert.ok(runner.includes("webhookImportUnmapped: input.webhookImportUnmapped"));
  const create = sync.slice(sync.indexOf("// Import new Notion rows"), sync.indexOf("// Canonical GEO"));
  assert.ok(create.includes("input.targetPageId && page.id !== input.targetPageId"));
  assert.ok(create.includes("if (mappedPageIds.has(page.id)) continue"));
  assert.ok(create.includes("provenance.canonical_entity_id !== null"));
  assert.ok(create.includes("GEMINI_PRIVATE_DRAFT_REQUIRED"));
  assert.ok(create.includes("GEMINI_PROVENANCE_MISMATCH"));
  assert.ok(create.includes("GEMINI_CATEGORY_MISMATCH"));
  assert.ok(create.includes('clean(pageProperty(page, "Vytvoril")) === "Gemini automatizácia"'));
  assert.ok(create.includes("const liveMappings = await loadMappings("));
  assert.ok(create.includes("acquireGeminiNotionLock(input.database, page.id)"));
  assert.ok(create.includes("const latest = await notionRequest<NotionPage>"));
  assert.ok(create.includes("if (sourceDuplicateCandidate(latest"));
  assert.ok(create.indexOf("await saveMapping({") < create.indexOf("const written = await writeSourceToNotion({"),
    "durable mapping must be recorded before uncertain remote writeback");
  assert.ok(create.includes("if (trustedGemini) {"));
  assert.ok(create.includes("UPDATE gemini_notion_created_pages SET canonical_entity_id"));
});
