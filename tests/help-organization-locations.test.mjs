import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildPublicOrganizationLocationsQuery } from "../lib/help-organization-store.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../drizzle/0040_organization_locations_foundation.sql");
const schema = read("../db/help-organization-schema.ts");

test("organization_locations migration defines the minimal canonical schema and constraints", () => {
  assert.match(migration, /^CREATE TABLE IF NOT EXISTS organization_locations/m);
  assert.match(migration, /organization_id INTEGER NOT NULL REFERENCES help_organizations\(id\) ON DELETE CASCADE/);
  assert.match(migration, /CHECK \(role IN \('UNSPECIFIED', 'SITE', 'LEGAL_SEAT', 'SERVICE_AREA'\)\)/);
  assert.match(migration, /CHECK \(is_primary IN \(0, 1\)\)/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS organization_locations_org_order_idx\s+ON organization_locations\(organization_id, sort_order, id\)/m);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS organization_locations_one_primary_idx\s+ON organization_locations\(organization_id\)\s+WHERE is_primary = 1/m);
  for (const column of ["label", "address", "city", "district", "region", "country_code", "sort_order"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.doesNotMatch(migration, /latitude|longitude|\blat\b|\blng\b|geocod|postcode/i);
});

test("legacy backfill is deterministic, idempotency-conscious and does not mutate organizations", () => {
  assert.match(migration, /INSERT INTO organization_locations/);
  assert.match(migration, /SELECT\s+o\.id,\s+'UNSPECIFIED',\s+'',\s+o\.address,\s+o\.city,\s+o\.district,\s+o\.region,\s+o\.country_code,\s+1,\s+0\s+FROM help_organizations o/s);
  assert.match(migration, /WHERE NOT EXISTS \(\s+SELECT 1\s+FROM organization_locations l\s+WHERE l\.organization_id = o\.id\s+\)/s);
  assert.doesNotMatch(migration, /source_data_json|operatingArea|facilityNames/i);
  assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM|INSERT INTO)\s+help_organizations/i);
  assert.doesNotMatch(migration, /\bstatus\b|published_at/);
});

test("Drizzle representation mirrors migration constraints without changing legacy parent fields", () => {
  assert.match(schema, /export const organizationLocations = sqliteTable\(/);
  assert.match(schema, /organizationId: integer\("organization_id"\)[\s\S]*references\(\(\) => helpOrganizations\.id, \{ onDelete: "cascade" \}\)/);
  assert.match(schema, /organizationLocationRoles = \["UNSPECIFIED", "SITE", "LEGAL_SEAT", "SERVICE_AREA"\]/);
  assert.match(schema, /organization_locations_role_check/);
  assert.match(schema, /organization_locations_is_primary_check/);
  assert.match(schema, /organization_locations_org_order_idx/);
  assert.match(schema, /organization_locations_one_primary_idx/);
  for (const legacyField of ["address", "city", "district", "region", "countryCode"]) {
    assert.match(schema, new RegExp(`${legacyField}:`));
  }
});

test("public location query is deterministic and excludes street address/provenance", () => {
  const query = buildPublicOrganizationLocationsQuery(7);
  assert.ok(query);
  assert.deepEqual(query.bindings, [7]);
  assert.match(query.sql, /FROM organization_locations l/);
  assert.match(query.sql, /WHERE l\.organization_id = \?/);
  assert.match(query.sql, /ORDER BY l\.sort_order ASC, l\.id ASC/);
  assert.doesNotMatch(query.sql, /\baddress\b|source_data_json|import_key|created_by|updated_by/i);
  assert.equal(buildPublicOrganizationLocationsQuery(0), null);
});
