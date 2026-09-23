import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
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

function d1Fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE review_authors (
      id TEXT PRIMARY KEY NOT NULL,
      email_ciphertext TEXT NOT NULL,
      email_hash TEXT NOT NULL UNIQUE,
      display_name TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
        CHECK(status IN ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','DEACTIVATED')),
      email_verified_at TEXT,
      deactivated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE review_auth_notification_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      review_author_id TEXT NOT NULL REFERENCES review_authors(id) ON DELETE RESTRICT,
      notification_type TEXT NOT NULL CHECK(notification_type='AUTH_MAGIC_LINK'),
      dedupe_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','SENDING','SENT','FAILED','EXPIRED')),
      encrypted_secret TEXT,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      provider_message_id TEXT,
      last_error TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE resource_access_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      resource_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE resource_management_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      resource_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      session_hash TEXT NOT NULL UNIQUE,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );
    CREATE TABLE security_rate_limits (
      bucket_key TEXT PRIMARY KEY NOT NULL,
      window_started_at TEXT NOT NULL,
      count INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE turnstile_token_uses (
      token_hash TEXT PRIMARY KEY NOT NULL,
      action TEXT NOT NULL,
      hostname TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT NOT NULL
    );
    CREATE TABLE partner_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      email_ciphertext TEXT NOT NULL,
      email_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      email_verified_at TEXT,
      suspended_at TEXT,
      deactivated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  function statement(sql, params = []) {
    return {
      bind(...values) { return statement(sql, values); },
      async first() { return sqlite.prepare(sql).get(...params) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...params) }; },
      async run() {
        const result = sqlite.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes ?? 0) } };
      },
    };
  }

  return {
    sqlite,
    database: { prepare(sql) { return statement(sql); } },
  };
}

test("review author email normalization, HMAC dedupe and Partner identity isolation", async () => {
  const auth = await importTs("lib/review-author-auth.ts");
  const store = await importTs("lib/review-author-auth-store.ts");
  const pii = await importTs("lib/pii-crypto.ts");
  const { sqlite, database } = d1Fixture();
  const encryptionKey = key32(11);
  const hashKey = key32(77);
  const email = auth.normalizeReviewAuthorEmail(" Person@Example.sk ");
  assert.equal(email, "person@example.sk");

  const emailHash = await pii.hashPii(email, hashKey);
  const emailCiphertext = await pii.encryptPii(email, encryptionKey);
  const first = await store.createOrGetPendingReviewAuthor({ emailCiphertext, emailHash, database });
  const second = await store.createOrGetPendingReviewAuthor({ emailCiphertext, emailHash, database });
  assert.equal(first.id, second.id);
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM review_authors").get().count, 1);

  sqlite.prepare("INSERT INTO partner_accounts VALUES (?,?,?,?,?,?,?,?,?)")
    .run("partner-same-email", emailCiphertext, emailHash, "ACTIVE", new Date().toISOString(), null, null, new Date().toISOString(), new Date().toISOString());
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM partner_accounts WHERE email_hash=?").get(emailHash).count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM review_authors WHERE email_hash=?").get(emailHash).count, 1);
  assert.notEqual(first.id, "partner-same-email");
  sqlite.close();
});

test("review author verification creates a separate session and replay is rejected", async () => {
  const auth = await importTs("lib/review-author-auth.ts");
  const store = await importTs("lib/review-author-auth-store.ts");
  const pii = await importTs("lib/pii-crypto.ts");
  const { sqlite, database } = d1Fixture();
  const email = "reviewer@example.sk";
  const author = await store.createOrGetPendingReviewAuthor({
    emailCiphertext: await pii.encryptPii(email, key32(12)),
    emailHash: await pii.hashPii(email, key32(78)),
    database,
  });

  const issued = await store.issueReviewAuthorAuthToken(author.id, database);
  const result = await auth.consumeReviewAuthorMagicLink({
    token: issued.token,
    database,
    bindings: { DB: database, PII_HASH_KEY: key32(78) },
  });
  assert.equal(result.authorId, author.id);
  assert.match(result.cookie, /^__Host-psipedia_review_author_session=/);
  assert.doesNotMatch(result.cookie, /psipedia_partner_session/);
  assert.ok(!result.cookie.includes(issued.token));

  await assert.rejects(
    () => auth.consumeReviewAuthorMagicLink({
      token: issued.token,
      database,
      bindings: { DB: database, PII_HASH_KEY: key32(78) },
    }),
    /už bol použitý|neplatný|expirovaný/,
  );

  const cookieToken = auth.reviewAuthorSessionTokenFromCookieHeader(result.cookie);
  assert.ok(cookieToken);
  const identity = await auth.getReviewAuthorSession({ token: cookieToken, database });
  assert.equal(identity?.authorId, author.id);
  assert.equal(identity?.status, "ACTIVE");
  assert.equal("email" in (identity ?? {}), false);

  sqlite.prepare("UPDATE review_authors SET status='SUSPENDED' WHERE id=?").run(author.id);
  assert.equal(await auth.getReviewAuthorSession({ token: cookieToken, database }), null);
  assert.ok(sqlite.prepare("SELECT revoked_at FROM resource_management_sessions WHERE subject_id=?").get(author.id).revoked_at);
  sqlite.close();
});

test("outstanding reviewer token is revoked on repeated issue and expired token fails", async () => {
  const auth = await importTs("lib/review-author-auth.ts");
  const store = await importTs("lib/review-author-auth-store.ts");
  const resource = await importTs("lib/resource-access.ts");
  const pii = await importTs("lib/pii-crypto.ts");
  const { sqlite, database } = d1Fixture();
  const author = await store.createOrGetPendingReviewAuthor({
    emailCiphertext: await pii.encryptPii("repeat@example.sk", key32(13)),
    emailHash: await pii.hashPii("repeat@example.sk", key32(79)),
    database,
  });

  const first = await store.issueReviewAuthorAuthToken(author.id, database);
  const second = await store.issueReviewAuthorAuthToken(author.id, database);
  const firstHash = await resource.hashOpaqueToken(first.token);
  assert.ok(sqlite.prepare("SELECT revoked_at FROM resource_access_tokens WHERE token_hash=?").get(firstHash).revoked_at);
  await assert.rejects(() => auth.consumeReviewAuthorMagicLink({
    token: first.token,
    database,
    bindings: { DB: database, PII_HASH_KEY: key32(79) },
  }));

  const expiredRaw = "review-author-expired-token-000000000000000000";
  sqlite.prepare("INSERT INTO resource_access_tokens VALUES (?,?,?,?,?,?,?,?,?)").run(
    "expired-id",
    "REVIEW_AUTHOR",
    author.id,
    "REVIEW_AUTHOR_AUTH",
    await resource.hashOpaqueToken(expiredRaw),
    "2020-01-01T00:00:00.000Z",
    null,
    null,
    "2019-12-31T00:00:00.000Z",
  );
  await assert.rejects(() => auth.consumeReviewAuthorMagicLink({
    token: expiredRaw,
    database,
    bindings: { DB: database, PII_HASH_KEY: key32(79) },
  }));
  assert.ok(second.token);
  sqlite.close();
});

test("review auth return path is profile-only and blocks open redirects", async () => {
  const { normalizeReviewAuthorReturnTo } = await importTs("lib/review-author-return-to.ts");
  assert.equal(normalizeReviewAuthorReturnTo("/adresar/veterinari/moja-klinika#recenzie"), "/adresar/veterinari/moja-klinika#recenzie");
  assert.equal(normalizeReviewAuthorReturnTo("/organizacie/utulok?reviewsPage=2#recenzie"), "/organizacie/utulok?reviewsPage=2#recenzie");
  for (const bad of [
    "https://evil.example/",
    "//evil.example/path",
    "javascript:alert(1)",
    "/admin",
    "/api/review-author/auth/logout",
    "/partner",
    "/recenzie",
    "/adresar/veterinari",
    "/organizacie/a/b",
  ]) {
    assert.equal(normalizeReviewAuthorReturnTo(bad), null, bad);
  }
});

test("same-origin guard and HMAC D1 rate limits are reused for reviewer auth", async () => {
  const security = await importTs("lib/review-author-security.ts");
  const { sqlite, database } = d1Fixture();
  const safeRequest = new Request("https://psipedia.sk/api/review-author/auth/request-link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://psipedia.sk",
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "203.0.113.20",
    },
    body: "{}",
  });
  assert.doesNotThrow(() => security.assertReviewAuthorJsonMutation(safeRequest));
  assert.throws(() => security.assertReviewAuthorJsonMutation(new Request(
    "https://psipedia.sk/api/review-author/auth/request-link",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      body: "{}",
    },
  )));

  for (let index = 0; index < 5; index += 1) {
    await security.enforceReviewAuthorAuthRateLimits({
      database,
      request: safeRequest,
      normalizedEmail: "rate@example.sk",
      hashKey: key32(80),
      now: new Date("2026-09-23T06:00:00.000Z"),
    });
  }
  await assert.rejects(() => security.enforceReviewAuthorAuthRateLimits({
    database,
    request: safeRequest,
    normalizedEmail: "rate@example.sk",
    hashKey: key32(80),
    now: new Date("2026-09-23T06:00:00.000Z"),
  }), /priveľa požiadaviek/);

  const keys = sqlite.prepare("SELECT bucket_key FROM security_rate_limits").all().map((row) => row.bucket_key);
  assert.ok(keys.some((key) => String(key).startsWith("review-auth-email:")));
  assert.ok(keys.every((key) => !String(key).includes("rate@example.sk")));
  assert.ok(keys.every((key) => !String(key).includes("203.0.113.20")));
  sqlite.close();
});

test("review auth outbox dedupes pending delivery, encrypts the token and clears secret after send", async () => {
  const email = await importTs("lib/review-author-email.ts");
  const store = await importTs("lib/review-author-auth-store.ts");
  const pii = await importTs("lib/pii-crypto.ts");
  const { sqlite, database } = d1Fixture();
  const encryptionKey = key32(14);
  const author = await store.createOrGetPendingReviewAuthor({
    emailCiphertext: await pii.encryptPii("mail@example.sk", encryptionKey),
    emailHash: await pii.hashPii("mail@example.sk", key32(81)),
    database,
  });
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const first = await email.queueReviewAuthorMagicLinkEmail({
    authorId: author.id,
    rawToken: "raw-review-token-one-00000000000000000000",
    returnTo: "/adresar/veterinari/mail-test#recenzie",
    expiresAt,
    database,
    bindings: { DB: database, PII_ENCRYPTION_KEY: encryptionKey },
  });
  const second = await email.queueReviewAuthorMagicLinkEmail({
    authorId: author.id,
    rawToken: "raw-review-token-two-00000000000000000000",
    returnTo: "/adresar/veterinari/mail-test#recenzie",
    expiresAt,
    database,
    bindings: { DB: database, PII_ENCRYPTION_KEY: encryptionKey },
  });
  assert.equal(sqlite.prepare("SELECT status FROM review_auth_notification_outbox WHERE id=?").get(first).status, "EXPIRED");
  assert.equal(sqlite.prepare("SELECT status FROM review_auth_notification_outbox WHERE id=?").get(second).status, "PENDING");
  const pendingSecret = sqlite.prepare("SELECT encrypted_secret FROM review_auth_notification_outbox WHERE id=?").get(second).encrypted_secret;
  assert.ok(pendingSecret);
  assert.ok(!String(pendingSecret).includes("raw-review-token-two"));

  const originalFetch = globalThis.fetch;
  let outbound = null;
  globalThis.fetch = async (_url, init) => {
    outbound = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ id: "resend-review-e2e" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await email.processReviewAuthorNotificationOutboxItem(second, {
      database,
      bindings: {
        DB: database,
        PII_ENCRYPTION_KEY: encryptionKey,
        RESEND_API_KEY: "test-key",
        PARTNER_FROM_EMAIL: "Psipedia <noreply@psipedia.sk>",
      },
    });
    assert.equal(result.status, "sent");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(outbound.subject, /overenie emailu pre recenziu/);
  assert.match(outbound.text, /jednorazový a platí 15 minút/);
  assert.match(outbound.text, /nevytvorí ani nezverejní/);
  const sent = sqlite.prepare("SELECT status,encrypted_secret,provider_message_id FROM review_auth_notification_outbox WHERE id=?").get(second);
  assert.equal(sent.status, "SENT");
  assert.equal(sent.encrypted_secret, null);
  assert.equal(sent.provider_message_id, "resend-review-e2e");
  sqlite.close();
});

test("public request is anti-enumeration safe for blocked reviewer lifecycle and creates no review rows", async () => {
  const authSource = await fs.readFile(new URL("../lib/review-author-auth.ts", import.meta.url), "utf8");
  const storeSource = await fs.readFile(new URL("../lib/review-author-auth-store.ts", import.meta.url), "utf8");
  const routeSource = await fs.readFile(new URL("../app/api/review-author/auth/request-link/route.ts", import.meta.url), "utf8");
  const allAuth = authSource + "\n" + storeSource + "\n" + routeSource;
  assert.match(authSource, /REVIEW_AUTHOR_AUTH_GENERIC_RESPONSE/);
  assert.match(authSource, /author\.status === "SUSPENDED" \|\| author\.status === "DEACTIVATED"/);
  assert.doesNotMatch(routeSource, /email už existuje|partner účet|suspendovaný|deaktivovaný/i);
  assert.doesNotMatch(allAuth, /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+profile_reviews/i);
  assert.doesNotMatch(allAuth, /UPDATE\s+profile_reviews/i);
});

test("reviewer session primitives are isolated from Partner cookie, resource scope and permissions", async () => {
  const storeSource = await fs.readFile(new URL("../lib/review-author-auth-store.ts", import.meta.url), "utf8");
  const authSource = await fs.readFile(new URL("../lib/review-author-auth.ts", import.meta.url), "utf8");
  assert.match(storeSource, /REVIEW_AUTHOR_RESOURCE_TYPE = "REVIEW_AUTHOR"/);
  assert.match(storeSource, /REVIEW_AUTHOR_AUTH_PURPOSE = "REVIEW_AUTHOR_AUTH"/);
  assert.match(storeSource, /__Host-psipedia_review_author_session/);
  assert.doesNotMatch(storeSource, /__Host-psipedia_partner_session/);
  assert.match(storeSource, /permissions: \[\]/);
  assert.doesNotMatch(authSource, /requirePartnerAccount|getPartnerSession\(/);
});

test("review auth UI and callback keep token in fragment and no Review JSON-LD is introduced", async () => {
  const verification = await fs.readFile(new URL("../components/review-author-verification.tsx", import.meta.url), "utf8");
  const reviewSection = await fs.readFile(new URL("../components/profile-review-section.tsx", import.meta.url), "utf8");
  const emailSource = await fs.readFile(new URL("../lib/review-author-email.ts", import.meta.url), "utf8");
  assert.match(verification, /URLSearchParams\(window\.location\.hash/);
  assert.match(verification, /history\.replaceState\(null, "", "\/recenzia\/overenie"\)/);
  assert.match(emailSource, /\/recenzia\/overenie#" \+ fragment\.toString\(\)/);
  assert.doesNotMatch(emailSource, /\/recenzia\/overenie\?token=/);
  assert.match(reviewSection, /Napísať recenziu/);
  assert.doesNotMatch(reviewSection, /AggregateRating|"Review"/);
});

test("review auth routes are excluded from analytics/ads and share the existing notification sweep", async () => {
  const consent = await fs.readFile(new URL("../components/cookie-consent.tsx", import.meta.url), "utf8");
  const ads = await fs.readFile(new URL("../components/programmatic-ad-loader.tsx", import.meta.url), "utf8");
  const worker = await fs.readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(consent, /pathname\.startsWith\("\/recenzia"\)/);
  assert.match(ads, /pathname\.startsWith\("\/recenzia"\)/);
  assert.match(worker, /runReviewAuthorNotificationSweep/);
  assert.match(worker, /review_author_notification_sweep/);
});


test("reviewer Turnstile enforces action, hostname and replay protection", async () => {
  const security = await importTs("lib/review-author-security.ts");
  const { sqlite, database } = d1Fixture();
  const now = new Date("2026-09-23T06:00:00.000Z");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    hostname: "psipedia.sk",
    action: "review_author_auth_request",
    challenge_ts: now.toISOString(),
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const request = new Request("https://psipedia.sk/api/review-author/auth/request-link", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.9" },
    });
    const first = await security.verifyReviewAuthorTurnstile({
      database,
      request,
      token: "review-turnstile-once",
      secret: "test-secret",
      now,
    });
    assert.equal(first.ok, true);

    await assert.rejects(
      () => security.verifyReviewAuthorTurnstile({
        database,
        request,
        token: "review-turnstile-once",
        secret: "test-secret",
        now,
      }),
      /Bezpečnostné overenie zlyhalo/,
    );

    const wrongHostRequest = new Request("https://preview.example/api/review-author/auth/request-link");
    await assert.rejects(
      () => security.verifyReviewAuthorTurnstile({
        database,
        request: wrongHostRequest,
        token: "review-turnstile-wrong-host",
        secret: "test-secret",
        now,
      }),
      /Bezpečnostné overenie zlyhalo/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("review auth logs never include plaintext email, token or cookie values", async () => {
  const authSource = await fs.readFile(new URL("../lib/review-author-auth.ts", import.meta.url), "utf8");
  const emailSource = await fs.readFile(new URL("../lib/review-author-email.ts", import.meta.url), "utf8");
  const routes = await Promise.all([
    "app/api/review-author/auth/request-link/route.ts",
    "app/api/review-author/auth/consume/route.ts",
    "app/api/review-author/auth/logout/route.ts",
  ].map((path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8")));
  const loggedSource = authSource + "\n" + emailSource + "\n" + routes.join("\n");
  assert.doesNotMatch(loggedSource, /console\.(?:info|error)\([^\n]*(?:rawToken|emailCiphertext|normalizedEmail|cookie|token:)/i);
  assert.match(authSource, /authorId/);
  assert.match(authSource, /outboxId/);
});


test("request magic-link flow dedupes reviewer identity and keeps blocked lifecycle anti-enumeration safe", async () => {
  const auth = await importTs("lib/review-author-auth.ts");
  const pii = await importTs("lib/pii-crypto.ts");
  const { sqlite, database } = d1Fixture();
  const now = new Date("2026-09-23T06:00:00.000Z");
  const encryptionKey = key32(21);
  const hashKey = key32(91);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.includes("challenges.cloudflare.com/turnstile")) {
      const form = init?.body;
      const token = form instanceof FormData ? String(form.get("response") ?? "") : "";
      return new Response(JSON.stringify({
        success: true,
        hostname: "psipedia.sk",
        action: "review_author_auth_request",
        challenge_ts: now.toISOString(),
        token_echo: token,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.includes("api.resend.com/emails")) {
      return new Response(JSON.stringify({ id: "resend-review-request-test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("unexpected fetch: " + target);
  };

  const makeRequest = () => new Request("https://psipedia.sk/api/review-author/auth/request-link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://psipedia.sk",
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "203.0.113.44",
    },
    body: "{}",
  });

  try {
    const first = await auth.requestReviewAuthorMagicLink({
      request: makeRequest(),
      email: "Reviewer@Example.sk",
      turnstileToken: "review-request-turnstile-1",
      returnTo: "/adresar/veterinari/request-flow#recenzie",
      database,
      bindings: {
        DB: database,
        PII_ENCRYPTION_KEY: encryptionKey,
        PII_HASH_KEY: hashKey,
        TURNSTILE_SECRET_KEY: "turnstile-secret",
        RESEND_API_KEY: "resend-test",
        PARTNER_FROM_EMAIL: "Psipedia <noreply@psipedia.sk>",
      },
      now,
    });
    assert.equal(first.message, auth.REVIEW_AUTHOR_AUTH_GENERIC_RESPONSE);

    const second = await auth.requestReviewAuthorMagicLink({
      request: makeRequest(),
      email: " reviewer@example.sk ",
      turnstileToken: "review-request-turnstile-2",
      returnTo: "/adresar/veterinari/request-flow#recenzie",
      database,
      bindings: {
        DB: database,
        PII_ENCRYPTION_KEY: encryptionKey,
        PII_HASH_KEY: hashKey,
        TURNSTILE_SECRET_KEY: "turnstile-secret",
        RESEND_API_KEY: "resend-test",
        PARTNER_FROM_EMAIL: "Psipedia <noreply@psipedia.sk>",
      },
      now: new Date(now.getTime() + 1_000),
    });
    assert.equal(second.message, auth.REVIEW_AUTHOR_AUTH_GENERIC_RESPONSE);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM review_authors").get().count, 1);

    const normalizedHash = await pii.hashPii("reviewer@example.sk", hashKey);
    const author = sqlite.prepare("SELECT id FROM review_authors WHERE email_hash=?").get(normalizedHash);
    assert.ok(author?.id);

    sqlite.prepare("UPDATE review_authors SET status='SUSPENDED' WHERE id=?").run(author.id);
    const tokenCountBefore = sqlite.prepare("SELECT COUNT(*) count FROM resource_access_tokens WHERE resource_type='REVIEW_AUTHOR'").get().count;
    const outboxCountBefore = sqlite.prepare("SELECT COUNT(*) count FROM review_auth_notification_outbox").get().count;

    const blocked = await auth.requestReviewAuthorMagicLink({
      request: makeRequest(),
      email: "reviewer@example.sk",
      turnstileToken: "review-request-turnstile-3",
      returnTo: "/adresar/veterinari/request-flow#recenzie",
      database,
      bindings: {
        DB: database,
        PII_ENCRYPTION_KEY: encryptionKey,
        PII_HASH_KEY: hashKey,
        TURNSTILE_SECRET_KEY: "turnstile-secret",
        RESEND_API_KEY: "resend-test",
        PARTNER_FROM_EMAIL: "Psipedia <noreply@psipedia.sk>",
      },
      now: new Date(now.getTime() + 2_000),
    });
    assert.equal(blocked.message, auth.REVIEW_AUTHOR_AUTH_GENERIC_RESPONSE);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM resource_access_tokens WHERE resource_type='REVIEW_AUTHOR'").get().count, tokenCountBefore);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM review_auth_notification_outbox").get().count, outboxCountBefore);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
