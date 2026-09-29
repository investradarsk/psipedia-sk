import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const syncSource = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const storeSource = await readFile(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
const addressSaveSource = await readFile(new URL("../lib/directory-address-save.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0098_directory_notion_bidirectional_sync.sql", import.meta.url), "utf8");
const wranglerSource = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("directory Notion mirror covers the complete managed profile contract", () => {
  for (const field of [
    "Názov",
    "Psipedia ID",
    "Slug",
    "Kategória",
    "Psipedia stav",
    "Perex",
    "Popis",
    "Služby",
    "Kvalifikácie",
    "Kraj",
    "Okres",
    "Mesto",
    "Adresa",
    "PSČ",
    "Ulica",
    "Číslo domu",
    "Formát adresy",
    "Potvrdená prevádzka",
    "Online",
    "Cena / poznámka",
    "Web",
    "Telefón",
    "E-mail",
    "Facebook",
    "Instagram",
    "Interný e-mail",
    "Hlavný obrázok URL",
    "Overené",
    "Odporúčané",
    "SEO title",
    "SEO popis",
    "SEO kľúčové slovo",
    "Canonical URL",
    "OG title",
    "OG popis",
    "OG obrázok",
    "Noindex",
  ]) {
    assert.ok(syncSource.includes(`"${field}"`), `missing Notion directory field ${field}`);
  }
});

test("technical GEO and sync state are mirrored from Psipedia without becoming editable profile input", () => {
  for (const field of [
    "Latitude",
    "Longitude",
    "GEO stav",
    "GEO provider",
    "Google Place ID",
    "Google miesto aktuálne",
    "Google Maps cieľ",
    "Vytvorené Psipedia",
    "Aktualizované Psipedia",
    "Publikované Psipedia",
    "Archivované Psipedia",
    "Vytvoril",
    "Upravil",
    "Sync hash",
    "Sync stav",
    "Sync chyba",
    "Posledný sync",
  ]) {
    assert.ok(syncSource.includes(`"${field}"`), `missing technical mirror field ${field}`);
  }
  const notionSnapshotBody = syncSource.slice(
    syncSource.indexOf("function notionSnapshot"),
    syncSource.indexOf("async function snapshotHash"),
  );
  assert.doesNotMatch(notionSnapshotBody, /Google Place ID|Latitude|Longitude|GEO stav|GEO provider/);
});


test("multiline rich text stays lossless so services do not collapse into one item", () => {
  assert.match(syncSource, /function richTextPlainText/);
  assert.match(syncSource, /\.join\(""\)\.replace\(\/\\r\\n\?\/g, "\\n"\)\.trim\(\)/);
  assert.doesNotMatch(syncSource, /notionRichTextPlainText/);
  assert.match(syncSource, /split\(\/\\n\|;\/g\)/);
});

test("a duplicate Notion row cannot silently steal an existing profile mapping", () => {
  assert.match(syncSource, /existingMapping\.notion_page_id !== input\.page\.id/);
  assert.match(syncSource, /už je prepojený s iným Notion záznamom/);
});

test("directory Notion mapping is one-to-one and idempotent", () => {
  assert.match(migrationSource, /notion_page_id TEXT PRIMARY KEY/);
  assert.match(migrationSource, /directory_profile_id INTEGER NOT NULL UNIQUE/);
  assert.match(migrationSource, /FOREIGN KEY \(directory_profile_id\) REFERENCES directory_profiles\(id\) ON DELETE CASCADE/);
  assert.match(syncSource, /content_hash/);
  assert.match(syncSource, /sha256Text\(JSON\.stringify\(snapshot\)\)/);
  assert.match(syncSource, /ON CONFLICT\(directory_profile_id\) DO UPDATE SET/);
});

test("bidirectional conflict resolution uses last common hash and newest real edit", () => {
  assert.match(syncSource, /profileHash !== lastHash/);
  assert.match(syncSource, /pageHash !== lastHash/);
  assert.match(syncSource, /Date\.parse\(page\.last_edited_time/);
  assert.match(syncSource, /Date\.parse\(profile\.updatedAt\)/);
  assert.match(syncSource, /notionTime > profileTime/);
  assert.match(syncSource, /forcePsipediaPush/);
});

test("Notion address edits use canonical verification and exact GEO lifecycle", () => {
  assert.match(syncSource, /directoryPhysicalAddressChanged/);
  assert.match(syncSource, /verifyDirectoryCanonicalAddress/);
  assert.match(syncSource, /withVerifiedDirectoryAddress/);
  assert.match(syncSource, /applyVerifiedDirectoryAddressGeo/);
  assert.match(syncSource, /autoAssignGooglePlaceForDirectoryProfile/);
  assert.ok(
    syncSource.indexOf("applyVerifiedDirectoryAddressGeo") < syncSource.lastIndexOf("autoAssignGooglePlaceForDirectoryProfile"),
    "Google Place auto-match must run after verified exact GEO is applied",
  );
  assert.match(addressSaveSource, /applyGeocoderResolution/);
  assert.match(addressSaveSource, /setGeoVisibility/);
  assert.match(storeSource, /reconcileGeoAfterSourceMutation/);
});

test("ready Notion rows without a Psipedia ID create directly as published profiles", () => {
  assert.match(syncSource, /createManagedDirectoryProfile/);
  assert.match(syncSource, /if \(propertyText\(page, "Psipedia ID"\)\) return false/);
  assert.match(syncSource, /editorialState === "Ready" \|\| editorialState === "Publikované"/);
  assert.match(syncSource, /function newProfileInput/);
  assert.match(syncSource, /status: "published"/);
  assert.match(syncSource, /createManagedDirectoryProfile\(payload, SYSTEM_ACTOR, input\.database\)/);
  assert.match(syncSource, /summary\.createdFromNotion \+= 1/);
  assert.match(syncSource, /await writeProfileToNotion\(\{/);
});

test("existing Psipedia profiles bootstrap into Notion in bounded batches", () => {
  assert.match(syncSource, /const BOOTSTRAP_BATCH = 20/);
  assert.match(syncSource, /LEFT JOIN directory_notion_sync dns/);
  assert.match(syncSource, /WHERE dns\.directory_profile_id IS NULL/);
  assert.match(syncSource, /createNotionPage/);
  assert.match(syncSource, /bootstrapped \+= 1/);
});

test("directory mirror runs in the full hourly worker sweep and production is pinned to the exact Notion data source", () => {
  assert.match(workerSource, /runNotionDirectorySyncSweep/);
  assert.match(workerSource, /event: "notion_directory_sync_sweep"/);
  const boundedFiveMinuteBranch = workerSource.split("if (!isFullHourlyScheduledSweep(controller)) {")[1]?.split("const [summary,")[0] ?? "";
  assert.doesNotMatch(boundedFiveMinuteBranch, /runNotionDirectorySyncSweep/);
  assert.match(wranglerSource, /"NOTION_DIRECTORY_SYNC_ENABLED": "true"/);
  assert.match(wranglerSource, /"NOTION_DIRECTORY_DATA_SOURCE_ID": "84e0664c-ca47-405f-9d54-31b20287bc8c"/);
});
