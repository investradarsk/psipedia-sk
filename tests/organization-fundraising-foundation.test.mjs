import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  ORGANIZATION_FUNDRAISING_METHOD_TYPES,
  ORGANIZATION_FUNDRAISING_OWNERSHIPS,
  ORGANIZATION_FUNDRAISING_VERIFICATION_STATUSES,
} from "../lib/organization-fundraising-contract.ts";
import { mapOrganizationFundraisingMethodRow } from "../lib/organization-fundraising-store.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../drizzle/0041_organization_fundraising_methods.sql");
const schema = read("../db/help-organization-schema.ts");

function makeDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE help_organizations (id INTEGER PRIMARY KEY AUTOINCREMENT);");
  db.exec(migration);
  return db;
}

function insertMethod(db, overrides = {}) {
  const row = {
    organizationId: 1,
    type: "DONATION_PAGE",
    ownership: "ORGANIZATION_OWNED",
    label: undefined,
    url: undefined,
    value: undefined,
    instructions: undefined,
    beneficiaryIdentity: undefined,
    sortOrder: undefined,
    isActive: undefined,
    verificationStatus: undefined,
    version: undefined,
    ...overrides,
  };

  const columns = ["organization_id", "type", "ownership", "created_at", "updated_at", "created_by", "updated_by"];
  const values = [
    row.organizationId,
    row.type,
    row.ownership,
    "2026-09-17T19:45:00.000Z",
    "2026-09-17T19:45:00.000Z",
    "org-7b-test",
    "org-7b-test",
  ];
  const optional = [
    ["label", row.label],
    ["url", row.url],
    ["value", row.value],
    ["instructions", row.instructions],
    ["beneficiary_identity", row.beneficiaryIdentity],
    ["sort_order", row.sortOrder],
    ["is_active", row.isActive],
    ["verification_status", row.verificationStatus],
    ["version", row.version],
  ];
  for (const [column, value] of optional) {
    if (value !== undefined) {
      columns.push(column);
      values.push(value);
    }
  }

  const placeholders = columns.map(() => "?").join(", ");
  db.prepare(`INSERT INTO organization_fundraising_methods (${columns.join(", ")}) VALUES (${placeholders})`).run(...values);
  return Number(db.prepare("SELECT last_insert_rowid() AS id").get().id);
}

test("0041 migration is schema-only and contains the canonical ORG-7A allowlists", () => {
  assert.match(migration, /^CREATE TABLE IF NOT EXISTS organization_fundraising_methods/m);
  assert.doesNotMatch(migration, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  assert.doesNotMatch(migration, /source_data_json|published_at|help_organizations\.status/i);
  for (const value of ORGANIZATION_FUNDRAISING_METHOD_TYPES) assert.match(migration, new RegExp(`'${value}'`));
  for (const value of ORGANIZATION_FUNDRAISING_OWNERSHIPS) assert.match(migration, new RegExp(`'${value}'`));
  for (const value of ORGANIZATION_FUNDRAISING_VERIFICATION_STATUSES) assert.match(migration, new RegExp(`'${value}'`));
  for (const forbidden of ["TAX_2_PERCENT", "WISHLIST", "OTHER", "DONIO"]) assert.doesNotMatch(migration, new RegExp(forbidden));
  assert.match(migration, /beneficiary_identity TEXT/);
});

test("migration creates the full canonical schema and inserts zero fundraising rows", () => {
  const db = makeDatabase();
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'organization_fundraising_methods'").get();
    assert.equal(table.name, "organization_fundraising_methods");
    const columns = db.prepare("PRAGMA table_info('organization_fundraising_methods')").all().map((row) => row.name);
    assert.deepEqual(columns, [
      "id", "organization_id", "type", "label", "url", "value", "instructions", "beneficiary_identity", "ownership",
      "sort_order", "is_active", "verification_status", "verified_at", "verified_by", "verification_source_url",
      "verification_expires_at", "valid_until", "version", "archived_at", "created_at", "updated_at", "created_by", "updated_by",
    ]);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM organization_fundraising_methods").get().total, 0);
  } finally {
    db.close();
  }
});

test("foreign key rejects orphans and owned fundraising rows cascade with organization deletion", () => {
  const db = makeDatabase();
  try {
    assert.throws(() => insertMethod(db, { organizationId: 999 }), /FOREIGN KEY constraint failed/i);
    db.exec("INSERT INTO help_organizations DEFAULT VALUES;");
    insertMethod(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM organization_fundraising_methods").get().total, 1);
    db.exec("DELETE FROM help_organizations WHERE id = 1;");
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM organization_fundraising_methods").get().total, 0);
  } finally {
    db.close();
  }
});

test("enum boolean and version checks reject values outside the canonical contract", () => {
  const db = makeDatabase();
  try {
    db.exec("INSERT INTO help_organizations DEFAULT VALUES;");
    for (const overrides of [
      { type: "OTHER" },
      { ownership: "PLATFORM_OWNED" },
      { verificationStatus: "PUBLISHED" },
      { isActive: 2 },
      { version: 0 },
    ]) {
      assert.throws(() => insertMethod(db, overrides), /constraint failed/i);
    }
  } finally {
    db.close();
  }
});

test("multiple methods are allowed and organization ordering is deterministic", () => {
  const db = makeDatabase();
  try {
    db.exec("INSERT INTO help_organizations DEFAULT VALUES;");
    const first = insertMethod(db, { label: "later-a", sortOrder: 10 });
    const second = insertMethod(db, { label: "first", sortOrder: 0, type: "BANK_TRANSFER" });
    const third = insertMethod(db, { label: "later-b", sortOrder: 10, type: "MATERIAL_DONATION" });
    assert.deepEqual(
      db.prepare("SELECT id FROM organization_fundraising_methods WHERE organization_id = 1 ORDER BY sort_order ASC, id ASC").all().map((row) => Number(row.id)),
      [second, first, third],
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM organization_fundraising_methods WHERE organization_id = 1").get().total, 3);
    assert.deepEqual(
      db.prepare("PRAGMA index_info('organization_fundraising_methods_org_order_idx')").all().map((row) => row.name),
      ["organization_id", "sort_order", "id"],
    );
  } finally {
    db.close();
  }
});

test("new rows fail closed with UNVERIFIED inactive lifecycle and OCC-ready version defaults", () => {
  const db = makeDatabase();
  try {
    db.exec("INSERT INTO help_organizations DEFAULT VALUES;");
    const id = insertMethod(db);
    const row = db.prepare("SELECT label, sort_order, is_active, verification_status, version, verified_at, verified_by FROM organization_fundraising_methods WHERE id = ?").get(id);
    assert.deepEqual(row, {
      label: "",
      sort_order: 0,
      is_active: 0,
      verification_status: "UNVERIFIED",
      version: 1,
      verified_at: null,
      verified_by: null,
    });
  } finally {
    db.close();
  }
});

test("Drizzle representation mirrors migration contract without adding fundraising fields to help_organizations", () => {
  assert.match(schema, /export const organizationFundraisingMethods = sqliteTable\(/);
  assert.match(schema, /organizationId: integer\("organization_id"\)[\s\S]*references\(\(\) => helpOrganizations\.id, \{ onDelete: "cascade" \}\)/);
  assert.match(schema, /organization_fundraising_methods_type_check/);
  assert.match(schema, /organization_fundraising_methods_ownership_check/);
  assert.match(schema, /organization_fundraising_methods_verification_status_check/);
  assert.match(schema, /organization_fundraising_methods_is_active_check/);
  assert.match(schema, /organization_fundraising_methods_version_check/);
  assert.match(schema, /organization_fundraising_methods_org_order_idx/);
  assert.match(schema, /beneficiaryIdentity: text\("beneficiary_identity"\)/);
  const parentBlock = schema.slice(schema.indexOf("export const helpOrganizations"), schema.indexOf("export const organizationLocationRoles"));
  assert.doesNotMatch(parentBlock, /fundrais|beneficiaryIdentity/i);
});

test("storage mapper preserves canonical verification and sensitive-destination fields", () => {
  const mapped = mapOrganizationFundraisingMethodRow({
    id: 4,
    organization_id: 8,
    type: "BANK_TRANSFER",
    label: "Účet útulku",
    url: null,
    value: "GB82WEST12345698765432",
    instructions: "Variabilný symbol nepoužívajte",
    beneficiary_identity: "Psia nádej, o.z.",
    ownership: "ORGANIZATION_OWNED",
    sort_order: 3,
    is_active: 0,
    verification_status: "UNVERIFIED",
    verified_at: null,
    verified_by: null,
    verification_source_url: null,
    verification_expires_at: null,
    valid_until: null,
    version: 1,
    archived_at: null,
    created_at: "2026-09-17T19:45:00.000Z",
    updated_at: "2026-09-17T19:45:00.000Z",
    created_by: "org-7b-test",
    updated_by: "org-7b-test",
  });
  assert.equal(mapped.organizationId, 8);
  assert.equal(mapped.beneficiaryIdentity, "Psia nádej, o.z.");
  assert.equal(mapped.isActive, false);
  assert.equal(mapped.verificationStatus, "UNVERIFIED");
  assert.equal(mapped.version, 1);
});
