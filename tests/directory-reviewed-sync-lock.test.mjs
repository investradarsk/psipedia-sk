import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  DIRECTORY_REVIEW_UNLOCK_PENDING_KEY,
  isDirectoryReviewUnlockPendingSource,
  isDirectoryReviewedSourceLocked,
  directoryProfileNotionSyncLocked,
  DIRECTORY_REVIEW_LOCK_SQL,
  directoryReviewLockedFromProjection,
} from "../lib/directory-reviewed-sync-lock.ts";

test("review lock is determined only by Admin review timestamp", () => {
  assert.equal(isDirectoryReviewedSourceLocked("{}"), false);
  assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify({
    "_psipedia_profile_review_reviewed_at":"2026-11-18T18:00:00Z",
    "_psipedia_profile_review_reviewed_by":"owner",
  })), true);
  assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify({
    "_psipedia_profile_review_notion_synced":"1",
  })), false);
  assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify({
    "_psipedia_profile_review_reviewed_at":"",
  })), false);
});

test("malformed metadata never silently unlocks Notion sync", () => {
  assert.throws(() => isDirectoryReviewedSourceLocked("{"), /DIRECTORY_REVIEW_LOCK_INVALID_JSON/);
  assert.throws(() => isDirectoryReviewedSourceLocked("[]"), /DIRECTORY_REVIEW_LOCK_INVALID_JSON/);
});

test("SQL-only lock query protects reviewed, partner and tombstone states", async () => {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec([
    "CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,status TEXT,source_data_json TEXT)",
    "CREATE TABLE directory_profile_review_state(profile_id INTEGER PRIMARY KEY,reviewed_at TEXT,unlock_pending INTEGER)",
    "CREATE TABLE partner_resources(id TEXT PRIMARY KEY,entity_type TEXT,directory_profile_id INTEGER)",
    "CREATE TABLE partner_memberships(id TEXT PRIMARY KEY,resource_id TEXT,revoked_at TEXT)",
    "CREATE TABLE admin_record_tombstones(kind TEXT,record_id INTEGER)",
  ].join(";")+";");
  const addProfile=sqlite.prepare("INSERT INTO directory_profiles VALUES(?,?,?)");
  for(const id of [1,2,3,5,6,7,8,9])addProfile.run(id,id===2?"archived":"published","{}");
  sqlite.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=1")
    .run(JSON.stringify({"_psipedia_profile_review_reviewed_at":"2026-11-18"}));
  sqlite.exec([
    "INSERT INTO partner_resources VALUES('res-5','DIRECTORY_PROFILE',5)",
    "INSERT INTO partner_memberships VALUES('m-5','res-5',NULL)",
    "INSERT INTO directory_profile_review_state VALUES(6,'2026-11-19',0)",
    "INSERT INTO directory_profile_review_state VALUES(7,NULL,1)",
    "INSERT INTO admin_record_tombstones VALUES('directory',8)",
    "INSERT INTO directory_profile_review_state VALUES(9,NULL,0)",
  ].join(";")+";");
  sqlite.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=9")
    .run(JSON.stringify({"_psipedia_profile_review_unlock_pending":"1"}));
  const db={
    prepare(sql){
      assert.equal(sql,DIRECTORY_REVIEW_LOCK_SQL);
      return {bind(id){return {first:async()=>sqlite.prepare(sql).get(id)??null}}};
    },
  };
  try {
    assert.equal(await directoryProfileNotionSyncLocked(db,1),false,"legacy JSON cannot override SQL");
    assert.equal(await directoryProfileNotionSyncLocked(db,2),true,"archived");
    assert.equal(await directoryProfileNotionSyncLocked(db,3),false,"unlocked");
    assert.equal(await directoryProfileNotionSyncLocked(db,4),true,"missing");
    assert.equal(await directoryProfileNotionSyncLocked(db,5),true,"active partner");
    assert.equal(await directoryProfileNotionSyncLocked(db,6),true,"SQL reviewed with blank JSON");
    assert.equal(await directoryProfileNotionSyncLocked(db,7),true,"SQL unlock pending");
    assert.equal(await directoryProfileNotionSyncLocked(db,8),true,"pending deletion");
    assert.equal(await directoryProfileNotionSyncLocked(db,9),false,"SQL clear overrides obsolete JSON pending");
    sqlite.exec("UPDATE directory_profile_review_state SET reviewed_at=NULL,unlock_pending=0 WHERE profile_id=6");
    assert.equal(await directoryProfileNotionSyncLocked(db,6),false,"explicit SQL unlock");
    sqlite.exec("UPDATE partner_memberships SET revoked_at='2026-11-20' WHERE id='m-5'");
    assert.equal(await directoryProfileNotionSyncLocked(db,5),false,"revoked partner");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n,8,
      "read-only query cannot create or delete profiles");
    await assert.rejects(()=>directoryProfileNotionSyncLocked(db,0),/DIRECTORY_REVIEW_LOCK_INVALID_ID/);
  } finally { sqlite.close(); }
});

test("SQL lock ignores obsolete JSON metadata and still fails closed for missing profiles",()=>{
  assert.equal(directoryReviewLockedFromProjection({
    status:"published",sql_reviewed_at:"2026-11-19",
    sql_unlock_pending:0,partner_active:0,deletion_pending:0,
  }),true);
  assert.equal(directoryReviewLockedFromProjection(null),true);
  assert.equal(directoryReviewLockedFromProjection({
    status:"published",sql_reviewed_at:null,
    sql_unlock_pending:null,partner_active:0,deletion_pending:0,
  }),false,"missing SQL review state means unchecked after import");
});

test("Notion sweep gates targeted, signed event, catalog and legacy paths",()=>{
  const sync=readFileSync(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database, input\.mapping\.directory_profile_id\)\)/);
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database, profileId\)\)/);
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database, input\.targetProfileId\)\)/);
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database,mapped\.directory_profile_id\)\)/);
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database,mapping\.directory_profile_id\)\)/);
});

test("old pending metadata remains a lock until an explicit owner action", () => {
  const pending = JSON.stringify({ [DIRECTORY_REVIEW_UNLOCK_PENDING_KEY]: "1" });
  assert.equal(isDirectoryReviewedSourceLocked(pending), true);
  assert.equal(isDirectoryReviewUnlockPendingSource(pending), true);
  assert.equal(isDirectoryReviewUnlockPendingSource(JSON.stringify({
    [DIRECTORY_REVIEW_UNLOCK_PENDING_KEY]: "1",
    "_psipedia_profile_review_reviewed_at": "2026-11-18T18:00:00Z",
  })), false);
  assert.equal(isDirectoryReviewedSourceLocked("{}"), false);
  assert.equal(isDirectoryReviewUnlockPendingSource("{}"), false);
});

test("explicit uncheck removes pending lock without whole-profile Notion rebaseline", () => {
  const store = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  const start = route.indexOf('if (body.action === "set-reviewed")');
  const end = route.indexOf('if (body.action !== "restore")', start);
  assert.ok(start > 0 && end > start);
  const toggle = route.slice(start, end);
  assert.match(store, /unlock_pending=0/);
  assert.doesNotMatch(store, /markNotionUnlockPending|alreadyPending/);
  assert.match(toggle, /setManagedDirectoryProfileReviewed\(/);
  assert.match(toggle, /syncDirectoryReviewedWithNotion\(/);
  assert.doesNotMatch(toggle, /runNotionDirectorySyncSweep|deferUnlock|stillPending/);
});

test("standalone Notion GEO and services relation adapters obey the directory review lock", () => {
  const geo = readFileSync(new URL("../lib/notion-geo-detach-mirror.ts", import.meta.url), "utf8");
  const relation = readFileSync(new URL("../lib/service-catalog-notion-relations.ts", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  assert.match(geo, /directoryProfileNotionSyncLocked\(db, targetId\)/);
  assert.match(relation, /directoryProfileNotionSyncLocked\(db, profileId\)/);
  for (const operation of [
    "mirrorPilotDirectoryMetadataFieldsToNotion",
    "mirrorDirectoryMainImageToNotion",
    "mirrorBreederCategoryFiltersToNotion",
    "mirrorTrainerTrustFieldsToNotion",
    "mirrorBreederRelationNamesToNotion",
    "mirrorDirectoryAdditionalCategoriesToNotion",
  ]) {
    const start = sync.indexOf("export async function " + operation);
    assert.ok(start >= 0, "missing mirror " + operation);
    const chunk = sync.slice(start, start + 650);
    assert.match(chunk, /directoryProfileNotionSyncLocked\(input.database, input.profileId\)/, operation);
  }
});

test("a legacy pending marker remains locked until explicitly cleared", () => {
  const pending = JSON.stringify({
    "_psipedia_profile_review_unlock_pending": "1",
    "_psipedia_profile_review_notion_synced": "0",
  });
  assert.equal(isDirectoryReviewedSourceLocked(pending), true);
  assert.equal(isDirectoryReviewUnlockPendingSource(pending), true);
  assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify({
    "_psipedia_profile_review_reviewed_at": "2026-11-18T18:00:00Z",
    "_psipedia_profile_review_unlock_pending": "1",
  })), true);
  assert.equal(isDirectoryReviewUnlockPendingSource(JSON.stringify({
    "_psipedia_profile_review_reviewed_at": "2026-11-18T18:00:00Z",
    "_psipedia_profile_review_unlock_pending": "1",
  })), false);
  assert.equal(isDirectoryReviewedSourceLocked("{}"), false);
  assert.equal(isDirectoryReviewUnlockPendingSource("{}"), false);
});

test("Notion no longer has a legacy JSON owner-unlock bypass", () => {
  const sync = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sync, /completeDirectoryReviewedOwnerUnlock/);
  assert.doesNotMatch(sync, /ownerUnlock/);
  assert.doesNotMatch(sync, /isDirectoryReviewUnlockPendingSource/);
  assert.match(sync, /directoryProfileNotionSyncLocked\(input.database, input.profile.id\)/);
});

test("additional Notion writers cannot bypass reviewed profile lock", () => {
  const geo = readFileSync(new URL("../lib/notion-geo-detach-mirror.ts", import.meta.url), "utf8");
  const services = readFileSync(new URL("../lib/service-catalog-notion-relations.ts", import.meta.url), "utf8");
  const media = readFileSync(new URL("../lib/media-source-monitor.ts", import.meta.url), "utf8");
  assert.match(geo, /directoryProfileNotionSyncLocked\(db, targetId\)/);
  assert.match(services, /directoryProfileNotionSyncLocked\(db, profileId\)/);
  assert.match(media, /directoryProfileNotionSyncLocked\(input\.database, input\.row\.entityId\)/);
});

test("Admin review toggle mirrors only checkbox and never waits for editorial hash", () => {
  const route = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  const start = route.indexOf('if (body.action === "set-reviewed")');
  const end = route.indexOf('if (body.action !== "restore")', start);
  const toggle = route.slice(start, end);
  assert.match(toggle, /notionReviewSync = await syncDirectoryReviewedWithNotion/);
  assert.match(toggle, /return Response.json\(\{ profile, notionReviewSync \}\)/);
  assert.doesNotMatch(toggle, /markNotionUnlockPending|ownerUnlock|targetProfileId/);
});

test("repeated owner uncheck clears the SQL pending lock", () => {
  const store = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
  const begin = store.indexOf("export async function setManagedDirectoryProfileReviewed(");
  const finish = store.indexOf("export async function archiveManagedDirectoryProfile(", begin);
  const writer = store.slice(begin, finish);
  assert.match(writer, /unlock_pending=0/);
  assert.doesNotMatch(writer, /alreadyPending|markNotionUnlockPending/);
  const pending = JSON.stringify({
    "_psipedia_profile_review_unlock_pending": "1",
    "_psipedia_profile_review_reviewed_at": "",
  });
  assert.equal(isDirectoryReviewedSourceLocked(pending), true);
  const source = JSON.parse(pending);
  delete source[DIRECTORY_REVIEW_UNLOCK_PENDING_KEY];
  assert.equal(isDirectoryReviewedSourceLocked(JSON.stringify(source)), false);
});
