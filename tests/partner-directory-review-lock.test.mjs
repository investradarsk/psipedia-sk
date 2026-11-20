import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { directoryProfileNotionSyncLocked } from "../lib/directory-reviewed-sync-lock.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("live external owner blocks Notion even if older profile had no reviewed marker", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, status TEXT, source_data_json TEXT);
    CREATE TABLE partner_resources(id TEXT PRIMARY KEY, entity_type TEXT, directory_profile_id INTEGER);
    CREATE TABLE partner_memberships(id TEXT PRIMARY KEY, resource_id TEXT, revoked_at TEXT);
    CREATE TABLE directory_profile_review_state(profile_id INTEGER PRIMARY KEY,reviewed_at TEXT,unlock_pending INTEGER);
    CREATE TABLE admin_record_tombstones(kind TEXT,record_id INTEGER);
    INSERT INTO directory_profiles VALUES(101,'published','{}');
    INSERT INTO partner_resources VALUES('res-101','DIRECTORY_PROFILE',101);
  `);
  const database = {
    prepare(sql) {
      return {
        bind(...values) {
          return { first: async () => sqlite.prepare(sql).get(...values) ?? null };
        },
      };
    },
  };
  try {
    assert.equal(await directoryProfileNotionSyncLocked(database, 101), false);
    sqlite.prepare("INSERT INTO partner_memberships VALUES (?,?,NULL)").run("member-101", "res-101");
    assert.equal(await directoryProfileNotionSyncLocked(database, 101), true);
    sqlite.prepare("UPDATE partner_memberships SET revoked_at=? WHERE id=?").run("2026-11-19", "member-101");
    assert.equal(await directoryProfileNotionSyncLocked(database, 101), false);
    sqlite.prepare("INSERT INTO directory_profile_review_state VALUES(?,?,?)")
      .run(101,"2026-11-19",0);
    assert.equal(await directoryProfileNotionSyncLocked(database,101),true,
      "SQL owner review must block Notion even if legacy JSON is blank");
    sqlite.prepare("UPDATE directory_profile_review_state SET reviewed_at=NULL WHERE profile_id=101").run();
    assert.equal(await directoryProfileNotionSyncLocked(database,101),false,
      "explicit SQL-clear and revoked partner should allow Notion");
    sqlite.prepare("INSERT INTO admin_record_tombstones VALUES(?,?)").run("directory",101);
    assert.equal(await directoryProfileNotionSyncLocked(database,101),true,
      "pending owner deletion must never be overwritten by Notion");
    sqlite.prepare("DELETE FROM admin_record_tombstones WHERE kind='directory' AND record_id=101").run();
    sqlite.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=101")
      .run(JSON.stringify({ _psipedia_profile_review_reviewed_at:"2026-11-19T19:00:00.000Z" }));
    assert.equal(await directoryProfileNotionSyncLocked(database, 101), true,
      "explicit review remains locked after revocation");
  } finally { sqlite.close(); }
});

test("all directory partner grants activate the existing reviewed flag", () => {
  const lock=read("lib/partner-directory-review.ts");
  const owner=read("lib/partner-admin-store.ts");
  const moderation=read("lib/partner-new-profile-admin.ts");
  const claim=read("lib/partner-claims-admin.ts");
  assert.match(owner,/await ensurePartnerDirectoryReviewLock/);
  assert.match(claim,/await ensurePartnerOwnerMembershipAdmin/);
  assert.equal((moderation.match(/partnerDirectoryReviewLockStatement\(/g)??[]).length,2,
    "both create and link-existing moderation paths are protected");
  assert.match(lock,/setManagedDirectoryProfileReviewed\(/);
  assert.match(lock,/json_remove\(source_data_json, '\$\._psipedia_profile_review_unlock_pending'\)/);
  assert.match(lock,/m\.revoked_at IS NULL/);
  assert.match(lock,/COALESCE\(json_extract\(source_data_json/);
  assert.match(lock,/WHERE id=\(\$\{input\.canonicalSql\}\)/);
});

test("Admin identifies actual owner and cannot uncheck reviewed while partner access exists", () => {
  const owner=read("lib/partner-admin-store.ts");
  const page=read("app/admin/adresar/[id]/page.tsx");
  const editor=read("components/admin-directory-editor.tsx");
  const store=read("lib/directory-store.ts");
  const route=read("app/api/admin/directory/[id]/route.ts");
  assert.match(owner,/m\.revoked_at IS NULL/);
  assert.match(owner,/await decryptPii\(emailCiphertext/);
  assert.match(page,/getDirectoryPartnerOwnerAdmin/);
  assert.match(editor,/Tento profil spravuje partner/);
  assert.match(editor,/Notion synchronizácia je uzamknutá/);
  assert.match(editor,/disabled=\{reviewSaving \|\| Boolean\(partnerOwner\) \|\| partnerOwnershipUnavailable\}/);
  assert.match(store,/DIRECTORY_PARTNER_MANAGED_REVIEW_LOCK/);
  assert.match(store,/r\.directory_profile_id=directory_profiles\.id/);
  assert.match(route,/DIRECTORY_PARTNER_MANAGED_REVIEW_LOCK/);
  assert.match(route,/status: 409/);
});
