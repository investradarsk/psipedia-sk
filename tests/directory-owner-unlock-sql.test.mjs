import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const source = readFileSync(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
const marker = "export async function completeDirectoryReviewedOwnerUnlock(";
const begin = source.indexOf(marker);
const end = source.indexOf("function fullProfileInput(", begin);
assert.ok(begin >= 0 && end > begin, "production owner unlock function must exist");
const unlock = source.slice(begin, end);

const match = unlock.match(/const released = await input\.database\.prepare\(`([\s\S]*?)`\)\.bind\(now, input\.profileId/);
assert.ok(match, "use the production CAS release SQL");
const releaseSql = match[1];

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE directory_profile_review_state(
      profile_id INTEGER PRIMARY KEY, reviewed_at TEXT, unlock_pending INTEGER NOT NULL,
      unlock_requested_at TEXT, unlock_requested_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT
    );
    CREATE TABLE directory_notion_sync(directory_profile_id INTEGER PRIMARY KEY, notion_page_id TEXT);
    CREATE TABLE partner_resources(id INTEGER PRIMARY KEY, entity_type TEXT, directory_profile_id INTEGER);
    CREATE TABLE partner_memberships(id INTEGER PRIMARY KEY, resource_id INTEGER, revoked_at TEXT);
    CREATE TABLE admin_record_tombstones(kind TEXT, record_id INTEGER);
    INSERT INTO directory_profiles VALUES(1872, 'draft', 'profile-v1');
    INSERT INTO directory_profile_review_state
      VALUES(1872,NULL,1,'request-v1','owner','review-v1','owner');
    INSERT INTO directory_notion_sync VALUES(1872,'notion-1872');
  `);
  const attempt = () => sqlite.prepare(releaseSql).get(
    "finalized-at",1872,"review-v1","profile-v1","notion-1872",
  );
  const pending = () => sqlite.prepare(
    "SELECT unlock_pending FROM directory_profile_review_state WHERE profile_id=1872",
  ).get().unlock_pending;
  return { sqlite, attempt, pending };
}

test("verified owner unlock releases only the exact SQL pending profile", () => {
  const f = fixture();
  try {
    assert.equal(f.pending(), 1);
    assert.equal(f.attempt()?.profile_id, 1872);
    assert.equal(f.pending(), 0);
    assert.equal(f.attempt(), undefined);
  } finally { f.sqlite.close(); }
});

test("concurrent D1 edit leaves pending owner unlock locked", () => {
  const f = fixture();
  try {
    f.sqlite.exec("UPDATE directory_profiles SET updated_at='profile-v2' WHERE id=1872");
    assert.equal(f.attempt(), undefined);
    assert.equal(f.pending(), 1);
  } finally { f.sqlite.close(); }
});

test("partner ownership blocks SQL owner unlock", () => {
  const f = fixture();
  try {
    f.sqlite.exec(`
      INSERT INTO partner_resources VALUES(10,'DIRECTORY_PROFILE',1872);
      INSERT INTO partner_memberships VALUES(20,10,NULL);
    `);
    assert.equal(f.attempt(), undefined);
    assert.equal(f.pending(), 1);
  } finally { f.sqlite.close(); }
});

test("moved Notion mapping or deleted record cannot unlock", () => {
  const f = fixture();
  try {
    f.sqlite.exec("UPDATE directory_notion_sync SET notion_page_id='notion-other' WHERE directory_profile_id=1872");
    assert.equal(f.attempt(), undefined);
    assert.equal(f.pending(), 1);
    f.sqlite.exec("UPDATE directory_notion_sync SET notion_page_id='notion-1872' WHERE directory_profile_id=1872");
    f.sqlite.exec("INSERT INTO admin_record_tombstones VALUES('directory',1872)");
    assert.equal(f.attempt(), undefined);
    assert.equal(f.pending(), 1);
  } finally { f.sqlite.close(); }
});

test("unlock checks Notion identity, echoes full D1 snapshot, then releases", () => {
  const mirror = unlock.indexOf("await syncDirectoryReviewedWithNotion");
  const exportIndex = unlock.indexOf("await writeProfileToNotion");
  const releaseIndex = unlock.indexOf("const released = await input.database.prepare");
  assert.ok(mirror >= 0 && mirror < exportIndex && exportIndex < releaseIndex);
  assert.match(unlock, /ownerUnlock: true/);
  assert.match(unlock, /DIRECTORY_OWNER_UNLOCK_PROFILE_CHANGED/);
  assert.match(unlock, /DIRECTORY_OWNER_UNLOCK_CONCURRENT_CHANGE/);
});
