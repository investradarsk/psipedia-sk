import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { enqueueNotionWebhook, runNotionWebhookInboxSweep } from "../lib/notion-webhook-inbox.ts";
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
  const dispatch = await readFile(new URL("../lib/notion-webhook-dispatch.ts", import.meta.url), "utf8");
  assert.match(dispatch, /notionPageBelongsToDataSource\(/);
  assert.match(webhook, /NOTION_WEBHOOK_SYNC_ENABLED/);
  assert.doesNotMatch(webhook, /runNotionFacebookImagesSync|runServicesV3CatalogAutoSweep/);
  assert.match(dispatch, /runNotionEventsHelpSyncSweep\(/);
  assert.match(dispatch, /webhookMappedOnly: true/);
  assert.match(dispatch, /targetPageId: id/);
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
  const dispatch = await readFile(new URL("../lib/notion-webhook-dispatch.ts", import.meta.url), "utf8");
  const sync = await readFile(
    new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.ok(webhook.includes("verifyNotionWebhook("));
  assert.ok(dispatch.includes("notionPageBelongsToDataSource(page,"));
  assert.ok(dispatch.includes("webhookMappedOnly: true,"));
  assert.ok(dispatch.includes("webhookImportUnmapped: true,"));
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

test("targeted Admin Help statuses require actual reconciliation evidence", async () => {
  const source = await readFile(new URL("../lib/notion-targeted-admin-help.ts", import.meta.url), "utf8");
  const functionOnly = source.slice(source.indexOf("export async function syncOneAdminHelpRecord("));
  const compiled = ts.transpileModule(functionOnly, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const makeCase = (overrides, linked = true) => {
    const calls = [];
    const item = {
      agenda: "events", enabled: true, schemaReady: true, targetMissing: false,
      dataSourceId: "84e0664c-ca47-405f-9d54-31b20287bc8c",
      scanned: 1, unchanged: 1, pulledFromNotion: 0,
      pushedToNotion: 0, bootstrapped: 0,
      ...overrides,
    };
    const totals = { failed: 0, conflicts: 0, reviewRequired: 0, ...overrides.totals };
    const summary = { enabled: true, schemaReady: true, agendas: [item], totals, ...overrides.summary };
    const context = {
      exports: {},
      runNotionEventsHelpSyncSweep: async args => { calls.push(args); return summary; },
    };
    runInNewContext(compiled, context);
    const input = {
      database: { prepare: () => ({ bind: () => ({
        first: async () => linked ? { notion_page_id: "11111111-1111-4111-8111-111111111111" } : null,
      }) }) },
      bindings: { NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED: "true" },
      agenda: "events", entityId: 17,
    };
    return { input, calls, run: () => context.exports.syncOneAdminHelpRecord(input) };
  };
  const ok = makeCase({});
  assert.equal(await ok.run(), "synced");
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0].webhookMappedOnly, true);
  assert.equal(ok.calls[0].targetPageId, "11111111-1111-4111-8111-111111111111");
  const orphan = makeCase({ unchanged: 0 });
  assert.equal(await orphan.run(), "pending", "a scanned orphan with no resolved entity is not synced");
  assert.equal(await makeCase({ scanned: 0 }).run(), "pending");
  assert.equal(await makeCase({ targetMissing: true }).run(), "pending");
  assert.equal(await makeCase({ dataSourceId: null }).run(), "pending");
  assert.equal(await makeCase({ summary: { enabled: false } }).run(), "pending");
  assert.equal(await makeCase({ summary: { schemaReady: false } }).run(), "pending");
  assert.equal(await makeCase({ totals: { failed: 1 } }).run(), "pending");
  assert.equal(await makeCase({ totals: { conflicts: 1 } }).run(), "pending");
  assert.equal(await makeCase({}, false).run(), "unlinked");
});

test("Directory and E-shop targeted saves fail closed on missing configuration or orphan mapping", async () => {
  const directory = await readFile(
    new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  const eshop = await readFile(new URL("../lib/notion-eshop-sync.ts", import.meta.url), "utf8");
  assert.ok(directory.includes('!result.enabled || !result.schemaReady || result.failed ? "pending"'));
  assert.ok(directory.includes('result.unchanged ? "unchanged" : "unlinked"'));
  assert.ok(directory.includes('if (!notionEnv.DB) {'));
  assert.ok(eshop.includes('if (!shop) throw new Error("ESHOP_CANONICAL_MAPPING_ORPHAN")'));
});

test("signed webhook only acknowledges a committed D1 receipt", async () => {
  const webhook = await readFile(
    new URL("../app/api/integrations/notion/webhook/route.ts", import.meta.url), "utf8");
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const dispatcher = await readFile(
    new URL("../lib/notion-webhook-dispatch.ts", import.meta.url), "utf8");
  const sql = await readFile(
    new URL("../drizzle/0145_notion_webhook_inbox.sql", import.meta.url), "utf8");
  assert.ok(webhook.includes("verifyNotionWebhook(body,"));
  assert.ok(webhook.includes("NOTION_WEBHOOK_SUBSCRIPTION_ID"));
  assert.ok(webhook.includes('NOTION_WEBHOOK_SYNC_ENABLED !== "true"'));
  assert.ok(webhook.includes("await enqueueNotionWebhook(bindings.DB, data, body)"));
  assert.ok(webhook.includes('result: "queued"'));
  assert.ok(webhook.includes('status: 503'));
  assert.ok(webhook.includes("if (bindings.NOTION_WEBHOOK_INBOX_ENABLED !== \"true\")"));
  assert.ok(webhook.includes("await dispatchNotionPageChange(data, bindings)"));
  assert.ok(webhook.indexOf("await dispatchNotionPageChange(data, bindings)") < webhook.indexOf("await enqueueNotionWebhook(bindings.DB, data, body)"));
  assert.ok(worker.includes("controller.cron === ADMIN_PUSH_CRON"));
  assert.ok(worker.includes("pushTaskEnabled(env.NOTION_WEBHOOK_INBOX_ENABLED)"));
  assert.ok(worker.includes("runNotionWebhookInboxSweep({"));
  assert.ok(worker.includes("process: event => dispatchNotionPageChange(event, env)"));
  assert.ok(dispatcher.includes('if (!summary.enabled) return "disabled"'));
  assert.ok(dispatcher.includes('throw new Error("NOTION_TARGETED_SCHEMA_UNAVAILABLE")'));
  assert.ok(sql.includes("CREATE TABLE notion_webhook_inbox"));
  assert.ok(sql.includes("CREATE INDEX notion_webhook_inbox_pending"));
  assert.ok(sql.includes("CREATE INDEX notion_webhook_inbox_page"));
});

test("durable Notion receipts deduplicate by event ID and store no values", async () => {
  const statements = [];
  const db = { prepare: sql => ({
    bind: (...args) => ({
      run: async () => { statements.push({sql, args}); },
    }),
  }) };
  const event = { id: "aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    type: "page.properties_updated",
    entity: { id: "11111111-2222-4333-8444-555555555555", type: "page" },
    data: {updated_properties: ["Phone", "abc123"]},
  };
  await enqueueNotionWebhook(db, event, JSON.stringify(event));
  await enqueueNotionWebhook(db, event, JSON.stringify(event));
  assert.equal(statements.length, 2);
  assert.ok(statements.every(s => s.sql.includes("INSERT OR IGNORE")));
  assert.equal(statements[0].args[0], statements[1].args[0]);
  assert.equal(statements[0].args[0], event.id);
  assert.deepEqual(JSON.parse(statements[0].args[3]), ["Phone", "abc123"]);
  assert.equal(JSON.stringify(statements).includes("0900"), false);
});

test("inbox retries transient processing failures without silently dropping the event", async () => {
  const writes = [];
  let claimed = false;
  const db = { prepare: sql => ({
    bind: (...args) => ({
      first: async () => {
        if (!sql.includes("RETURNING event_key")) throw new Error("unexpected claim");
        if (claimed) return null;
        claimed = true;
        return { event_key: "evt", page_id: "11111111-2222-4333-8444-555555555555",
          event_type: "page.content_updated", changed_properties_json: "[]", attempts: 1 };
      },
      run: async () => { writes.push({sql, args}); },
    }),
  }) };
  const result = await runNotionWebhookInboxSweep({
    database: db, now: 1_800_000_000_000, process: async () => {
      throw new Error("simulated upstream outage");
    },
  });
  assert.deepEqual(result, {claimed: 1, done: 0, review: 0, retried: 1});
  assert.ok(writes.some(w => w.sql.includes("status='PENDING'")));
  assert.ok(writes.every(w => !w.sql.startsWith("UPDATE notion_webhook_inbox SET status='DONE'")));
  assert.ok(writes.every(w => !JSON.stringify(w).includes("simulated upstream outage")));
});
