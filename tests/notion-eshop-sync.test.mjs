import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("0102 adds a durable one-to-one e-shop Notion mapping", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    "PRAGMA foreign_keys=ON;" +
    "CREATE TABLE review_authors (" +
      "id TEXT PRIMARY KEY NOT NULL,email_ciphertext TEXT NOT NULL,email_hash TEXT NOT NULL UNIQUE," +
      "display_name TEXT,status TEXT NOT NULL DEFAULT 'ACTIVE',email_verified_at TEXT,deactivated_at TEXT," +
      "created_at TEXT NOT NULL,updated_at TEXT NOT NULL" +
    ");"
  );
  sqlite.exec(read("drizzle/0100_eshop_ratings.sql"));
  sqlite.exec(read("drizzle/0101_eshop_profile_presentation.sql"));
  sqlite.exec(read("drizzle/0102_eshop_notion_sync.sql"));

  const shop = sqlite.prepare("SELECT id FROM managed_eshops WHERE slug='super-zoo'").get();
  sqlite.prepare(
    "INSERT INTO eshop_notion_sync " +
    "(notion_page_id,eshop_id,content_hash,last_synced_at,created_at,updated_at) " +
    "VALUES (?,?,?,?,?,?)"
  ).run("notion-1", shop.id, "hash", "2026-09-30T10:00:00Z", "2026-09-30T10:00:00Z", "2026-09-30T10:00:00Z");

  assert.throws(
    () => sqlite.prepare(
      "INSERT INTO eshop_notion_sync " +
      "(notion_page_id,eshop_id,content_hash,last_synced_at,created_at,updated_at) " +
      "VALUES (?,?,?,?,?,?)"
    ).run("notion-2", shop.id, "hash2", "2026-09-30T10:01:00Z", "2026-09-30T10:01:00Z", "2026-09-30T10:01:00Z"),
    /UNIQUE constraint failed/,
  );
  sqlite.close();
});

test("e-shop Notion sync is bidirectional only for profile fields", () => {
  const source = read("lib/notion-eshop-sync.ts");

  assert.match(source, /notionTitleProperty\(page, "Názov"\)/);
  assert.match(source, /notionRichTextProperty\(page, "Slug"\)/);
  assert.match(source, /notionUrlProperty\(page, "Web"\)/);
  assert.match(source, /notionRichTextProperty\(page, "Popis"\)/);
  assert.match(source, /multiSelectProperty\(page, "Zameranie"\)/);
  assert.match(source, /notionUrlProperty\(page, "Logo URL"\)/);
  assert.match(source, /createManagedEshop/);
  assert.match(source, /updateManagedEshop/);

  assert.match(source, /"Počet hodnotení": number\(shop\.ratingCount\)/);
  assert.match(source, /"Celkové hodnotenie": number\(shop\.averages\?\.overall/);
  assert.match(source, /"Doručenie": number\(shop\.averages\?\.delivery/);
  assert.match(source, /"Komunikácia": number\(shop\.averages\?\.communication/);
  assert.match(source, /"Sortiment": number\(shop\.averages\?\.assortment/);
  assert.match(source, /"Ceny": number\(shop\.averages\?\.price/);

  const notionSnapshotStart = source.indexOf("function notionSnapshot");
  const notionSnapshotEnd = source.indexOf("async function snapshotHash");
  const inbound = source.slice(notionSnapshotStart, notionSnapshotEnd);
  assert.doesNotMatch(inbound, /Počet hodnotení|Celkové hodnotenie|Doručenie|Komunikácia|Sortiment|Ceny/);
});

test("e-shop logos from Notion use the durable R2 pipeline", () => {
  const source = read("lib/notion-eshop-sync.ts");
  const shared = read("lib/notion-sync-shared.ts");
  assert.match(source, /prepareNotionMainImage/);
  assert.match(source, /folder: "eshops"/);
  assert.match(source, /cleanupNotionImageKeys/);
  assert.match(shared, /"eshops"/);
});

test("e-shop Notion sync is scheduled and manually available in admin", () => {
  const worker = read("worker/index.ts");
  const route = read("app/api/admin/notion-eshops-sync/route.ts");
  const page = read("app/admin/recenzie/eshopy/page.tsx");
  const wrangler = read("wrangler.jsonc");

  assert.match(worker, /runNotionEshopBootstrapSweep/);
  assert.match(worker, /runNotionEshopSyncSweep/);
  assert.match(worker, /notion_eshop_backfill_sweep/);
  assert.match(worker, /notion_eshop_sync_sweep/);
  assert.match(route, /getAdminApiUser/);
  assert.match(route, /runNotionEshopSyncSweep/);
  assert.match(page, /AdminEshopNotionSyncButton/);
  assert.match(wrangler, /"NOTION_ESHOP_SYNC_ENABLED": "true"/);
  assert.match(wrangler, /"NOTION_ESHOPS_DATA_SOURCE_ID": "24837932-2867-4809-9adb-f3f33ba47339"/);
});

test("mapping hash resolves conflicts while rating-only changes force a Notion mirror refresh", () => {
  const source = read("lib/notion-eshop-sync.ts");
  assert.match(source, /profileHash !== lastHash/);
  assert.match(source, /pageHash !== lastHash/);
  assert.match(source, /notionTime > profileTime/);
  assert.match(source, /rating\.updated_at > ens\.last_synced_at/);
  assert.match(source, /forcePush: true/);
});
