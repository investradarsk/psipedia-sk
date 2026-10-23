import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { listPublicAdoptionCards } from "../lib/adoption-store.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec([
    "CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, status TEXT, fci_number INTEGER, import_key TEXT, fci_group INTEGER, seo_json TEXT)",
    "CREATE TABLE help_organizations (id INTEGER PRIMARY KEY, name TEXT, slug TEXT)",
    "CREATE TABLE adoption_dogs (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, status TEXT, sex TEXT, birth_date TEXT, approximate_age_months INTEGER, size TEXT, breed_id INTEGER, breed_name TEXT, breed_mix INTEGER, region TEXT, city TEXT, organization_id INTEGER, organization_name TEXT, organization_slug TEXT, main_image TEXT, thumbnail_display_json TEXT, short_description TEXT, published_at TEXT, last_verified_at TEXT, updated_at TEXT, search_text TEXT, gallery_json TEXT, description TEXT, health_notes TEXT, contact_email TEXT)",
  ].join(";") + ";");
  sqlite.prepare("INSERT INTO managed_breeds VALUES (1,'Labradorský retriever','labradorsky-retriever','published',122,'fci-122',8,'{}')").run();
  sqlite.prepare("INSERT INTO help_organizations VALUES (10,'Aktuálne OZ','aktualne-oz')").run();
  const insert = sqlite.prepare("INSERT INTO adoption_dogs (id,name,slug,status,sex,birth_date,approximate_age_months,size,breed_id,breed_name,breed_mix,region,city,organization_id,organization_name,organization_slug,main_image,thumbnail_display_json,short_description,published_at,last_verified_at,updated_at,search_text,gallery_json,description,health_notes,contact_email) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let id = 1; id <= 30; id++) {
    const status = id % 5 === 0 ? "RESERVED" : "ACTIVE";
    insert.run(id, "Pes " + id, "pes-" + id, status, "MALE", null, 24, "MEDIUM",
      id === 1 ? 1 : null, "Pôvodný názov", 0, "Nitriansky kraj", "Nitra",
      id === 1 ? 10 : null, "Staré OZ", "stare-oz",
      "/media/adoption/one.jpg", null, "Krátky opis",
      "2026-10-23", id === 1 ? "2026-10-22" : null, "2026-10-23",
      "pes " + id + " nitra", JSON.stringify(["/media/private/asset.jpg"]),
      "Long detailed description ".repeat(300), "Vet health notes", "private@example.sk");
  }
  insert.run(31, "Draft", "draft", "DRAFT", "MALE", null, 12, "MEDIUM",
    null, "", 0, "Nitriansky kraj", "Nitra", null, "", null, null, null, "",
    "2026-10-23", null, "2026-10-23", "draft", "[]", "", "", "");
  insert.run(32, "Adopted", "adopted", "ADOPTED", "MALE", null, 12, "MEDIUM",
    null, "", 0, "Nitriansky kraj", "Nitra", null, "", null, null, null, "",
    "2026-10-23", null, "2026-10-23", "adopted", "[]", "", "", "");
  const sql = [];
  const database = {
    prepare(query) {
      sql.push(query);
      return {
        bind(...bindings) {
          return {
            async first() { return sqlite.prepare(query).get(...bindings) ?? null; },
            async all() { return { results: sqlite.prepare(query).all(...bindings) }; },
          };
        },
      };
    },
  };
  return { sqlite, database, sql };
}

test("public catalog reads a page of lean cards without private details, preserving total and status", async () => {
  const { sqlite, database, sql } = fixture();
  try {
    const first = await listPublicAdoptionCards({}, database);
    assert.equal(first.pagination.total, 30);
    assert.equal(first.pagination.pageSize, 24);
    assert.equal(first.pagination.totalPages, 2);
    assert.equal(first.items.length, 24);
    assert.deepEqual(first.items.slice(0, 2).map(dog => dog.id), [30, 29]);
    assert.ok(first.items.every(item => item.status === "ACTIVE" || item.status === "RESERVED"));
    assert.deepEqual(Object.keys(first.items[0]).sort(), [
      "id", "name", "slug", "status", "sex", "birthDate",
      "approximateAgeMonths", "size", "breedName", "breedMix",
      "region", "city", "organizationName", "organizationSlug",
      "mainImage", "thumbnailImageDisplay", "shortDescription",
      "publishedAt", "lastVerifiedAt",
    ].sort());
    assert.equal(first.items[0].description, undefined);
    assert.equal(first.items[0].gallery, undefined);
    assert.equal(first.items[0].contactEmail, undefined);
    const firstSql = sql.find(s => s.includes("FROM adoption_dogs d") && s.includes("LEFT JOIN"));
    assert.ok(firstSql, "dedicated join-based public select exists");
    assert.doesNotMatch(firstSql, /d\.\*|gallery_json|health_notes|description(?!.*short_description)|contact_email|contact_phone|source_data_json/i);
    const pageTwo = await listPublicAdoptionCards({page: 2}, database);
    assert.deepEqual(pageTwo.items.map(item => item.id), [6,5,4,3,2,1]);
    assert.equal(pageTwo.items.at(-1).breedName, "Labradorský retriever");
    assert.equal(pageTwo.items.at(-1).organizationName, "Aktuálne OZ");
    assert.equal(pageTwo.items.at(-1).organizationSlug, "aktualne-oz");
    assert.equal(pageTwo.items.at(-1).lastVerifiedAt, "2026-10-22");
    assert.equal(pageTwo.items.at(-1).status, "ACTIVE");
    assert.equal(sql.length, 4, "two bounded D1 statements per paginated request");
  } finally { sqlite.close(); }
});

test("public catalog projection uses shared filters while full adoption detail/admin remain intact", () => {
  const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
  const store = read("../lib/adoption-store.ts");
  const catalog = store.split("export async function listPublicAdoptionCards(")[1]
    ?.split("export const getPublicAdoptions =", 1)[0];
  assert.ok(catalog);
  assert.match(catalog, /buildPublicAdoptionQuery\(filters\)/);
  assert.match(catalog, /PUBLIC_CARD_SELECT/);
  assert.match(store, /export async function getPublicAdoptionBySlug/);
  assert.match(store, /const row = await db\.prepare\(\`\$\{PUBLIC_SELECT\} WHERE d\.slug = \?/);
  assert.match(read("../app/pomoc-psom/adopcia/page.tsx"), /listPublicAdoptionCards\(filters\)/);
  assert.match(read("../components/adoption-catalog.tsx"), /items: PublicAdoptionCard\[\]/);
});
