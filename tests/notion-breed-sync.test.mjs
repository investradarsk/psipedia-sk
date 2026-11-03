import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const syncSource = await readFile(new URL("../lib/notion-breed-sync.ts", import.meta.url), "utf8");
const sharedSource = await readFile(new URL("../lib/notion-sync-shared.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/admin/notion-breeds-sync/route.ts", import.meta.url), "utf8");
const breedRouteSource = await readFile(new URL("../app/api/admin/breeds/[id]/route.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0045_notion_breed_sync.sql", import.meta.url), "utf8");
const wranglerSource = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("linked breed content is not blocked by Notion editorial approval, and SEO is mapped", () => {
  assert.match(syncSource,/validateReady\(page, Boolean\(mapping \|\| current\?\.status === "published"\)\)/);
  for (const property of ["SEO focus keyword","SEO OG title","SEO OG description",
    "SEO canonical URL","SEO noindex"]) {
    assert.ok(syncSource.includes(JSON.stringify(property)), "missing mapped field "+property);
  }
});

test("legacy breed sync has a no-webhook comparison path instead of a manual blocker",()=>{
  assert.match(syncSource,/fields = touched\.length \? touched : BREED_NOTION_EDITABLE_FIELDS/);
  assert.doesNotMatch(syncSource,/throw new Error\("BREED_WEBHOOK_FIELDS_UNRESOLVED"/);
  assert.doesNotMatch(syncSource,/throw new Error\("BREED_LEGACY_CONCURRENT_ADMIN_EDIT"/);
});

test("new breeds are created as drafts; no Notion edit publishes a profile",()=>{
  assert.match(syncSource,/status: "draft"/);
  assert.match(syncSource,/BREED_CREATE_REQUIRES_READY/);
  assert.doesNotMatch(syncSource,/status: "published"/);
});

test("already linked published breeds update content and preserve publication state",()=>{
  assert.match(syncSource,/validateReady\(page, Boolean\(mapping \|\| current\?\.status === "published"\)\)/);
  assert.match(syncSource,/status:existing.status/);
  assert.match(syncSource,/prepareNotionMainImage/);
  assert.match(syncSource,/findUnmappedCanonicalBreed/);
  assert.match(syncSource,/BREED_MAPPING_REVIEW_REQUIRED/);
});

test("published canonical breeds ignore an obsolete Notion review state, but new drafts do not", () => {
  const start = syncSource.indexOf("function validateReady(");
  const end = syncSource.indexOf("\n/** A missing mapping", start);
  assert.ok(start >= 0 && end > start);
  const source = syncSource.slice(start, end).replace("page: NotionPage", "page").replace("existingPublished: boolean", "existingPublished");
  const validate = runInNewContext(`(${source})`, {
    notionSelectProperty: (page) => page.state,
    checkboxProperty: (page) => page.checked === true,
  }, { timeout: 500 });
  assert.doesNotThrow(() => validate({ state: "Na kontrolu", checked: false }, true));
  assert.doesNotThrow(() => validate({ state: "Ready", checked: false }, false));
  assert.throws(() => validate({ state: "Na kontrolu", checked: false }, false), /schválenú/);
});

test("breed sync uses the exact configured Notion data source and hourly worker", () => {
  assert.match(syncSource, /NOTION_BREEDS_DATA_SOURCE_ID/);
  assert.match(syncSource, /listEditableNotionBreeds\(args\.bindings, dataSourceId/);
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

test("publishing writes canonical status back to Notion, without confusing editorial sync",()=>{
  assert.match(syncSource,/writeBackPublishedBreedToNotion/);
  assert.match(syncSource,/SELECT notion_page_id FROM breed_notion_sync WHERE breed_id = \?/);
  assert.match(syncSource,/"Stav": \{ select: \{ name: "Publikované" \} \}/);
  assert.match(syncSource,/"URL Psipedia": \{ url: publicUrl \}/);
  assert.match(breedRouteSource,/before.status!=="published" && breed.status==="published"/);
  assert.match(breedRouteSource,/writeBackPublishedBreedToNotion/);
});

test("Notion resync merges sparse updates before full D1 upsert and preserves OG media", () => {
  assert.match(syncSource, /mergeNotionBreedInput\(existing, basePayload\)/);
  assert.match(syncSource, /preparePayloadWithImage\(bindings, page, mergedPayload, existing\)/);
  assert.match(syncSource, /ogImage: basePayload\.seo\?\.ogImage\?\.trim\(\) \|\| prepared\.imageUrl \|\| ""/);
  assert.match(syncSource, /notionPropertyRecord\(page, "Editorial complete"\) \? checkboxProperty/);
});

test("Admin writes every changed supported field independently, including published breeds",()=>{
  assert.match(syncSource,/export async function writeBackBreedEditorialToNotion/);
  assert.match(syncSource,/changedFieldKeys\?\?BREED_NOTION_EDITABLE_FIELDS/);
  assert.match(syncSource,/breedNotionContentPatch\(field,after\[field\]\)/);
  assert.match(syncSource,/BREED_NOTION_WRITEBACK_UNCONFIRMED/);
  assert.match(breedRouteSource,/writeBackBreedEditorialToNotion\(/);
  assert.match(breedRouteSource,/if \(bindings.DB\)/);
  assert.match(syncSource,/richTextNotionValue\(stringValue/);
});

test("outbound writeback protects identity but not whole-page content revisions",()=>{
  const writer=syncSource.slice(syncSource.indexOf("export async function writeBackBreedEditorialToNotion("),
    syncSource.indexOf("/** Kept as a public alias"));
  assert.match(writer,/notionPageBelongsToDataSource\(page,sourceId\)/);
  assert.match(writer,/notionRichTextProperty\(page,"Psipedia ID"\)/);
  assert.match(writer,/sameBreedField\(remote\[field\],oldNotion\[field\]\)/);
  assert.match(writer,/acknowledged/);
  assert.match(writer,/await upsertMapping/);
  assert.doesNotMatch(writer,/BREED_NOTION_REMOTE_EDITORIAL_CHANGED/);
  assert.doesNotMatch(writer,/BREED_NOTION_FIELD_REVIEW_REQUIRED/);
});

test("normal editorial differences resolve by priority and never cause global locks",()=>{
  const mapped=syncSource.slice(syncSource.indexOf("async function syncOneBreed("),
    syncSource.indexOf("export async function runNotionBreedSyncSweep("));
  assert.match(mapped,/planBreedNotionFieldDelta\(existing,basePayload/);
  assert.match(mapped,/applySafeBreedSync/);
  assert.match(mapped,/BREED_PSID_CONFLICT/);
  assert.match(mapped,/unsent=BREED_NOTION_EDITABLE_FIELDS.filter/);
  assert.match(mapped,/writeBackBreedEditorialToNotion/);
  assert.doesNotMatch(mapped,/BREED_ADMIN_REVISION_NOT_SYNCED/);
  assert.match(breedRouteSource,/notion_breed_writeback_retry_needed/);
});

test("hourly sweep retries unacknowledged edits to all 93 content fields",()=>{
  const mapped=syncSource.slice(syncSource.indexOf("async function syncOneBreed("),
    syncSource.indexOf("export async function runNotionBreedSyncSweep("));
  assert.match(mapped,/const unsent=BREED_NOTION_EDITABLE_FIELDS.filter/);
  assert.match(mapped,/baselineSnapshot:fieldReceipt.admin/);
  assert.match(mapped,/changedFieldKeys:unsent/);
  assert.doesNotMatch(mapped,/canonicalTextDiffers/);
});
