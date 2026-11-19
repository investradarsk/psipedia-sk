import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DIRECTORY_REVIEW_UNLOCK_PENDING_KEY,
  isDirectoryReviewUnlockPendingSource,
  isDirectoryReviewedSourceLocked,
  directoryProfileNotionSyncLocked,
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

test("database review lock checks current D1 metadata and archives", async () => {
  let seen=0;
  const db={
    prepare(sql) {
      assert.match(sql,/FROM directory_profiles WHERE id=\?/);
      return {bind(id) { seen=id; return {async first(){
        if(id===1)return {source_data_json:JSON.stringify({"_psipedia_profile_review_reviewed_at":"2026-11-18"}),status:"published"};
        if(id===2)return {source_data_json:"{}",status:"archived"};
        if(id===3)return {source_data_json:"{}",status:"published"};
        return null;
      }};}};
    },
  };
  assert.equal(await directoryProfileNotionSyncLocked(db,1),true);
  assert.equal(await directoryProfileNotionSyncLocked(db,2),true);
  assert.equal(await directoryProfileNotionSyncLocked(db,3),false);
  assert.equal(await directoryProfileNotionSyncLocked(db,4),true);
  assert.equal(seen,4);
  await assert.rejects(()=>directoryProfileNotionSyncLocked(db,0),/DIRECTORY_REVIEW_LOCK_INVALID_ID/);
});

test("Notion sweep gates targeted, signed event, catalog and legacy paths",()=>{
  const sync=readFileSync(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database, input\.mapping\.directory_profile_id\)\)/);
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database, profileId\)\)/);
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database, input\.targetProfileId\)\)/);
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database,mapped\.directory_profile_id\)\)/);
  assert.match(sync,/if \(await directoryProfileNotionSyncLocked\(input\.database,mapping\.directory_profile_id\)\)/);
});

test("unchecking a reviewed mapped profile does not reopen Notion before D1 rebaseline", () => {
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

test("unlock is a verified owner-only D1 -> Notion rebaseline", () => {
  const sync = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  const store = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
  assert.match(store, /markNotionUnlockPending/);
  assert.match(store, /_psipedia_profile_review_unlock_pending/);
  assert.match(route, /deferUnlock = Boolean\(linked\?\.notion_page_id\)/);
  assert.match(route, /targetProfileId: id/);
  assert.match(sync, /async function completeDirectoryReviewedOwnerUnlock/);
  assert.match(sync, /ownerUnlock: true/);
  assert.match(sync, /DIRECTORY_REVIEW_UNLOCK_CONTROL_NOT_CONFIRMED/);
  assert.match(sync, /DIRECTORY_REVIEW_UNLOCK_CONCURRENT_CHANGE/);
  assert.match(sync, /WHERE id=\? AND source_data_json=\? AND updated_at=\?/);
  assert.match(sync, /directoryProfileNotionSyncLocked\(input.database,input.profile.id\)/);
  assert.match(sync, /isDirectoryReviewUnlockPendingSource\(state.source_data_json\)/);
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

test("unchecking keeps the profile Notion-locked until its D1-first rebaseline succeeds", () => {
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

test("owner unlock is explicitly D1-first, echo-verified, and remains locked on failure", () => {
  const sync = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const start = sync.indexOf("async function completeDirectoryReviewedOwnerUnlock(");
  const end = sync.indexOf("\nfunction fullProfileInput(", start);
  assert.ok(start > 0 && end > start, "owner unlock finalizer exists");
  const finalizer = sync.slice(start, end);
  assert.match(finalizer, /isDirectoryReviewUnlockPendingSource/);
  assert.match(finalizer, /propertyCheckbox\(remote, "Odkontrolované"\)/);
  assert.match(finalizer, /await writeProfileToNotion\(\{/);
  assert.match(finalizer, /ownerUnlock: true/);
  assert.match(finalizer, /delete source\[DIRECTORY_REVIEW_UNLOCK_PENDING_KEY\]/);
  assert.match(finalizer, /WHERE id=\? AND source_data_json=\? AND updated_at=\? RETURNING id/);
  assert.ok(finalizer.indexOf("await writeProfileToNotion(") <
    finalizer.indexOf("delete source[DIRECTORY_REVIEW_UNLOCK_PENDING_KEY]"),
    "never remove pending lock before canonical Notion writeback");
  assert.match(sync, /if \(await directoryProfileNotionSyncLocked\(input\.database,input\.profile\.id\)\)/);
  assert.match(sync, /if \(await completeDirectoryReviewedOwnerUnlock\(\{/);
});

test("additional Notion writers cannot bypass reviewed profile lock", () => {
  const geo = readFileSync(new URL("../lib/notion-geo-detach-mirror.ts", import.meta.url), "utf8");
  const services = readFileSync(new URL("../lib/service-catalog-notion-relations.ts", import.meta.url), "utf8");
  const media = readFileSync(new URL("../lib/media-source-monitor.ts", import.meta.url), "utf8");
  assert.match(geo, /directoryProfileNotionSyncLocked\(db, targetId\)/);
  assert.match(services, /directoryProfileNotionSyncLocked\(db, profileId\)/);
  assert.match(media, /directoryProfileNotionSyncLocked\(input\.database, input\.row\.entityId\)/);
});

test("Admin review toggle unlocks through canonical targeted rebaseline without releasing pending lock", () => {
  const route = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  const store = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
  assert.match(store, /markNotionUnlockPending/);
  assert.match(store, /_psipedia_profile_review_unlock_pending/);
  assert.match(route, /markNotionUnlockPending: deferUnlock/);
  assert.match(route, /targetProfileId: id/);
  assert.match(route, /notionReviewSync = status.failed \|\| stillPending \? "pending" : "pushed"/);
});

test("a repeated uncheck cannot erase a pending Notion rebaseline lock", () => {
  const store = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  // The DB writer itself must preserve the existing pending marker: protecting
  // only the HTTP route would leave retry and other-caller bypasses.
  assert.match(store, /const alreadyPending = isDirectoryReviewUnlockPendingSource\\(row\\.source_data_json\\)/);
  assert.match(store, /!reviewed && \\(options\\.markNotionUnlockPending \\|\\| alreadyPending\\)/);
  assert.match(route, /current\\.importData\\?\\.\\["_psipedia_profile_review_unlock_pending"\\] === "1"/);
  assert.match(route, /if \\(current\\.reviewed \\|\\| alreadyPending\\)/);
  assert.match(route, /targetProfileId: id/);
  const persisted = JSON.stringify({
    "_psipedia_profile_review_unlock_pending": "1",
    "_psipedia_profile_review_reviewed_at": "",
    "Zdroj dát": "unchanged",
  });
  assert.equal(isDirectoryReviewUnlockPendingSource(persisted), true);
  assert.equal(isDirectoryReviewedSourceLocked(persisted), true);
});

