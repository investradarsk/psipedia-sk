import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migration = readFileSync(new URL("../drizzle/0062_profile_reviews_foundation.sql", import.meta.url), "utf8");
const backfill = migration.match(/-- REVIEWABLE_RESOURCE_BACKFILL_BEGIN([\s\S]*?)-- REVIEWABLE_RESOURCE_BACKFILL_END/)?.[1];
assert.ok(backfill, "resource backfill markers must exist");

function baseDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT 'test'
    );
    CREATE TABLE help_organizations (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE managed_events (id INTEGER PRIMARY KEY);
    CREATE TABLE partner_accounts (id TEXT PRIMARY KEY);
    CREATE TABLE partner_resources (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION','MANAGED_EVENT')),
      directory_profile_id INTEGER REFERENCES directory_profiles(id) ON DELETE RESTRICT,
      help_organization_id INTEGER REFERENCES help_organizations(id) ON DELETE RESTRICT,
      managed_event_id INTEGER REFERENCES managed_events(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (entity_type='DIRECTORY_PROFILE' AND directory_profile_id IS NOT NULL AND help_organization_id IS NULL AND managed_event_id IS NULL) OR
        (entity_type='HELP_ORGANIZATION' AND directory_profile_id IS NULL AND help_organization_id IS NOT NULL AND managed_event_id IS NULL) OR
        (entity_type='MANAGED_EVENT' AND directory_profile_id IS NULL AND help_organization_id IS NULL AND managed_event_id IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX partner_resources_directory_unique ON partner_resources(directory_profile_id) WHERE directory_profile_id IS NOT NULL;
    CREATE UNIQUE INDEX partner_resources_organization_unique ON partner_resources(help_organization_id) WHERE help_organization_id IS NOT NULL;
    CREATE UNIQUE INDEX partner_resources_event_unique ON partner_resources(managed_event_id) WHERE managed_event_id IS NOT NULL;
    CREATE TABLE partner_memberships (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES partner_accounts(id) ON DELETE RESTRICT,
      resource_id TEXT NOT NULL REFERENCES partner_resources(id) ON DELETE RESTRICT,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE moderation_events (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function seedCanonical(db) {
  const at = "2026-09-22T12:00:00.000Z";
  db.prepare("INSERT INTO directory_profiles(id,status,created_at,updated_at,updated_by) VALUES (1,'published',?,?,?)").run(at, at, "seed");
  db.prepare("INSERT INTO directory_profiles(id,status,created_at,updated_at,updated_by) VALUES (2,'draft',?,?,?)").run(at, at, "seed");
  db.prepare("INSERT INTO help_organizations(id,created_at,updated_at) VALUES (10,?,?)").run(at, at);
  db.prepare("INSERT INTO help_organizations(id,created_at,updated_at) VALUES (11,?,?)").run(at, at);
  db.prepare("INSERT INTO partner_resources(id,entity_type,directory_profile_id,created_at,updated_at) VALUES ('existing-directory-resource','DIRECTORY_PROFILE',1,?,?)").run(at, at);
}

test("0062 applies cleanly, preserves existing resource identity and backfills exactly one anchor per canonical profile", () => {
  const db = baseDatabase();
  seedCanonical(db);
  db.exec(migration);

  assert.equal(db.prepare("SELECT id FROM partner_resources WHERE directory_profile_id=1").get().id, "existing-directory-resource");
  assert.equal(db.prepare("SELECT id FROM partner_resources WHERE directory_profile_id=2").get().id, "directory-profile-2");
  assert.equal(db.prepare("SELECT id FROM partner_resources WHERE help_organization_id=10").get().id, "help-organization-10");
  assert.equal(db.prepare("SELECT id FROM partner_resources WHERE help_organization_id=11").get().id, "help-organization-11");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM partner_resources WHERE directory_profile_id IS NOT NULL").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM partner_resources WHERE help_organization_id IS NOT NULL").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM directory_profiles d WHERE NOT EXISTS (SELECT 1 FROM partner_resources r WHERE r.directory_profile_id=d.id)").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM help_organizations o WHERE NOT EXISTS (SELECT 1 FROM partner_resources r WHERE r.help_organization_id=o.id)").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM pragma_table_info('directory_profiles') WHERE name='archived_at'").get().count, 1);
  db.close();
});

test("resource backfill block is idempotent and does not replace legacy resource IDs", () => {
  const db = baseDatabase();
  seedCanonical(db);
  db.exec(migration);
  const before = db.prepare("SELECT id,entity_type,directory_profile_id,help_organization_id FROM partner_resources ORDER BY id").all();
  db.exec(backfill);
  db.exec(backfill);
  const after = db.prepare("SELECT id,entity_type,directory_profile_id,help_organization_id FROM partner_resources ORDER BY id").all();
  assert.deepEqual(after, before);
  assert.equal(db.prepare("SELECT id FROM partner_resources WHERE directory_profile_id=1").get().id, "existing-directory-resource");
  db.close();
});

test("review constraints enforce stable author/resource identity, ratings and dimension uniqueness", () => {
  const db = baseDatabase();
  seedCanonical(db);
  db.prepare("INSERT INTO managed_events(id) VALUES (50)").run();
  db.prepare("INSERT INTO partner_resources(id,entity_type,managed_event_id,created_at,updated_at) VALUES ('event-resource','MANAGED_EVENT',50,?,?)")
    .run("2026-09-22T12:25:00.000Z","2026-09-22T12:25:00.000Z");
  db.exec(migration);
  const at = "2026-09-22T12:30:00.000Z";
  db.prepare("INSERT INTO review_authors(id,email_ciphertext,email_hash,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("author-1","ciphertext-1","hash-1","ACTIVE",at,at,at);
  db.prepare("INSERT INTO review_authors(id,email_ciphertext,email_hash,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("author-2","ciphertext-2","hash-2","ACTIVE",at,at,at);
  db.prepare("INSERT INTO profile_reviews(id,resource_id,author_id,overall_rating,body,status,created_at,updated_at,published_at) VALUES (?,?,?,?,?,'VISIBLE',?,?,?)")
    .run("review-1","existing-directory-resource","author-1",5,"Výborná skúsenosť s profesionálnym prístupom.",at,at,at);

  assert.throws(() => db.prepare("INSERT INTO profile_reviews(id,resource_id,author_id,overall_rating,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("review-duplicate","existing-directory-resource","author-1",4,"Druhá recenzia tej istej identity sa nesmie vytvoriť.",at,at), /UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO profile_reviews(id,resource_id,author_id,overall_rating,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("review-bad-rating","directory-profile-2","author-2",6,"Táto recenzia má úmyselne neplatné hodnotenie.",at,at), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO profile_reviews(id,resource_id,author_id,overall_rating,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("review-event","event-resource","author-2",5,"Podujatie zatiaľ nesmie byť reviewable resource target.",at,at), /not reviewable/);
  assert.throws(() => db.prepare("UPDATE profile_reviews SET resource_id='directory-profile-2' WHERE id='review-1'").run(), /immutable/);

  db.prepare("INSERT INTO profile_review_rating_values(id,review_id,dimension_key,value,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("dim-1","review-1","communication",5,at,at);
  assert.throws(() => db.prepare("INSERT INTO profile_review_rating_values(id,review_id,dimension_key,value,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("dim-2","review-1","communication",4,at,at), /UNIQUE/);

  db.prepare("INSERT INTO profile_review_helpful_votes(id,review_id,author_id,created_at) VALUES (?,?,?,?)")
    .run("vote-1","review-1","author-2",at);
  assert.throws(() => db.prepare("INSERT INTO profile_review_helpful_votes(id,review_id,author_id,created_at) VALUES (?,?,?,?)")
    .run("vote-2","review-1","author-2",at), /UNIQUE/);
  db.close();
});

test("provider reply and report foundations enforce constrained foreign keys and duplicate-report protection", () => {
  const db = baseDatabase();
  seedCanonical(db);
  db.exec(migration);
  const at = "2026-09-22T12:45:00.000Z";
  db.prepare("INSERT INTO partner_accounts(id) VALUES ('partner-1')").run();
  db.prepare("INSERT INTO partner_memberships(id,account_id,resource_id,role,created_at,created_by,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("membership-1","partner-1","existing-directory-resource","OWNER",at,"test",at);
  db.prepare("INSERT INTO review_authors(id,email_ciphertext,email_hash,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("author-1","ciphertext","hash","ACTIVE",at,at,at);
  db.prepare("INSERT INTO profile_reviews(id,resource_id,author_id,overall_rating,body,status,created_at,updated_at,published_at) VALUES (?,?,?,?,?,'VISIBLE',?,?,?)")
    .run("review-1","existing-directory-resource","author-1",4,"Dobrá skúsenosť, odpoveď poskytovateľa je vítaná.",at,at,at);
  db.prepare("INSERT INTO profile_review_provider_replies(id,review_id,partner_account_id,partner_membership_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("reply-1","review-1","partner-1","membership-1","Ďakujeme za spätnú väzbu.",at,at);
  assert.throws(() => db.prepare("INSERT INTO profile_review_provider_replies(id,review_id,partner_account_id,partner_membership_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("reply-2","review-1","partner-1","membership-1","Druhá odpoveď.",at,at), /UNIQUE/);

  db.prepare("INSERT INTO profile_review_reports(id,review_id,target_type,reporter_type,review_author_id,reason_code,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'OPEN',?,?)")
    .run("report-1","review-1","REVIEW","REVIEW_AUTHOR","author-1","OTHER",at,at);
  assert.throws(() => db.prepare("INSERT INTO profile_review_reports(id,review_id,target_type,reporter_type,review_author_id,reason_code,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'OPEN',?,?)")
    .run("report-2","review-1","REVIEW","REVIEW_AUTHOR","author-1","OTHER",at,at), /UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO profile_review_reports(id,review_id,provider_reply_id,target_type,reporter_type,review_author_id,reason_code,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'OPEN',?,?)")
    .run("report-bad-target","review-1",null,"PROVIDER_REPLY","REVIEW_AUTHOR","author-1","OTHER",at,at), /CHECK/);
  db.close();
});

test("persistent resource anchor blocks canonical hard delete while archive keeps the anchor intact", () => {
  const db = baseDatabase();
  seedCanonical(db);
  db.exec(migration);
  assert.throws(() => db.prepare("DELETE FROM directory_profiles WHERE id=2").run(), /FOREIGN KEY/);
  db.prepare("UPDATE directory_profiles SET status='archived',published_at=NULL,archived_at=?,updated_at=?,updated_by=? WHERE id=2")
    .run("2026-09-22T13:00:00.000Z","2026-09-22T13:00:00.000Z","admin:test");
  const profile = db.prepare("SELECT status,archived_at FROM directory_profiles WHERE id=2").get();
  assert.equal(profile.status, "archived");
  assert.ok(profile.archived_at);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM partner_resources WHERE directory_profile_id=2").get().count, 1);
  db.close();
});

test("moderation event foundation is append-only after 0062", () => {
  const db = baseDatabase();
  seedCanonical(db);
  db.exec(migration);
  db.prepare("INSERT INTO moderation_events(id,resource_type,created_at) VALUES ('event-1','PROFILE_REVIEW','2026-09-22T13:00:00.000Z')").run();
  assert.throws(() => db.prepare("UPDATE moderation_events SET resource_type='OTHER' WHERE id='event-1'").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM moderation_events WHERE id='event-1'").run(), /append-only/);
  db.close();
});
