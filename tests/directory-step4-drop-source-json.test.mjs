import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const source = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const dropSql = source("db/isolated/directory_step4_drop_source_data_json.sql");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY, slug TEXT NOT NULL, status TEXT NOT NULL,
    source_data_json TEXT NOT NULL DEFAULT '{}'
  );
  INSERT INTO directory_profiles (id,slug,status,source_data_json)
    VALUES (1,'sql-only-fixture','published','{"retired":"yes"}');`);
  return db;
}

test("step 4 physically drops only directory source_data_json and keeps existing canonical rows", () => {
  const db = fixture();
  try {
    db.exec(dropSql);
    const cols = db.prepare("PRAGMA table_info(directory_profiles)").all().map(x => x.name);
    assert.deepEqual(cols, ["id", "slug", "status"]);
    assert.deepEqual(db.prepare("SELECT id,slug,status FROM directory_profiles").all(), [
      { id: 1, slug: "sql-only-fixture", status: "published" },
    ]);
    db.prepare("INSERT INTO directory_profiles (slug,status) VALUES (?,?)").run("new-sql-only","draft");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n, 2);
  } finally { db.close(); }
});

test("step 4 fails closed on an active schema trigger depending on the old column", () => {
  const db = fixture();
  try {
    db.exec(`CREATE TRIGGER directory_legacy_guard
      AFTER UPDATE ON directory_profiles
      WHEN NEW.source_data_json IS NOT OLD.source_data_json
      BEGIN SELECT RAISE(ABORT, 'LEGACY_GUARD'); END;`);
    assert.throws(() => db.exec(dropSql), /source_data_json|trigger|error in schema/i);
    assert.ok(db.prepare("PRAGMA table_info(directory_profiles)").all().some(c => c.name === "source_data_json"));
  } finally { db.close(); }
});

test("step 4 code no longer inserts directory source_data_json or declares it in the live schema", () => {
  const schema = source("db/schema.ts");
  const store = source("lib/directory-store.ts");
  const draft = source("lib/canonical-draft-service.ts");
  const importer = source("app/api/admin/import/route.ts");
  assert.doesNotMatch(schema, /sourceDataJson:\s*text\("source_data_json"\)/);
  const create = store.slice(store.indexOf("export function buildManagedDirectoryProfileCreateStatement("),
    store.indexOf("export async function getPublishedDirectoryProfiles("));
  assert.doesNotMatch(create, /source_data_json/);
  const draftDirectory = draft.slice(draft.indexOf('if (input.entityType === "DIRECTORY")'),
    draft.indexOf('if (input.entityType === "ADOPTION")'));
  assert.doesNotMatch(draftDirectory, /source_data_json/);
  const importDirectory = importer.slice(importer.indexOf("for (const [index, row] of profiles.entries())"),
    importer.indexOf("for (const [index, row] of events.entries())"));
  assert.doesNotMatch(importDirectory, /INSERT INTO directory_profiles[\\s\\S]*?source_data_json/);
});
