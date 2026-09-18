import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const syncSource = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/admin/notion-sync/route.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0044_notion_article_sync.sql", import.meta.url), "utf8");

test("Ready Notion articles auto-flow into Psipedia as draft only", () => {
  assert.match(syncSource, /selectProperty\(page, "Stav"\) !== "Ready"/);
  assert.match(syncSource, /status: "draft"/);
  assert.match(syncSource, /existing\.status !== "draft"/);
  assert.doesNotMatch(syncSource, /status: "published"/);
  assert.doesNotMatch(syncSource, /Odoslať na Psipedia/);
  assert.doesNotMatch(syncSource, /Zdroje overené/);
  assert.doesNotMatch(syncSource, /Obsah skontrolovaný/);
  assert.doesNotMatch(syncSource, /SEO skontrolované/);
});

test("Notion query automatically scans Ready articles in the exact data source", () => {
  assert.match(syncSource, /filter: \{ property: "Stav", select: \{ equals: "Ready" \} \}/);
  assert.match(syncSource, /last_edited_time/);
  assert.match(syncSource, /NOTION_ARTICLES_DATA_SOURCE_ID/);
  assert.match(syncSource, /\/data_sources\/\$\{encodeURIComponent\(dataSourceId\)\}\/query/);
});


test("Notion editorial categories map to supported public article destinations", () => {
  assert.match(syncSource, /"Zdravie a starostlivosť": \\{[\\s\\S]*?portalSection: "starostlivost",[\\s\\S]*?portalSubpage: "zdravie"/);
  assert.match(syncSource, /"Výživa": \\{[\\s\\S]*?portalSection: "starostlivost",[\\s\\S]*?portalSubpage: "vyziva"/);
  assert.match(syncSource, /"Správanie": \\{[\\s\\S]*?portalSection: "starostlivost",[\\s\\S]*?portalSubpage: "spravanie"/);
  assert.match(syncSource, /"Výcvik a aktivity": \\{[\\s\\S]*?portalSection: "aktivity",[\\s\\S]*?portalSubpage: "trening"/);
  assert.match(syncSource, /"Šteniatka": \\{[\\s\\S]*?portalSection: "steniatka"/);
  assert.match(syncSource, /contentType === "Aktuálna novinka"/);
  assert.match(syncSource, /portalSection: "novinky"/);
  assert.match(syncSource, /contentType === "Recenzia"/);
  assert.match(syncSource, /portalSection: "recenzie"/);
});

test("unsupported editorial buckets do not invent non-article portal sections", () => {
  assert.match(syncSource, /"Plemená": \\{[\\s\\S]*?portalSection: "clanky"/);
  assert.match(syncSource, /"Pomoc psom": \\{[\\s\\S]*?portalSection: "clanky"/);
  assert.match(syncSource, /"Bezpečnosť": \\{[\\s\\S]*?portalSection: "clanky"/);
  assert.match(syncSource, /"Zaujímavosti": \\{[\\s\\S]*?portalSection: "clanky"/);
  assert.doesNotMatch(syncSource, /portalSection: "plemena"/);
  assert.doesNotMatch(syncSource, /portalSection: "pomoc-psom"/);
});

test("sync is idempotent and writes status back to Notion", () => {
  assert.match(migrationSource, /notion_page_id TEXT PRIMARY KEY/);
  assert.match(migrationSource, /article_id INTEGER NOT NULL UNIQUE/);
  assert.match(migrationSource, /FOREIGN KEY \(article_id\) REFERENCES managed_articles\(id\) ON DELETE CASCADE/);
  assert.match(syncSource, /content_hash/);
  assert.match(syncSource, /"Sync stav": \{ select: \{ name: values\.state \} \}/);
  assert.match(syncSource, /"Psipedia ID"/);
});

test("manual trigger stays behind existing admin authentication", () => {
  assert.match(routeSource, /getAdminApiUser/);
  assert.match(routeSource, /unauthorizedAdminResponse/);
  assert.match(routeSource, /runNotionArticleSyncSweep/);
});

test("hourly worker invokes the guarded sync sweep", () => {
  assert.match(workerSource, /runNotionArticleSyncSweep/);
  assert.match(workerSource, /event: "notion_article_sync_sweep"/);
});
