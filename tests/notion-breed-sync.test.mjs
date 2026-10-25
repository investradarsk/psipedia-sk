import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const syncSource = await readFile(new URL("../lib/notion-breed-sync.ts", import.meta.url), "utf8");
const sharedSource = await readFile(new URL("../lib/notion-sync-shared.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/admin/notion-breeds-sync/route.ts", import.meta.url), "utf8");
const breedRouteSource = await readFile(new URL("../app/api/admin/breeds/[id]/route.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0045_notion_breed_sync.sql", import.meta.url), "utf8");
const wranglerSource = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("Ready Notion breeds flow into Psipedia as draft only", () => {
  assert.match(syncSource, /notionSelectProperty\(page, "Stav"\) !== "Ready"/);
  assert.match(syncSource, /status: "draft"/);
  assert.match(syncSource, /existing\.status !== "draft"/);
  assert.doesNotMatch(syncSource, /status: "published"/);
});

test("breed sync uses the exact configured Notion data source and hourly worker", () => {
  assert.match(syncSource, /NOTION_BREEDS_DATA_SOURCE_ID/);
  assert.match(syncSource, /listReadyNotionPages\(args\.bindings, dataSourceId/);
  assert.match(workerSource, /runNotionBreedSyncSweep/);
  assert.match(workerSource, /event: "notion_breed_sync_sweep"/);
  assert.match(wranglerSource, /"NOTION_BREED_SYNC_ENABLED": "true"/);
  assert.match(wranglerSource, /"NOTION_BREEDS_DATA_SOURCE_ID": "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2"/);
});

test("breed sync maps the editorial fields needed by the managed breed store", () => {
  for (const field of [
    "FCI číslo",
    "FCI skupina",
    "Oficiálny FCI názov",
    "Krajina pôvodu",
    "Hmotnosť",
    "Výška",
    "Dĺžka života",
    "Energia",
    "Trénovateľnosť",
    "Charakter",
    "Pohyb",
    "Výcvik",
    "Zdravie",
    "SEO title",
    "Meta description",
  ]) {
    assert.ok(syncSource.includes(`"${field}"`), `missing Notion breed field ${field}`);
  }
});

test("breed sync is idempotent, mapped, and refuses silent duplicates", () => {
  assert.match(migrationSource, /notion_page_id TEXT PRIMARY KEY/);
  assert.match(migrationSource, /breed_id INTEGER NOT NULL UNIQUE/);
  assert.match(migrationSource, /FOREIGN KEY \(breed_id\) REFERENCES managed_breeds\(id\) ON DELETE CASCADE/);
  assert.match(syncSource, /content_hash/);
  assert.match(syncSource, /assertNoUnmappedDuplicate/);
  assert.match(syncSource, /Automatický sync nevytvorí duplicitu/);
});

test("breed images use reusable safe R2 ingestion", () => {
  assert.match(syncSource, /prepareNotionMainImage/);
  assert.match(syncSource, /folder: "breeds"/);
  assert.match(syncSource, /Hlavný obrázok URL/);
  assert.match(syncSource, /Zdroj obrázka/);
  assert.match(syncSource, /Alt text obrázka/);
  assert.match(sharedSource, /MAX_REMOTE_IMAGE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(sharedSource, /redirect: "manual"/);
  assert.match(sharedSource, /"User-Agent": "PsipediaNotionSync\/1\.0 \(\+https:\/\/psipedia\.sk\/kontakt\)"/);
  assert.match(sharedSource, /"Api-User-Agent": "PsipediaNotionSync\/1\.0 \(\+https:\/\/psipedia\.sk\/kontakt\)"/);
  assert.match(sharedSource, /notionSourceHash/);
  assert.match(sharedSource, /optimizeRemoteImageForStorage/);
  assert.match(sharedSource, /bucket\.put\(key, stored\.bytes/);
  assert.match(sharedSource, /sourceContentHash: remote\.contentHash/);
  assert.match(syncSource, /cleanupNotionImageKeys\(bindings\.BUCKET, prepared\.replacedKeys\)/);
});

test("manual breed sync trigger is protected by existing admin authentication", () => {
  assert.match(routeSource, /getAdminApiUser/);
  assert.match(routeSource, /unauthorizedAdminResponse/);
  assert.match(routeSource, /runNotionBreedSyncSweep/);
});

test("publishing a Notion-linked breed writes public state back to Notion", () => {
  assert.match(syncSource, /writeBackPublishedBreedToNotion/);
  assert.match(syncSource, /SELECT notion_page_id FROM breed_notion_sync WHERE breed_id = \?/);
  assert.match(syncSource, /"Stav": \{ select: \{ name: "Publikované" \} \}/);
  assert.match(syncSource, /"URL Psipedia": \{ url: publicUrl \}/);
  assert.match(breedRouteSource, /before\.status !== "published" && breed\.status === "published"/);
  assert.match(breedRouteSource, /writeBackPublishedBreedToNotion/);
  assert.match(breedRouteSource, /notion_breed_publish_writeback_failed/);
});


test("Notion resync merges sparse updates before full D1 upsert and preserves OG media", () => {
  assert.match(syncSource, /mergeNotionBreedInput\(existing, basePayload\)/);
  assert.match(syncSource, /preparePayloadWithImage\(bindings, page, mergedPayload, existing\)/);
  assert.match(syncSource, /ogImage: basePayload\.seo\?\.ogImage\?\.trim\(\) \|\| prepared\.imageUrl \|\| ""/);
  assert.match(syncSource, /notionPropertyRecord\(page, "Editorial complete"\) \? checkboxProperty/);
});

test("draft breed Admin saves mirror only explicitly edited Notion text fields", () => {
  assert.match(syncSource, /export async function writeBackDraftBreedEditorialToNotion/);
  assert.match(syncSource, /breedDraftTextChanges\(args.before, args.breed\)/);
  assert.match(syncSource, /"Intro", "rich_text"/);
  assert.match(syncSource, /"Charakter", "rich_text"/);
  assert.match(syncSource, /"Výcvik", "rich_text"/);
  assert.match(syncSource, /"Zdravie", "rich_text"/);
  assert.match(syncSource, /"Názov", "title"/);
  const draft = syncSource.slice(syncSource.indexOf("export async function writeBackDraftBreedEditorialToNotion("),
    syncSource.indexOf("async function syncOneBreed("));
  assert.doesNotMatch(draft, /"Stav":|slug: args.breed.slug|status: args.breed.status/);
  assert.match(breedRouteSource, /writeBackDraftBreedEditorialToNotion\(/);
  assert.match(breedRouteSource, /before.status === "draft" && breed.status === "draft"/);
});

test("breed draft write-back checks Notion identity, source and unchanged remote revision", () => {
  const draft = syncSource.slice(syncSource.indexOf("export async function writeBackDraftBreedEditorialToNotion("),
    syncSource.indexOf("async function syncOneBreed("));
  assert.match(draft, /notionPageBelongsToDataSource\(page, dataSourceId\)/);
  assert.match(draft, /notionRichTextProperty\(page, "Psipedia ID"\)/);
  assert.match(draft, /BREED_NOTION_REMOTE_EDITORIAL_CHANGED/);
  assert.match(draft, /BREED_NOTION_FIELD_REVIEW_REQUIRED/);
  assert.match(draft, /BREED_NOTION_WRITEBACK_ECHO_UNVERIFIED/);
  const evidence = draft.indexOf("BREED_NOTION_WRITEBACK_ECHO_UNVERIFIED");
  const mapping = draft.indexOf("UPDATE breed_notion_sync SET content_hash");
  assert.ok(evidence >= 0 && mapping > evidence, "Mapping must follow verified Notion echo");
  assert.match(draft, /WHERE notion_page_id=\? AND breed_id=\? AND content_hash=\?/);
  assert.match(draft, /committed.meta.changes !== 1/);
});

test("pending Admin breed edits block stale Notion sync and false success", () => {
  const mapped = syncSource.slice(syncSource.indexOf("async function syncOneBreed("),
    syncSource.indexOf("export async function runNotionBreedSyncSweep("));
  const guard = mapped.indexOf("BREED_ADMIN_REVISION_NOT_SYNCED");
  const original = mapped.indexOf("if (mapping.content_hash === contentHash)");
  assert.ok(guard >= 0 && original > guard);
  assert.match(mapped, /canonicalTextDiffers/);
  assert.match(mapped, /mapping.content_hash === contentHash && canonicalTextDiffers/);
  assert.match(breedRouteSource, /notion_breed_draft_writeback_failed/);
  assert.match(breedRouteSource, /notionEditorialWriteback/);
  assert.match(breedRouteSource, /REMOTE_WRITEBACK_FAILED/);
});

test("hourly breed sweep replays unacknowledged Admin-only text changes safely", () => {
  const mapped = syncSource.slice(syncSource.indexOf("async function syncOneBreed("),
    syncSource.indexOf("export async function runNotionBreedSyncSweep("));
  const replay = mapped.indexOf("const lastCommonText = { ...existing }");
  const acknowledged = mapped.indexOf("if (mapping.content_hash === contentHash) {");
  assert.ok(replay >= 0 && acknowledged > replay);
  assert.match(mapped, /mapping.content_hash === contentHash && canonicalTextDiffers/);
  assert.match(mapped, /await writeBackDraftBreedEditorialToNotion\(/);
  assert.match(mapped, /if \(!result.updated\) throw new Error\("BREED_ADMIN_WRITEBACK_NOT_ACKNOWLEDGED"\)/);
  assert.match(mapped, /lastCommonText\[key\] = notionBreedTextValue\(page, property\)/);
});
