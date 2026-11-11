import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  CONTACTS_0165_TARGET, CONTACTS_0165_GIT_BLOB_SHA, CONTACTS_0165_COLUMNS,
  CONTACTS_0165_SQL, assertContacts0165Schema, assertContacts0165Postflight,
} from "../lib/production-d1-0165-contacts-guard.mjs";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const ddl = read("drizzle/" + CONTACTS_0165_TARGET);
const workflow = read(".github/workflows/production-d1-0165-contacts.yml");
const runner = read("scripts/production-d1-0165-contacts.mjs");
const migrator = read("scripts/production-d1-migrate.mjs");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec([
    "CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY, slug TEXT NOT NULL, status TEXT NOT NULL, public_contact_note TEXT NOT NULL DEFAULT '');",
    "CREATE TABLE lost_found_dog_private_details (report_id INTEGER PRIMARY KEY, contact_phone_encrypted TEXT, contact_email_encrypted TEXT);",
    "CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
    "INSERT INTO d1_migrations VALUES (157, '0157_facebook_weekly_plan_marks.sql');",
    "INSERT INTO lost_found_dog_reports VALUES (1,'found-dog','ACTIVE','Verejná poznámka');",
    "INSERT INTO lost_found_dog_reports VALUES (2,'lost-dog','ACTIVE','');",
    "INSERT INTO lost_found_dog_private_details VALUES (1,'encrypted-phone-A','encrypted-email-A');",
    "INSERT INTO lost_found_dog_private_details VALUES (2,'encrypted-phone-B','encrypted-email-B');",
  ].join("\n"));
  return db;
}
function inspect(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name));
  const info = table => db.prepare("SELECT name,type,pk,\"notnull\" AS is_not_null,dflt_value FROM pragma_table_info('" + table + "')")
    .all().map(({is_not_null,...record}) => ({...record,notnull:is_not_null}));
  return {
    tablePresent: tables.has("lost_found_dog_reports"),
    privateTablePresent: tables.has("lost_found_dog_private_details"),
    columns: info("lost_found_dog_reports"),
    privateColumns: info("lost_found_dog_private_details"),
    rowCount: db.prepare("SELECT COUNT(*) AS n FROM lost_found_dog_reports").get().n,
    privateCount: db.prepare("SELECT COUNT(*) AS n FROM lost_found_dog_private_details").get().n,
    ledgerCount: db.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n,
  };
}

test("0165 has exact pinned five-column additive SQL", () => {
  const bytes = Buffer.from(ddl);
  const sha = createHash("sha1")
    .update(Buffer.concat([Buffer.from("blob " + bytes.length + "\0"), bytes])).digest("hex");
  assert.equal(sha, CONTACTS_0165_GIT_BLOB_SHA);
  const lines = ddl.split("\n").map(x => x.trim()).filter(x => x && !x.startsWith("--"));
  assert.deepEqual(lines, CONTACTS_0165_SQL);
  assert.equal(lines.length, 5);
  assert.deepEqual(CONTACTS_0165_COLUMNS, [
    "public_phone", "public_email", "public_website_url", "public_facebook_url", "public_instagram_url",
  ]);
  assert.doesNotMatch(lines.join(" "), /\b(?:INSERT|UPDATE|DELETE|DROP|REPLACE|CREATE)\b/i);
});

test("0165 adds five empty public fields without touching existing data, private contacts or ledger", () => {
  const db = fixture();
  try {
    const original = db.prepare("SELECT id,slug,status,public_contact_note FROM lost_found_dog_reports ORDER BY id")
      .all().map(row => ({ ...row }));
    const privateRows = db.prepare("SELECT report_id,contact_phone_encrypted,contact_email_encrypted FROM lost_found_dog_private_details ORDER BY report_id")
      .all().map(row => ({ ...row }));
    const before = assertContacts0165Schema(inspect(db));
    assert.equal(before.installed, false);
    assert.equal(before.readyToApply, true);
    db.exec(ddl);
    const after = assertContacts0165Postflight(before, inspect(db));
    assert.equal(after.installed, true);
    assert.equal(after.rowCount, 2);
    assert.equal(after.privateCount, 2);
    assert.equal(after.ledgerCount, 1);
    assert.deepEqual(db.prepare("SELECT id,slug,status,public_contact_note FROM lost_found_dog_reports ORDER BY id").all().map(row => ({ ...row })),original);
    assert.deepEqual(db.prepare("SELECT report_id,contact_phone_encrypted,contact_email_encrypted FROM lost_found_dog_private_details ORDER BY report_id").all().map(row => ({ ...row })),privateRows);
    assert.deepEqual(db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map(x => x.name),["0157_facebook_weekly_plan_marks.sql"]);
    for (const row of db.prepare("SELECT * FROM lost_found_dog_reports ORDER BY id").all())
      for (const name of CONTACTS_0165_COLUMNS) assert.equal(row[name], "", name);
    assert.equal(assertContacts0165Schema(inspect(db)).installed, true);
  } finally { db.close(); }
});

test("0165 fails closed on partially applied or incompatible columns", () => {
  const db = fixture();
  try {
    db.exec(CONTACTS_0165_SQL[0]);
    assert.throws(() => assertContacts0165Schema(inspect(db)), /CONTACTS_0165_PARTIAL_SCHEMA_REFUSED/);
    for (const statement of CONTACTS_0165_SQL.slice(1,4)) db.exec(statement);
    assert.throws(() => assertContacts0165Schema(inspect(db)), /CONTACTS_0165_PARTIAL_SCHEMA_REFUSED/);
  } finally { db.close(); }
  const invalid = fixture();
  try {
    invalid.exec("ALTER TABLE lost_found_dog_reports ADD COLUMN public_phone TEXT");
    for (const statement of CONTACTS_0165_SQL.slice(1)) invalid.exec(statement);
    assert.throws(() => assertContacts0165Schema(inspect(invalid)), /CONTACTS_0165_INCOMPATIBLE_COLUMN_public_phone/);
  } finally { invalid.close(); }
});

test("0165 rejects missing source and private structures, impossible counts and changed postflight", () => {
  const db = fixture();
  try {
    const state = inspect(db);
    assert.throws(() => assertContacts0165Schema({ ...state,tablePresent:false }), /SOURCE_TABLE_MISSING/);
    assert.throws(() => assertContacts0165Schema({ ...state,privateTablePresent:false }), /PRIVATE_TABLE_MISSING/);
    assert.throws(() => assertContacts0165Schema({ ...state,columns:[] }), /SOURCE_FIELD_MISSING/);
    assert.throws(() => assertContacts0165Schema({ ...state,privateColumns:[] }), /PRIVATE_FIELD_MISSING/);
    assert.throws(() => assertContacts0165Schema({ ...state,rowCount:NaN }), /ROW_COUNT_INVALID/);
    assert.throws(() => assertContacts0165Schema({ ...state,privateCount:-1 }), /PRIVATE_ROW_COUNT_INVALID/);
    assert.throws(() => assertContacts0165Schema({ ...state,ledgerCount:-1 }), /LEDGER_COUNT_INVALID/);
    const before = assertContacts0165Schema(state);
    assert.throws(() => assertContacts0165Postflight(before,state), /POSTFLIGHT_COLUMNS_MISSING/);
    db.exec(ddl);
    const after = inspect(db);
    assert.throws(() => assertContacts0165Postflight(before,{...after,rowCount:3}), /POSTFLIGHT_ROW_COUNT_CHANGED/);
    assert.throws(() => assertContacts0165Postflight(before,{...after,privateCount:1}), /POSTFLIGHT_PRIVATE_COUNT_CHANGED/);
    assert.throws(() => assertContacts0165Postflight(before,{...after,ledgerCount:2}), /POSTFLIGHT_LEDGER_CHANGED/);
  } finally { db.close(); }
});

test("0165 workflow is manual-only, audited by default, production-protected and isolated", () => {
  assert.match(workflow, /on:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule):/m);
  assert.match(workflow, /default: audit/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /Refuse stale main/);
  assert.match(workflow, /AUDIT-0165-psipedia-sk-db/);
  assert.match(workflow, /APPLY-0165-psipedia-sk-db/);
  assert.match(workflow, /CLOUDFLARE_D1_API_TOKEN/);
  assert.match(runner, /CONTACTS_0165_GIT_BLOB_SHA/);
  assert.match(runner, /RECOVERY_BOOKMARK_MISSING/);
  assert.match(runner, /evidence\("RECOVERY_POINT"/);
  assert.match(runner, /assertContacts0165Postflight/);
  assert.match(runner, /"--file", sqlPath, "--yes", "--json"/);
  assert.match(runner, /"--remote"/);
  assert.match(runner, /"MAIN_ONLY"/);
  assert.match(runner, /"EXPLICIT_CONFIRMATION_REQUIRED"/);
  assert.match(runner, /migrationHistoryRecorded: false/);
  assert.doesNotMatch(runner, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\s+(?:INTO\s+|FROM\s+)?d1_migrations\b/i);
  assert.match(migrator, /UNACTIVATED_PRODUCTION_TARGETS/);
  assert.match(migrator, /"0165_lost_found_public_contacts\.sql"/);
});
