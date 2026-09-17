import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { OrganizationFundraisingAdminValidationError } from "../lib/organization-fundraising-admin.ts";
import {
  archiveOrganizationFundraisingMethodFromAdmin,
  createOrganizationFundraisingMethodFromAdmin,
  OrganizationFundraisingConcurrentEditError,
  OrganizationFundraisingLifecycleError,
  updateOrganizationFundraisingMethodFromAdmin,
} from "../lib/organization-fundraising-admin-write.ts";
import { listOrganizationFundraisingMethodsAdmin } from "../lib/organization-fundraising-admin-store.ts";

const migration = readFileSync(new URL("../drizzle/0041_organization_fundraising_methods.sql", import.meta.url), "utf8");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

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
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL,
    archived_at TEXT
  );`);
  sqlite.exec(migration);
  sqlite.exec(`INSERT INTO help_organizations (id, name, slug, status, archived_at) VALUES
    (1, 'Prvá organizácia', 'prva', 'PUBLISHED', NULL),
    (2, 'Druhá organizácia', 'druha', 'DRAFT', NULL),
    (3, 'Archivovaná organizácia', 'archivovana', 'ARCHIVED', '2026-09-01T00:00:00.000Z');`);
  return { sqlite, db: new SqliteD1Database(sqlite) };
}

const donationPayload = (overrides = {}) => ({
  type: "DONATION_PAGE",
  label: "Podporte nás",
  url: "https://example.com/donate",
  value: null,
  instructions: null,
  beneficiaryIdentity: "Prvá organizácia",
  ownership: "ORGANIZATION_OWNED",
  sortOrder: 0,
  isActive: false,
  ...overrides,
});

const bankPayload = (overrides = {}) => ({
  type: "BANK_TRANSFER",
  label: "Účet",
  url: null,
  value: "GB82 WEST 1234 5698 7654 32",
  instructions: null,
  beneficiaryIdentity: "Prvá organizácia",
  ownership: "ORGANIZATION_OWNED",
  sortOrder: 0,
  isActive: false,
  ...overrides,
});

test("create is explicitly fail-closed and ignores no trust defaults", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const item = await createOrganizationFundraisingMethodFromAdmin(1, donationPayload({ url: "https://EXAMPLE.com/donate" }), "ADMIN@EXAMPLE.COM", db, new Date("2026-09-17T20:30:00.000Z"));
    assert.ok(item);
    assert.equal(item.organizationId, 1);
    assert.equal(item.url, "https://example.com/donate");
    assert.equal(item.isActive, false);
    assert.equal(item.verificationStatus, "UNVERIFIED");
    assert.equal(item.version, 1);
    assert.equal(item.verifiedAt, null);
    assert.equal(item.verifiedBy, null);
    assert.equal(item.createdBy, "admin@example.com");
    assert.equal(item.updatedBy, "admin@example.com");
  } finally { sqlite.close(); }
});

test("create rejects client trust fields, activation, unsafe URL, invalid type and archived parent", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    await assert.rejects(() => createOrganizationFundraisingMethodFromAdmin(1, donationPayload({ verificationStatus: "VERIFIED" }), "admin@example.com", db), OrganizationFundraisingAdminValidationError);
    await assert.rejects(() => createOrganizationFundraisingMethodFromAdmin(1, donationPayload({ isActive: true }), "admin@example.com", db), /musí začať ako neaktívna/);
    await assert.rejects(() => createOrganizationFundraisingMethodFromAdmin(1, donationPayload({ url: "http://127.0.0.1/donate" }), "admin@example.com", db), /nebezpečná fundraising URL/);
    await assert.rejects(() => createOrganizationFundraisingMethodFromAdmin(1, donationPayload({ type: "OTHER" }), "admin@example.com", db), /Neplatný typ/);
    await assert.rejects(() => createOrganizationFundraisingMethodFromAdmin(3, donationPayload(), "admin@example.com", db), OrganizationFundraisingLifecycleError);
  } finally { sqlite.close(); }
});

test("methods stay isolated to their parent organization and order deterministically", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const later = await createOrganizationFundraisingMethodFromAdmin(1, donationPayload({ label: "Neskôr", sortOrder: 10 }), "admin@example.com", db);
    const first = await createOrganizationFundraisingMethodFromAdmin(1, bankPayload({ label: "Prvý", sortOrder: 0 }), "admin@example.com", db);
    assert.ok(later && first);
    const other = await createOrganizationFundraisingMethodFromAdmin(2, donationPayload({ label: "Iná organizácia" }), "admin@example.com", db);
    assert.ok(other);
    assert.equal(await updateOrganizationFundraisingMethodFromAdmin(2, first.id, bankPayload(), "admin@example.com", first.version, db), null);
    assert.deepEqual((await listOrganizationFundraisingMethodsAdmin(1, db)).map((item) => item.id), [first.id, later.id]);
  } finally { sqlite.close(); }
});

test("cosmetic edits preserve verification, normalized-equivalent destinations preserve trust, sensitive edits reset it", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    let item = await createOrganizationFundraisingMethodFromAdmin(1, bankPayload(), "admin@example.com", db);
    assert.ok(item);
    sqlite.prepare(`UPDATE organization_fundraising_methods SET verification_status='VERIFIED', verified_at=?, verified_by=?, verification_source_url=?, verification_expires_at=? WHERE id=?`).run(
      "2026-09-17T20:31:00.000Z", "verifier@example.com", "https://example.com/source", "2026-12-31T23:59:59.000Z", item.id,
    );
    item = (await listOrganizationFundraisingMethodsAdmin(1, db)).find((candidate) => candidate.id === item.id);
    assert.ok(item);

    const cosmetic = await updateOrganizationFundraisingMethodFromAdmin(1, item.id, bankPayload({ label: "Účet – upravený", sortOrder: 4, value: "GB82WEST12345698765432" }), "admin@example.com", item.version, db);
    assert.ok(cosmetic);
    assert.equal(cosmetic.verificationStatus, "VERIFIED");
    assert.equal(cosmetic.verifiedBy, "verifier@example.com");
    assert.equal(cosmetic.version, 2);

    const sensitive = await updateOrganizationFundraisingMethodFromAdmin(1, cosmetic.id, donationPayload({ label: cosmetic.label, sortOrder: cosmetic.sortOrder, isActive: true }), "admin@example.com", cosmetic.version, db);
    assert.ok(sensitive);
    assert.equal(sensitive.verificationStatus, "UNVERIFIED");
    assert.equal(sensitive.verifiedAt, null);
    assert.equal(sensitive.verifiedBy, null);
    assert.equal(sensitive.verificationSourceUrl, null);
    assert.equal(sensitive.verificationExpiresAt, null);
    assert.equal(sensitive.isActive, true, "active alone is not public eligibility without VERIFIED");
    assert.equal(sensitive.version, 3);
  } finally { sqlite.close(); }
});

test("OCC rejects stale version and archive is soft, versioned and deactivating", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const item = await createOrganizationFundraisingMethodFromAdmin(1, donationPayload(), "admin@example.com", db);
    assert.ok(item);
    const updated = await updateOrganizationFundraisingMethodFromAdmin(1, item.id, donationPayload({ label: "Nový názov", isActive: true }), "admin@example.com", item.version, db);
    assert.ok(updated);
    await assert.rejects(() => updateOrganizationFundraisingMethodFromAdmin(1, item.id, donationPayload(), "admin@example.com", item.version, db), OrganizationFundraisingConcurrentEditError);
    const archived = await archiveOrganizationFundraisingMethodFromAdmin(1, item.id, "admin@example.com", updated.version, db, new Date("2026-09-17T20:35:00.000Z"));
    assert.ok(archived);
    assert.equal(archived.isActive, false);
    assert.equal(archived.version, updated.version + 1);
    assert.equal(archived.archivedAt, "2026-09-17T20:35:00.000Z");
    await assert.rejects(() => updateOrganizationFundraisingMethodFromAdmin(1, item.id, donationPayload(), "admin@example.com", archived.version, db), OrganizationFundraisingLifecycleError);
  } finally { sqlite.close(); }
});

test("admin routes authorize before parsing mutations and do not expose a verification mutation", () => {
  const collection = read("../app/api/admin/organizations/[id]/fundraising/route.ts");
  const item = read("../app/api/admin/organizations/[id]/fundraising/[methodId]/route.ts");
  const editor = read("../components/admin-organization-fundraising.tsx");
  const detail = read("../app/admin/organizacie/[id]/page.tsx");
  const dashboard = read("../components/admin-organization-publication-dashboard.tsx");

  assert.ok(collection.indexOf("getAdminApiUser()") < collection.indexOf("request.json()"));
  assert.ok(item.indexOf("getAdminApiUser()") < item.indexOf("request.json()"));
  assert.match(item, /expectedVersion/);
  assert.match(item, /updateOrganizationFundraisingMethodFromAdmin/);
  assert.match(item, /archiveOrganizationFundraisingMethodFromAdmin/);
  assert.doesNotMatch(collection + item, /verificationStatus\s*[:=]\s*["']VERIFIED["']/);
  assert.doesNotMatch(editor, /verificationStatus:\s*["']VERIFIED["']/);
  assert.doesNotMatch(editor, /action:\s*["']verify["']/i);
  assert.match(editor, /readOnly/);
  assert.match(detail, /listOrganizationFundraisingMethodsAdmin/);
  assert.match(dashboard, /\/admin\/organizacie\/\$\{item\.id\}/);
});
