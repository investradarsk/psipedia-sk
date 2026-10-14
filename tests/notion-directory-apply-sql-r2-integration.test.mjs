import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { buildManagedDirectoryProfileUpdateStatement, normalizeManagedDirectoryProfileInput } from "../lib/directory-store.ts";
import { cleanupUnreferencedNotionUpload } from "../lib/notion-sync-shared.ts";

// Execute the real production Notion apply function, not a reimplementation of
// its ordering. Canonical UPDATE SQL and R2 reference-check SQL execute on real
// isolated SQLite. External Notion/R2/GEO service boundaries are fault-injected.
const syncSource = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
const start = syncSource.indexOf("async function applyNotionToProfile(");
const end = syncSource.indexOf("\nasync function recentNotionPages(", start);
assert.ok(start > 0 && end > start, "production apply function is present");
const workerStart = syncSource.indexOf("async function syncMappedPage(");
const workerEnd = syncSource.indexOf("\nasync function recoverMappingFromPage(", workerStart);
assert.ok(workerStart > end && workerEnd > workerStart, "production Notion mapped-page worker is present");
const runtimeCode = ts.transpileModule(syncSource.slice(start, end) + "\n" + syncSource.slice(workerStart, workerEnd) + "\nexports.applyNotionToProfile = applyNotionToProfile; exports.syncMappedPage = syncMappedPage;", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(options = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY, slug TEXT, name TEXT, category TEXT, status TEXT,
    excerpt TEXT, description TEXT, services_json TEXT, qualifications_json TEXT,
    city TEXT, district TEXT, region TEXT, address TEXT, postal_code TEXT,
    street TEXT, house_number TEXT, address_format TEXT,
    service_address_confirmation TEXT, online INTEGER, price_note TEXT,
    website_url TEXT, internal_email TEXT, image_url TEXT, image_key TEXT,
    thumbnail_display_json TEXT, detail_display_json TEXT, source_data_json TEXT,
    verified INTEGER, featured INTEGER, seo_json TEXT, search_text TEXT,
    updated_at TEXT, published_at TEXT, archived_at TEXT, updated_by TEXT
  )`);
  const version = "2026-10-14T08:00:00.000Z";
  const status = options.status ?? "draft";
  sqlite.prepare(`INSERT INTO directory_profiles
    (id,slug,name,category,status,city,district,region,address,image_url,image_key,updated_at,archived_at,service_address_confirmation)
    VALUES (1,'test-profil','Pôvodný profil','treneri',?,?,?,?,?,?,?,?,?,?)`).run(
      status, "Nitra", "Nitra", "Nitriansky kraj", "Hlavná 1, Nitra",
      "/media/directory/old.webp", "directory/old.webp", version,
      status === "archived" ? version : null, "CONFIRMED_SERVICE_LOCATION",
    );
  const initial = sqlite.prepare("SELECT * FROM directory_profiles WHERE id=1").get();
  const objects = new Set(["directory/old.webp"]);
  const deleted = [];
  const calls = [];
  const bucket = {
    async put(key) { calls.push("r2-put"); if (options.r2Failure) throw Error("R2_FAILED"); objects.add(key); },
    async delete(key) { calls.push("r2-delete"); deleted.push(key); objects.delete(key); },
  };
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (options.referenceFailure && /SELECT 1 AS used FROM directory_profiles/.test(sql)) throw Error("D1_UNCERTAIN");
              if (sql.includes("UPDATE directory_profiles") && options.commitFailure === "before") throw Error("D1_COMMIT_FAILED");
              const row = sqlite.prepare(sql).get(...params) ?? null;
              if (sql.includes("UPDATE directory_profiles")) {
                calls.push("d1-update");
                if (options.commitFailure === "after") throw Error("D1_RESPONSE_LOST");
              }
              return row;
            },
            async run() { return sqlite.prepare(sql).run(...params); },
          };
        },
      };
    },
  };
  const read = () => sqlite.prepare("SELECT * FROM directory_profiles WHERE id=1").get();
  const current = {
    id: 1, status, updatedAt: version, publishedAt: null,
    imageUrl: initial.image_url, imageKey: initial.image_key,
    importData: {}, seo: {}, address: initial.address,
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION", websiteUrl: "",
  };
  const newPayload = {
    name: "Nový profil", slug: "test-profil", category: options.invalidInput ? "invalid-category" : "treneri",
    status: "draft", region: "Nitriansky kraj", district: "Nitra", city: "Nitra",
    address: "Hlavná 1, Nitra", street: "Hlavná", houseNumber: "1",
    addressFormat: "STREET", confirmServiceAddress: true,
    imageUrl: current.imageUrl, imageKey: current.imageKey,
  };
  const profileRow = row => row && ({
    ...current, id: row.id, status: row.status, updatedAt: row.updated_at,
    imageKey: row.image_key, imageUrl: row.image_url,
  });
  const desired = {
    status: "draft", imageUrl: options.image === false ? "" : "https://images.example.org/new.webp",
    confirmedServiceLocation: true, name: "Nový profil", websiteUrl: "",
    region: "Nitriansky kraj", district: "Nitra", city: "Nitra",
  };
  const ctx = {
    exports: {},
    notionSnapshot() { calls.push("notion-snapshot"); return desired; },
    externalSourceImageUrl(url) { return /^https:\/\//.test(url ?? "") ? url : null; },
    propertyText(page, property) { return property === "Psipedia ID" ? "1" : ""; },
    fullProfileInput() { return { ...newPayload }; },
    directoryPhysicalAddressChanged() { return !!options.addressChanged; },
    notionDirectoryUpdateSafety() {
      return {
        blocksConfirmedAddressDowngrade: !!options.downgrade,
        preserveUnchangedCanonicalPhone: false,
        verifyExactAddress: !!options.invalidAddress,
      };
    },
    readDirectoryPublicContacts() { return { phone: "" }; },
    async verifyDirectoryCanonicalAddress() { calls.push("address-validation"); throw Error("INVALID_ADDRESS"); },
    withVerifiedDirectoryAddress(input) { return input; },
    normalizeManagedDirectoryProfileInput,
    async prepareNotionMainImage() {
      await bucket.put("directory/new.webp");
      return {
        imageUrl: "/media/directory/new.webp", imageKey: "directory/new.webp",
        uploadedKey: "directory/new.webp", replacedKeys: ["directory/old.webp"],
        sourceContentHash: "hash",
      };
    },
    async updateManagedDirectoryProfile(id, payload, actor, existing, database, guard) {
      calls.push("canonical-store");
      if (options.concurrent) {
        sqlite.prepare("UPDATE directory_profiles SET updated_at=? WHERE id=1").run("concurrent-v2");
      }
      const result = await buildManagedDirectoryProfileUpdateStatement(
        database, id, payload, actor, existing, "2026-10-14T08:02:00.000Z", guard,
      ).first();
      if (!result) return null;
      calls.push("canonical-committed");
      if (options.geoFailure === "store") throw Error("GEO_FAILED_AFTER_COMMIT");
      return profileRow(result);
    },
    async upsertMediaSourceMonitor() { if (options.mediaFailure) throw Error("MEDIA_FAILED"); calls.push("media-saved"); },
    cleanupUnreferencedNotionUpload,
    async applyVerifiedDirectoryAddressGeo() { if (options.geoFailure === "verified") throw Error("GEO_FAILED"); },
    async autoAssignGooglePlaceForDirectoryProfile() {
      calls.push("geo-after-commit");
      if (options.geoFailure === "google") throw Error("GEO_FAILED");
    },
    async getManagedDirectoryProfileById() { return profileRow(read()); },
    async fetchNotionPage() { throw Error("UNEXPECTED_REMOTE_FETCH"); },
    async getMediaSourceMonitorForEntity() { return null; },
    profileSnapshot() { return { origin: "psipedia" }; },
    async snapshotHash(value) { return value.origin === "psipedia" ? "stable-profile-hash" : "changed-notion-hash"; },
    async writeProfileToNotion() { calls.push("notion-writeback"); },
    async archiveManagedDirectoryProfile() { throw Error("UNEXPECTED_ARCHIVE"); },
    SYSTEM_ACTOR: "notion-worker",
    Date, Error, Boolean,
  };
  runInNewContext(runtimeCode, ctx, { filename: "production-notion-directory-apply.cjs" });
  const run = () => ctx.exports.applyNotionToProfile({
    database: db, bindings: { BUCKET: bucket }, page: { id: "notion-page-1" }, profile: current,
  });
  const runMappedWorker = () => ctx.exports.syncMappedPage({
    database: db, bindings: { BUCKET: bucket }, dataSourceId: "test-notion-source",
    mapping: { directory_profile_id: 1, notion_page_id: "notion-page-1", content_hash: "stable-profile-hash", notion_last_edited_time: null },
    page: { id: "notion-page-1", last_edited_time: "2026-10-14T09:00:00.000Z" },
  });
  return { run, runMappedWorker, read, initial, deleted, objects, calls, sqlite, bucket, db };
}
const closes = f => f.sqlite.close();

test("invalid Notion canonical payload fails before R2 and D1 write", async () => {
  const f = fixture({ invalidInput: true });
  await assert.rejects(f.run);
  assert.equal(f.calls.includes("r2-put"), false);
  assert.equal(f.calls.includes("canonical-store"), false);
  assert.deepEqual(f.read(), f.initial);
  closes(f);
});

test("invalid Notion physical address fails verification before R2", async () => {
  const f = fixture({ invalidAddress: true });
  await assert.rejects(f.run, /INVALID_ADDRESS/);
  assert.equal(f.calls.includes("r2-put"), false);
  assert.deepEqual(f.read(), f.initial);
  closes(f);
});

test("refused confirmed-address downgrade preserves D1 and R2", async () => {
  const f = fixture({ downgrade: true });
  await assert.rejects(f.run, /REVIEW_REQUIRED/);
  assert.equal(f.calls.includes("r2-put"), false);
  assert.deepEqual(f.read(), f.initial);
  closes(f);
});

test("archived recovery commits restoration and image in one SQL UPDATE", async () => {
  const f = fixture({ status: "archived" });
  const result = await f.run();
  assert.equal(result.status, "draft");
  assert.equal(f.read().archived_at, null);
  assert.equal(f.read().image_key, "directory/new.webp");
  assert.ok(f.calls.indexOf("d1-update") < f.calls.indexOf("geo-after-commit"));
  closes(f);
});

test("stale updated_at causes a safe CAS conflict without overwriting a concurrent update", async () => {
  const f = fixture({ concurrent: true });
  await assert.rejects(f.run, /CONFLICT/);
  assert.equal(f.read().image_key, "directory/old.webp");
  assert.equal(f.read().updated_at, "concurrent-v2");
  assert.deepEqual(f.deleted, ["directory/new.webp"]);
  closes(f);
});

test("D1 commit failure safely removes only the unused upload", async () => {
  const f = fixture({ commitFailure: "before" });
  await assert.rejects(f.run, /D1_COMMIT_FAILED/);
  assert.deepEqual(f.deleted, ["directory/new.webp"]);
  assert.equal(f.read().image_key, "directory/old.webp");
  closes(f);
});

test("lost D1 response after commit must retain the canonical R2 upload", async () => {
  const f = fixture({ commitFailure: "after" });
  await assert.rejects(f.run, /D1_RESPONSE_LOST/);
  assert.equal(f.read().image_key, "directory/new.webp");
  assert.equal(f.objects.has("directory/new.webp"), true);
  assert.deepEqual(f.deleted, []);
  closes(f);
});

test("R2 PUT failure leaves D1 and original image untouched", async () => {
  const f = fixture({ r2Failure: true });
  await assert.rejects(f.run, /R2_FAILED/);
  assert.deepEqual(f.read(), f.initial);
  assert.equal(f.objects.has("directory/old.webp"), true);
  closes(f);
});

test("GEO failure after successful D1 update retains the referenced R2 object", async () => {
  const f = fixture({ geoFailure: "google" });
  await assert.rejects(f.run, /GEO_FAILED/);
  assert.equal(f.read().image_key, "directory/new.webp");
  assert.equal(f.objects.has("directory/new.webp"), true);
  closes(f);
});

test("D1 reference lookup failure defers R2 cleanup", async () => {
  const f = fixture({ commitFailure: "before", referenceFailure: true });
  await assert.rejects(f.run, /D1_COMMIT_FAILED/);
  assert.deepEqual(f.deleted, []);
  assert.equal(f.objects.has("directory/new.webp"), true);
  closes(f);
});

test("a shared replacement image stays in R2 while any canonical profile still references it", async () => {
  const f = fixture();
  f.sqlite.prepare("INSERT INTO directory_profiles (id,image_key,updated_at) VALUES (2,?,?)").run("directory/old.webp", "v1");
  const result = await f.run();
  assert.equal(result.imageKey, "directory/new.webp");
  assert.equal(f.objects.has("directory/old.webp"), true);
  assert.deepEqual(f.deleted, []);
  closes(f);
});

test("unchanged external image absent causes no upload or delete during canonical update", async () => {
  const f = fixture({ image: false });
  const result = await f.run();
  assert.equal(result.imageKey, "directory/old.webp");
  assert.equal(f.calls.includes("r2-put"), false);
  assert.deepEqual(f.deleted, []);
  closes(f);
});

test("media monitor failure after canonical commit retains the referenced upload", async () => {
  const f = fixture({ mediaFailure: true });
  await assert.rejects(f.run, /MEDIA_FAILED/);
  assert.equal(f.read().image_key, "directory/new.webp");
  assert.equal(f.objects.has("directory/new.webp"), true);
  assert.deepEqual(f.deleted, []);
  closes(f);
});

test("stale retry cannot add another profile or overwrite the committed row", async () => {
  const f = fixture();
  const first = await f.run();
  assert.equal(first.imageKey, "directory/new.webp");
  const updatedAt = f.read().updated_at;
  await assert.rejects(f.run, /CONFLICT/);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n, 1);
  assert.equal(f.read().updated_at, updatedAt);
  assert.equal(f.read().image_key, "directory/new.webp");
  assert.equal(f.objects.has("directory/new.webp"), true);
  closes(f);
});

test("mapped Notion worker pulls through canonical SQL, R2, GEO and Notion writeback in order", async () => {
  const f = fixture();
  const result = await f.runMappedWorker();
  assert.equal(result, "pulled");
  assert.equal(f.read().image_key, "directory/new.webp");
  const order = ["notion-snapshot", "r2-put", "canonical-store", "d1-update", "geo-after-commit", "notion-writeback"];
  const positions = order.map(event => f.calls.indexOf(event));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  closes(f);
});

test("mapped Notion worker does not write success metadata after GEO postcommit failure", async () => {
  const f = fixture({ geoFailure: "google" });
  await assert.rejects(f.runMappedWorker, /GEO_FAILED/);
  assert.equal(f.read().image_key, "directory/new.webp");
  assert.equal(f.objects.has("directory/new.webp"), true);
  assert.equal(f.calls.includes("notion-writeback"), false);
  closes(f);
});
