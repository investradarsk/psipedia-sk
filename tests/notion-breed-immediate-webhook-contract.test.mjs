import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const webhook = read("app/api/integrations/notion/webhook/route.ts");
const breedSave = read("app/api/admin/breeds/[id]/route.ts");
const dispatch = read("lib/notion-webhook-dispatch.ts");

test("signed edits on mapped breeds use immediate field dispatch, never an unverified page ID", () => {
  assert.match(webhook, /data\.type === "page\.properties_updated"/);
  assert.match(webhook, /data\.data\?\.updated_properties\?\.length/);
  assert.match(webhook, /work_notion_page_id=\? AND status='ACTIVE'/);
  assert.match(webhook, /breed_notion_sync [\s\S]*?notion_page_id=\? LIMIT 1/);
  assert.match(webhook, /if \(mapping\) \{\s*const result = await dispatchNotionPageChange\(data, bindings\)/);
  assert.match(dispatch, /notionPageBelongsToDataSource\(page/);
  assert.match(dispatch, /runNotionBreedWorkCopySyncSweep/);
  assert.match(dispatch, /changedPropertyIds: event\.data\?\.updated_properties/);
});

test("a failed breed inline dispatch falls back to durable webhook inbox", () => {
  const immediate = webhook.indexOf("notion_breed_immediate_dispatch_deferred");
  const enqueue = webhook.lastIndexOf("await enqueueNotionWebhook(bindings.DB, data, body)");
  assert(immediate > 0);
  assert(enqueue > immediate);
  assert.match(webhook, /result === "processed" \|\| result === "metadata-only"/);
  assert.doesNotMatch(webhook, /result === "deferred"[\s\S]*?return Response\.json\(\{ received: true, result \}/);
});

test("Admin PUT and PATCH mark an incomplete per-field Notion write as pending", () => {
  const matches = breedSave.match(/"pendingFields" in result && result\.pendingFields\?\.length/g) ?? [];
  assert(matches.length >= 2);
  assert.match(breedSave, /BREED_NOTION_FIELDS_PENDING/);
});
