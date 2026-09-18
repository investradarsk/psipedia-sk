import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  archiveOrganizationFundraisingMethodFromAdmin,
  createOrganizationFundraisingMethodFromAdmin,
  OrganizationFundraisingConcurrentEditError,
  OrganizationFundraisingLifecycleError,
  updateOrganizationFundraisingMethodFromAdmin,
} from "../lib/organization-fundraising-admin-write.ts";
import {
  changeOrganizationFundraisingVerificationFromAdmin,
  normalizeOrganizationFundraisingVerificationCommand,
  OrganizationFundraisingVerificationTransitionError,
  OrganizationFundraisingVerificationValidationError,
} from "../lib/organization-fundraising-verification.ts";

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
    (1, 'Testovacia organizácia A', 'test-a', 'PUBLISHED', NULL),
    (2, 'Testovacia organizácia B', 'test-b', 'DRAFT', NULL),
    (3, 'Archivovaná organizácia', 'archivovana', 'ARCHIVED', '2026-09-01T00:00:00.000Z');`);
  return { sqlite, db: new SqliteD1Database(sqlite) };
}

const donationPayload = (overrides = {}) => ({
  type: "DONATION_PAGE",
  label: "Podporte nás",
  url: "https://example.com/donate",
  value: null,
  instructions: "Syntetické testovacie inštrukcie",
  beneficiaryIdentity: "Testovacia organizácia A",
  ownership: "ORGANIZATION_OWNED",
  sortOrder: 1,
  isActive: false,
  ...overrides,
});

function command(action, expectedVersion, overrides = {}) {
  return normalizeOrganizationFundraisingVerificationCommand({
    action,
    expectedVersion,
    ...overrides,
  });
}

test("verification command uses the exact action surface and validates metadata without external checks", () => {
  const normalized = command("verify", 3, {
    verificationSourceUrl: " https://EXAMPLE.com/editorial/source ",
    verificationExpiresAt: "2030-01-02T03:04:05Z",
  });
  assert.deepEqual(normalized, {
    action: "verify",
    expectedVersion: 3,
    verificationSourceUrl: "https://example.com/editorial/source",
    verificationExpiresAt: "2030-01-02T03:04:05.000Z",
  });
  assert.throws(() => command("approve", 1), OrganizationFundraisingVerificationValidationError);
  assert.throws(() => command("verify", 1, { verificationSourceUrl: "http://127.0.0.1/private" }), OrganizationFundraisingVerificationValidationError);
  assert.throws(() => command("reject", 1, { verificationSourceUrl: "https://example.com/source" }), OrganizationFundraisingVerificationValidationError);
  assert.throws(() => command("verify", 0), OrganizationFundraisingConcurrentEditError);
});

test("explicit verify updates trust metadata, version and audit fields while preserving fundraising-sensitive values", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const created = await createOrganizationFundraisingMethodFromAdmin(1, donationPayload({ isActive: false }), "creator@example.com", db);
    assert.ok(created);
    sqlite.prepare("UPDATE organization_fundraising_methods SET valid_until = ? WHERE id = ?").run("2031-12-31T23:59:59.000Z", created.id);
    const before = sqlite.prepare(`SELECT type, url, value, instructions, beneficiary_identity, ownership, is_active, valid_until
      FROM organization_fundraising_methods WHERE id = ?`).get(created.id);

    const verified = await changeOrganizationFundraisingVerificationFromAdmin(
      1,
      created.id,
      command("verify", created.version, {
        verificationSourceUrl: "https://EXAMPLE.com/editorial/source",
        verificationExpiresAt: "2030-12-31T23:59:59Z",
      }),
      "VERIFIER@EXAMPLE.COM",
      db,
      new Date("2026-09-17T21:30:00.000Z"),
    );
    assert.ok(verified);
    assert.equal(verified.verificationStatus, "VERIFIED");
    assert.equal(verified.verifiedAt, "2026-09-17T21:30:00.000Z");
    assert.equal(verified.verifiedBy, "verifier@example.com");
    assert.equal(verified.verificationSourceUrl, "https://example.com/editorial/source");
    assert.equal(verified.verificationExpiresAt, "2030-12-31T23:59:59.000Z");
    assert.equal(verified.validUntil, "2031-12-31T23:59:59.000Z");
    assert.equal(verified.version, created.version + 1);
    assert.equal(verified.updatedBy, "verifier@example.com");

    const after = sqlite.prepare(`SELECT type, url, value, instructions, beneficiary_identity, ownership, is_active, valid_until
      FROM organization_fundraising_methods WHERE id = ?`).get(created.id);
    assert.deepEqual({ ...after }, { ...before }, "verification must not rewrite sensitive fundraising destination data");
  } finally { sqlite.close(); }
});

test("contract transitions support stale, reject and unverify while rejecting REJECTED to VERIFIED", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    let item = await createOrganizationFundraisingMethodFromAdmin(1, donationPayload(), "creator@example.com", db);
    assert.ok(item);
    item = await changeOrganizationFundraisingVerificationFromAdmin(
      1, item.id, command("verify", item.version, { verificationSourceUrl: "https://example.com/source" }),
      "verifier@example.com", db, new Date("2026-09-17T21:31:00.000Z"),
    );
    assert.ok(item);
    const provenance = { verifiedAt: item.verifiedAt, verifiedBy: item.verifiedBy, source: item.verificationSourceUrl };

    item = await changeOrganizationFundraisingVerificationFromAdmin(
      1, item.id, command("mark-stale", item.version), "editor@example.com", db,
      new Date("2026-09-17T21:32:00.000Z"),
    );
    assert.ok(item);
    assert.equal(item.verificationStatus, "STALE");
    assert.deepEqual(
      { verifiedAt: item.verifiedAt, verifiedBy: item.verifiedBy, source: item.verificationSourceUrl },
      provenance,
      "STALE keeps the provenance of the prior verification",
    );

    item = await changeOrganizationFundraisingVerificationFromAdmin(
      1, item.id, command("verify", item.version), "verifier2@example.com", db,
      new Date("2026-09-17T21:33:00.000Z"),
    );
    assert.ok(item);
    item = await changeOrganizationFundraisingVerificationFromAdmin(
      1, item.id, command("reject", item.version), "reviewer@example.com", db,
      new Date("2026-09-17T21:34:00.000Z"),
    );
    assert.ok(item);
    assert.equal(item.verificationStatus, "REJECTED");
    assert.equal(item.verifiedAt, null);
    assert.equal(item.verifiedBy, null);
    assert.equal(item.verificationSourceUrl, null);
    assert.equal(item.verificationExpiresAt, null);

    await assert.rejects(
      () => changeOrganizationFundraisingVerificationFromAdmin(
        1, item.id, command("verify", item.version), "reviewer@example.com", db,
      ),
      OrganizationFundraisingVerificationTransitionError,
    );

    item = await changeOrganizationFundraisingVerificationFromAdmin(
      1, item.id, command("unverify", item.version), "reviewer@example.com", db,
    );
    assert.ok(item);
    assert.equal(item.verificationStatus, "UNVERIFIED");
    item = await changeOrganizationFundraisingVerificationFromAdmin(
      1, item.id, command("verify", item.version), "verifier@example.com", db,
    );
    assert.ok(item);
    assert.equal(item.verificationStatus, "VERIFIED");
  } finally { sqlite.close(); }
});

test("verification enforces OCC, organization isolation and missing-record handling", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const item = await createOrganizationFundraisingMethodFromAdmin(1, donationPayload(), "creator@example.com", db);
    assert.ok(item);
    const verified = await changeOrganizationFundraisingVerificationFromAdmin(
      1, item.id, command("verify", item.version), "verifier@example.com", db,
    );
    assert.ok(verified);

    await assert.rejects(
      () => changeOrganizationFundraisingVerificationFromAdmin(
        1, item.id, command("unverify", item.version), "verifier@example.com", db,
      ),
      OrganizationFundraisingConcurrentEditError,
    );
    assert.equal(
      await changeOrganizationFundraisingVerificationFromAdmin(
        2, item.id, command("unverify", verified.version), "verifier@example.com", db,
      ),
      null,
    );
    assert.equal(
      await changeOrganizationFundraisingVerificationFromAdmin(
        1, 999999, command("verify", 1), "verifier@example.com", db,
      ),
      null,
    );
    assert.equal(
      await changeOrganizationFundraisingVerificationFromAdmin(
        999999, item.id, command("unverify", verified.version), "verifier@example.com", db,
      ),
      null,
    );
  } finally { sqlite.close(); }
});

test("archived parent and archived fundraising method cannot be verified", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    const item = await createOrganizationFundraisingMethodFromAdmin(1, donationPayload(), "creator@example.com", db);
    assert.ok(item);
    const archivedMethod = await archiveOrganizationFundraisingMethodFromAdmin(
      1, item.id, "editor@example.com", item.version, db,
    );
    assert.ok(archivedMethod);
    await assert.rejects(
      () => changeOrganizationFundraisingVerificationFromAdmin(
        1, item.id, command("verify", archivedMethod.version), "verifier@example.com", db,
      ),
      OrganizationFundraisingLifecycleError,
    );

    sqlite.prepare(`INSERT INTO organization_fundraising_methods (
      organization_id, type, label, url, ownership, is_active, verification_status, version,
      created_at, updated_at, created_by, updated_by
    ) VALUES (3, 'DONATION_PAGE', 'Archived parent fixture', 'https://example.com/donate', 'ORGANIZATION_OWNED', 0, 'UNVERIFIED', 1,
      '2026-09-17T21:00:00.000Z', '2026-09-17T21:00:00.000Z', 'fixture', 'fixture')`).run();
    const archivedParentMethodId = Number(sqlite.prepare("SELECT last_insert_rowid() AS id").get().id);
    await assert.rejects(
      () => changeOrganizationFundraisingVerificationFromAdmin(
        3, archivedParentMethodId, command("verify", 1), "verifier@example.com", db,
      ),
      OrganizationFundraisingLifecycleError,
    );
  } finally { sqlite.close(); }
});

test("ordinary Save cannot escalate verification and sensitive edits still invalidate verified trust", async () => {
  const { sqlite, db } = makeDatabase();
  try {
    let item = await createOrganizationFundraisingMethodFromAdmin(1, donationPayload(), "creator@example.com", db);
    assert.ok(item);
    item = await changeOrganizationFundraisingVerificationFromAdmin(
      1, item.id, command("verify", item.version, {
        verificationSourceUrl: "https://example.com/source",
        verificationExpiresAt: "2030-01-01T00:00:00Z",
      }),
      "verifier@example.com", db,
    );
    assert.ok(item);

    const cosmetic = await updateOrganizationFundraisingMethodFromAdmin(
      1,
      item.id,
      donationPayload({ label: "Kozmetická zmena", sortOrder: 9 }),
      "editor@example.com",
      item.version,
      db,
    );
    assert.ok(cosmetic);
    assert.equal(cosmetic.verificationStatus, "VERIFIED");
    assert.equal(cosmetic.verifiedBy, "verifier@example.com");

    const sensitive = await updateOrganizationFundraisingMethodFromAdmin(
      1,
      item.id,
      donationPayload({ label: cosmetic.label, sortOrder: cosmetic.sortOrder, url: "https://example.com/donate-changed" }),
      "editor@example.com",
      cosmetic.version,
      db,
    );
    assert.ok(sensitive);
    assert.equal(sensitive.verificationStatus, "UNVERIFIED");
    assert.equal(sensitive.verifiedAt, null);
    assert.equal(sensitive.verifiedBy, null);
    assert.equal(sensitive.verificationSourceUrl, null);
    assert.equal(sensitive.verificationExpiresAt, null);
  } finally { sqlite.close(); }
});

test("verification route keeps auth and browser-CSRF boundaries ahead of mutation parsing", () => {
  const route = read("../app/api/admin/organizations/[id]/fundraising/[methodId]/verification/route.ts");
  const ordinaryItemRoute = read("../app/api/admin/organizations/[id]/fundraising/[methodId]/route.ts");
  const editor = read("../components/admin-organization-fundraising.tsx");

  assert.match(route, /export async function PUT/);
  assert.doesNotMatch(route, /export async function (?:GET|POST|DELETE)/);
  assert.ok(route.indexOf("getAdminApiUser()") < route.indexOf("request.json()"));
  assert.ok(route.indexOf('content-type') < route.indexOf("request.json()"));
  assert.match(route, /application\/json/);
  assert.match(read("../lib/organization-fundraising-verification.ts"), /expectedVersion/);
  assert.doesNotMatch(route, /searchParams|request\.url/);
  assert.doesNotMatch(route, /console\.error\([^\n]*(?:body|verificationSourceUrl|beneficiary|value|url)/i);
  assert.doesNotMatch(ordinaryItemRoute, /changeOrganizationFundraisingVerificationFromAdmin|verification_status\s*=\s*'VERIFIED'/);
  assert.match(editor, /\/verification/);
  assert.match(editor, /window\.confirm/);
  assert.match(editor, /Verification stav[\s\S]*readOnly/);
  assert.match(editor, /Overil[\s\S]*readOnly/);
});
