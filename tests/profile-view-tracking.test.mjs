import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  PROFILE_VIEW_COOLDOWN_MS,
  reserveQualifiedProfileView,
  sendQualifiedProfileView,
} from "../lib/profile-view-tracking.ts";
import {
  hasTrustedProfileViewOrigin,
  isLikelyCrawlerRequest,
} from "../lib/profile-view-security.ts";
import { deriveRateLimitKey } from "../lib/rate-limit.ts";
import { pruneExpiredProfileViewRateKeys, shouldPruneProfileViewRateKeys } from "../lib/profile-view-retention.ts";
import { POST as postProfileView } from "../app/api/directory/views/route.ts";

const tokenA = randomUUID();
const tokenB = randomUUID();
const hashKey = Buffer.alloc(32, 7).toString("base64url");
const browser = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const migration = await readFile(new URL("../drizzle/0167_content_analytics_profile_views.sql", import.meta.url), "utf8");
const articleMigration = await readFile(new URL("../drizzle/0105_article_popularity.sql", import.meta.url), "utf8");

function storage() {
  const state = new Map();
  return {
    getItem: (key) => state.get(key) ?? null,
    setItem(key, value) { state.set(key, value); },
  };
}

function request(payload, options = {}) {
  return new Request("https://psipedia.sk/api/directory/views", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://psipedia.sk",
      "sec-fetch-site": "same-origin",
      "referer": "https://psipedia.sk/adresar/treneri/sirius",
      "user-agent": browser,
      "cf-connecting-ip": "203.0.113.10",
      ...options.headers,
    },
    body: options.body ?? JSON.stringify(payload),
  });
}

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managed_articles(id INTEGER PRIMARY KEY);
    CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, slug TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE security_rate_limits(
      bucket_key TEXT PRIMARY KEY NOT NULL,
      window_started_at TEXT NOT NULL,
      count INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  sqlite.exec(articleMigration);
  sqlite.exec(migration);
  sqlite.exec(`
    INSERT INTO managed_articles(id) VALUES (1);
    INSERT INTO directory_profiles(id, slug, status) VALUES
      (1, 'sirius', 'published'),
      (2, 'concept', 'draft'),
      (3, 'archived', 'archived'),
      (4, 'canine-school', 'published');
  `);

  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              return sqlite.prepare(sql).get(...values) ?? null;
            },
            async run() {
              return sqlite.prepare(sql).run(...values);
            },
          };
        },
      };
    },
  };
  const runtime = globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {};
  runtime.DB = db;
  runtime.PII_HASH_KEY = hashKey;
  return { sqlite, db, runtime };
}

const validPayload = { profileId: 1, profileSlug: "sirius", visitToken: tokenA };

test("profile view is reserved once per profile per six hours and expires", () => {
  const store = storage();
  const start = 1_000_000;
  assert.equal(reserveQualifiedProfileView(store, 1, start, () => tokenA), tokenA);
  assert.equal(reserveQualifiedProfileView(store, 1, start + 15_000, () => tokenB), null);
  assert.equal(reserveQualifiedProfileView(store, 4, start + 15_000, () => tokenB), tokenB);
  assert.equal(reserveQualifiedProfileView(store, 1, start + PROFILE_VIEW_COOLDOWN_MS, () => tokenB), tokenB);
  assert.equal(reserveQualifiedProfileView(store, -1, start, () => tokenA), null);
});

test("corrupt local storage is recoverable; disabled storage fails closed", () => {
  const store = storage();
  store.setItem("psipedia-profile-view:v1:1", "{not-json");
  assert.equal(reserveQualifiedProfileView(store, 1, 5_000, () => tokenA), tokenA);
  const forbidden = {
    getItem() { throw new Error("Storage disabled"); },
    setItem() { throw new Error("Storage disabled"); },
  };
  assert.equal(reserveQualifiedProfileView(forbidden, 1, 5_000, () => tokenA), null);
});

test("client sends same-origin POST only and never exposes a visible counter", async () => {
  const calls = [];
  await sendQualifiedProfileView(1, "sirius", tokenA, async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 204 });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/directory/views");
  assert.equal(calls[0].options.mode, "same-origin");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.keepalive, true);
  assert.deepEqual(JSON.parse(calls[0].options.body), validPayload);

  const component = await readFile(new URL("../components/directory-profile-view-tracker.tsx", import.meta.url), "utf8");
  const detail = await readFile(new URL("../app/adresar/[category]/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(component, /ARTICLE_READ_QUALIFY_MS/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /isInternalArticleReadBrowser/);
  assert.match(component, /return null;/);
  assert.match(detail, /<DirectoryProfileViewTracker profileId=\{profile\.id\} profileSlug=\{profile\.slug\}/);
});

test("same-origin, exact referrer slug and browser bot filters reject bad traffic", () => {
  assert.equal(hasTrustedProfileViewOrigin(request(validPayload), "sirius"), true);
  assert.equal(hasTrustedProfileViewOrigin(request(validPayload, {
    headers: { origin: "https://outside.example" },
  }), "sirius"), false);
  assert.equal(hasTrustedProfileViewOrigin(request(validPayload, {
    headers: { "sec-fetch-site": "cross-site" },
  }), "sirius"), false);
  assert.equal(hasTrustedProfileViewOrigin(request(validPayload, {
    headers: { referer: "https://psipedia.sk/adresar/treneri/other-dog" },
  }), "sirius"), false);
  assert.equal(isLikelyCrawlerRequest(request(validPayload)), false);
  assert.equal(isLikelyCrawlerRequest(request(validPayload, {
    headers: { "user-agent": "Googlebot/2.1" },
  })), true);
  assert.equal(isLikelyCrawlerRequest(request(validPayload, {
    headers: { "user-agent": "Mozilla/5.0 HeadlessChrome/120" },
  })), true);
  const cloudflareBot = request(validPayload);
  Object.defineProperty(cloudflareBot, "cf", {
    value: { botManagement: { verifiedBot: true, score: 90 } },
  });
  assert.equal(isLikelyCrawlerRequest(cloudflareBot), true);
  const lowScoreBot = request(validPayload);
  Object.defineProperty(lowScoreBot, "cf", {
    value: { botManagement: { verifiedBot: false, score: 4 } },
  });
  assert.equal(isLikelyCrawlerRequest(lowScoreBot), true);
});

test("public endpoint counts a published profile and dedupes repeated posts on the server", async () => {
  const { sqlite } = setup();
  try {
    assert.equal((await postProfileView(request(validPayload))).status, 204);
    assert.equal((await postProfileView(request(validPayload))).status, 204);
    assert.equal(sqlite.prepare("SELECT qualified_views AS n FROM directory_profile_view_hourly WHERE profile_id=1").get().n, 1);
    assert.equal((await postProfileView(request({ ...validPayload, visitToken: tokenB }))).status, 204);
    assert.equal(sqlite.prepare("SELECT qualified_views AS n FROM directory_profile_view_hourly WHERE profile_id=1").get().n, 2);
    assert.equal((await postProfileView(request({ profileId: 4, profileSlug: "canine-school", visitToken: tokenA }, {
      headers: { referer: "https://psipedia.sk/adresar/treneri/canine-school" },
    }))).status, 204);
    assert.equal(sqlite.prepare("SELECT qualified_views AS n FROM directory_profile_view_hourly WHERE profile_id=4").get().n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM article_read_hourly").get().n, 0);
  } finally {
    sqlite.close();
  }
});

test("draft, archived, unknown and mismatched profile identity never count", async () => {
  const { sqlite } = setup();
  try {
    for (const [profileId, profileSlug] of [[2, "concept"], [3, "archived"], [99, "missing"]]) {
      const req = request({ profileId, profileSlug, visitToken: tokenA }, {
        headers: { referer: `https://psipedia.sk/adresar/treneri/${profileSlug}` },
      });
      assert.equal((await postProfileView(req)).status, 404);
    }
    assert.equal((await postProfileView(request({
      ...validPayload, profileSlug: "something-else",
    }, { headers: { referer: "https://psipedia.sk/adresar/treneri/something-else" } }))).status, 404);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profile_view_hourly").get().n, 0);
  } finally {
    sqlite.close();
  }
});

test("bots and internal traffic do not touch the view counter", async () => {
  const { sqlite } = setup();
  try {
    assert.equal((await postProfileView(request(validPayload, {
      headers: { "user-agent": "Googlebot/2.1" },
    }))).status, 204);
    assert.equal((await postProfileView(request(validPayload, {
      headers: { cookie: "psipedia_internal=1" },
    }))).status, 204);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profile_view_hourly").get().n, 0);
  } finally {
    sqlite.close();
  }
});

test("invalid, oversized and cross-site submissions fail before counting", async () => {
  const { sqlite } = setup();
  try {
    assert.equal((await postProfileView(request(validPayload, {
      headers: { origin: "https://outside.example" },
    }))).status, 403);
    assert.equal((await postProfileView(request({ ...validPayload, profileId: 0 }))).status, 400);
    assert.equal((await postProfileView(request({ ...validPayload, visitToken: "not-a-token" }))).status, 400);
    assert.equal((await postProfileView(request(validPayload, { body: "{" }))).status, 400);
    assert.equal((await postProfileView(request(validPayload, { body: "x".repeat(513) }))).status, 413);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profile_view_hourly").get().n, 0);
  } finally {
    sqlite.close();
  }
});

test("server IP cap blocks token-rotation floods before profile writes", async () => {
  const { sqlite } = setup();
  try {
    const key = await deriveRateLimitKey("public-profile-view-ip", "203.0.113.10", hashKey);
    sqlite.prepare(`
      INSERT INTO security_rate_limits(bucket_key, window_started_at, count, expires_at)
      VALUES (?, ?, 120, ?)
    `).run(key, new Date().toISOString(), new Date(Date.now() + 60_000).toISOString());
    assert.equal((await postProfileView(request(validPayload))).status, 429);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profile_view_hourly").get().n, 0);
  } finally {
    sqlite.close();
  }
});

test("missing security secret fails closed without counting", async () => {
  const { sqlite, runtime } = setup();
  try {
    delete runtime.PII_HASH_KEY;
    assert.equal((await postProfileView(request(validPayload))).status, 503);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profile_view_hourly").get().n, 0);
  } finally {
    sqlite.close();
  }
});

test("expiry cleanup is bounded, indexed and cannot delete unrelated security keys", async () => {
  const { sqlite, db } = setup();
  try {
    assert.equal(shouldPruneProfileViewRateKeys("550e8400-e29b-41d4-a716-446655440011"), true);
    assert.equal(shouldPruneProfileViewRateKeys(tokenA), false);
    const rows = [
      ["public-profile-view-event:expired", "2026-11-12T00:00:00.000Z"],
      ["public-profile-view-ip:expired", "2026-11-12T00:00:00.000Z"],
      ["public-profile-view-event:active", "2026-11-16T00:00:00.000Z"],
      ["partner-auth:expired", "2026-11-12T00:00:00.000Z"],
    ];
    for (const [key, expiresAt] of rows) {
      sqlite.prepare(`
        INSERT INTO security_rate_limits(bucket_key, window_started_at, count, expires_at)
        VALUES (?, ?, 1, ?)
      `).run(key, "2026-11-11T00:00:00.000Z", expiresAt);
    }
    await pruneExpiredProfileViewRateKeys(db, new Date("2026-11-14T00:00:00.000Z"));
    const remaining = sqlite.prepare("SELECT bucket_key FROM security_rate_limits ORDER BY bucket_key")
      .all().map((row) => row.bucket_key);
    assert.deepEqual(remaining, ["partner-auth:expired", "public-profile-view-event:active"]);
  } finally {
    sqlite.close();
  }
});
