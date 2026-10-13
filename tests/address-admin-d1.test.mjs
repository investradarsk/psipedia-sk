import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { managedEvents, directoryProfiles } from "../db/schema.ts";
import { organizationLocations, helpOrganizations } from "../db/help-organization-schema.ts";
import { getManagedEventById } from "../lib/event-store.ts";
import { listOrganizationLocationsAdmin } from "../lib/organization-location-admin-store.ts";
import { env } from "cloudflare:workers";

const migrationName = "0123_event_organization_structured_address.sql";
const sql = readFileSync(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8");
const fields = {
  managed_events: ["district", "postal_code", "street", "house_number", "address_format"],
  organization_locations: ["postal_code", "street", "house_number", "address_format"],
};
const read = (name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
const rows = (db, query) => db.prepare(query).all().map((r) => ({ ...r }));
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  // Existing repository migrations, not a hand-written replacement address schema.
  for (const name of ["0002_spicy_ultragirl.sql", "0003_talented_cammi.sql", "0018_cold_nico_minoru.sql",
    "0036_help_organizations_foundation.sql", "0040_organization_locations_foundation.sql",
    "0064_geo_foundation.sql", "0074_directory_service_address.sql", "0077_directory_geo_provider_result_id.sql",
    "0090_geo_google_place_identity.sql"]) db.exec(read(name));
  db.exec(`
    INSERT INTO directory_profiles(id,slug,name,category,excerpt,description,city,region,address,created_at,updated_at,created_by,updated_by)
      VALUES(7,'service','Service','veterinari','','','Liptovská Teplička','Prešovský kraj','Legacy service','old','old','test','test');
    INSERT INTO managed_events(id,slug,title,excerpt,event_type,status,start_date,venue,city,region,address,organizer,description,created_at,updated_at,created_by,updated_by)
      VALUES(11,'physical','Physical','','Iné','published','2026-12-01','Areál nie je ulica','Liptovská Teplička','Prešovský kraj','Pôvodná adresa\n034 84 Liptovská Teplička','Organizer','','old','old','test','test'),
            (12,'online','Online','','Iné','published','2026-12-02','Videohovor','Online','Online','','Organizer','','old','old','test','test');
    INSERT INTO help_organizations(id,name,slug,directory_profile_id,address,city,district,region,created_at,updated_at,created_by,updated_by)
      VALUES(21,'Organization','org',7,'Legacy parent address','Liptovská Teplička','Poprad','Prešovský kraj','old','old','test','test');
    INSERT INTO organization_locations(id,organization_id,role,label,address,city,district,region,is_primary,sort_order)
      VALUES(31,21,'SITE','Prevádzka','Original SITE address','Liptovská Teplička','Poprad','Prešovský kraj',1,0),
            (32,21,'LEGAL_SEAT','Sídlo','Original legal seat','Poprad','Poprad','Prešovský kraj',0,1),
            (33,21,'SERVICE_AREA','Oblasť','','Poprad','Poprad','Prešovský kraj',0,2),
            (34,21,'UNSPECIFIED','','Unspecified address','','','',0,3);
    INSERT INTO geo_points(id,target_type,managed_event_id,organization_location_id,directory_profile_id,
      public_visibility,public_precision,latitude,longitude,resolution_method,provider,source_fingerprint,
      resolved_source_fingerprint,google_place_id,google_place_source_fingerprint,google_place_matched_at,
      provider_result_id,geocode_status,created_at,updated_at)
      VALUES(41,'MANAGED_EVENT',11,NULL,NULL,'EXACT_PUBLIC','EXACT',49,20,'GEOCODER','google_places','event-fp','event-fp','event-place','event-fp','old','event-place','RESOLVED','old','old'),
            (42,'ORGANIZATION_LOCATION',NULL,31,NULL,'EXACT_PUBLIC','EXACT',49.1,20.1,'GEOCODER','google_places','org-fp','org-fp','org-place','org-fp','old','org-place','RESOLVED','old','old'),
            (43,'DIRECTORY_PROFILE',NULL,NULL,7,'EXACT_PUBLIC','EXACT',49.2,20.2,'GEOCODER','geoapify','dir-fp','dir-fp',NULL,NULL,NULL,'geoapify-place','RESOLVED','old','old'),
            (44,'MANAGED_EVENT',12,NULL,NULL,'HIDDEN',NULL,NULL,NULL,NULL,NULL,'online-fp',NULL,NULL,NULL,NULL,NULL,'SKIPPED','old','old');
  `);
  return db;
}
function d1(db) {
  return { prepare(query) {
    const statement = db.prepare(query);
    return { values: [], bind(...values) { this.values = values; return this; },
      async first() { return statement.get(...this.values) ?? null; },
      async all() { return { results: statement.all(...this.values) }; },
      async run() { return { meta: { changes: Number(statement.run(...this.values).changes) } }; },
    };
  } };
}
function capture(db) {
  return Object.fromEntries(["managed_events", "organization_locations", "help_organizations", "directory_profiles", "geo_points"].map((table) => {
    const columns = rows(db, `PRAGMA table_info(${table})`).map((c) => c.name);
    return [table, { columns, data: rows(db, `SELECT ${columns.join(",")} FROM ${table} ORDER BY id`) }];
  }));
}

test("0123 preserves every original column, row, ID, relation, role, primary and GEO value", (t) => {
  const db = fixture(); t.after(() => db.close()); const before = capture(db);
  const foreignKeys = rows(db, "PRAGMA foreign_key_list(organization_locations)");
  const indexes = rows(db, "SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name");
  db.exec(sql);
  for (const [table, snapshot] of Object.entries(before)) {
    assert.deepEqual(rows(db, `SELECT ${snapshot.columns.join(",")} FROM ${table} ORDER BY id`), snapshot.data, table);
  }
  assert.deepEqual(rows(db, "PRAGMA foreign_key_list(organization_locations)"), foreignKeys);
  assert.deepEqual(rows(db, "SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name"), indexes);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), []);
});
test("0123 legacy rows receive empty TEXT defaults, not inferred venue/address fields", (t) => {
  const db = fixture(); t.after(() => db.close()); db.exec(sql);
  for (const [table, names] of Object.entries(fields)) {
    const columns = rows(db, `PRAGMA table_info(${table})`);
    for (const name of names) {
      const column = columns.find((c) => c.name === name);
      assert.equal(column.type, "TEXT"); assert.equal(column.notnull, 1); assert.equal(column.dflt_value, "''");
    }
    for (const row of rows(db, `SELECT ${names.join(",")} FROM ${table}`)) assert.ok(Object.values(row).every((v) => v === ""));
  }
  assert.equal(db.prepare("SELECT region FROM managed_events WHERE id=12").get().region, "Online");
  assert.equal(db.prepare("SELECT street FROM managed_events WHERE id=11").get().street, "");
});
test("0123 stores leading-zero postcode and slash house numbers as text without editing public address or GEO", (t) => {
  const db = fixture(); t.after(() => db.close()); db.exec(sql); const geo = rows(db, "SELECT * FROM geo_points ORDER BY id");
  for (const [table, id, number] of [["managed_events",11,"1127/21"],["organization_locations",31,"12/A"]]) {
    const before = db.prepare(`SELECT address FROM ${table} WHERE id=?`).get(id).address;
    db.prepare(`UPDATE ${table} SET postal_code=?,street=?,house_number=?,address_format=? WHERE id=?`).run("034 84","Ručne zadaná",number,"STREET",id);
    const row = db.prepare(`SELECT postal_code,house_number,typeof(postal_code) AS postal_type,typeof(house_number) AS number_type,address FROM ${table} WHERE id=?`).get(id);
    assert.equal(row.postal_code,"034 84"); assert.equal(row.house_number,number);
    assert.equal(row.postal_type,"text"); assert.equal(row.number_type,"text"); assert.equal(row.address,before);
  }
  assert.deepEqual(rows(db, "SELECT * FROM geo_points ORDER BY id"), geo);
});
test("0123 retains format, nullability, foreign-key and primary constraints", (t) => {
  const db = fixture(); t.after(() => db.close()); db.exec(sql);
  for (const table of Object.keys(fields)) {
    for (const format of ["", "STREET", "MUNICIPALITY_NUMBER"]) db.prepare(`UPDATE ${table} SET address_format=?`).run(format);
    assert.throws(() => db.exec(`UPDATE ${table} SET address_format='BOGUS'`), /CHECK constraint/);
    assert.throws(() => db.exec(`UPDATE ${table} SET postal_code=NULL`), /NOT NULL/);
  }
  assert.throws(() => db.exec("UPDATE organization_locations SET organization_id=999 WHERE id=31"), /FOREIGN KEY/);
  assert.throws(() => db.exec("UPDATE organization_locations SET is_primary=1 WHERE id=32"), /UNIQUE/);
  assert.throws(() => db.exec("UPDATE organization_locations SET role='BOGUS' WHERE id=32"), /CHECK/);
});
test("legacy SQL inserts/updates omit new fields safely, and table info adds exactly nine columns", (t) => {
  const db = fixture(); t.after(() => db.close()); const before = capture(db); db.exec(sql);
  db.exec(`INSERT INTO organization_locations(organization_id,role,address,is_primary) VALUES(21,'SITE','Legacy new branch',0);
    INSERT INTO managed_events(slug,title,excerpt,event_type,start_date,city,region,organizer,description,created_at,updated_at,created_by,updated_by)
    VALUES('legacy-insert','New','','Iné','2026-12-03','Online','Online','','','old','old','test','test');
    UPDATE managed_events SET venue='Updated venue',address='Updated legacy address' WHERE id=11;
    UPDATE organization_locations SET label='Updated label' WHERE id=31;`);
  assert.equal(db.prepare("SELECT postal_code FROM managed_events WHERE slug='legacy-insert'").get().postal_code, "");
  assert.equal(db.prepare("SELECT house_number FROM organization_locations WHERE address='Legacy new branch'").get().house_number, "");
  for (const [table, snapshot] of Object.entries(before)) {
    const after = rows(db, `PRAGMA table_info(${table})`).map(c => c.name);
    assert.deepEqual(after.filter(name => !snapshot.columns.includes(name)), fields[table] ?? []);
  }
});
test("existing event and location runtime readers return identical contracts after migration", async (t) => {
  const db = fixture(); t.after(() => db.close()); const binding = d1(db); const oldDb = env.DB;
  env.DB = binding; t.after(() => { env.DB = oldDb; });
  const before = [await getManagedEventById(11), await getManagedEventById(12), await listOrganizationLocationsAdmin(21,binding)];
  db.exec(sql);
  const after = [await getManagedEventById(11), await getManagedEventById(12), await listOrganizationLocationsAdmin(21,binding)];
  assert.deepEqual(after,before); assert.equal(after[1].region,"Online");
});
test("Drizzle matches migration columns and enum constraints without duplicating directory or parent fields", () => {
  for (const [table, names] of [[managedEvents,fields.managed_events],[organizationLocations,fields.organization_locations]]) {
    const config = getTableConfig(table);
    for (const name of names) {
      const column = config.columns.find(c => c.name === name);
      assert.ok(column); assert.equal(column.dataType,"string"); assert.equal(column.notNull,true); assert.equal(column.default,"");
    }
    assert.ok(config.checks.some(c => c.name === `${config.name}_address_format_check`));
  }
  for (const name of fields.organization_locations) {
    assert.equal(getTableConfig(directoryProfiles).columns.filter(c => c.name === name).length,1);
    assert.equal(getTableConfig(helpOrganizations).columns.some(c => c.name === name),false);
  }
});
test("migration consists only of nine additive statements; replay is delegated to migration history", (t) => {
  const db = fixture(); t.after(() => db.close());
  const statements = sql.replace(/--[^\n]*/g, "").split(";").map(s => s.trim()).filter(Boolean);
  assert.equal(statements.length,9); assert.ok(statements.every(s => /^ALTER TABLE (managed_events|organization_locations) ADD COLUMN /i.test(s)));
  db.exec(sql); assert.throws(() => db.exec(sql), /duplicate column/);
  // Raw ALTER is not idempotent; Wrangler d1_migrations must apply it exactly once.
});
