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
