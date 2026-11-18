import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isDirectoryReviewedSourceLocked, directoryProfileNotionSyncLocked } from "../lib/directory-reviewed-sync-lock.ts";

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
