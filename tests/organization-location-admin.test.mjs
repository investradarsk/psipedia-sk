import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { getPublicOrganizationBySlug } from "../lib/help-organization-store.ts";
import { OrganizationLocationAdminValidationError } from "../lib/organization-location-admin.ts";
import {
  createOrganizationLocationFromAdmin,
  deleteOrganizationLocationFromAdmin,
  OrganizationLocationMutationConflictError,
  updateOrganizationLocationFromAdmin,
} from "../lib/organization-location-admin-write.ts";
import { listOrganizationLocationsAdmin } from "../lib/organization-location-admin-store.ts";

const migration = readFileSync(new URL("../drizzle/0040_organization_locations_foundation.sql", import.meta.url), "utf8");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

class SqliteD1Statement {
  constructor(statement) { this.statement = statement; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.statement.get(...this.values) ?? null; }
  async all() { return { results: this.statement.all(...this.values) }; }
  async run() { const result = this.statement.run(...this.values); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; }
}

class SqliteD1Database {
  constructor(database) { this.database = database; }
  prepare(query) { return new SqliteD1Statement(this.database.prepare(query)); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = statements.map((statement) => { const result = statement.statement.run(...statement.values); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; });
      this.database.exec("COMMIT"); return results;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}

function makeDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(`CREATE TABLE help_organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL,
    legal_name TEXT NOT NULL DEFAULT '', registration_number TEXT, type TEXT NOT NULL DEFAULT 'OTHER', status TEXT NOT NULL DEFAULT 'DRAFT',
    short_description TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', public_email TEXT, public_phone TEXT,
    website_url TEXT, facebook_url TEXT, instagram_url TEXT, address TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
    district TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', country_code TEXT NOT NULL DEFAULT 'SK', image_url TEXT,
    directory_profile_id INTEGER, source_url TEXT, published_at TEXT, last_verified_at TEXT, archived_at TEXT,
    updated_at TEXT NOT NULL DEFAULT '2026-09-18T06:00:00.000Z'
  );`);
  sqlite.exec(migration);
  sqlite.exec(`INSERT INTO help_organizations (id, name, slug, status, address, city, district, region, country_code, published_at, archived_at) VALUES
    (1, 'Prvá organizácia', 'prva', 'PUBLISHED', 'Legacy 1', 'Legacy mesto', 'Legacy okres', 'Legacy kraj', 'SK', '2026-09-01T00:00:00.000Z', NULL),
    (2, 'Druhá organizácia', 'druha', 'DRAFT', '', '', '', '', 'SK', NULL, NULL),
    (3, 'Archivovaná organizácia', 'archivovana', 'ARCHIVED', '', '', '', '', 'SK', NULL, '2026-09-01T00:00:00.000Z');`);
  return { sqlite, db: new SqliteD1Database(sqlite) };
}

const locationPayload = (overrides = {}) => ({ role: "SITE", label: "Prevádzka", address: "Testovacia 1", city: "Nitra", district: "Nitra", region: "Nitriansky kraj", countryCode: "SK", isPrimary: false, sortOrder: 0, ...overrides });

test("create uses canonical fields, supports zero/one primary and orders deterministically", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const later = await createOrganizationLocationFromAdmin(1, locationPayload({ label: "Neskôr", sortOrder: 20 }), db);
    const primary = await createOrganizationLocationFromAdmin(1, locationPayload({ label: "Hlavná", role: "SERVICE_AREA", sortOrder: 10, isPrimary: true }), db);
    assert.ok(later && primary);
    assert.deepEqual((await listOrganizationLocationsAdmin(1, db)).map((item) => item.id), [primary.id, later.id]);
    assert.equal((await listOrganizationLocationsAdmin(1, db)).filter((item) => item.isPrimary).length, 1);
    assert.equal(primary.role, "SERVICE_AREA"); assert.equal(primary.address, "Testovacia 1");
  } finally { sqlite.close(); }
});

test("editing primary switches the invariant in one statement and clearing primary is valid", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const first = await createOrganizationLocationFromAdmin(1, locationPayload({ label: "Prvá", isPrimary: true }), db);
    const second = await createOrganizationLocationFromAdmin(1, locationPayload({ label: "Druhá", city: "Šaľa", sortOrder: 1 }), db);
    assert.ok(first && second);
    const switched = await updateOrganizationLocationFromAdmin(1, second.id, locationPayload({ label: "Druhá upravená", city: "Levice", isPrimary: true, sortOrder: -5 }), db);
    assert.ok(switched?.isPrimary);
    let items = await listOrganizationLocationsAdmin(1, db);
    assert.deepEqual(items.map((item) => [item.id, item.isPrimary]), [[second.id, true], [first.id, false]]);
    const cleared = await updateOrganizationLocationFromAdmin(1, second.id, locationPayload({ label: "Druhá upravená", city: "Levice", sortOrder: -5, isPrimary: false }), db);
    assert.equal(cleared?.isPrimary, false); items = await listOrganizationLocationsAdmin(1, db);
    assert.equal(items.filter((item) => item.isPrimary).length, 0, "ORG-2A permits zero primary rows");
  } finally { sqlite.close(); }
});

test("organization/location isolation and invalid identifiers fail closed", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const item = await createOrganizationLocationFromAdmin(1, locationPayload(), db); assert.ok(item);
    assert.equal(await updateOrganizationLocationFromAdmin(2, item.id, locationPayload({ city: "Wrong org" }), db), null);
    assert.equal(await deleteOrganizationLocationFromAdmin(2, item.id, db), false);
    assert.equal(await createOrganizationLocationFromAdmin(0, locationPayload(), db), null);
    assert.equal(await updateOrganizationLocationFromAdmin(1, -1, locationPayload(), db), null);
    assert.equal(await deleteOrganizationLocationFromAdmin(1, Number.NaN, db), false);
    assert.equal((await listOrganizationLocationsAdmin(1, db))[0].city, "Nitra");
  } finally { sqlite.close(); }
});

test("deleting a primary is a hard delete without invented auto-promotion; public read stays deterministic", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const primary = await createOrganizationLocationFromAdmin(1, locationPayload({ city: "Primárne", isPrimary: true, sortOrder: 0 }), db);
    const remaining = await createOrganizationLocationFromAdmin(1, locationPayload({ city: "Zostáva", isPrimary: false, sortOrder: 5 }), db);
    assert.ok(primary && remaining); assert.equal(await deleteOrganizationLocationFromAdmin(1, primary.id, db), true);
    const items = await listOrganizationLocationsAdmin(1, db); assert.deepEqual(items.map((item) => [item.id, item.isPrimary]), [[remaining.id, false]]);
    const publicOrganization = await getPublicOrganizationBySlug("prva", db);
    assert.equal(publicOrganization?.city, "Zostáva"); assert.equal(publicOrganization?.locations[0].id, remaining.id);
  } finally { sqlite.close(); }
});

test("organization with no canonical locations remains representable and legacy fallback is not rewritten", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    assert.deepEqual(await listOrganizationLocationsAdmin(2, db), []);
    const item = await createOrganizationLocationFromAdmin(1, locationPayload({ city: "Canonical mesto" }), db); assert.ok(item);
    assert.equal(await deleteOrganizationLocationFromAdmin(1, item.id, db), true);
    const parent = sqlite.prepare("SELECT address, city, district, region, country_code FROM help_organizations WHERE id = 1").get();
    assert.equal(parent.address, "Legacy 1"); assert.equal(parent.city, "Legacy mesto"); assert.equal(parent.district, "Legacy okres"); assert.equal(parent.region, "Legacy kraj"); assert.equal(parent.country_code, "SK");
    const publicOrganization = await getPublicOrganizationBySlug("prva", db); assert.equal(publicOrganization?.locations[0].id, null); assert.equal(publicOrganization?.city, "Legacy mesto");
  } finally { sqlite.close(); }
});

test("server-side validation rejects invalid roles, types, managed IDs and archived-parent mutations", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    await assert.rejects(() => createOrganizationLocationFromAdmin(1, locationPayload({ role: "OTHER" }), db), OrganizationLocationAdminValidationError);
    await assert.rejects(() => createOrganizationLocationFromAdmin(1, locationPayload({ sortOrder: 1.5 }), db), /celé číslo/);
    await assert.rejects(() => createOrganizationLocationFromAdmin(1, locationPayload({ isPrimary: "yes" }), db), /boolean/);
    await assert.rejects(() => createOrganizationLocationFromAdmin(1, locationPayload({ organizationId: 2 }), db), /spravuje server/);
    await assert.rejects(() => createOrganizationLocationFromAdmin(3, locationPayload(), db), OrganizationLocationMutationConflictError);
  } finally { sqlite.close(); }
});

test("ORG-2B public read observes canonical data changed by admin CRUD and still excludes street address", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const item = await createOrganizationLocationFromAdmin(1, locationPayload({ label: "Pobočka", address: "Neverejná 99", city: "Trnava", isPrimary: true }), db); assert.ok(item);
    const edited = await updateOrganizationLocationFromAdmin(1, item.id, locationPayload({ label: "Pôsobnosť", role: "SERVICE_AREA", address: "Neverejná 100", city: "Piešťany", isPrimary: true }), db); assert.ok(edited);
    const publicOrganization = await getPublicOrganizationBySlug("prva", db);
    assert.equal(publicOrganization?.city, "Piešťany"); assert.equal(publicOrganization?.locations[0].label, "Pôsobnosť"); assert.equal(Object.hasOwn(publicOrganization?.locations[0] ?? {}, "address"), false);
  } finally { sqlite.close(); }
});

test("admin routes enforce auth-before-body, JSON content type and organization-scoped mutations", () => {
  const collection = read("../app/api/admin/organizations/[id]/locations/route.ts");
  const item = read("../app/api/admin/organizations/[id]/locations/[locationId]/route.ts");
  const write = read("../lib/organization-location-admin-write.ts"); const page = read("../app/admin/organizacie/[id]/page.tsx");
  assert.ok(collection.indexOf("getAdminApiUser()") < collection.indexOf("request.json()"));
  assert.ok(item.indexOf("getAdminApiUser()") < item.indexOf("request.json()"));
  assert.match(collection, /content-type/); assert.match(item, /content-type/);
  assert.match(write, /WHERE id = \? AND organization_id = \?/); assert.match(write, /CASE WHEN id = \? THEN 1 ELSE 0 END/);
  assert.doesNotMatch(write, /UPDATE help_organizations[\s\S]*(address|city|district|region|country_code)/i);
  assert.match(page, /listOrganizationLocationsAdmin/);
});
