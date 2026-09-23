import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE partner_resources (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      directory_profile_id INTEGER,
      help_organization_id INTEGER,
      managed_event_id INTEGER
    );
    CREATE TABLE review_authors (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      email_ciphertext TEXT,
      email_hash TEXT
    );
    CREATE TABLE profile_reviews (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      overall_rating INTEGER NOT NULL,
      body TEXT NOT NULL,
      service_month TEXT,
      service_type_key TEXT,
      rating_schema_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      published_at TEXT
    );
    CREATE TABLE profile_review_rating_values (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      dimension_key TEXT NOT NULL,
      value INTEGER NOT NULL
    );
    CREATE TABLE profile_review_provider_replies (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE profile_review_helpful_votes (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  sqlite.exec(`
    INSERT INTO partner_resources VALUES
      ('directory-profile-1','DIRECTORY_PROFILE',1,NULL,NULL),
      ('help-organization-2','HELP_ORGANIZATION',NULL,2,NULL),
      ('managed-event-3','MANAGED_EVENT',NULL,NULL,3),
      ('directory-profile-4','DIRECTORY_PROFILE',4,NULL,NULL);

    INSERT INTO review_authors VALUES
      ('author-1','Jana','cipher-1','hash-1'),
      ('author-2',NULL,'cipher-2','hash-2'),
      ('author-3','Neverejný autor','cipher-3','hash-3');

    INSERT INTO profile_reviews VALUES
      ('review-1','directory-profile-1','author-1',5,'Výborná skúsenosť s profesionálnym prístupom.','2026-08','consultation',1,'VISIBLE','2026-09-01T10:00:00.000Z','2026-09-02T10:00:00.000Z'),
      ('review-2','directory-profile-1','author-2',4,'Text ostáva bezpečný aj keď obsahuje <script>alert(1)</script> a dlhší komentár.','2026-09','internal_raw_key',1,'VISIBLE','2026-09-03T10:00:00.000Z',NULL),
      ('review-hidden','directory-profile-1','author-3',1,'Skrytá recenzia sa nesmie zobraziť verejne.',NULL,NULL,1,'HIDDEN','2026-09-04T10:00:00.000Z',NULL),
      ('review-pending','directory-profile-1','author-3',1,'Čakajúca recenzia sa nesmie zobraziť verejne.',NULL,NULL,1,'PENDING_REVIEW','2026-09-05T10:00:00.000Z',NULL),
      ('review-rejected','directory-profile-1','author-3',1,'Zamietnutá recenzia sa nesmie zobraziť verejne.',NULL,NULL,1,'REJECTED','2026-09-06T10:00:00.000Z',NULL),
      ('review-deleted','directory-profile-1','author-3',1,'Autorsky zmazaná recenzia sa nesmie zobraziť.',NULL,NULL,1,'AUTHOR_DELETED','2026-09-07T10:00:00.000Z',NULL),
      ('review-removed','directory-profile-1','author-3',1,'Odstránená recenzia sa nesmie zobraziť verejne.',NULL,NULL,1,'REMOVED','2026-09-08T10:00:00.000Z',NULL),
      ('review-org','help-organization-2','author-1',3,'Organizačná recenzia používa rovnaký verejný engine.',NULL,NULL,1,'VISIBLE','2026-09-09T10:00:00.000Z','2026-09-09T11:00:00.000Z');

    INSERT INTO profile_review_rating_values VALUES
      ('dim-1','review-1','approach',5),
      ('dim-2','review-1','communication',4),
      ('dim-3','review-2','approach',4),
      ('dim-4','review-2','communication',4),
      ('dim-hidden','review-hidden','approach',1),
      ('dim-org-1','review-org','communication',3),
      ('dim-org-2','review-org','service_quality',5);

    INSERT INTO profile_review_provider_replies VALUES
      ('reply-visible','review-1','Ďakujeme za spätnú väzbu.','VISIBLE','2026-09-02T12:00:00.000Z'),
      ('reply-hidden','review-2','Táto odpoveď je skrytá.','HIDDEN','2026-09-03T12:00:00.000Z');

    INSERT INTO profile_review_helpful_votes VALUES
      ('vote-1','review-1','author-2','2026-09-10T10:00:00.000Z'),
      ('vote-2','review-1','author-3','2026-09-10T11:00:00.000Z');
  `);

  let queryCount = 0;
  const statement = (sql, params = []) => ({
    bind(...values) { return statement(sql, values); },
    async first() { return sqlite.prepare(sql).get(...params) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...params) }; },
  });
  const database = {
    prepare(sql) {
      queryCount += 1;
      return statement(sql);
    },
  };
  return { sqlite, database, queries: () => queryCount };
}

test("public directory review read is VISIBLE-only, aggregated and bounded without N+1", async () => {
  const reviewRead = await importTs("lib/profile-review-read.ts");
  const { sqlite, database, queries } = fixture();

  const data = await reviewRead.getPublicProfileReviewData(database, {
    entityType: "DIRECTORY_PROFILE",
    canonicalId: 1,
    category: "veterinari",
  });

  assert.equal(data.resourceId, "directory-profile-1");
  assert.equal(data.summary.count, 2);
  assert.equal(data.summary.average, 4.5);
  assert.deepEqual({ ...data.summary.distribution }, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
  assert.deepEqual(data.summary.dimensions, [
    { key: "approach", label: "Prístup", average: 4.5 },
    { key: "communication", label: "Komunikácia", average: 4 },
  ]);
  assert.equal(data.reviews.length, 2);
  assert.deepEqual(data.reviews.map((item) => item.id), ["review-2", "review-1"]);
  assert.equal(data.reviews[0].displayName, "Používateľ Psipedia.sk");
  assert.equal(data.reviews[0].providerReply, null);
  assert.equal(data.reviews[0].serviceTypeLabel, null);
  assert.match(data.reviews[0].body, /<script>alert\(1\)<\/script>/);
  assert.equal("email" in data.reviews[0], false);
  assert.equal("authorId" in data.reviews[0], false);
  assert.equal("riskFlags" in data.reviews[0], false);
  assert.equal(data.reviews[1].providerReply?.body, "Ďakujeme za spätnú väzbu.");
  assert.equal(data.reviews[1].helpfulCount, 2);
  assert.equal(queries(), 5, "a review page must use a fixed-size batched query model");
  sqlite.close();
});

test("public review pagination is newest-first and preserves visible provider reply data", async () => {
  const reviewRead = await importTs("lib/profile-review-read.ts");
  const { sqlite, database } = fixture();

  const page2 = await reviewRead.getPublicProfileReviewData(database, {
    entityType: "DIRECTORY_PROFILE",
    canonicalId: 1,
    category: "veterinari",
  }, { page: 2, pageSize: 1 });

  assert.deepEqual(page2.pagination, { page: 2, pageSize: 1, total: 2, totalPages: 2 });
  assert.equal(page2.reviews[0].id, "review-1");
  assert.equal(page2.reviews[0].serviceMonth, "2026-08");
  assert.deepEqual(page2.reviews[0].dimensions, [
    { key: "approach", label: "Prístup", value: 5 },
    { key: "communication", label: "Komunikácia", value: 4 },
  ]);
  assert.equal(page2.reviews[0].providerReply?.body, "Ďakujeme za spätnú väzbu.");
  sqlite.close();
});

test("organization target reuses the same engine and generic configured dimension labels", async () => {
  const reviewRead = await importTs("lib/profile-review-read.ts");
  const { sqlite, database } = fixture();

  const data = await reviewRead.getPublicProfileReviewData(database, {
    entityType: "HELP_ORGANIZATION",
    canonicalId: 2,
  });
  assert.equal(data.summary.count, 1);
  assert.equal(data.summary.average, 3);
  assert.deepEqual(data.summary.dimensions, [
    { key: "communication", label: "Komunikácia", average: 3 },
    { key: "service_quality", label: "Kvalita služby", average: 5 },
  ]);
  assert.equal(data.reviews[0].id, "review-org");
  sqlite.close();
});

test("zero state has no fake aggregate and managed events are explicitly rejected", async () => {
  const reviewRead = await importTs("lib/profile-review-read.ts");
  const { sqlite, database } = fixture();

  const empty = await reviewRead.getPublicProfileReviewData(database, {
    entityType: "DIRECTORY_PROFILE",
    canonicalId: 4,
    category: "salony-a-sluzby",
  });
  assert.equal(empty.summary.count, 0);
  assert.equal(empty.summary.average, null);
  assert.deepEqual({ ...empty.summary.distribution }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  assert.deepEqual(empty.reviews, []);
  assert.equal(empty.pagination.totalPages, 0);

  await assert.rejects(
    () => reviewRead.getPublicProfileReviewData(database, {
      entityType: "MANAGED_EVENT",
      canonicalId: 3,
    }),
    /not reviewable/i,
  );
  sqlite.close();
});

test("public display helpers round once and never derive identity from email", async () => {
  const reviewRead = await importTs("lib/profile-review-read.ts");
  assert.equal(reviewRead.roundPublicRating(4.76), 4.8);
  assert.equal(reviewRead.roundPublicRating(4.74), 4.7);
  assert.equal(reviewRead.roundPublicRating(null), null);
  assert.equal(reviewRead.safePublicReviewDisplayName("  Jana Nováková  "), "Jana Nováková");
  assert.equal(reviewRead.safePublicReviewDisplayName(""), "Používateľ Psipedia.sk");
  assert.equal(reviewRead.safePublicServiceMonth("2026-09"), "2026-09");
  assert.equal(reviewRead.safePublicServiceMonth("2026-13"), null);
  assert.equal(reviewRead.publicReviewServiceTypeLabel("raw-private-key"), null);
});
