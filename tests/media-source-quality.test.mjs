import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../drizzle/0099_media_source_quality.sql", import.meta.url), "utf8");
const monitor = await readFile(new URL("../lib/media-source-monitor.ts", import.meta.url), "utf8");
const shared = await readFile(new URL("../lib/notion-sync-shared.ts", import.meta.url), "utf8");
const directorySync = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
const eventSync = await readFile(new URL("../lib/notion-event-sync.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const adminPage = await readFile(new URL("../app/admin/kvalita/page.tsx", import.meta.url), "utf8");
const adminComponent = await readFile(new URL("../components/admin-data-quality-dashboard.tsx", import.meta.url), "utf8");
const adminNavigation = await readFile(new URL("../lib/admin-navigation.ts", import.meta.url), "utf8");

test("media source monitor has a stable one-row-per-entity schema", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS media_source_monitors/);
  assert.match(migration, /UNIQUE\(entity_type, entity_id\)/);
  assert.match(migration, /'DIRECTORY_PROFILE','MANAGED_EVENT'/);
  assert.match(migration, /'UNTRACKED','OK','CANDIDATE','CHANGED','MISSING','ERROR'/);
  assert.match(migration, /media_source_monitors_due_idx/);
});

test("remote media is content-hashed and optimized before durable R2 storage", () => {
  assert.match(shared, /sha256Bytes/);
  assert.match(shared, /contentHash: await sha256Bytes\(bytes\)/);
  assert.match(shared, /optimizeRemoteImageForStorage/);
  assert.match(shared, /output\(\{ format: "image\/webp", quality: 82, anim: false \}\)/);
  assert.match(shared, /sourceContentHash: remote\.contentHash/);
  assert.match(shared, /cacheControl: "public, max-age=31536000, immutable"/);
});

test("directory Notion image URLs are ingested into R2 instead of hotlinked", () => {
  assert.match(directorySync, /prepareNotionMainImage/);
  assert.match(directorySync, /folder: "directory"/);
  assert.match(directorySync, /existingImageKey: current\.imageKey/);
  assert.match(directorySync, /upsertMediaSourceMonitor/);
  assert.match(directorySync, /sourceContentHash: prepared\.sourceContentHash/);
  assert.match(directorySync, /cleanupNotionImageKeys\(input\.bindings\.BUCKET, prepared\.replacedKeys\)/);
});

test("event Notion images register their long-lived source monitor", () => {
  assert.match(eventSync, /entityType: "MANAGED_EVENT"/);
  assert.match(eventSync, /sourceContentHash: prepared\.sourceContentHash/);
  assert.match(eventSync, /activeImageKey: prepared\.imageKey/);
});

test("background monitoring is bounded to one due check per source per day", () => {
  assert.match(monitor, /SOURCE_CHECK_INTERVAL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(monitor, /last_checked_at IS NULL OR last_checked_at <= \?/);
  assert.match(monitor, /LIMIT \?/);
  assert.match(worker, /runMediaSourceMonitorSweep/);
  const fiveMinute = worker.split("if (!isFullHourlyScheduledSweep(controller)) {")[1]?.split("const \[summary,")[0] ?? "";
  assert.doesNotMatch(fiveMinute, /runMediaSourceMonitorSweep/);
});

test("source changes create a review candidate instead of silently replacing public media", () => {
  assert.match(monitor, /status: row\.activeImageKey && row\.sourceContentHash \? "CHANGED" : "CANDIDATE"/);
  assert.match(monitor, /candidateImageKey: candidate\.key/);
  const beforeAccept = monitor.slice(0, monitor.indexOf("export async function acceptMediaSourceCandidate"));
  assert.doesNotMatch(beforeAccept, /UPDATE directory_profiles\s+SET image_url/);
  assert.doesNotMatch(beforeAccept, /UPDATE managed_events\s+SET image_url/);
  assert.match(monitor, /export async function acceptMediaSourceCandidate/);
  assert.match(monitor, /UPDATE directory_profiles/);
  assert.match(monitor, /UPDATE managed_events/);
});

test("admin quality workspace separates profile cleanup from focused image approval", () => {
  assert.match(adminNavigation, /href: "\/admin\/kvalita"/);
  assert.match(adminPage, /Kvalita údajov/);
  assert.match(adminComponent, /admin-quality-tabs/);
  assert.match(adminComponent, /sectionHref\("media"\)/);
  assert.match(adminComponent, /Skontrolovať zdroje/);
  assert.match(adminComponent, /Schváliť obrázok/);
  assert.match(adminComponent, /Chýbajúce údaje v profiloch/);
  assert.match(adminComponent, /Obrázky na kontrolu/);
  assert.match(adminComponent, /admin-quality-profile-row/);
  assert.match(adminComponent, /admin-quality-media-card/);
});
