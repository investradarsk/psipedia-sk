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
const geoMigration = readFileSync(new URL("../drizzle/0064_geo_foundation.sql", import.meta.url), "utf8");
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
  sqlite.exec(`CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY);
    CREATE TABLE managed_events (id INTEGER PRIMARY KEY);`);
  sqlite.exec(geoMigration);
  sqlite.exec(`CREATE TABLE moderation_events (
    id TEXT PRIMARY KEY, submission_id TEXT, resource_type TEXT, subject_id TEXT, action TEXT,
    actor_type TEXT, actor_ref TEXT, from_status TEXT, to_status TEXT, reason_code TEXT,
    changed_fields_json TEXT, request_id TEXT, created_at TEXT
  );`);
  sqlite.exec(`INSERT INTO help_organizations (id, name, slug, status, address, city, district, region, country_code, published_at, archived_at) VALUES
    (1, 'Prvá organizácia', 'prva', 'PUBLISHED', 'Legacy 1', 'Legacy mesto', 'Legacy okres', 'Legacy kraj', 'SK', '2026-09-01T00:00:00.000Z', NULL),
    (2, 'Druhá organizácia', 'druha', 'DRAFT', '', '', '', '', 'SK', NULL, NULL),
    (3, 'Archivovaná organizácia', 'archivovana', 'ARCHIVED', '', '', '', '', 'SK', NULL, '2026-09-01T00:00:00.000Z'),
    (4, 'Štvrtá organizácia', 'stvrtá', 'PUBLISHED', '', 'Nitra', 'Nitra', 'Nitriansky kraj', 'SK', '2026-09-01T00:00:00.000Z', NULL),
    (5, 'Piata organizácia', 'piata', 'PUBLISHED', '', 'Nitra', 'Nitra', 'Nitriansky kraj', 'SK', '2026-09-01T00:00:00.000Z', NULL);`);
  return { sqlite, db: new SqliteD1Database(sqlite) };
}

const locationPayload = (overrides = {}) => ({ role: "SITE", label: "Prevádzka", address: "Testovacia 1", city: "Nitra", district: "Nitra", region: "Nitriansky kraj", countryCode: "SK", isPrimary: false, sortOrder: 0, ...overrides });

test("create establishes the single canonical address and rejects a second row", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const first = await createOrganizationLocationFromAdmin(1, locationPayload({ label: "Adresa", sortOrder: 20, isPrimary: false }), db);
    assert.ok(first);
    assert.equal(first.isPrimary, true);
    assert.equal(first.sortOrder, 0);
    await assert.rejects(
      () => createOrganizationLocationFromAdmin(1, locationPayload({ label: "Druhá adresa" }), db),
      OrganizationLocationMutationConflictError,
    );
    const items = await listOrganizationLocationsAdmin(1, db);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, first.id);
  } finally { sqlite.close(); }
});

test("the one canonical address can still be edited without creating another row", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const first = await createOrganizationLocationFromAdmin(1, locationPayload({ label: "Adresa", isPrimary: true }), db);
    assert.ok(first);
    const edited = await updateOrganizationLocationFromAdmin(
      1,
      first.id,
      locationPayload({ label: "Adresa upravená", city: "Levice", isPrimary: true, sortOrder: 0 }),
      db,
    );
    assert.equal(edited?.city, "Levice");
    assert.equal((await listOrganizationLocationsAdmin(1, db)).length, 1);
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

test("deleting the single canonical address leaves legacy public fallback intact", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const primary = await createOrganizationLocationFromAdmin(1, locationPayload({ city: "Canonical", isPrimary: true }), db);
    assert.ok(primary);
    assert.equal(await deleteOrganizationLocationFromAdmin(1, primary.id, db), true);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM geo_points WHERE organization_location_id = ?").get(primary.id).count, 0);
    assert.equal((await listOrganizationLocationsAdmin(1, db)).length, 0);
    const publicOrganization = await getPublicOrganizationBySlug("prva", db);
    assert.equal(publicOrganization?.city, "Legacy mesto");
    assert.equal(publicOrganization?.locations[0].id, null);
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


test("organization address admin gates the single-address form until hydration", () => {
  const editor = read("../components/admin-organization-locations.tsx");
  assert.match(editor, /useSyncExternalStore/);
  assert.match(editor, /const disabled = !hydrated \|\| archived \|\| busy/);
  assert.match(editor, /<h2>Adresa<\/h2>/);
  assert.doesNotMatch(editor, /Typ lokality|Pridať lokalitu|Hlavná lokalita|ORGANIZATION_LOCATION_ROLES/);
});

test("MAP-AUTO-1C create initializes GEO with classifier-owned SITE review semantics", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const item = await createOrganizationLocationFromAdmin(1, locationPayload({ role: "SITE" }), db);
    assert.ok(item);
    const geo = sqlite.prepare(`SELECT public_visibility, public_precision, geocode_status, last_error_code
      FROM geo_points WHERE organization_location_id = ?`).get(item.id);
    assert.equal(geo.public_visibility, null);
    assert.equal(geo.public_precision, null);
    assert.equal(geo.geocode_status, "NEEDS_REVIEW");
    assert.equal(geo.last_error_code, "PRIVACY_CLASSIFICATION_MISSING");
  } finally { sqlite.close(); }
});

test("MAP-AUTO-1C technical roles still classify safely when each belongs to a different organization", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const service = await createOrganizationLocationFromAdmin(1, locationPayload({ role: "SERVICE_AREA", city: "Nitra" }), db);
    const legal = await createOrganizationLocationFromAdmin(4, locationPayload({ role: "LEGAL_SEAT", city: "Nitra" }), db);
    const unspecified = await createOrganizationLocationFromAdmin(5, locationPayload({ role: "UNSPECIFIED", city: "Nitra" }), db);
    for (const item of [service, legal, unspecified]) assert.ok(item);
    const serviceGeo = sqlite.prepare("SELECT public_visibility, public_precision, geocode_status FROM geo_points WHERE organization_location_id = ?").get(service.id);
    assert.equal(serviceGeo.public_visibility, "APPROXIMATE_PUBLIC");
    assert.equal(serviceGeo.public_precision, "SERVICE_AREA");
    assert.equal(serviceGeo.geocode_status, "PENDING");
    for (const id of [legal.id, unspecified.id]) {
      const geo = sqlite.prepare("SELECT public_visibility, public_precision, geocode_status, last_error_code FROM geo_points WHERE organization_location_id = ?").get(id);
      assert.equal(geo.public_visibility, null);
      assert.equal(geo.public_precision, null);
      assert.equal(geo.geocode_status, "NEEDS_REVIEW");
      assert.equal(geo.last_error_code, "PRIVACY_CLASSIFICATION_MISSING");
    }
  } finally { sqlite.close(); }
});

test("MAP-AUTO-1C update uses centralized reconcile and repeated identical source update is idempotent", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const item = await createOrganizationLocationFromAdmin(1, locationPayload({ role: "SERVICE_AREA", city: "Nitra" }), db);
    assert.ok(item);
    const afterCreate = sqlite.prepare("SELECT COUNT(*) AS count FROM moderation_events").get().count;
    await updateOrganizationLocationFromAdmin(1, item.id, locationPayload({ role: "SERVICE_AREA", city: "Levice" }), db);
    const changed = sqlite.prepare("SELECT geocode_status, source_fingerprint FROM geo_points WHERE organization_location_id = ?").get(item.id);
    assert.equal(changed.geocode_status, "STALE");
    const afterChange = sqlite.prepare("SELECT COUNT(*) AS count FROM moderation_events").get().count;
    assert.ok(afterChange > afterCreate);
    await updateOrganizationLocationFromAdmin(1, item.id, locationPayload({ role: "SERVICE_AREA", city: "Levice" }), db);
    const same = sqlite.prepare("SELECT geocode_status, source_fingerprint FROM geo_points WHERE organization_location_id = ?").get(item.id);
    const afterSame = sqlite.prepare("SELECT COUNT(*) AS count FROM moderation_events").get().count;
    assert.equal(same.source_fingerprint, changed.source_fingerprint);
    assert.equal(afterSame, afterChange);
  } finally { sqlite.close(); }
});

test("MAP-AUTO-1C protects manual coordinates and marks changed source for manual review", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const item = await createOrganizationLocationFromAdmin(1, locationPayload({ role: "SERVICE_AREA", city: "Nitra" }), db);
    assert.ok(item);
    sqlite.prepare(`UPDATE geo_points SET latitude = 48.3, longitude = 18.1, resolution_method = 'MANUAL',
      geocode_status = 'RESOLVED', manual_override = 1, manual_updated_at = '2026-09-26T18:00:00.000Z',
      manual_updated_by = 'admin', resolved_source_fingerprint = source_fingerprint
      WHERE organization_location_id = ?`).run(item.id);
    await updateOrganizationLocationFromAdmin(1, item.id, locationPayload({ role: "SERVICE_AREA", city: "Levice" }), db);
    const geo = sqlite.prepare(`SELECT latitude, longitude, manual_override, geocode_status, last_error_code
      FROM geo_points WHERE organization_location_id = ?`).get(item.id);
    assert.equal(geo.latitude, 48.3);
    assert.equal(geo.longitude, 18.1);
    assert.equal(geo.manual_override, 1);
    assert.equal(geo.geocode_status, "STALE");
    assert.equal(geo.last_error_code, "MANUAL_REVIEW");
  } finally { sqlite.close(); }
});

test("MAP-AUTO-1C integration has one canonical lifecycle entrypoint and no provider call", () => {
  const write = read("../lib/organization-location-admin-write.ts");
  const route = read("../app/api/admin/organizations/[id]/locations/[locationId]/route.ts");
  const geo = read("../lib/geo-store.ts");
  const map = read("../lib/map-query.ts");
  const publication = read("../lib/help-organization-admin-write.ts");
  const bulk = read("../app/api/admin/organizations/bulk/route.ts");

  assert.match(write, /reconcileGeoAfterSourceMutation/);
  assert.equal((write.match(/reconcileGeoAfterSourceMutation\(/g) ?? []).length, 2);
  assert.doesNotMatch(route, /syncGeoPointAfterSourceChange|reconcileGeoAfterSourceMutation/);
  assert.doesNotMatch(write, /Geoapify|applyGeocoderResolution|geocodeOrganization|geo-provider/);
  assert.match(geo, /locationRole: String\(row\.role \?\? "UNSPECIFIED"\)/);
  assert.match(map, /o\.status = 'PUBLISHED'/);
  assert.match(map, /o\.archived_at IS NULL/);
  assert.doesNotMatch(publication, /DELETE FROM geo_points|UPDATE geo_points/);
  assert.match(bulk, /changeOrganizationPublicationFromAdmin/);
});
