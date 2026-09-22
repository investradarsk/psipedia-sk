import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8");
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

function resourceHarness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(`
    CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE help_organizations (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE managed_events (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
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
  `);
  const statement = (sql, params=[]) => ({
    bind(...values) { return statement(sql, values); },
    async first() { return sqlite.prepare(sql).get(...params) ?? null; },
    async run() {
      const result = sqlite.prepare(sql).run(...params);
      return { meta: { changes: Number(result.changes) }, changes: Number(result.changes) };
    },
  });
  return {
    sqlite,
    database: { prepare(sql) { return statement(sql); } },
  };
}

test("review domain validates status, rating, service month and aggregate eligibility", async () => {
  const domain = await importTs("lib/profile-review-domain.ts");
  assert.deepEqual([...domain.profileReviewStatuses], [
    "PENDING_REVIEW", "VISIBLE", "HIDDEN", "REJECTED", "AUTHOR_DELETED", "REMOVED",
  ]);
  assert.equal(domain.normalizeOverallRating(1), 1);
  assert.equal(domain.normalizeOverallRating(5), 5);
  assert.throws(() => domain.normalizeOverallRating(0), /1 to 5/);
  assert.throws(() => domain.normalizeOverallRating(6), /1 to 5/);
  assert.throws(() => domain.normalizeOverallRating(4.5), /1 to 5/);
  assert.equal(domain.profileReviewCountsTowardAggregate("VISIBLE"), true);
  for (const status of ["PENDING_REVIEW","HIDDEN","REJECTED","AUTHOR_DELETED","REMOVED"]) {
    assert.equal(domain.profileReviewCountsTowardAggregate(status), false, status);
  }
  assert.equal(domain.canTransitionProfileReview("PENDING_REVIEW", "VISIBLE"), true);
  assert.equal(domain.canTransitionProfileReview("VISIBLE", "HIDDEN"), true);
  assert.equal(domain.canTransitionProfileReview("HIDDEN", "VISIBLE"), true);
  assert.equal(domain.canTransitionProfileReview("REMOVED", "PENDING_REVIEW"), true);
  assert.equal(domain.canTransitionProfileReview("VISIBLE", "REJECTED"), false);
  assert.throws(() => domain.assertProfileReviewTransition("VISIBLE", "REJECTED"), /Invalid profile review transition/);
  assert.equal(domain.normalizeServiceMonth("2026-09"), "2026-09");
  assert.equal(domain.normalizeServiceMonth(""), null);
  assert.throws(() => domain.normalizeServiceMonth("2026-13"), /YYYY-MM/);
  assert.equal(domain.assertReviewableResourceType("DIRECTORY_PROFILE"), "DIRECTORY_PROFILE");
  assert.equal(domain.assertReviewableResourceType("HELP_ORGANIZATION"), "HELP_ORGANIZATION");
  assert.throws(() => domain.assertReviewableResourceType("MANAGED_EVENT"), /not reviewable/);
});

test("rating dimensions are versioned, config driven and reject unknown or duplicate keys", async () => {
  const domain = await importTs("lib/profile-review-domain.ts");
  const vet = domain.reviewRatingConfig({ entityType: "DIRECTORY_PROFILE", category: "veterinari" });
  assert.equal(vet.schemaVersion, 1);
  assert.deepEqual(vet.dimensions.map((item) => item.key), ["approach","communication","care_quality"]);
  const hotel = domain.reviewRatingConfig({ entityType: "DIRECTORY_PROFILE", category: "hotely-a-opatrovanie" });
  assert.deepEqual(hotel.dimensions.map((item) => item.key), ["care","communication","environment"]);
  const trainer = domain.reviewRatingConfig({ entityType: "DIRECTORY_PROFILE", category: "treneri" });
  assert.deepEqual(trainer.dimensions.map((item) => item.key), ["approach","communication","training_quality"]);
  const values = domain.normalizeReviewDimensionValues(vet, [
    { key: "approach", value: 5 },
    { key: "communication", value: 4 },
  ]);
  assert.deepEqual(values, [{ key: "approach", value: 5 }, { key: "communication", value: 4 }]);
  assert.throws(() => domain.normalizeReviewDimensionValues(vet, [{ key: "environment", value: 5 }]), /Unsupported/);
  assert.throws(() => domain.normalizeReviewDimensionValues(vet, [
    { key: "approach", value: 5 }, { key: "approach", value: 4 },
  ]), /Duplicate/);
});

test("canonical resource ensure preserves existing IDs and is idempotent for missing anchors", async () => {
  const resource = await importTs("lib/canonical-resource.ts");
  const { sqlite, database } = resourceHarness();
  const at = "2026-09-22T12:00:00.000Z";
  sqlite.prepare("INSERT INTO directory_profiles VALUES (?,?,?)").run(1, at, at);
  sqlite.prepare("INSERT INTO directory_profiles VALUES (?,?,?)").run(2, at, at);
  sqlite.prepare("INSERT INTO help_organizations VALUES (?,?,?)").run(10, at, at);
  sqlite.prepare("INSERT INTO partner_resources(id,entity_type,directory_profile_id,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("legacy-random-uuid", "DIRECTORY_PROFILE", 1, at, at);

  const existing = await resource.ensureResourceForDirectoryProfile(1, database, new Date(at));
  assert.equal(existing.id, "legacy-random-uuid");

  const first = await resource.ensureResourceForDirectoryProfile(2, database, new Date(at));
  const second = await resource.ensureResourceForDirectoryProfile(2, database, new Date(at));
  assert.equal(first.id, "directory-profile-2");
  assert.equal(second.id, first.id);

  const org = await resource.ensureResourceForHelpOrganization(10, database, new Date(at));
  assert.equal(org.id, "help-organization-10");
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM partner_resources").get().count, 3);

  const bulk1 = await resource.ensureReviewableResourceAnchors(database, new Date(at));
  const bulk2 = await resource.ensureReviewableResourceAnchors(database, new Date(at));
  assert.deepEqual(bulk1, { directoryInserted: 0, organizationInserted: 0 });
  assert.deepEqual(bulk2, { directoryInserted: 0, organizationInserted: 0 });
  sqlite.close();
});

test("creation paths use the shared canonical resource helper and directory hard delete is removed", async () => {
  const directoryStore = await read("lib/directory-store.ts");
  const orgStore = await read("lib/help-organization-admin-write.ts");
  const partnerAdmin = await read("lib/partner-admin-store.ts");
  const automation = await read("lib/data-automation-apply.ts");
  const importRoute = await read("app/api/admin/import/route.ts");
  const directoryRoute = await read("app/api/admin/directory/[id]/route.ts");

  assert.match(directoryStore, /ensureResourceForDirectoryProfile/);
  assert.match(directoryStore, /archiveManagedDirectoryProfile/);
  assert.match(directoryStore, /restoreManagedDirectoryProfile/);
  assert.doesNotMatch(directoryStore, /DELETE FROM directory_profiles/);
  assert.match(orgStore, /ensureResourceForHelpOrganization/);
  assert.match(partnerAdmin, /ensureCanonicalResource/);
  assert.doesNotMatch(partnerAdmin, /INSERT INTO partner_resources/);
  assert.match(automation, /ensureAutomationResourceAnchor/);
  assert.match(importRoute, /ensureReviewableResourceAnchors/);
  assert.match(directoryRoute, /archiveManagedDirectoryProfile/);
  assert.match(directoryRoute, /action !== "restore"/);
});

test("directory runtime stays compatible with production before migration 0062 is applied", async () => {
  const directoryStore = await read("lib/directory-store.ts");
  assert.match(directoryStore, /published_at, NULL AS archived_at, created_by, updated_by/);
  assert.doesNotMatch(directoryStore, /SET status='archived',[^\n]*archived_at=/);
  assert.doesNotMatch(directoryStore, /SET status='draft',[^\n]*archived_at=/);
});

test("review foundation contains no public UI, aggregate cache or privacy-hostile request metadata", async () => {
  const migration = await read("drizzle/0062_profile_reviews_foundation.sql");
  const schema = await read("db/review-schema.ts");
  const combined = migration + "\n" + schema;
  for (const table of [
    "review_authors","review_auth_notification_outbox","profile_reviews",
    "profile_review_rating_values","profile_review_provider_replies",
    "profile_review_helpful_votes","profile_review_reports",
  ]) assert.match(migration, new RegExp("CREATE TABLE .*" + table));
  assert.doesNotMatch(combined, /review_aggregates|profile_review_revisions|profile_review_verifications/);
  assert.doesNotMatch(combined, /raw_ip|ip_address|user_agent|turnstile_token|device_fingerprint/i);
  assert.match(migration, /moderation_events_no_update/);
  assert.match(migration, /moderation_events_no_delete/);
  const moderation = await read("lib/moderation-store.ts");
  assert.match(moderation, /"PROFILE_REVIEW"/);
});
