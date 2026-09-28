import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

function key32(seed = 7) {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, category TEXT NOT NULL,
      status TEXT NOT NULL, archived_at TEXT
    );
    CREATE TABLE help_organizations (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, status TEXT NOT NULL,
      published_at TEXT, archived_at TEXT
    );
    CREATE TABLE managed_events (id INTEGER PRIMARY KEY, title TEXT);
    CREATE TABLE partner_resources (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL,
      directory_profile_id INTEGER REFERENCES directory_profiles(id),
      help_organization_id INTEGER REFERENCES help_organizations(id),
      managed_event_id INTEGER REFERENCES managed_events(id)
    );
    CREATE TABLE review_authors (
      id TEXT PRIMARY KEY, email_ciphertext TEXT NOT NULL, email_hash TEXT NOT NULL UNIQUE,
      display_name TEXT, status TEXT NOT NULL, email_verified_at TEXT, deactivated_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE resource_management_sessions (
      id TEXT PRIMARY KEY, resource_type TEXT NOT NULL, subject_id TEXT NOT NULL,
      session_hash TEXT NOT NULL UNIQUE, permissions_json TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, last_used_at TEXT
    );
    CREATE TABLE profile_reviews (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL REFERENCES partner_resources(id),
      author_id TEXT NOT NULL REFERENCES review_authors(id),
      overall_rating INTEGER NOT NULL CHECK(overall_rating BETWEEN 1 AND 5),
      body TEXT NOT NULL CHECK(length(body) BETWEEN 20 AND 5000),
      service_month TEXT,
      service_type_key TEXT,
      rating_schema_version INTEGER NOT NULL CHECK(rating_schema_version >= 1),
      status TEXT NOT NULL CHECK(status IN ('PENDING_REVIEW','VISIBLE','HIDDEN','REJECTED','AUTHOR_DELETED','REMOVED')),
      risk_flags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, deleted_at TEXT,
      UNIQUE(resource_id, author_id)
    );
    CREATE TABLE profile_review_rating_values (
      id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES profile_reviews(id),
      dimension_key TEXT NOT NULL, value INTEGER NOT NULL CHECK(value BETWEEN 1 AND 5),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(review_id, dimension_key)
    );
    CREATE TABLE profile_review_provider_replies (
      id TEXT PRIMARY KEY, review_id TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE profile_review_helpful_votes (
      id TEXT PRIMARY KEY, review_id TEXT NOT NULL, author_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE moderation_events (
      id TEXT PRIMARY KEY, submission_id TEXT, resource_type TEXT NOT NULL, subject_id TEXT,
      action TEXT NOT NULL, actor_type TEXT NOT NULL, actor_ref TEXT, from_status TEXT,
      to_status TEXT, reason_code TEXT, changed_fields_json TEXT NOT NULL DEFAULT '[]',
      request_id TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE security_rate_limits (
      bucket_key TEXT PRIMARY KEY, window_started_at TEXT NOT NULL, count INTEGER NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE TABLE turnstile_token_uses (
      token_hash TEXT PRIMARY KEY, action TEXT NOT NULL, hostname TEXT NOT NULL,
      expires_at TEXT NOT NULL, used_at TEXT NOT NULL
    );
  `);

  function execute(sql, params, mode) {
    const prepared = sqlite.prepare(sql);
    if (mode === "first") return prepared.get(...params) ?? null;
    if (mode === "all") return { results: prepared.all(...params) };
    const result = prepared.run(...params);
    return { success: true, meta: { changes: Number(result.changes ?? 0) }, results: [] };
  }

  function statement(sql, params = []) {
    return {
      sql, params,
      bind(...values) { return statement(sql, values); },
      async first() { return execute(sql, params, "first"); },
      async all() { return execute(sql, params, "all"); },
      async run() { return execute(sql, params, "run"); },
    };
  }

  const database = {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((item) => execute(item.sql, item.params, "run"));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };

  sqlite.prepare("INSERT INTO directory_profiles VALUES (1,'Veterina E2E','veterina-e2e','veterinari','published',NULL)").run();
  sqlite.prepare("INSERT INTO directory_profiles VALUES (2,'Draft E2E','draft-e2e','veterinari','draft',NULL)").run();
  sqlite.prepare("INSERT INTO help_organizations VALUES (11,'Útulok E2E','utulok-e2e','PUBLISHED','2026-09-01T00:00:00.000Z',NULL)").run();
  sqlite.prepare("INSERT INTO managed_events VALUES (21,'Event E2E')").run();
  sqlite.prepare("INSERT INTO partner_resources VALUES ('opaque.directory.1','DIRECTORY_PROFILE',1,NULL,NULL)").run();
  sqlite.prepare("INSERT INTO partner_resources VALUES ('opaque.directory.2','DIRECTORY_PROFILE',2,NULL,NULL)").run();
  sqlite.prepare("INSERT INTO partner_resources VALUES ('opaque.org.11','HELP_ORGANIZATION',NULL,11,NULL)").run();
  sqlite.prepare("INSERT INTO partner_resources VALUES ('opaque.event.21','MANAGED_EVENT',NULL,NULL,21)").run();
  sqlite.prepare("INSERT INTO review_authors VALUES ('author-1','cipher','hash-1','Reviewer','ACTIVE','2026-09-01T00:00:00.000Z',NULL,'2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z')").run();
  sqlite.prepare("INSERT INTO review_authors VALUES ('author-suspended','cipher2','hash-2',NULL,'SUSPENDED','2026-09-01T00:00:00.000Z',NULL,'2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z')").run();

  return { sqlite, database };
}

test("submission validation is config-driven and service context stays minimal", async () => {
  const submission = await importTs("lib/profile-review-submission.ts");
  const target = {
    resourceId: "opaque.directory.1",
    entityType: "DIRECTORY_PROFILE",
    canonicalId: 1,
    name: "Veterina E2E",
    category: "veterinari",
    profileHref: "/adresar/veterinari/veterina-e2e",
  };
  const normalized = submission.normalizeProfileReviewSubmission({
    target,
    overallRating: 5,
    body: "Veľmi dobrá skúsenosť, profesionálny prístup a jasná komunikácia.",
    serviceMonth: "2026-09",
    ratingSchemaVersion: 1,
    dimensions: [
      { key: "approach", value: 5 },
      { key: "communication", value: 4 },
    ],
  });
  assert.equal(normalized.overallRating, 5);
  assert.equal(normalized.serviceMonth, "2026-09");
  assert.equal(normalized.serviceTypeKey, null);
  assert.equal(normalized.ratingSchemaVersion, 1);
  assert.deepEqual(normalized.dimensions, [
    { key: "approach", value: 5 },
    { key: "communication", value: 4 },
  ]);

  assert.throws(() => submission.normalizeProfileReviewSubmission({ target, overallRating: 0, body: "x".repeat(30), serviceMonth: "", ratingSchemaVersion: 1, dimensions: [] }), /celkové hodnotenie/i);
  assert.throws(() => submission.normalizeProfileReviewSubmission({ target, overallRating: 5, body: "<script>alert(1)</script> bezpečný zvyšok textu", serviceMonth: "", ratingSchemaVersion: 1, dimensions: [] }), /obyčajný text/i);
  assert.throws(() => submission.normalizeProfileReviewSubmission({ target, overallRating: 5, body: "Bezpečný text recenzie s dostatočnou dĺžkou.", serviceMonth: "2026-13", ratingSchemaVersion: 1, dimensions: [] }), /Mesiac služby/i);
  assert.throws(() => submission.normalizeProfileReviewSubmission({ target, overallRating: 5, body: "Bezpečný text recenzie s dostatočnou dĺžkou.", serviceMonth: "", ratingSchemaVersion: 1, dimensions: [{ key: "unknown_dimension", value: 5 }] }), /Doplnkové hodnotenia/i);
  assert.throws(() => submission.normalizeProfileReviewSubmission({ target, overallRating: 5, body: "Bezpečný text recenzie s dostatočnou dĺžkou.", serviceMonth: "", ratingSchemaVersion: 99, dimensions: [] }), /Formulár hodnotenia sa zmenil/i);
});

test("canonical target resolver allows public directory and organization, rejects event and draft", async () => {
  const submission = await importTs("lib/profile-review-submission.ts");
  const { sqlite, database } = fixture();
  try {
    const directory = await submission.resolveProfileReviewSubmissionTarget("opaque.directory.1", database);
    assert.equal(directory.entityType, "DIRECTORY_PROFILE");
    assert.equal(directory.category, "veterinari");
    assert.equal(directory.profileHref, "/adresar/veterinari/veterina-e2e");

    const organization = await submission.resolveProfileReviewSubmissionTarget("opaque.org.11", database);
    assert.equal(organization.entityType, "HELP_ORGANIZATION");
    assert.equal(organization.profileHref, "/organizacie/utulok-e2e");

    await assert.rejects(() => submission.resolveProfileReviewSubmissionTarget("opaque.event.21", database), /nepodporuje recenzie/);
    await assert.rejects(() => submission.resolveProfileReviewSubmissionTarget("opaque.directory.2", database), /nie je verejný/);
    await assert.rejects(() => submission.resolveProfileReviewSubmissionTarget("../unsafe", database), /nie je platný/);
  } finally {
    sqlite.close();
  }
});

test("atomic create writes PENDING_REVIEW, dimensions and one moderation event", async () => {
  const submission = await importTs("lib/profile-review-submission.ts");
  const read = await importTs("lib/profile-review-read.ts");
  const { sqlite, database } = fixture();
  try {
    const target = await submission.resolveProfileReviewSubmissionTarget("opaque.directory.1", database);
    const normalized = submission.normalizeProfileReviewSubmission({
      target,
      overallRating: 4,
      body: "Prístup bol veľmi dobrý a komunikácia bola zrozumiteľná.",
      serviceMonth: "2026-08",
      ratingSchemaVersion: 1,
      dimensions: [{ key: "approach", value: 5 }, { key: "communication", value: 4 }],
    });
    const result = await submission.createPendingProfileReview({
      request: new Request("https://psipedia.sk/api/review-author/reviews", { headers: { "cf-ray": "test-ray-1" } }),
      reviewer: { authorId: "author-1", status: "ACTIVE", emailVerifiedAt: "2026-09-01T00:00:00.000Z", displayName: "Reviewer" },
      target,
      normalized,
      database,
      now: new Date("2026-09-23T10:00:00.000Z"),
    });
    assert.equal(result.status, "PENDING_REVIEW");

    const review = sqlite.prepare("SELECT * FROM profile_reviews").get();
    assert.equal(review.status, "PENDING_REVIEW");
    assert.equal(review.resource_id, "opaque.directory.1");
    assert.equal(review.author_id, "author-1");
    assert.equal(review.published_at, null);
    assert.equal(review.service_type_key, null);
    assert.equal(JSON.parse(review.risk_flags_json).length, 0);

    const dimensions = sqlite.prepare("SELECT dimension_key,value FROM profile_review_rating_values ORDER BY dimension_key").all()
      .map((row) => ({ dimension_key: row.dimension_key, value: Number(row.value) }));
    assert.deepEqual(dimensions, [
      { dimension_key: "approach", value: 5 },
      { dimension_key: "communication", value: 4 },
    ]);

    const event = sqlite.prepare("SELECT * FROM moderation_events").get();
    assert.equal(event.resource_type, "PROFILE_REVIEW");
    assert.equal(event.subject_id, review.id);
    assert.equal(event.action, "SUBMITTED");
    assert.equal(event.actor_type, "REVIEW_AUTHOR");
    assert.equal(event.actor_ref, "author-1");
    assert.equal(event.to_status, "PENDING_REVIEW");

    const publicData = await read.getPublicProfileReviewData(database, {
      entityType: "DIRECTORY_PROFILE",
      canonicalId: 1,
      category: "veterinari",
    });
    assert.equal(publicData.summary.count, 0);
    assert.equal(publicData.summary.average, null);
    assert.deepEqual(publicData.reviews, []);
    assert.deepEqual(publicData.summary.dimensions, []);
  } finally {
    sqlite.close();
  }
});

test("batch failure rolls back review, dimensions and moderation event", async () => {
  const submission = await importTs("lib/profile-review-submission.ts");
  const { sqlite, database } = fixture();
  try {
    const target = await submission.resolveProfileReviewSubmissionTarget("opaque.directory.1", database);
    const normalized = {
      overallRating: 5,
      body: "Bezpečný text s dostatočnou dĺžkou pre atomicitu.",
      serviceMonth: null,
      serviceTypeKey: null,
      ratingSchemaVersion: 1,
      dimensions: [{ key: "approach", value: 99 }],
      riskFlags: [],
      config: { schemaVersion: 1, dimensions: [] },
    };
    await assert.rejects(() => submission.createPendingProfileReview({
      request: new Request("https://psipedia.sk/api/review-author/reviews"),
      reviewer: { authorId: "author-1", status: "ACTIVE", emailVerifiedAt: "2026-09-01T00:00:00.000Z", displayName: null },
      target,
      normalized,
      database,
    }));
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM profile_reviews").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM profile_review_rating_values").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM moderation_events").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("duplicate and concurrent submission resolve deterministically without second row", async () => {
  const submission = await importTs("lib/profile-review-submission.ts");
  const { sqlite, database } = fixture();
  try {
    const target = await submission.resolveProfileReviewSubmissionTarget("opaque.directory.1", database);
    const normalized = submission.normalizeProfileReviewSubmission({
      target,
      overallRating: 5,
      body: "Veľmi dobrá skúsenosť s dostatočne dlhým textom recenzie.",
      serviceMonth: "",
      ratingSchemaVersion: 1,
      dimensions: [],
    });
    const input = {
      request: new Request("https://psipedia.sk/api/review-author/reviews"),
      reviewer: { authorId: "author-1", status: "ACTIVE", emailVerifiedAt: "2026-09-01T00:00:00.000Z", displayName: null },
      target,
      normalized,
      database,
    };
    const settled = await Promise.allSettled([
      submission.createPendingProfileReview(input),
      submission.createPendingProfileReview(input),
    ]);
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
    const rejected = settled.find((item) => item.status === "rejected");
    assert.equal(rejected?.reason?.code, "ALREADY_REVIEWED");
    assert.equal(rejected?.reason?.status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM profile_reviews").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM moderation_events").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("all existing review lifecycle states block delete/recreate behavior", async () => {
  const submission = await importTs("lib/profile-review-submission.ts");
  const statuses = ["PENDING_REVIEW","VISIBLE","HIDDEN","REJECTED","AUTHOR_DELETED","REMOVED"];
  for (const status of statuses) {
    const message = submission.existingProfileReviewMessage(status);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 10);
  }
});

test("mutation authorization distinguishes missing, expired, suspended and active reviewer sessions", async () => {
  const submission = await importTs("lib/profile-review-submission.ts");
  const store = await importTs("lib/review-author-auth-store.ts");
  const auth = await importTs("lib/review-author-auth.ts");
  const { sqlite, database } = fixture();
  try {
    await assert.rejects(
      () => submission.requireProfileReviewSubmissionReviewer({ cookieHeader: null, database }),
      (error) => error?.code === "REVIEWER_UNAUTHORIZED" && error?.status === 401,
    );

    const activeSession = await store.createReviewAuthorSession("author-1", database);
    const active = await submission.requireProfileReviewSubmissionReviewer({
      cookieHeader: activeSession.cookie,
      database,
    });
    assert.equal(active.authorId, "author-1");

    const suspendedSession = await store.createReviewAuthorSession("author-suspended", database);
    await assert.rejects(
      () => submission.requireProfileReviewSubmissionReviewer({ cookieHeader: suspendedSession.cookie, database }),
      (error) => error?.code === "REVIEWER_SUSPENDED" && error?.status === 403,
    );
    const suspendedToken = auth.reviewAuthorSessionTokenFromCookieHeader(suspendedSession.cookie);
    const hash = await (await importTs("lib/resource-access.ts")).hashOpaqueToken(suspendedToken);
    assert.ok(sqlite.prepare("SELECT revoked_at FROM resource_management_sessions WHERE session_hash=?").get(hash).revoked_at);

    const expiredSession = await store.createReviewAuthorSession("author-1", database);
    const expiredToken = auth.reviewAuthorSessionTokenFromCookieHeader(expiredSession.cookie);
    const expiredHash = await (await importTs("lib/resource-access.ts")).hashOpaqueToken(expiredToken);
    sqlite.prepare("UPDATE resource_management_sessions SET expires_at='2020-01-01T00:00:00.000Z' WHERE session_hash=?").run(expiredHash);
    await assert.rejects(
      () => submission.requireProfileReviewSubmissionReviewer({ cookieHeader: expiredSession.cookie, database, now: new Date("2026-09-23T10:00:00.000Z") }),
      (error) => error?.code === "REVIEWER_SESSION_EXPIRED" && error?.status === 401,
    );
  } finally {
    sqlite.close();
  }
});

test("risk flags are low-complexity internal signals only", async () => {
  const submission = await importTs("lib/profile-review-submission.ts");
  assert.deepEqual(submission.evaluateProfileReviewRiskFlags("Normálna recenzia bez podozrivých znakov."), []);
  assert.deepEqual(submission.evaluateProfileReviewRiskFlags("https://a.test https://b.test https://c.test obsah"), ["EXCESSIVE_URLS"]);
  assert.deepEqual(submission.evaluateProfileReviewRiskFlags("aaaaaaaaaaaa dlhší obsah"), ["REPEATED_CHARACTERS"]);
});

test("submission security enforces Turnstile action/hostname/replay and HMAC rate limits", async () => {
  const security = await importTs("lib/review-author-security.ts");
  const { sqlite, database } = fixture();
  const originalFetch = globalThis.fetch;
  const now = new Date("2026-09-23T12:00:00.000Z");
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    hostname: "psipedia.sk",
    action: "profile_review_submit",
    challenge_ts: now.toISOString(),
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const request = new Request("https://psipedia.sk/api/review-author/reviews", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.50" },
    });
    const first = await security.verifyProfileReviewSubmissionTurnstile({
      database, request, token: "review-submit-turnstile-once", secret: "secret", now,
    });
    assert.equal(first.ok, true);
    await assert.rejects(
      () => security.verifyProfileReviewSubmissionTurnstile({
        database, request, token: "review-submit-turnstile-once", secret: "secret", now,
      }),
      /Bezpečnostné overenie zlyhalo/,
    );

    const wrongHost = new Request("https://preview.invalid/api/review-author/reviews");
    await assert.rejects(
      () => security.verifyProfileReviewSubmissionTurnstile({
        database, request: wrongHost, token: "review-submit-wrong-host", secret: "secret", now,
      }),
      /Bezpečnostné overenie zlyhalo/,
    );

    for (let index = 0; index < 8; index += 1) {
      await security.enforceProfileReviewSubmissionRateLimits({
        database,
        request,
        authorId: "author-rate-limit",
        hashKey: key32(55),
        now,
      });
    }
    await assert.rejects(
      () => security.enforceProfileReviewSubmissionRateLimits({
        database,
        request,
        authorId: "author-rate-limit",
        hashKey: key32(55),
        now,
      }),
      /priveľa recenzií/,
    );

    const buckets = sqlite.prepare("SELECT bucket_key FROM security_rate_limits").all().map((row) => String(row.bucket_key));
    assert.ok(buckets.some((key) => key.startsWith("profile-review-submit-author:")));
    assert.ok(buckets.some((key) => key.startsWith("profile-review-submit-client:")));
    assert.ok(buckets.every((key) => !key.includes("author-rate-limit")));
    assert.ok(buckets.every((key) => !key.includes("203.0.113.50")));
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("Partner session cookie never authorizes reviewer submission", async () => {
  const submission = await importTs("lib/profile-review-submission.ts");
  const { sqlite, database } = fixture();
  try {
    await assert.rejects(
      () => submission.requireProfileReviewSubmissionReviewer({
        cookieHeader: "__Host-psipedia_partner_session=partner-only-session",
        database,
      }),
      (error) => error?.code === "REVIEWER_UNAUTHORIZED" && error?.status === 401,
    );
  } finally {
    sqlite.close();
  }
});

test("actual review submission API creates one pending canonical review through the full security boundary", async () => {
  const { sqlite, database } = fixture();
  const store = await importTs("lib/review-author-auth-store.ts");
  const envObject = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  const previousEnv = { ...envObject };
  const originalFetch = globalThis.fetch;

  Object.assign(envObject, {
    DB: database,
    PROFILE_REVIEW_SUBMISSIONS_ENABLED: "true",
    TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    PII_HASH_KEY: key32(56),
    PII_ENCRYPTION_KEY: key32(57),
  });

  const session = await store.createReviewAuthorSession("author-1", database);
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    hostname: "psipedia.sk",
    action: "profile_review_submit",
    challenge_ts: new Date().toISOString(),
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const { POST } = await importTs("app/api/review-author/reviews/route.ts");
    const request = new Request("https://psipedia.sk/api/review-author/reviews", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://psipedia.sk",
        "sec-fetch-site": "same-origin",
        "cf-connecting-ip": "203.0.113.77",
        cookie: session.cookie.split(";")[0],
      },
      body: JSON.stringify({
        resourceId: "opaque.directory.1",
        overallRating: 5,
        body: "Veľmi dobrá skúsenosť s profesionálnym prístupom a komunikáciou.",
        serviceMonth: "2026-09",
        ratingSchemaVersion: 1,
        dimensions: [{ key: "approach", value: 5 }],
        turnstileToken: "route-turnstile-token",
        authorId: "attacker-controlled-author",
        status: "VISIBLE",
      }),
    });

    const response = await POST(request);
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.status, "PENDING_REVIEW");
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM profile_reviews").get().count, 1);
    const stored = sqlite.prepare("SELECT author_id,status,published_at FROM profile_reviews").get();
    assert.equal(stored.author_id, "author-1");
    assert.equal(stored.status, "PENDING_REVIEW");
    assert.equal(stored.published_at, null);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(envObject)) delete envObject[key];
    Object.assign(envObject, previousEnv);
    sqlite.close();
  }
});
