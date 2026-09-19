import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const syncSource = await readFile(new URL("../lib/notion-event-sync.ts", import.meta.url), "utf8");
const sharedSource = await readFile(new URL("../lib/notion-sync-shared.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/admin/notion-events-sync/route.ts", import.meta.url), "utf8");
const eventRouteSource = await readFile(new URL("../app/api/admin/events/[id]/route.ts", import.meta.url), "utf8");
const bulkRouteSource = await readFile(new URL("../app/api/admin/events/bulk/route.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0047_notion_event_sync.sql", import.meta.url), "utf8");
const wranglerSource = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("Ready Notion events flow into Psipedia as draft only", () => {
  assert.match(syncSource, /notionSelectProperty\(page, "Stav"\) !== "Ready"/);
  assert.match(syncSource, /status: "draft"/);
  assert.match(syncSource, /existing\.status !== "draft"/);
  assert.doesNotMatch(syncSource, /status: "published"/);
});

test("event sync uses the exact configured Notion data source and hourly worker", () => {
  assert.match(syncSource, /NOTION_EVENTS_DATA_SOURCE_ID/);
  assert.match(syncSource, /listReadyNotionPages\(args\.bindings, dataSourceId/);
  assert.match(workerSource, /runNotionEventSyncSweep/);
  assert.match(workerSource, /event: "notion_event_sync_sweep"/);
  assert.match(wranglerSource, /"NOTION_EVENT_SYNC_ENABLED": "true"/);
  assert.match(wranglerSource, /"NOTION_EVENTS_DATA_SOURCE_ID": "76d9ccde-5816-422c-bcfe-863ab69db080"/);
});

test("event sync maps the managed event editorial contract", () => {
  for (const field of [
    "Typ podujatia",
    "Začiatok",
    "Čas začiatku",
    "Koniec",
    "Čas konca",
    "Miesto",
    "Mesto",
    "Kraj",
    "Organizátor",
    "Perex",
    "Popis",
    "Praktické info",
    "Web",
    "Registrácia",
    "Zrušené",
    "SEO title",
    "Meta description",
  ]) {
    assert.ok(syncSource.includes(`"${field}"`), `missing Notion event field ${field}`);
  }
});

test("event sync is idempotent, mapped, and refuses silent duplicates", () => {
  assert.match(migrationSource, /notion_page_id TEXT PRIMARY KEY/);
  assert.match(migrationSource, /event_id INTEGER NOT NULL UNIQUE/);
  assert.match(migrationSource, /FOREIGN KEY \(event_id\) REFERENCES managed_events\(id\) ON DELETE CASCADE/);
  assert.match(syncSource, /content_hash/);
  assert.match(syncSource, /assertNoUnmappedDuplicate/);
  assert.match(syncSource, /Automatický sync nevytvorí duplicitu/);
});

test("event images use reusable safe R2 ingestion", () => {
  assert.match(syncSource, /prepareNotionMainImage/);
  assert.match(syncSource, /folder: "events"/);
  assert.match(syncSource, /Hlavný obrázok URL/);
  assert.match(syncSource, /Zdroj obrázka/);
  assert.match(syncSource, /Alt text obrázka/);
  assert.match(sharedSource, /MAX_REMOTE_IMAGE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(sharedSource, /"User-Agent": "PsipediaNotionSync\/1\.0/);
  assert.match(syncSource, /cleanupNotionImageKeys\(bindings\.BUCKET, prepared\.replacedKeys\)/);
});

test("manual event sync trigger is protected by existing admin authentication", () => {
  assert.match(routeSource, /getAdminApiUser/);
  assert.match(routeSource, /unauthorizedAdminResponse/);
  assert.match(routeSource, /runNotionEventSyncSweep/);
});

test("publishing a Notion-linked event writes public state back to Notion", () => {
  assert.match(syncSource, /writeBackPublishedEventToNotion/);
  assert.match(syncSource, /SELECT notion_page_id FROM event_notion_sync WHERE event_id = \?/);
  assert.match(syncSource, /"Stav": \{ select: \{ name: "Publikované" \} \}/);
  assert.match(syncSource, /"URL Psipedia": \{ url: publicUrl \}/);
  assert.match(eventRouteSource, /before\.status !== "published" && event\.status === "published"/);
  assert.match(eventRouteSource, /writeBackPublishedEventToNotion/);
  assert.match(bulkRouteSource, /writeBackPublishedEventToNotion/);
});
