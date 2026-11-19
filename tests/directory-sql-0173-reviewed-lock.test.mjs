import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  directory0173ReviewCasGuardStatement,
  directory0173ReviewSqlMirrorStatement,
  partnerDirectory0173ReviewSqlMirrorStatement,
} from "../lib/directory-0173-review-state-sql.ts";
import { isDirectoryReviewedSourceLocked } from "../lib/directory-reviewed-sync-lock.ts";

const load = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const migration = load("drizzle/0173_directory_structured_sql_foundation.sql");

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(`
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL,
      source_data_json TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
    );
    CREATE TABLE partner_resources (
      id TEXT PRIMARY KEY, entity_type TEXT, directory_profile_id INTEGER
    );
    CREATE TABLE partner_memberships (
      id TEXT PRIMARY KEY, resource_id TEXT, account_id TEXT, revoked_at TEXT
    );
    INSERT INTO directory_profiles VALUES (1,'veterinari','published','{}','T1','admin');
    INSERT INTO directory_profiles VALUES (2,'veterinari','published','{}','T1','admin');
  `);
  for (const part of migration.split("--> statement-breakpoint")) {
    const sql = part.replace(/^\s*(?:--[^\n]*\n\s*)+/g, "").trim();
    if (sql) sqlite.exec(sql);
  }
  const database = {
    prepare(sql) {
      return { sql, bindings:[], bind(...bindings) { return { sql, bindings }; } };
    },
  };
  const apply = statement => sqlite.prepare(statement.sql).run(...statement.bindings);
  const review = id => sqlite.prepare(
    "SELECT reviewed_at,reviewed_by,unlock_pending,updated_at,updated_by FROM directory_profile_review_state WHERE profile_id=?",
  ).get(id);
  const writeLegacy = (id,source,at,actor) => sqlite.prepare(
    "UPDATE directory_profiles SET source_data_json=?,updated_at=?,updated_by=? WHERE id=?",
  ).run(JSON.stringify(source),at,actor,id);
  return { sqlite, database, apply, review, writeLegacy };
}

test("0173 shadow tracks explicit review without changing the legacy Notion lock", () => {
  const f = fixture();
  try {
    const reviewedSource = {
      _psipedia_profile_review_reviewed_at:"2026-11-19T22:20:00.000Z",
      _psipedia_profile_review_reviewed_by:"owner@example.invalid",
    };
    f.writeLegacy(1,reviewedSource,"T2","owner@example.invalid");
    f.apply(directory0173ReviewSqlMirrorStatement({
      database:f.database,profileId:1,sourceDataJson:JSON.stringify(reviewedSource),
      profileUpdatedAt:"T2",projectedAt:"T2",projectedBy:"owner@example.invalid",
    }));
    assert.equal(f.review(1).reviewed_at,reviewedSource._psipedia_profile_review_reviewed_at);
    assert.equal(f.review(1).reviewed_by,"owner@example.invalid");
    assert.equal(f.review(1).unlock_pending,0);
    assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify(reviewedSource)),true);
    const clearedSource={ _psipedia_profile_review_notion_synced:"0" };
    f.writeLegacy(1,clearedSource,"T3","owner@example.invalid");
    f.apply(directory0173ReviewSqlMirrorStatement({
      database:f.database,profileId:1,sourceDataJson:JSON.stringify(clearedSource),
      profileUpdatedAt:"T3",projectedAt:"T3",projectedBy:"owner@example.invalid",
    }));
    assert.equal(f.review(1).reviewed_at,null);
    assert.equal(f.review(1).unlock_pending,0);
    assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify(clearedSource)),false);
    assert.equal(f.review(2),undefined,"other profiles must not be changed");
  } finally {f.sqlite.close();}
});

test("legacy pending unlock cannot appear open in SQL shadow until explicit owner clear",()=>{
  const f=fixture();
  try{
    const pending={_psipedia_profile_review_unlock_pending:"1"};
    f.writeLegacy(1,pending,"T2","admin");
    f.apply(directory0173ReviewSqlMirrorStatement({
      database:f.database,profileId:1,sourceDataJson:JSON.stringify(pending),
      profileUpdatedAt:"T2",projectedAt:"T2",projectedBy:"admin",
    }));
    assert.equal(f.review(1).reviewed_at,null);
    assert.equal(f.review(1).unlock_pending,1);
    assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify(pending)),true);
    // Failed/stale write cannot replace the current projected row.
    const older=directory0173ReviewSqlMirrorStatement({
      database:f.database,profileId:1,sourceDataJson:"{}",
      profileUpdatedAt:"T1",projectedAt:"T9",projectedBy:"notion",
    });
    assert.equal(f.apply(older).changes,0);
    assert.equal(f.review(1).unlock_pending,1);
    assert.equal(f.review(2),undefined);
  } finally{f.sqlite.close();}
});

test("Notion acknowledgement with unchanged profile revision still mirrors only committed JSON",()=>{
  const f=fixture();
  try{
    const source={_psipedia_profile_review_reviewed_at:"2026-11-19T22:40:00.000Z",
      _psipedia_profile_review_reviewed_by:"owner",_psipedia_profile_review_notion_synced:"1"};
    f.writeLegacy(1,source,"T1","admin");
    const current=directory0173ReviewSqlMirrorStatement({
      database:f.database,profileId:1,sourceDataJson:JSON.stringify(source),
      profileUpdatedAt:"T1",projectedAt:"T2",projectedBy:"notion-directory-sync@psipedia.sk",
    });
    f.apply(current);
    assert.equal(f.review(1).reviewed_by,"owner",
      "Notion checkbox echo must not take ownership of the review");
    assert.equal(f.review(1).updated_by,"notion-directory-sync@psipedia.sk");
    const stale=directory0173ReviewSqlMirrorStatement({
      database:f.database,profileId:1,sourceDataJson:"{}",
      profileUpdatedAt:"T1",projectedAt:"T3",projectedBy:"notion",
    });
    assert.equal(f.apply(stale).changes,0);
    assert.equal(f.review(1).updated_at,"T2");
  }finally{f.sqlite.close();}
});

test("review projection CAS guard aborts before a stale SQL row can be changed",()=>{
  const f=fixture();
  try{
    f.sqlite.prepare("UPDATE directory_profiles SET updated_at='T2' WHERE id=404").run();
    const stmt=directory0173ReviewCasGuardStatement(f.database);
    // No row was changed in this transaction; the guard intentionally throws
    // a SQL error rather than allowing a later sidecar upsert.
    assert.throws(()=>f.apply(stmt),/malformed JSON/);
    f.sqlite.prepare("UPDATE directory_profiles SET updated_at='T3' WHERE id=1").run();
    assert.equal(f.apply(stmt).changes,0);
    assert.equal(f.review(1),undefined);
  }finally{f.sqlite.close();}
});

test("partner grant writes SQL review state only for active matching owner",()=>{
  const f=fixture();
  try{
    const source={_psipedia_profile_review_reviewed_at:"2026-11-19T22:50:00Z",
      _psipedia_profile_review_reviewed_by:"admin:owner"};
    f.writeLegacy(1,source,"T3","admin");
    f.sqlite.exec(`
      INSERT INTO partner_resources VALUES ('res-1','DIRECTORY_PROFILE',1);
      INSERT INTO partner_memberships VALUES ('mem-1','res-1','account-1',NULL);
    `);
    const args={database:f.database,
      canonicalSql:"SELECT id FROM directory_profiles WHERE id=1",
      accountId:"account-1",nowIso:"T3",actorRef:"admin"};
    const denied=partnerDirectory0173ReviewSqlMirrorStatement({...args,accountId:"wrong-account"});
    assert.equal(f.apply(denied).changes,0);
    assert.equal(f.review(1),undefined);
    f.apply(partnerDirectory0173ReviewSqlMirrorStatement(args));
    assert.equal(f.review(1).reviewed_at,source._psipedia_profile_review_reviewed_at);
    assert.equal(f.review(1).reviewed_by,"admin:owner",
      "existing human review timestamp and owner are retained");
    f.sqlite.prepare("UPDATE partner_memberships SET revoked_at='T4' WHERE id='mem-1'").run();
    f.writeLegacy(1,{}, "T4","admin");
    assert.equal(f.apply(partnerDirectory0173ReviewSqlMirrorStatement(args)).changes,0);
    assert.equal(f.review(1).reviewed_at,source._psipedia_profile_review_reviewed_at);
  }finally{f.sqlite.close();}
});

test("legacy pending owner unlock finalization atomically updates SQL 0173 and preserves unrelated source fields",()=>{
  const f=fixture();
  try{
    const pending={
      _psipedia_profile_review_unlock_pending:"1",
      _psipedia_profile_review_notion_synced:"1",
      "Pošta":"nezmenené",
    };
    f.writeLegacy(1,pending,"T2","owner@example.invalid");
    f.apply(directory0173ReviewSqlMirrorStatement({
      database:f.database,profileId:1,sourceDataJson:JSON.stringify(pending),
      profileUpdatedAt:"T2",projectedAt:"T2",projectedBy:"admin",
    }));
    assert.equal(f.review(1).unlock_pending,1);
    assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify(pending)),true);
    const cleared={...pending};
    delete cleared._psipedia_profile_review_unlock_pending;
    const canonicalSql="UPDATE directory_profiles SET source_data_json=? "+
      "WHERE id=? AND source_data_json=? AND updated_at=? RETURNING id";
    f.sqlite.exec("BEGIN");
    try{
      const result=f.sqlite.prepare(canonicalSql).get(
        JSON.stringify(cleared),1,JSON.stringify(pending),"T2",
      );
      assert.equal(result.id,1);
      f.sqlite.prepare(directory0173ReviewCasGuardStatement(f.database).sql).get();
      const mirror=directory0173ReviewSqlMirrorStatement({
        database:f.database,profileId:1,sourceDataJson:JSON.stringify(cleared),
        profileUpdatedAt:"T2",projectedAt:"T3",projectedBy:"notion-directory-sync@psipedia.sk",
      });
      f.apply(mirror);
      f.sqlite.exec("COMMIT");
    }catch(error){f.sqlite.exec("ROLLBACK");throw error;}
    assert.equal(f.review(1).unlock_pending,0);
    assert.equal(f.review(1).reviewed_at,null);
    assert.equal(f.review(1).updated_at,"T3");
    assert.equal(f.review(1).updated_by,"notion-directory-sync@psipedia.sk");
    const saved=JSON.parse(f.sqlite.prepare("SELECT source_data_json FROM directory_profiles WHERE id=1").get().source_data_json);
    assert.equal(saved["Pošta"],"nezmenené");
    assert.equal(saved._psipedia_profile_review_unlock_pending,undefined);
    assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify(saved)),false);
    assert.equal(f.review(2),undefined);
  }finally{f.sqlite.close();}
});

test("stale owner-unlock CAS rolls back SQL and keeps pending lock, never reports partial unlock",()=>{
  const f=fixture();
  try{
    const pending={_psipedia_profile_review_unlock_pending:"1"};
    f.writeLegacy(1,pending,"T2","admin");
    f.apply(directory0173ReviewSqlMirrorStatement({
      database:f.database,profileId:1,sourceDataJson:JSON.stringify(pending),
      profileUpdatedAt:"T2",projectedAt:"T2",projectedBy:"admin",
    }));
    const baseline=JSON.stringify(pending);
    const wrong={...pending,_psipedia_profile_review_unlock_pending:"0"};
    f.sqlite.exec("BEGIN");
    try{
      const changed=f.sqlite.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=? AND source_data_json=? AND updated_at=? RETURNING id")
        .get(JSON.stringify({}),1,JSON.stringify(wrong),"T2");
      assert.equal(changed,undefined);
      const cas=directory0173ReviewCasGuardStatement(f.database);
      assert.throws(()=>f.sqlite.prepare(cas.sql).get(),/malformed JSON/);
      f.sqlite.exec("ROLLBACK");
    }catch(error){f.sqlite.exec("ROLLBACK");throw error;}
    assert.equal(f.sqlite.prepare("SELECT source_data_json FROM directory_profiles WHERE id=1").get().source_data_json,baseline);
    assert.equal(f.review(1).unlock_pending,1);
    assert.equal(isDirectoryReviewedSourceLocked(baseline),true);
  }finally{f.sqlite.close();}
});

test("Notion legacy unlock finalizer mirrors SQL only after verified remote owner writeback",()=>{
  const notion=load("lib/notion-directory-sync.ts");
  const start=notion.indexOf("async function completeDirectoryReviewedOwnerUnlock(");
  const end=notion.indexOf("function fullProfileInput(",start);
  const finalizer=notion.slice(start,end);
  assert(start>0 && end>start);
  assert.match(finalizer,/await writeProfileToNotion\(\{/);
  assert.match(finalizer,/ownerUnlock: true/);
  assert.match(finalizer,/directory0173ReviewSqlMirrorStatement\(\{/);
  assert.match(finalizer,/directory0173ReviewCasGuardStatement\(input\.database\)/);
  assert.match(finalizer,/input\.database\.batch\(\[/);
  assert.match(finalizer,/AND source_data_json=\? AND updated_at=\? RETURNING id/);
  assert.ok(finalizer.indexOf("await writeProfileToNotion(") <
    finalizer.indexOf("delete source[DIRECTORY_REVIEW_UNLOCK_PENDING_KEY]"));
  assert.ok(finalizer.indexOf("delete source[DIRECTORY_REVIEW_UNLOCK_PENDING_KEY]") <
    finalizer.indexOf("input.database.batch("));
});

test("review writer paths are atomic and all legacy Notion lock predicates stay active",()=>{
  const store=load("lib/directory-store.ts");
  const notion=load("lib/directory-notion-reviewed-sync.ts");
  const partner=load("lib/partner-new-profile-admin.ts");
  const lock=load("lib/directory-reviewed-sync-lock.ts");
  const adminWriter=store.slice(store.indexOf("export async function setManagedDirectoryProfileReviewed("),
    store.indexOf("export async function archiveManagedDirectoryProfile("));
  assert.match(adminWriter,/database\.batch\(\[[\s\S]*?canonical, directory0173ReviewCasGuardStatement\(database\), reviewMirror/);
  assert.match(adminWriter,/source_data_json = \?/);
  assert.match(adminWriter,/AND \(\?=1 OR NOT EXISTS \(SELECT 1 FROM partner_resources/);
  assert.match(notion,/input\.database\.batch\(\[[\s\S]*?canonical, directory0173ReviewCasGuardStatement\(input\.database\), reviewMirror/);
  assert.match(partner,/partnerDirectory0173ReviewSqlMirrorStatement/);
  assert.equal((partner.match(/partnerDirectoryReviewLockStatement\(/g)??[]).length,2);
  assert.match(lock,/isDirectoryReviewedSourceLocked\(row\.source_data_json\)/);
  assert.match(lock,/JOIN partner_memberships/);
  assert.doesNotMatch(lock,/directory_profile_review_state/,
    "SQL shadow cannot unlock historical reviewed JSON before audited backfill");
});
