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
