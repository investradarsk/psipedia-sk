import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  buildPublicOrganizationFundraisingMethodsQuery,
  listPublicOrganizationFundraisingMethods,
} from "../lib/organization-fundraising-public.ts";

const migration = readFileSync(new URL("../drizzle/0041_organization_fundraising_methods.sql", import.meta.url), "utf8");
const publicSource = readFileSync(new URL("../lib/organization-fundraising-public.ts", import.meta.url), "utf8");
const NOW = new Date("2026-09-18T08:00:00.000Z");

class SqliteD1Statement {
  constructor(statement) { this.statement = statement; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.statement.get(...(this.values ?? [])) ?? null; }
  async all() { return { results: this.statement.all(...(this.values ?? [])) }; }
  async run() {
    const result = this.statement.run(...(this.values ?? []));
    return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class SqliteD1Database {
  constructor(database) { this.database = database; }
  prepare(query) { return new SqliteD1Statement(this.database.prepare(query)); }
}

function makeDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(`CREATE TABLE help_organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL
  );`);
  sqlite.exec("INSERT INTO help_organizations (id, status) VALUES (1, 'PUBLISHED'), (2, 'DRAFT'), (3, 'ARCHIVED');");
  sqlite.exec(migration);
  return { sqlite, db: new SqliteD1Database(sqlite) };
}

function insertMethod(sqlite, overrides = {}) {
  const row = {
    organizationId: 1,
    type: "DONATION_PAGE",
    label: "Podporte nás",
    url: "https://example.org/donate",
    value: null,
    instructions: "Použite bezpečný verejný formulár.",
    beneficiaryIdentity: "Citlivý príjemca, nezverejňovať",
    ownership: "ORGANIZATION_OWNED",
    sortOrder: 0,
    isActive: 1,
    verificationStatus: "VERIFIED",
    verifiedAt: "2026-09-18T07:00:00.000Z",
    verifiedBy: "internal-verifier@example.org",
    verificationSourceUrl: "https://internal.example.org/source",
    verificationExpiresAt: "2030-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    version: 9,
    archivedAt: null,
    ...overrides,
  };
  const result = sqlite.prepare(`INSERT INTO organization_fundraising_methods (
    organization_id, type, label, url, value, instructions, beneficiary_identity, ownership, sort_order,
    is_active, verification_status, verified_at, verified_by, verification_source_url, verification_expires_at,
    valid_until, version, archived_at, created_at, updated_at, created_by, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.organizationId,
    row.type,
    row.label,
    row.url,
    row.value,
    row.instructions,
    row.beneficiaryIdentity,
    row.ownership,
    row.sortOrder,
    row.isActive,
    row.verificationStatus,
    row.verifiedAt,
    row.verifiedBy,
    row.verificationSourceUrl,
    row.verificationExpiresAt,
    row.validUntil,
    row.version,
    row.archivedAt,
    "2026-09-18T07:00:00.000Z",
    "2026-09-18T07:00:00.000Z",
    "internal-creator@example.org",
    "internal-editor@example.org",
  );
  return Number(result.lastInsertRowid);
}

test("eligible methods use deterministic sort_order/id ordering and a narrow public allowlist", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const laterDonation = insertMethod(sqlite, {
      sortOrder: 10,
      label: "Online dar",
      value: "internal-unused-value",
      url: "https://EXAMPLE.org/donate",
    });
    const bank = insertMethod(sqlite, {
      type: "BANK_TRANSFER",
      label: "Účet organizácie",
      sortOrder: 0,
      url: "https://example.org/unused-bank-url",
      value: "GB82 WEST 1234 5698 7654 32",
    });
    const material = insertMethod(sqlite, {
      type: "MATERIAL_DONATION",
      label: "Materiálna pomoc",
      sortOrder: 10,
      url: null,
      value: "Granule a deky",
      instructions: "Doručenie dohodnite vopred.",
    });

    const methods = await listPublicOrganizationFundraisingMethods(1, "PUBLISHED", db, NOW);
    assert.deepEqual(methods.map((method) => method.id), [bank, laterDonation, material]);

    assert.deepEqual(Object.keys(methods[0]).sort(), [
      "id", "instructions", "label", "sortOrder", "type", "url", "value",
    ].sort());
    assert.equal(methods[0].url, null, "BANK_TRANSFER must not expose an irrelevant URL field");
    assert.equal(methods[0].value, "GB82 WEST 1234 5698 7654 32");
    assert.equal(methods[1].url, "https://example.org/donate");
    assert.equal(methods[1].value, null, "DONATION_PAGE must not expose an irrelevant raw value");
    assert.equal(methods[2].value, "Granule a deky");

    const serialized = JSON.stringify(methods);
    for (const forbidden of [
      "Citlivý príjemca",
      "internal-verifier",
      "internal.example.org/source",
      "internal-creator",
      "internal-editor",
      '"version"',
      "verifiedAt",
      "verificationSource",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  } finally {
    sqlite.close();
  }
});

test("public eligibility fails closed for inactive, archived, non-verified, expired and invalid destinations", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const eligible = insertMethod(sqlite, { label: "Eligible", sortOrder: 0 });
    insertMethod(sqlite, { label: "Inactive", sortOrder: 1, isActive: 0 });
    insertMethod(sqlite, { label: "Archived", sortOrder: 2, archivedAt: "2026-09-18T07:30:00.000Z" });
    insertMethod(sqlite, { label: "Unverified", sortOrder: 3, verificationStatus: "UNVERIFIED" });
    insertMethod(sqlite, { label: "Rejected", sortOrder: 4, verificationStatus: "REJECTED" });
    insertMethod(sqlite, { label: "Stale", sortOrder: 5, verificationStatus: "STALE" });
    insertMethod(sqlite, {
      label: "Expired verification",
      sortOrder: 6,
      verificationExpiresAt: "2026-09-18T07:59:59.000Z",
    });
    insertMethod(sqlite, {
      label: "Expired validity",
      sortOrder: 7,
      validUntil: "2026-09-18T07:59:59.000Z",
    });
    insertMethod(sqlite, {
      label: "Unsafe URL",
      sortOrder: 8,
      url: "javascript:alert(1)",
    });
    insertMethod(sqlite, {
      label: "Local URL",
      sortOrder: 9,
      url: "https://127.0.0.1/donate",
    });
    insertMethod(sqlite, {
      label: "Data URL",
      sortOrder: 10,
      url: "data:text/plain,not-public",
    });
    insertMethod(sqlite, {
      type: "BANK_TRANSFER",
      label: "Invalid IBAN",
      sortOrder: 11,
      url: null,
      value: "NOT-AN-IBAN",
    });

    const methods = await listPublicOrganizationFundraisingMethods(1, "PUBLISHED", db, NOW);
    assert.deepEqual(methods.map((method) => method.id), [eligible]);
    assert.deepEqual(await listPublicOrganizationFundraisingMethods(1, "DRAFT", db, NOW), []);
    assert.deepEqual(await listPublicOrganizationFundraisingMethods(1, "ARCHIVED", db, NOW), []);
  } finally {
    sqlite.close();
  }
});

test("multiple public types preserve only contract-relevant destination fields and safe HTTPS CTAs", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    insertMethod(sqlite, {
      type: "TRANSPARENT_ACCOUNT",
      label: "Transparentný účet",
      url: "https://EXAMPLE.org/transparent",
      value: "GB82WEST12345698765432",
      sortOrder: 0,
    });
    insertMethod(sqlite, {
      type: "EXTERNAL_FUNDRAISER",
      label: "Externá zbierka",
      url: "https://example.org/campaign",
      value: "must-not-be-public",
      sortOrder: 1,
    });

    const methods = await listPublicOrganizationFundraisingMethods(1, "PUBLISHED", db, NOW);
    assert.equal(methods.length, 2);
    assert.equal(methods[0].url, "https://example.org/transparent");
    assert.equal(methods[0].value, "GB82 WEST 1234 5698 7654 32");
    assert.equal(methods[1].url, "https://example.org/campaign");
    assert.equal(methods[1].value, null);
  } finally {
    sqlite.close();
  }
});

test("public SQL boundary excludes beneficiary and admin/audit metadata", () => {
  const query = buildPublicOrganizationFundraisingMethodsQuery(1);
  assert.ok(query);
  const sql = query.sql;
  for (const forbidden of [
    "beneficiary_identity",
    "verified_by",
    "verification_source_url",
    "verified_at",
    "version",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
  ]) {
    assert.doesNotMatch(sql, new RegExp(forbidden, "i"), forbidden);
  }
  assert.match(sql, /ORDER BY f\.sort_order ASC, f\.id ASC/);
  assert.doesNotMatch(publicSource, /beneficiary_identity|verified_by|created_by|updated_by/i);
});

test("invalid organization ids return no public methods without constructing a query", async () => {
  const database = {
    prepare() { throw new Error("database must not be touched"); },
  };
  assert.equal(buildPublicOrganizationFundraisingMethodsQuery(0), null);
  assert.deepEqual(await listPublicOrganizationFundraisingMethods(0, "PUBLISHED", database, NOW), []);
});
