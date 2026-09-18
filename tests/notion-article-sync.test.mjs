import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const syncSource = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/admin/notion-sync/route.ts", import.meta.url), "utf8");
const articleRouteSource = await readFile(new URL("../app/api/admin/articles/[id]/route.ts", import.meta.url), "utf8");
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
  for (const category of ["Zdravie a starostlivosť", "Výživa", "Správanie", "Výcvik a aktivity", "Šteniatka"]) {
    assert.ok(syncSource.includes(`"${category}": {`), `missing placement for ${category}`);
  }
  assert.match(syncSource, /portalSection: "starostlivost"/);
  assert.match(syncSource, /portalSubpage: "zdravie"/);
  assert.match(syncSource, /portalSubpage: "vyziva"/);
  assert.match(syncSource, /portalSubpage: "spravanie"/);
  assert.match(syncSource, /portalSection: "aktivity"/);
  assert.match(syncSource, /portalSubpage: "trening"/);
  assert.match(syncSource, /portalSection: "steniatka"/);
  assert.match(syncSource, /contentType === "Aktuálna novinka"/);
  assert.match(syncSource, /portalSection: "novinky"/);
  assert.match(syncSource, /contentType === "Recenzia"/);
  assert.match(syncSource, /portalSection: "recenzie"/);
});

test("unsupported editorial buckets do not invent non-article portal sections", () => {
  for (const category of ["Plemená", "Pomoc psom", "Bezpečnosť", "Zaujímavosti"]) {
    assert.ok(syncSource.includes(`"${category}": {`), `missing safe fallback for ${category}`);
  }
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


test("publishing a Notion-linked draft writes publication metadata back to Notion", () => {
  assert.match(syncSource, /writeBackPublishedArticleToNotion/);
  assert.match(syncSource, /SELECT notion_page_id FROM article_notion_sync WHERE article_id = \?/);
  assert.match(syncSource, /"Stav": \{ select: \{ name: "Publikované" \} \}/);
  assert.match(syncSource, /"Dátum publikácie": \{ date: \{ start: publishedAt \} \}/);
  assert.match(syncSource, /"URL Psipedia": \{ url: publicUrl \}/);
  assert.match(syncSource, /"Sync stav": \{ select: \{ name: "Synchronizované" \} \}/);
  assert.match(articleRouteSource, /before\.status !== "published" && article\.status === "published"/);
  assert.match(articleRouteSource, /writeBackPublishedArticleToNotion/);
  assert.match(articleRouteSource, /notion_article_publish_writeback_failed/);
});

test("Notion publication writeback is best-effort and does not block the admin publish response", () => {
  const writebackCall = articleRouteSource.indexOf("await writeBackPublishedArticleToNotion");
  const responseCall = articleRouteSource.indexOf("return Response.json({ article });");
  assert.ok(writebackCall >= 0 && responseCall > writebackCall);
  assert.match(articleRouteSource, /try \{[\s\S]*await writeBackPublishedArticleToNotion[\s\S]*\} catch \(error\) \{/);
});


test("Notion main image URL is downloaded safely and persisted to R2", () => {
  assert.match(syncSource, /Hlavný obrázok URL/);
  assert.match(syncSource, /Zdroj obrázka/);
  assert.match(syncSource, /Alt text obrázka/);
  assert.match(syncSource, /MAX_REMOTE_IMAGE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(syncSource, /url\.protocol !== "https:"/);
  assert.match(syncSource, /redirect: "manual"/);
  assert.match(syncSource, /detectedRemoteImageType/);
  assert.match(syncSource, /bucket\.put\(key, remote\.bytes/);
  assert.match(syncSource, /notionSourceUrl/);
  assert.match(syncSource, /imageUrl,\s*imageKey: key/);
  assert.match(syncSource, /ogImageUrl: imageUrl,\s*ogImageKey: key/);
  assert.match(routeSource, /BUCKET\?: R2Bucket/);
});

test("Notion image sync is idempotent and cleans up failed or replaced R2 objects", () => {
  assert.match(syncSource, /currentObject\?\.customMetadata\?\.notionSourceUrl === sourceUrl/);
  assert.match(syncSource, /cleanupImageKeys\(bindings\.BUCKET, \[prepared\.uploadedKey\]\)/);
  assert.match(syncSource, /cleanupImageKeys\(bindings\.BUCKET, prepared\.replacedKeys\)/);
  assert.match(syncSource, /JSON\.stringify\(\{ payload: basePayload, notionImageSourceUrl \}\)/);
});
