import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

function createHarness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE profile_reviews (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      overall_rating INTEGER NOT NULL,
      body TEXT NOT NULL,
      published_at TEXT,
      deleted_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE moderation_events (
      id TEXT PRIMARY KEY,
      submission_id TEXT,
      resource_type TEXT NOT NULL,
      subject_id TEXT,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_ref TEXT,
      from_status TEXT,
      to_status TEXT,
      reason_code TEXT,
      changed_fields_json TEXT NOT NULL,
      request_id TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const makeStatement = (sql, params = []) => ({
    sql,
    params,
    bind(...values) { return makeStatement(sql, values); },
  });

  const database = {
    prepare(sql) { return makeStatement(sql); },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(({ sql, params }) => {
          const statement = sqlite.prepare(sql);
          if (/\bRETURNING\b/i.test(sql)) {
            return { success: true, results: statement.all(...params), meta: { changes: 0 } };
          }
          const result = statement.run(...params);
          return { success: true, results: [], meta: { changes: Number(result.changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, database };
}

function seed(sqlite, {
  id = "review-1",
  status = "PENDING_REVIEW",
  publishedAt = null,
  rating = 4,
  body = "Canonical reviewer text must never be edited by moderation.",
} = {}) {
  sqlite.prepare(`
    INSERT INTO profile_reviews (id,status,overall_rating,body,published_at,deleted_at,updated_at)
    VALUES (?,?,?,?,?,NULL,'2026-09-23T10:00:00.000Z')
  `).run(id, status, rating, body, publishedAt);
}

function input(overrides = {}) {
  return {
    id: "review-1",
    expectedStatus: "PENDING_REVIEW",
    action: "APPROVE",
    actorRef: "admin:hashed-actor",
    reasonCode: null,
    requestId: "request-1",
    eventId: "event-1",
    changedFieldsJson: '{"fields":["status","updated_at","published_at"],"moderatorNote":null}',
    now: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

function review(sqlite, id = "review-1") {
  return sqlite.prepare(`
    SELECT status,overall_rating AS rating,body,published_at AS publishedAt,
      deleted_at AS deletedAt,updated_at AS updatedAt
    FROM profile_reviews WHERE id=?
  `).get(id);
}

function events(sqlite) {
  return sqlite.prepare(`
    SELECT id,action,actor_type AS actorType,actor_ref AS actorRef,
      from_status AS fromStatus,to_status AS toStatus,reason_code AS reasonCode
    FROM moderation_events ORDER BY created_at,id
  `).all();
}

test("admin action mapping stays inside the canonical profile review transition matrix", async () => {
  const {
    assertProfileReviewAdminAction,
    profileReviewActionTarget,
  } = await importTs("lib/profile-review-admin-transition.ts");

  assert.equal(profileReviewActionTarget("APPROVE"), "VISIBLE");
  assert.equal(profileReviewActionTarget("RESTORE"), "VISIBLE");
  assert.equal(profileReviewActionTarget("REJECT"), "REJECTED");
  assert.equal(profileReviewActionTarget("HIDE"), "HIDDEN");
  assert.equal(profileReviewActionTarget("REMOVE"), "REMOVED");

  assert.equal(assertProfileReviewAdminAction({
    action: "APPROVE", expectedStatus: "PENDING_REVIEW", reasonCode: null,
  }), "VISIBLE");
  assert.equal(assertProfileReviewAdminAction({
    action: "HIDE", expectedStatus: "VISIBLE", reasonCode: "SPAM",
  }), "HIDDEN");
  assert.equal(assertProfileReviewAdminAction({
    action: "RESTORE", expectedStatus: "HIDDEN", reasonCode: null,
  }), "VISIBLE");

  assert.throws(() => assertProfileReviewAdminAction({
    action: "HIDE", expectedStatus: "PENDING_REVIEW", reasonCode: "SPAM",
  }), /Invalid profile review transition/);
  assert.throws(() => assertProfileReviewAdminAction({
    action: "REJECT", expectedStatus: "PENDING_REVIEW", reasonCode: null,
  }), /Moderation reason is required/);
  assert.throws(() => assertProfileReviewAdminAction({
    action: "REMOVE", expectedStatus: "VISIBLE", reasonCode: null,
  }), /Moderation reason is required/);
});

test("approve atomically publishes review and appends one privacy-safe audit event", async () => {
  const { applyAtomicProfileReviewModeration } = await importTs("lib/profile-review-admin-transition.ts");
  const { sqlite, database } = createHarness();
  seed(sqlite);

  await applyAtomicProfileReviewModeration(database, input());

  const row = review(sqlite);
  assert.equal(row.status, "VISIBLE");
  assert.equal(row.publishedAt, "2026-09-23T12:00:00.000Z");
  assert.equal(row.rating, 4);
  assert.equal(row.body, "Canonical reviewer text must never be edited by moderation.");
  assert.deepEqual(events(sqlite), [{
    id: "event-1",
    action: "PROFILE_REVIEW_APPROVED",
    actorType: "ADMIN",
    actorRef: "admin:hashed-actor",
    fromStatus: "PENDING_REVIEW",
    toStatus: "VISIBLE",
    reasonCode: null,
  }]);
  sqlite.close();
});

test("hide and restore preserve the original publication timestamp", async () => {
  const { applyAtomicProfileReviewModeration } = await importTs("lib/profile-review-admin-transition.ts");
  const { sqlite, database } = createHarness();
  const originalPublishedAt = "2026-09-20T09:00:00.000Z";
  seed(sqlite, { status: "VISIBLE", publishedAt: originalPublishedAt });

  await applyAtomicProfileReviewModeration(database, input({
    expectedStatus: "VISIBLE",
    action: "HIDE",
    reasonCode: "PRIVACY",
    eventId: "event-hide",
    now: "2026-09-23T12:10:00.000Z",
  }));
  assert.equal(review(sqlite).status, "HIDDEN");
  assert.equal(review(sqlite).publishedAt, originalPublishedAt);

  await applyAtomicProfileReviewModeration(database, input({
    expectedStatus: "HIDDEN",
    action: "RESTORE",
    eventId: "event-restore",
    now: "2026-09-23T12:20:00.000Z",
  }));
  assert.equal(review(sqlite).status, "VISIBLE");
  assert.equal(review(sqlite).publishedAt, originalPublishedAt);
  assert.equal(events(sqlite).length, 2);
  sqlite.close();
});

test("remove sets deletion timestamp without changing reviewer-authored rating or body", async () => {
  const { applyAtomicProfileReviewModeration } = await importTs("lib/profile-review-admin-transition.ts");
  const { sqlite, database } = createHarness();
  seed(sqlite, { status: "VISIBLE", publishedAt: "2026-09-20T09:00:00.000Z", rating: 2, body: "Reviewer-authored content stays immutable through moderation." });

  await applyAtomicProfileReviewModeration(database, input({
    expectedStatus: "VISIBLE",
    action: "REMOVE",
    reasonCode: "ABUSE",
    eventId: "event-remove",
    now: "2026-09-23T12:30:00.000Z",
  }));

  const row = review(sqlite);
  assert.equal(row.status, "REMOVED");
  assert.equal(row.deletedAt, "2026-09-23T12:30:00.000Z");
  assert.equal(row.rating, 2);
  assert.equal(row.body, "Reviewer-authored content stays immutable through moderation.");
  sqlite.close();
});

test("stale expected state is a deterministic conflict with no audit write", async () => {
  const {
    applyAtomicProfileReviewModeration,
    ProfileReviewModerationConflictError,
  } = await importTs("lib/profile-review-admin-transition.ts");
  const { sqlite, database } = createHarness();
  seed(sqlite);
  sqlite.prepare("UPDATE profile_reviews SET status='VISIBLE' WHERE id='review-1'").run();

  await assert.rejects(
    () => applyAtomicProfileReviewModeration(database, input({
      action: "REJECT",
      reasonCode: "SPAM",
    })),
    ProfileReviewModerationConflictError,
  );
  assert.equal(review(sqlite).status, "VISIBLE");
  assert.equal(events(sqlite).length, 0);
  sqlite.close();
});

test("D1 batch rollback prevents a status change when the audit insert fails", async () => {
  const { applyAtomicProfileReviewModeration } = await importTs("lib/profile-review-admin-transition.ts");
  const { sqlite, database } = createHarness();
  seed(sqlite);
  sqlite.prepare(`
    INSERT INTO moderation_events (
      id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,
      from_status,to_status,reason_code,changed_fields_json,request_id,created_at
    ) VALUES ('event-duplicate',NULL,'PROFILE_REVIEW','other','TEST','ADMIN','admin:test',
      NULL,NULL,NULL,'[]',NULL,'2026-09-23T11:00:00.000Z')
  `).run();

  await assert.rejects(() => applyAtomicProfileReviewModeration(database, input({
    eventId: "event-duplicate",
  })));

  assert.equal(review(sqlite).status, "PENDING_REVIEW");
  assert.equal(review(sqlite).publishedAt, null);
  assert.equal(events(sqlite).length, 1);
  sqlite.close();
});

test("public aggregate eligibility changes only with VISIBLE status", async () => {
  const { profileReviewCountsTowardAggregate } = await importTs("lib/profile-review-domain.ts");
  assert.equal(profileReviewCountsTowardAggregate("PENDING_REVIEW"), false);
  assert.equal(profileReviewCountsTowardAggregate("VISIBLE"), true);
  assert.equal(profileReviewCountsTowardAggregate("HIDDEN"), false);
  assert.equal(profileReviewCountsTowardAggregate("REJECTED"), false);
  assert.equal(profileReviewCountsTowardAggregate("REMOVED"), false);
});

test("admin review search and detail source never expose reviewer email material", () => {
  const source = readFileSync(new URL("../lib/profile-review-admin.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /email_ciphertext|email_hash|emailCiphertext|emailHash/);
  assert.doesNotMatch(source, /author\.email/i);
  assert.match(source, /review\.body/);
  assert.match(source, /author\.display_name/);
  assert.match(source, /COALESCE\(directory\.name,organization\.name/);
});

test("admin mutation API requires server-derived audit identity and expected state", () => {
  const source = readFileSync(new URL("../app/api/admin/profile-reviews/[id]/route.ts", import.meta.url), "utf8");
  assert.match(source, /requireAdminMutation\(request\)/);
  assert.match(source, /adminAuditActorRef\(auth\.user\.email\)/);
  assert.match(source, /expectedStatus: payload\.expectedStatus/);
  assert.doesNotMatch(source, /actorRef: payload/);
});
