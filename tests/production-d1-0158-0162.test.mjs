import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  COMPLETION_0158_SQL, COMPLETION_0162_SQL,
  COMPLETION_0158_BLOB, COMPLETION_0162_BLOB,
  DIRECTORY_0158_INDEX_SQL, DIRECTORY_0158_INDEX_NAMES,
  normalizedDdl, classify0158, classify0162, assert0159to0161,
} from "../lib/production-d1-0158-0162-guard.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql0158 = read("drizzle/" + COMPLETION_0158_SQL);
const sql0162 = read("drizzle/" + COMPLETION_0162_SQL);
const script = read("scripts/production-d1-0158-0162.mjs");
const workflow = read(".github/workflows/production-d1-0158-0162.yml");
const mainMigrator = read("scripts/production-d1-migrate.mjs");

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, updated_at TEXT NOT NULL, category TEXT NOT NULL,
      status TEXT NOT NULL, name TEXT NOT NULL, city TEXT NOT NULL
    );
    CREATE TABLE lost_found_dog_reports (
      id INTEGER PRIMARY KEY, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL
    );
    CREATE TABLE managed_events (
      id INTEGER PRIMARY KEY,
      contact_phone TEXT, contact_email TEXT,
      admission_fee TEXT NOT NULL DEFAULT '',
      image_alt TEXT NOT NULL DEFAULT '',
      internal_notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE breed_notion_workcopy_links (breed_id INTEGER PRIMARY KEY);
    CREATE INDEX idx_breed_notion_workcopy_status ON breed_notion_workcopy_links(breed_id);
    INSERT INTO directory_profiles VALUES (4,'2026-11-10','veterinari','published','Veterinár Z','Nitra');
    INSERT INTO directory_profiles VALUES (8,'2026-11-09','salony-a-sluzby','draft','Salón A','Zvolen');
    INSERT INTO lost_found_dog_reports VALUES (7,'Podrobný pôvodný popis','ACTIVE');
    INSERT INTO lost_found_dog_reports VALUES (9,'Druhý pôvodný popis','RESOLVED');
  `);
  return db;
}
function inspect0158(db) {
  const indexes = db.prepare("SELECT name,type,tbl_name,sql FROM sqlite_master WHERE type='index'").all()
    .filter((index) => DIRECTORY_0158_INDEX_NAMES.includes(index.name));
  return {
    tablePresent: true, columns: db.prepare("PRAGMA table_info('directory_profiles')").all(),
    indexes, count: db.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n,
  };
}
function inspect0162(db) {
  return {
    tablePresent: true, columns: db.prepare("PRAGMA table_info('lost_found_dog_reports')").all(),
    count: db.prepare("SELECT COUNT(*) AS n FROM lost_found_dog_reports").get().n,
  };
}
function schemaDependencies(db) {
  return {
    shadowTable: db.prepare("SELECT name,type FROM sqlite_master WHERE name='breed_notion_workcopy_links'").get(),
    shadowIndex: db.prepare("SELECT name,type,tbl_name FROM sqlite_master WHERE name='idx_breed_notion_workcopy_status'").get(),
    eventColumns: db.prepare("PRAGMA table_info('managed_events')").all(),
  };
}
function blobSha(text) {
  const bytes = Buffer.from(text);
  return createHash("sha1").update(Buffer.concat([
    Buffer.from("blob " + bytes.length + "\0"), bytes,
  ])).digest("hex");
}
function executable(sql) {
  return sql.replace(/--[^\n]*/g, "").split(";").map(normalizedDdl).filter(Boolean);
}

test("0158 and 0162 use pinned additive SQL without data modifications", () => {
  assert.equal(blobSha(sql0158), COMPLETION_0158_BLOB);
  assert.equal(blobSha(sql0162), COMPLETION_0162_BLOB);
  assert.deepEqual(executable(sql0158), DIRECTORY_0158_INDEX_SQL);
  assert.deepEqual(executable(sql0162), [
    "ALTER TABLE lost_found_dog_reports ADD COLUMN short_description TEXT NOT NULL DEFAULT ''",
  ]);
  for (const sql of [sql0158, sql0162])
    assert.doesNotMatch(executable(sql).join(";"), /\b(DROP|UPDATE|DELETE|INSERT|REPLACE|TRUNCATE)\b/i);
});

test("0158 adds all five exact indexes, preserves existing profiles", () => {
  const db = setup();
  try {
    const baseline = db.prepare("SELECT * FROM directory_profiles ORDER BY id").all();
    assert.equal(classify0158(inspect0158(db)).installed, false);
    db.exec(sql0158);
    assert.deepEqual(classify0158(inspect0158(db)), {
      installed: true, count: 2, presentIndexes: [...DIRECTORY_0158_INDEX_NAMES], missingIndexes: [],
    });
    assert.deepEqual(db.prepare("SELECT * FROM directory_profiles ORDER BY id").all(), baseline);
    for (const name of DIRECTORY_0158_INDEX_NAMES)
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name=? AND type='index'").get(name).n, 1);
  } finally { db.close(); }
});

test("0158 completes compatible partial installations and rejects incompatible index reuse", () => {
  const db = setup();
  try {
    db.exec(executable(sql0158)[0]);
    const partial = classify0158(inspect0158(db));
    assert.equal(partial.installed, false);
    assert.deepEqual(partial.presentIndexes, [DIRECTORY_0158_INDEX_NAMES[0]]);
    assert.deepEqual(partial.missingIndexes, DIRECTORY_0158_INDEX_NAMES.slice(1));
    db.exec(sql0158);
    assert.equal(classify0158(inspect0158(db)).installed, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n, 2);
  } finally { db.close(); }
  const other = setup();
  try {
    for (let i = 0; i < DIRECTORY_0158_INDEX_NAMES.length; i += 1) {
      const sql = i === 3
        ? "CREATE INDEX " + DIRECTORY_0158_INDEX_NAMES[i] + " ON directory_profiles(name)"
        : DIRECTORY_0158_INDEX_SQL[i];
      other.exec(sql);
    }
    assert.throws(() => classify0158(inspect0158(other)), /INDEX_MISMATCH/);
  } finally { other.close(); }
});

test("0162 adds a default-empty short description without altering original descriptions", () => {
  const db = setup();
  try {
    const original = db.prepare("SELECT id,description,status FROM lost_found_dog_reports ORDER BY id").all().map((row) => ({ ...row }));
    assert.equal(classify0162(inspect0162(db)).installed, false);
    db.exec(sql0162);
    assert.equal(classify0162(inspect0162(db)).installed, true);
    const rows = db.prepare("SELECT * FROM lost_found_dog_reports ORDER BY id").all();
    assert.deepEqual(rows.map(({id,description,status}) => ({id,description,status})), original);
    assert.deepEqual(rows.map((row) => row.short_description), ["", ""]);
    db.prepare("UPDATE lost_found_dog_reports SET short_description = ? WHERE id = ?").run("Krátky popis", 7);
    assert.equal(db.prepare("SELECT short_description FROM lost_found_dog_reports WHERE id=7").get().short_description, "Krátky popis");
    assert.equal(db.prepare("SELECT description FROM lost_found_dog_reports WHERE id=7").get().description, "Podrobný pôvodný popis");
    db.prepare("UPDATE lost_found_dog_reports SET short_description = '' WHERE id=7").run();
    assert.equal(db.prepare("SELECT short_description FROM lost_found_dog_reports WHERE id=7").get().short_description, "");
  } finally { db.close(); }
});

test("0162 refuses a present but incompatible or nullable short description", () => {
  const db = setup();
  try {
    db.exec("ALTER TABLE lost_found_dog_reports ADD COLUMN short_description TEXT");
    assert.throws(() => classify0162(inspect0162(db)), /COLUMN_INCOMPATIBLE/);
  } finally { db.close(); }
});

test("already-installed 0159–0161 prerequisite schemas must remain intact", () => {
  const db = setup();
  try {
    assert.deepEqual(assert0159to0161(schemaDependencies(db)),
      { applied0159: true, applied0160: true, applied0161: true });
    db.exec("DROP INDEX idx_breed_notion_workcopy_status");
    assert.throws(() => assert0159to0161(schemaDependencies(db)), /0159_SHADOW_INDEX_MISSING/);
  } finally { db.close(); }
});

test("production workflow requires manual main dispatch, protected credentials and recovery", () => {
  assert.match(workflow, /\bon:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+(?:push|pull_request|schedule):/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /Require current main revision/);
  assert.match(workflow, /APPLY-0158-0162-psipedia-sk-db/);
  assert.match(workflow, /AUDIT-0158-0162-psipedia-sk-db/);
  assert.match(script, /D1_COMPLETION_MANUAL_ONLY/);
  assert.match(script, /D1_COMPLETION_TOKEN_MISSING/);
  assert.match(script, /D1_COMPLETION_RECOVERY_BOOKMARK_MISSING/);
  assert.match(script, /report\("RECOVERY_POINT"/);
  assert.match(script, /"--remote"/);
  assert.match(script, /verifySql\(\)/);
  assert.match(script, /assert0159to0161/);
  assert.doesNotMatch(script, /\b(?:INSERT|REPLACE|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?d1_migrations\b/i);
  assert.match(mainMigrator, /UNACTIVATED_PRODUCTION_TARGETS/);
  assert.doesNotMatch(mainMigrator.slice(mainMigrator.indexOf("export const SUPPORTED_PRODUCTION_TARGETS"),
    mainMigrator.indexOf("export const DYNAMIC_ENTITY_IDENTITY_INDEXES")), /"0158_admin_directory_list_indexes.sql"|"0162_lost_found_short_description.sql"/);
});
