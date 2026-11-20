import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  DIRECTORY_LEGACY_JSON_PURGE_SQL, DIRECTORY_LEGACY_JSON_STATUS_SQL,
  DIRECTORY_LEGACY_JSON_PROTECTED_COUNT_SQL,
} from "../lib/directory-legacy-json-purge.mjs";
import {directoryCategoryMembershipSql,directoryAdditionalCategoryJsonSql} from
  "../lib/directory-multi-category.ts";

function fixture() {
 const db=new DatabaseSync(":memory:");
 db.exec(`
   CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      source_data_json TEXT NOT NULL DEFAULT '{}'
   );
   CREATE TABLE directory_profile_review_state (
     profile_id INTEGER PRIMARY KEY,reviewed_at TEXT,unlock_pending INTEGER
   );
   CREATE TABLE partner_resources (id INTEGER PRIMARY KEY,entity_type TEXT,directory_profile_id INTEGER);
   CREATE TABLE partner_memberships (resource_id INTEGER,revoked_at TEXT);
   CREATE TABLE directory_profile_additional_categories (
     profile_id INTEGER,category TEXT,PRIMARY KEY(profile_id,category)
   );
 `);
 const insert=db.prepare("INSERT INTO directory_profiles(id,category,source_data_json) VALUES (?,?,?)");
 insert.run(1,"treneri",JSON.stringify({old:"data","_psipedia_additional_categories":'["vencenie"]'}));
 insert.run(2,"treneri",JSON.stringify({_psipedia_profile_review_reviewed_at:"2026-11-20"}));
 insert.run(3,"treneri",JSON.stringify({old:"data"}));
 insert.run(4,"treneri",JSON.stringify({old:"data"}));
 insert.run(5,"treneri","{invalid JSON");
 db.exec(`
    INSERT INTO directory_profile_review_state VALUES (3,'2026-11-20',0);
    INSERT INTO partner_resources VALUES (1,'DIRECTORY_PROFILE',4);
    INSERT INTO partner_memberships VALUES (1,NULL);
    INSERT INTO directory_profile_additional_categories VALUES (1,'vencenie');
 `);
 return db;
}
test("explicit destructive operation clears ordinary/invalid historical JSON without deleting profiles",()=>{
 const db=fixture();
 try {
   const before=db.prepare(DIRECTORY_LEGACY_JSON_STATUS_SQL).get();
   assert.equal(before.profiles,5);
   assert.equal(db.prepare(DIRECTORY_LEGACY_JSON_PROTECTED_COUNT_SQL).get().protected_profiles,3);
   db.exec(DIRECTORY_LEGACY_JSON_PURGE_SQL);
   const after=db.prepare(DIRECTORY_LEGACY_JSON_STATUS_SQL).get();
   assert.equal(after.profiles,5);
   assert.equal(after.empty_legacy,2);
   assert.equal(after.remaining_legacy,3);
   assert.equal(db.prepare("SELECT source_data_json FROM directory_profiles WHERE id=1").get().source_data_json,"{}");
   assert.equal(db.prepare("SELECT source_data_json FROM directory_profiles WHERE id=5").get().source_data_json,"{}");
   // Re-running the cleanup is stable, without a new migration.
   db.exec(DIRECTORY_LEGACY_JSON_PURGE_SQL);
   assert.deepEqual(db.prepare(DIRECTORY_LEGACY_JSON_STATUS_SQL).get(),after);
 } finally {db.close();}
});
test("secondary membership remains readable from SQL even when source_data_json is empty",()=>{
 const db=fixture();
 try {
   db.exec(DIRECTORY_LEGACY_JSON_PURGE_SQL);
   const ids=db.prepare(`SELECT id FROM directory_profiles WHERE
     ${directoryCategoryMembershipSql()} ORDER BY id`).all("vencenie","vencenie");
   assert.deepEqual(ids.map(x=>x.id),[1]);
   const v=db.prepare(`SELECT ${directoryAdditionalCategoryJsonSql()} AS categories
      FROM directory_profiles WHERE id=1`).get();
   assert.deepEqual(JSON.parse(v.categories),["vencenie"]);
 } finally {db.close();}
});
test("production deletion is explicitly manual and keeps physical column as compatibility shim",()=>{
 const workflow=readFileSync(new URL("../.github/workflows/production-directory-legacy-json-purge.yml",import.meta.url),"utf8");
 const production=readFileSync(new URL("../scripts/production-directory-legacy-json-purge.mjs",import.meta.url),"utf8");
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/environment: production/);
 assert.match(production,/process\.env\.GITHUB_REF==="refs\/heads\/main"/);
 assert.match(production,/DIRECTORY_JSON_PURGE_CONFIRMATION===confirmation/);
 assert.match(production,/legacyColumnPhysicallyPresent:true/);
 assert.doesNotMatch(production,/DROP TABLE|DROP COLUMN/i);
});
