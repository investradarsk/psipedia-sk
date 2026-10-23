import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  buildPublishedOrganizationIndexQuery,
  listPublishedOrganizationCards,
} from "../lib/help-organization-store.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec([
    "CREATE TABLE help_organizations (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, short_description TEXT, description TEXT, city TEXT, region TEXT, image_url TEXT, thumbnail_display_json TEXT, website_url TEXT, public_email TEXT, public_phone TEXT, published_at TEXT, last_verified_at TEXT, updated_at TEXT, status TEXT, archived_at TEXT)",
    "CREATE TABLE organization_locations (id INTEGER PRIMARY KEY, organization_id INTEGER, city TEXT, region TEXT, role TEXT, is_primary INTEGER, sort_order INTEGER)",
  ].join(";") + ";");
  const insert = db.prepare("INSERT INTO help_organizations (id,name,slug,short_description,description,city,region,image_url,thumbnail_display_json,website_url,public_email,public_phone,published_at,last_verified_at,updated_at,status,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const create = (id, name, status = "PUBLISHED", archivedAt = null, publishedAt = "2026-10-01") =>
    insert.run(id, name, "org-" + id, "Short " + name, "Full private description ".repeat(200),
      "Nitra", "Nitriansky kraj", "/media/organizations/sample.jpg", null,
      "https://example.sk", "public@example.sk", "+421900000000", publishedAt,
      id === 1 ? "2026-10-21" : null, "2026-10-22", status, archivedAt);
  create(1, "Berta");
  create(2, "Alfa");
  create(3, "Draft", "DRAFT");
  create(4, "Archived", "PUBLISHED", "2026-10-01");
  create(5, "Unpublished", "PUBLISHED", null, null);
  db.prepare("INSERT INTO organization_locations VALUES (1,1,'Trnava','Trnavský kraj','SITE',1,0)").run();
  return db;
}

test("shelter card SQL retains canonical eligibility, stable order and SITE priority without full descriptions", async () => {
  const sqlite = fixture();
  const queries = [];
  const adapter = {
    prepare(sql) {
      queries.push(sql);
      return {
        bind(...bindings) {
          return { all: async () => ({ results: sqlite.prepare(sql).all(...bindings) }) };
        },
      };
    },
  };
  try {
    const cards = await listPublishedOrganizationCards(adapter, 10);
    assert.deepEqual(cards.map(card => card.name), ["Alfa", "Berta"]);
    assert.equal(cards[1].city, "Trnava");
    assert.equal(cards[1].region, "Trnavský kraj");
    assert.equal(cards[1].lastVerifiedAt, "2026-10-21");
    assert.deepEqual(Object.keys(cards[0]).sort(), [
      "id", "name", "slug", "shortDescription", "city", "region",
      "imageUrl", "thumbnailImageDisplay", "lastVerifiedAt", "updatedAt",
    ].sort());
    assert.equal(cards[0].description, undefined);
    assert.equal(cards[0].publicEmail, undefined);
    assert.equal(cards[0].websiteUrl, undefined);
    const sql = queries[0];
    assert.ok(sql.includes("o.status = 'PUBLISHED' AND o.published_at IS NOT NULL AND o.archived_at IS NULL"));
    for (const field of ["o.description", "o.public_email", "o.public_phone", "o.website_url"]) {
      assert.ok(!sql.includes(field), "Card SQL must not select " + field);
    }
    assert.deepEqual((await listPublishedOrganizationCards(adapter, 1)).map(item => item.name), ["Alfa"]);
    const full = buildPublishedOrganizationIndexQuery(10);
    assert.match(full.sql, /o\.description/);
    assert.match(full.sql, /o\.public_email/);
    assert.match(full.sql, /o\.website_url/);
  } finally {
    sqlite.close();
  }
});

test("help category uses dedicated canonical cards and leaves full organization detail untouched", () => {
  const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
  const help = read("../lib/help-store.ts");
  const org = read("../lib/help-organization-store.ts");
  const functionBody = help.split("export async function getPublishedHelpCaseCards(")[1]
    ?.split("export async function getPublishedHelpCases(")[0];
  assert.ok(functionBody);
  assert.match(functionBody, /listPublishedOrganizationCards\(/);
  assert.doesNotMatch(functionBody, /canonicalOrganizationToHelpCase\(/);
  assert.match(org, /export async function getPublicOrganizationBySlug\(/);
  assert.match(org, /export async function listPublishedOrganizations\(/);
});
