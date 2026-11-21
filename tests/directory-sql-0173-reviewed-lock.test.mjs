import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { directory0173ReviewCasGuardStatement } from "../lib/directory-0173-review-state-sql.ts";
import { partnerDirectoryReviewLockStatement } from "../lib/partner-directory-review-sql.ts";
import { directoryReviewLockedFromProjection } from "../lib/directory-reviewed-sync-lock.ts";

const load = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE directory_profiles(
      id INTEGER PRIMARY KEY,status TEXT NOT NULL,
      updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,
      source_data_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE directory_profile_review_state(
      profile_id INTEGER PRIMARY KEY,reviewed_at TEXT,reviewed_by TEXT,
      unlock_pending INTEGER NOT NULL DEFAULT 0,
      unlock_requested_at TEXT,unlock_requested_by TEXT,
      updated_at TEXT NOT NULL,updated_by TEXT NOT NULL
    );
    CREATE TABLE partner_resources(
      id TEXT PRIMARY KEY,entity_type TEXT,directory_profile_id INTEGER
    );
    CREATE TABLE partner_memberships(
      id TEXT PRIMARY KEY,resource_id TEXT,account_id TEXT,revoked_at TEXT
    );
    INSERT INTO directory_profiles(id,status,updated_at,updated_by,source_data_json)
      VALUES(1,'published','T1','admin','{invalid legacy json');
    INSERT INTO partner_resources VALUES('resource','DIRECTORY_PROFILE',1);
  `);
  const database = {
    prepare(sql) {
      return {
        bind(...bindings) { return {sql,bindings}; },
        sql,
      };
    },
  };
  const apply = statement => sqlite.prepare(statement.sql).run(...(statement.bindings ?? []));
  const review = () => sqlite.prepare(
    "SELECT reviewed_at,reviewed_by,unlock_pending,updated_at FROM directory_profile_review_state WHERE profile_id=1",
  ).get();
  return { sqlite, database, apply, review };
}

test("partner grant activates an SQL review lock without reading or modifying old JSON", () => {
  const f = fixture();
  try {
    const args = {
      database:f.database,canonicalSql:"SELECT id FROM directory_profiles WHERE id=1",
      accountId:"partner-1",nowIso:"T2",actorRef:"admin@example.test",
    };
    const statement = partnerDirectoryReviewLockStatement(args);
    assert.equal(f.apply(statement).changes,0,"no active membership cannot set a review");
    f.sqlite.prepare("INSERT INTO partner_memberships VALUES(?,?,?,NULL)")
      .run("membership","resource","partner-1");
    assert.equal(f.apply(statement).changes,1);
    assert.equal(f.review().reviewed_at,"T2");
    assert.equal(f.review().reviewed_by,"admin@example.test");
    assert.equal(f.review().unlock_pending,0);
    assert.equal(f.sqlite.prepare("SELECT source_data_json FROM directory_profiles WHERE id=1")
      .get().source_data_json,"{invalid legacy json");
  } finally { f.sqlite.close(); }
});

test("partner renewal preserves an earlier human review and clears pending unlock", () => {
  const f = fixture();
  try {
    f.sqlite.prepare("INSERT INTO partner_memberships VALUES(?,?,?,NULL)")
      .run("membership","resource","partner-1");
    f.sqlite.prepare(`INSERT INTO directory_profile_review_state
      (profile_id,reviewed_at,reviewed_by,unlock_pending,updated_at,updated_by)
      VALUES(1,'T0','owner',1,'T0','owner')`).run();
    const stmt = partnerDirectoryReviewLockStatement({
      database:f.database,canonicalSql:"SELECT id FROM directory_profiles WHERE id=1",
      accountId:"partner-1",nowIso:"T3",actorRef:"partner-admin",
    });
    f.apply(stmt);
    assert.equal(f.review().reviewed_at,"T0");
    assert.equal(f.review().reviewed_by,"owner");
    assert.equal(f.review().unlock_pending,0);
    f.sqlite.prepare("UPDATE partner_memberships SET revoked_at='T4'").run();
    assert.equal(f.apply(stmt).changes,0,"revoked manager cannot modify review");
  } finally { f.sqlite.close(); }
});

test("Admin review CAS guard rejects a stale canonical revision", () => {
  const f = fixture();
  try {
    f.sqlite.prepare("UPDATE directory_profiles SET updated_at='T2' WHERE id=999").run();
    const guard = directory0173ReviewCasGuardStatement(f.database);
    assert.throws(()=>f.sqlite.prepare(guard.sql).get(),/malformed JSON/);
    f.sqlite.prepare("UPDATE directory_profiles SET updated_at='T2' WHERE id=1").run();
    assert.equal(f.sqlite.prepare(guard.sql).get().cas_accepted,1);
  } finally { f.sqlite.close(); }
});

test("Notion review lock is based on SQL status, active partner and deletion", () => {
  assert.equal(directoryReviewLockedFromProjection(null),true);
  assert.equal(directoryReviewLockedFromProjection({
    status:"published",sql_reviewed_at:null,sql_unlock_pending:0,
    partner_active:0,deletion_pending:0,
  }),false);
  assert.equal(directoryReviewLockedFromProjection({
    status:"published",sql_reviewed_at:"T2",sql_unlock_pending:0,
    partner_active:0,deletion_pending:0,
  }),true);
  assert.equal(directoryReviewLockedFromProjection({
    status:"published",sql_reviewed_at:null,sql_unlock_pending:1,
    partner_active:0,deletion_pending:0,
  }),true);
  assert.equal(directoryReviewLockedFromProjection({
    status:"published",sql_reviewed_at:null,sql_unlock_pending:0,
    partner_active:1,deletion_pending:0,
  }),true);
});

test("Admin and Notion reviewed sync write no old JSON or wholesale profile data", () => {
  const store=load("lib/directory-store.ts");
  const mirror=load("lib/directory-notion-reviewed-sync.ts");
  const notion=load("lib/notion-directory-sync.ts");
  const partner=load("lib/partner-new-profile-admin.ts");
  const canonical=load("lib/partner-canonical-workflow.ts");
  const writer=store.slice(store.indexOf("export async function setManagedDirectoryProfileReviewed("),
    store.indexOf("export async function archiveManagedDirectoryProfile("));
  assert.match(writer,/INSERT INTO directory_profile_review_state/);
  assert.match(writer,/directory0173ReviewCasGuardStatement/);
  assert.doesNotMatch(writer,/SET source_data_json/);
  assert.match(mirror,/LEFT JOIN directory_profile_review_state/);
  assert.doesNotMatch(mirror,/UPDATE directory_profiles/);
  assert.match(notion,/completeDirectoryReviewedOwnerUnlock/);
  assert.match(notion,/directoryProfileOwnerUnlockPending/);
  assert.doesNotMatch(notion,/isDirectoryReviewUnlockPendingSource/);
  assert.equal((partner.match(/partnerDirectoryReviewLockStatement\(/g)??[]).length,2);
  assert.match(canonical,/partnerDirectoryReviewLockStatement/);
  assert.doesNotMatch(canonical,/partnerDirectory0173ReviewSqlMirrorStatement/);
});
