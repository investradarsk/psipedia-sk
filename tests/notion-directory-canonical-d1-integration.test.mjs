import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildManagedDirectoryProfileUpdateStatement } from "../lib/directory-store.ts";

// Executes the production canonical UPDATE SQL against an isolated, real SQLite
// database. It is not a mock of SQL matching or an R2/D1 production binding.
function fixture(status = "archived") {
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
  const timestamp = "2026-10-14T08:00:00.000Z";
  sqlite.prepare(`INSERT INTO directory_profiles
    (id,slug,name,category,status,city,district,region,address,image_url,image_key,updated_at,archived_at,service_address_confirmation)
    VALUES (1,'test-profil','Pôvodný profil','treneri',?,?,?,?,?,?,?,?,?,?,?)`).run(
      status, "Nitra", "Nitra", "Nitriansky kraj", "Hlavná 1, Nitra",
      "/media/directory/original.webp", "directory/original.webp", timestamp,
      status === "archived" ? timestamp : null, "CONFIRMED_SERVICE_LOCATION",
    );
  const original = sqlite.prepare("SELECT * FROM directory_profiles WHERE id=1").get();
  const current = {
    id: 1, status, updatedAt: timestamp, publishedAt: null,
    imageUrl: original.image_url, imageKey: original.image_key,
    importData: {}, seo: {}, address: original.address,
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
  };
  const input = {
    name: "Nový profil", slug: "test-profil", category: "treneri", status: "draft",
    region: "Nitriansky kraj", district: "Nitra", city: "Nitra",
    address: "Hlavná 1, Nitra", street: "Hlavná", houseNumber: "1",
    addressFormat: "STREET", confirmServiceAddress: true,
    imageUrl: "/media/directory/new.webp", imageKey: "directory/new.webp",
  };
  const database = { prepare(sql) {
    return { bind(...args) { return { async first() { return sqlite.prepare(sql).get(...args) ?? null; } }; } };
  } };
  const read = () => sqlite.prepare("SELECT * FROM directory_profiles WHERE id=1").get();
  const write = (payload=input, guard={expectedUpdatedAt:timestamp,restoreArchived:true}) =>
    buildManagedDirectoryProfileUpdateStatement(database, 1, payload, "notion-sync", current,
      "2026-10-14T08:01:00.000Z", guard).first();
  return {sqlite, current, original, input, read, write};
}

test("invalid canonical input cannot create an UPDATE or change archived profile and image", async () => {
  const f = fixture();
  assert.throws(() => f.write({...f.input, category:"invalid-category"}));
  assert.deepEqual(f.read(),f.original);
  f.sqlite.close();
});

test("a valid archive restore commits status, content, and image in one conditional SQL UPDATE", async () => {
  const f = fixture();
  const row = await f.write();
  assert.equal(row.status,"draft");
  assert.equal(row.archived_at,null);
  assert.equal(row.image_key,"directory/new.webp");
  assert.equal(f.read().updated_by,"notion-sync");
  f.sqlite.close();
});

test("stale expectedUpdatedAt loses the optimistic concurrency race without restoring archive", async () => {
  const f = fixture();
  const row = await f.write(f.input,{expectedUpdatedAt:"2026-10-13T00:00:00Z",restoreArchived:true});
  assert.equal(row,null);
  assert.deepEqual(f.read(),f.original);
  f.sqlite.close();
});

test("archived restore is refused without explicit restoration guard", () => {
  const f = fixture();
  assert.throws(() => f.write(f.input,{expectedUpdatedAt:f.current.updatedAt}),/Archivovaný profil/);
  assert.deepEqual(f.read(),f.original);
  f.sqlite.close();
});

test("rejected draft update preserves original canonical image reference", async () => {
  const f = fixture("draft");
  const result = await f.write(f.input,{expectedUpdatedAt:"stale"});
  assert.equal(result,null);
  assert.equal(f.read().image_key,"directory/original.webp");
  f.sqlite.close();
});
