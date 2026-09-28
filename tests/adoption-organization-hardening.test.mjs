import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const foundation = read("../drizzle/0034_adoption_dogs_foundation.sql");
const hardening = read("../drizzle/0042_adoption_organization_relation_hardening.sql");

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY);");
  db.exec("CREATE TABLE help_organizations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL);");
  db.exec(foundation);
  return db;
}

function adoptionRows(db) {
  return db.prepare(`
    SELECT id, organization_id, organization_name, organization_slug
    FROM adoption_dogs
    ORDER BY id
  `).all().map((row) => ({
    id: Number(row.id),
    organizationId: row.organization_id === null ? null : Number(row.organization_id),
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
  }));
}

function insertFixture(db, { id, slug, organizationId, organizationName, organizationSlug }) {
  db.prepare(`
    INSERT INTO adoption_dogs (
      id, name, slug, status, organization_id, organization_name, organization_slug,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, '2026-09-17T00:00:00.000Z', '2026-09-17T00:00:00.000Z', 'test', 'test')
  `).run(id, `Dog ${id}`, slug, organizationId, organizationName, organizationSlug);
}

test("0042 preserves adoption rows, ids and compatibility snapshots while adding the canonical FK", () => {
  const db = database();
  db.exec("INSERT INTO help_organizations (id, name, slug) VALUES (7, 'Canonical OZ', 'canonical-oz');");
  insertFixture(db, { id: 11, slug: "linked", organizationId: 7, organizationName: "Historical Name", organizationSlug: "historical-slug" });
  insertFixture(db, { id: 12, slug: "nullable-draft", organizationId: null, organizationName: "Legacy Contact", organizationSlug: null });

  const before = adoptionRows(db);
  db.exec(hardening);
  const after = adoptionRows(db);

  assert.deepEqual(after, before, "table rebuild must preserve row count, ids, organization ids and snapshot values exactly");
  const relation = db.prepare("PRAGMA foreign_key_list(adoption_dogs)").all()
    .find((row) => row.from === "organization_id");
  assert.ok(relation, "organization_id FK must exist after 0042");
  assert.equal(relation.table, "help_organizations");
  assert.equal(relation.to, "id");
  assert.equal(relation.on_delete, "RESTRICT");

  assert.throws(
    () => insertFixture(db, { id: 13, slug: "orphan", organizationId: 999, organizationName: "Fake", organizationSlug: "fake" }),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(() => db.exec("DELETE FROM help_organizations WHERE id = 7;"), /FOREIGN KEY constraint failed/);
});

test("0042 refuses to copy a pre-existing orphan instead of repairing or silently detaching it", () => {
  const db = database();
  insertFixture(db, { id: 21, slug: "preexisting-orphan", organizationId: 999, organizationName: "Orphan", organizationSlug: "orphan" });
  assert.throws(() => db.exec(hardening), /FOREIGN KEY constraint failed/);
});
