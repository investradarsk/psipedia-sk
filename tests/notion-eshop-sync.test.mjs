import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import ts from "typescript";
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
  assert.match(route, /requireAdminMutation/);
  assert.match(route, /runNotionEshopSyncSweep/);
  assert.match(page, /AdminEshopNotionSyncButton/);
  assert.match(wrangler, /"NOTION_ESHOP_SYNC_ENABLED": "true"/);
  assert.match(wrangler, /"NOTION_ESHOPS_DATA_SOURCE_ID": "24837932-2867-4809-9adb-f3f33ba47339"/);
});

test("mapping hash resolves conflicts while rating-only changes force a Notion mirror refresh", () => {
  const source = read("lib/notion-eshop-sync.ts");
  assert.match(source, /profileHash !== lastHash/);
  assert.match(source, /pageHash !== lastHash/);
  assert.match(source, /reconcileProfileFields/);
  assert.match(source, /trustedProfileBaselineFromHashes/);
  assert.match(source, /canonicalFieldsWin: true/);
  assert.doesNotMatch(source, /notionTime > profileTime/);
  assert.match(source, /rating\.updated_at > ens\.last_synced_at/);
  assert.match(source, /forcePush: true/);
});

test("e-shop common baseline is recorded only after a verified remote payload", () => {
  const source = read("lib/notion-eshop-sync.ts");
  const write = source.slice(source.indexOf("async function writeShopToNotion("), source.indexOf("function readyForCreate("));
  const echo = write.indexOf("NOTION_ESHOP_WRITEBACK_ECHO_MISMATCH");
  const mapping = write.indexOf("await saveMapping(");
  const baseline = write.indexOf("await recordProfileFieldBaseline(");
  assert.ok(echo > 0 && mapping > echo && baseline > mapping);
  assert.match(write, /snapshotHash\(notionSnapshot\(page\)\) !== hash/);
});

test("e-shop mapping recovery rejects divergent pages and self-declared Sync hash", () => {
  const source = read("lib/notion-eshop-sync.ts");
  const fn = source.slice(source.indexOf("async function recoverMapping("),
    source.indexOf("async function syncMapped("));
  assert.match(fn, /ESHOP_MAPPING_REVIEW_REQUIRED/);
  assert.doesNotMatch(fn, /notionRichTextProperty\(input.page, "Sync hash"\) \|\| hash/);
});

test("e-shop production mapping upsert never silently reassigns Notion page", async () => {
  const source = read("lib/notion-eshop-sync.ts");
  const start = source.indexOf("async function saveMapping(input:");
  const end = source.indexOf("async function fetchPage(", start);
  assert.ok(start >= 0 && end > start);
  const compiled = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {};
  runInNewContext(compiled + "\nthis.saveMapping = saveMapping;", context);
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys=ON;");
    sqlite.exec(
      "CREATE TABLE managed_eshops (id INTEGER PRIMARY KEY);" +
      "INSERT INTO managed_eshops(id) VALUES (12);"
    );
    sqlite.exec(read("drizzle/0102_eshop_notion_sync.sql"));
    const d1 = {
      prepare: sql => ({ bind: (...args) => ({ run: async () => {
        const result = sqlite.prepare(sql).run(...args);
        return { success: true, meta: { changes: result.changes } };
      } }) }),
    };
    const input = {
      database: d1, pageId: "notion-a", shopId: 12, contentHash: "hash-a",
      notionLastEditedTime: "2026-10-26T13:00:00Z",
      psipediaUpdatedAt: "2026-10-26T13:00:00Z",
      syncedAt: "2026-10-26T13:00:00Z",
    };
    await context.saveMapping(input);
    await context.saveMapping({ ...input, contentHash: "hash-b" });
    await assert.rejects(
      context.saveMapping({ ...input, pageId: "notion-b", contentHash: "hash-c" }),
      /ESHOP_MAPPING_REASSIGNMENT_BLOCKED/,
    );
    assert.deepEqual(
      sqlite.prepare("SELECT notion_page_id,content_hash FROM eshop_notion_sync WHERE eshop_id=12").get(),
      { notion_page_id: "notion-a", content_hash: "hash-b" },
    );
  } finally {
    sqlite.close();
  }
});

test("e-shop new-page import locks identity and uses a provisional mapping before remote PATCH", () => {
  const source = read("lib/notion-eshop-sync.ts");
  const begin = source.indexOf("async function importUnmappedEshop(");
  const end = source.indexOf("async function applyNotionToShop(", begin);
  const code = source.slice(begin, end);
  assert.ok(begin >= 0 && end > begin);
  assert.match(code, /acquireGeminiNotionLock\(input\.database, "notion-eshop-import"\)/);
  assert.match(code, /acquireGeminiNotionLock\(input\.database, input\.page\.id\)/);
  assert.match(code, /await loadMappingByPage\(input\.database, input\.page\.id\)/);
  assert.match(code, /ESHOP_IMPORT_STALE_REVISION/);
  assert.match(code, /notionPageBelongsToDataSource\(latest, input\.dataSourceId\)/);
  assert.ok(code.indexOf("canonicalWriteUncertain = true") < code.indexOf("await createFromNotion"));
  assert.ok(code.indexOf('contentHash: ""') < code.indexOf("await writeShopToNotion("));
  assert.ok(code.indexOf("canonicalWriteUncertain = false") > code.indexOf("await saveMapping({"));
  assert.match(code, /if \(!canonicalWriteUncertain\)/);
  assert.match(source, /createManagedEshop\(updateInput\(\{ \.\.\.desired, status: "draft" \}, logo\)/);
});
