import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../drizzle/0099_media_source_quality.sql", import.meta.url), "utf8");
const monitor = await readFile(new URL("../lib/media-source-monitor.ts", import.meta.url), "utf8");
const mediaReviewDecisions = await readFile(new URL("../lib/media-source-review-decisions.ts", import.meta.url), "utf8");
const shared = await readFile(new URL("../lib/notion-sync-shared.ts", import.meta.url), "utf8");
const directorySync = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
const eventSync = await readFile(new URL("../lib/notion-event-sync.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const adminPage = await readFile(new URL("../app/admin/kvalita/page.tsx", import.meta.url), "utf8");
const adminComponent = await readFile(new URL("../components/admin-missing-quality-dashboard.tsx", import.meta.url), "utf8");
const originalMediaComponent = await readFile(new URL("../components/admin-data-quality-dashboard.tsx", import.meta.url), "utf8");
const dataQualityStore = await readFile(new URL("../lib/data-quality-store.ts", import.meta.url), "utf8");
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
  assert.match(directorySync, /for \(const key of prepared\.replacedKeys\)/);
  assert.match(directorySync, /cleanupUnreferencedNotionUpload\(input\.database, input\.bindings\.BUCKET, key\)/);
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

test("quality location selectors use one SQL statement and keep category, region and archived filtering", () => {
  const unionSql = dataQualityStore.match(/SELECT DISTINCT 'region' AS kind, region AS value[\s\S]*?ORDER BY kind, value COLLATE NOCASE/)?.[0];
  assert.ok(unionSql, "combined quality facet query present");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE directory_profiles (category TEXT, region TEXT, district TEXT, status TEXT)");
    const insert = db.prepare("INSERT INTO directory_profiles VALUES (?, ?, ?, ?)");
    for (const row of [
      ["veterinari", "Nitriansky kraj", "Nitra", "published"],
      ["veterinari", "Nitriansky kraj", "Levice", "draft"],
      ["veterinari", "Bratislavský kraj", "Bratislava", "published"],
      ["veterinari", "Žilinský kraj", "Žilina", "archived"],
      ["treneri", "Trnavský kraj", "Trnava", "published"],
    ]) insert.run(...row);

    const run = (category, region) => {
      const categoryClause = category ? " AND category=?" : "";
      const regionClause = region ? " AND region=?" : "";
      const sql = unionSql.replaceAll("$" + "{categoryClause}", categoryClause)
        .replaceAll("$" + "{districtRegionClause}", regionClause);
      const binds = [...(category ? [category, category] : []), ...(region ? [region] : [])];
      const rows = db.prepare(sql).all(...binds);
      return {
        regions: rows.filter((row) => row.kind === "region").map((row) => row.value),
        districts: rows.filter((row) => row.kind === "district").map((row) => row.value),
      };
    };
    assert.deepEqual(run("veterinari", "Nitriansky kraj"), {
      regions: ["Bratislavský kraj", "Nitriansky kraj"],
      districts: ["Levice", "Nitra"],
    });
    assert.deepEqual(run("", ""), {
      regions: ["Bratislavský kraj", "Nitriansky kraj", "Trnavský kraj"],
      districts: ["Bratislava", "Levice", "Nitra", "Trnava"],
    });
  } finally { db.close(); }
});

test("quality bulk reads have bounded concurrency and preserve ordered page results", () => {
  assert.match(dataQualityStore, /Math\.min\(2, pageCount - index\)/);
  assert.match(dataQualityStore, /const results = await Promise\.all\(/);
  assert.match(dataQualityStore, /rows\.push\(\.\.\.pageRows\)/);
  assert.match(dataQualityStore, /batches\.slice\(offset, offset \+ 2\)/);
  assert.match(dataQualityStore, /for \(const result of batchResults\) suggestions\.push\(\.\.\.result\)/);
  assert.match(dataQualityStore, /const \[profileNames, eventNames\] = await Promise\.all/);
});

test("source changes create a review candidate instead of silently replacing public media", () => {
  assert.match(monitor, /status: row\.activeImageKey && row\.sourceContentHash \? "CHANGED" : "CANDIDATE"/);
  assert.match(monitor, /candidateImageKey: candidate\.key/);
  const beforeAccept = monitor.slice(0, monitor.indexOf("export async function acceptMediaSourceCandidate"));
  assert.doesNotMatch(beforeAccept, /UPDATE directory_profiles\s+SET image_url/);
  assert.doesNotMatch(beforeAccept, /UPDATE managed_events\s+SET image_url/);
  assert.match(monitor, /export async function acceptMediaSourceCandidate/);
  // Acceptance moved its guarded canonical update into the D1 CAS helper.
  // The scheduled sweep must still never mutate canonical image records.
  assert.match(mediaReviewDecisions, /export async function finalizeAcceptedMediaCandidate/);
  assert.match(mediaReviewDecisions, /row\.entityType === "MANAGED_EVENT" \? "managed_events" : "directory_profiles"/);
  assert.match(mediaReviewDecisions, /UPDATE \$\{table\} SET image_url=\?, image_key=\?/);
  assert.match(mediaReviewDecisions, /WHERE id=\? AND image_key IS \?/);
});

test("admin quality displays found missing values for all areas", () => {
  assert.match(adminNavigation, /href: "\/admin\/kvalita"/);
  assert.match(adminPage, /AdminMissingQualityDashboard/);
  assert.match(adminComponent, /Nájdené nové údaje na schválenie/);
  assert.match(adminComponent, /Tento mesiac spustené/);
  assert.match(adminComponent, /Služby pre psov/);
  assert.match(adminComponent, /Podujatia/);
  assert.match(adminComponent, /Pomoc psom/);
  assert.match(adminComponent, /Zamietnuť všetky zobrazené/);
  assert.match(originalMediaComponent, /Schváliť obrázok/);
  assert.doesNotMatch(adminPage, /AdminDataQualityDashboard/);
});

test("admin quality loads only pending found values", () => {
  assert.match(adminPage, /loadMissingQualityDashboard/);
  assert.doesNotMatch(adminPage, /loadDataQualityDashboard/);
  assert.match(adminComponent, /setRemovedIds/);
  assert.match(adminComponent, /router.refresh/);
  assert.match(dataQualityStore, /const \\[profileRead, mediaRead\\] = await Promise\\.all/);
  assert.doesNotMatch(dataQualityStore, /listCanonicalAutomationUpdateSuggestionEntityIds/);
});
