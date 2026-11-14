import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getAdminContentViewSummary } from "../lib/admin-content-view-summary.ts";

const articleMigration = await readFile(
  new URL("../drizzle/0105_article_popularity.sql", import.meta.url),
  "utf8",
);
const profileMigration = await readFile(
  new URL("../drizzle/0167_content_analytics_profile_views.sql", import.meta.url),
  "utf8",
);
const now = new Date("2026-11-14T20:37:41.000Z");

function fixture(withProfileMigration = true) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managed_articles(id INTEGER PRIMARY KEY);
    CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE security_rate_limits(
      bucket_key TEXT PRIMARY KEY NOT NULL,
      window_started_at TEXT NOT NULL,
      count INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
    INSERT INTO managed_articles(id) VALUES (1), (2), (3);
    INSERT INTO directory_profiles(id, status)
    VALUES (1, 'published'), (2, 'draft'), (3, 'published');
  `);
  sqlite.exec(articleMigration);
  if (withProfileMigration) sqlite.exec(profileMigration);
  const articleInsert = sqlite.prepare(`
    INSERT INTO article_read_hourly
      (article_id, bucket_hour, qualified_reads, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const [articleId, bucket, amount] of [
    [1, "2026-11-14T20:00:00.000Z", 11],
    [1, "2026-11-13T21:00:00.000Z", 2],
    [1, "2026-11-07T21:00:00.000Z", 3],
    [1, "2026-10-15T21:00:00.000Z", 5],
    [1, "2026-10-10T12:00:00.000Z", 7],
    [1, "2026-11-15T20:00:00.000Z", 99],
    [2, "2026-11-14T20:00:00.000Z", 100],
  ]) articleInsert.run(articleId, bucket, amount, now.toISOString());

  if (withProfileMigration) {
    const profileInsert = sqlite.prepare(`
      INSERT INTO directory_profile_view_hourly
        (profile_id, bucket_hour, qualified_views, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const [profileId, bucket, amount] of [
      [1, "2026-11-14T20:00:00.000Z", 4],
      [1, "2026-11-08T12:00:00.000Z", 6],
      [1, "2026-10-20T12:00:00.000Z", 8],
      [1, "2026-10-01T12:00:00.000Z", 12],
      [1, "2026-11-15T20:00:00.000Z", 99],
      [2, "2026-11-14T20:00:00.000Z", 40],
    ]) profileInsert.run(profileId, bucket, amount, now.toISOString());
  }

  const queries = [];
  const database = {
    prepare(sql) {
      queries.push(sql);
      return {
        bind(...args) {
          return {
            async first() {
              return sqlite.prepare(sql).get(...args) ?? null;
            },
          };
        },
      };
    },
  };
  return { sqlite, database, queries };
}

test("one read returns exact 24h/7d/30d/lifetime counts for managed article", async () => {
  const { sqlite, database, queries } = fixture();
  try {
    assert.deepEqual(await getAdminContentViewSummary({
      entityType: "ARTICLE", entityId: 1, now, database,
    }), {
      "24h": 13,
      "7d": 16,
      "30d": 21,
      all: 28,
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0], /FROM article_read_hourly/);
    assert.match(queries[0], /article_id = \?1/);
    assert.doesNotMatch(queries[0], /INSERT|UPDATE|DELETE/i);
  } finally {
    sqlite.close();
  }
});

test("one read returns exact profile counts and does not combine overlapping numeric IDs", async () => {
  const { sqlite, database, queries } = fixture();
  try {
    assert.deepEqual(await getAdminContentViewSummary({
      entityType: "DIRECTORY_PROFILE", entityId: 1, now, database,
    }), {
      "24h": 4,
      "7d": 10,
      "30d": 18,
      all: 30,
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0], /FROM directory_profile_view_hourly/);
    assert.match(queries[0], /profile_id = \?1/);

    // The admin may show historical qualified views for a formerly published
    // draft, unlike the public ranking which only lists published profiles.
    assert.equal((await getAdminContentViewSummary({
      entityType: "DIRECTORY_PROFILE", entityId: 2, now, database,
    })).all, 40);
  } finally {
    sqlite.close();
  }
});

test("genuine zero is preserved, unavailable data is not rendered as invented zero", async () => {
  const { sqlite, database } = fixture();
  try {
    assert.deepEqual(await getAdminContentViewSummary({
      entityType: "ARTICLE", entityId: 3, now, database,
    }), { "24h": 0, "7d": 0, "30d": 0, all: 0 });
    assert.equal(await getAdminContentViewSummary({
      entityType: "ARTICLE", entityId: 1, now, database: null,
    }), null);
    assert.equal(await getAdminContentViewSummary({
      entityType: "ARTICLE", entityId: 0, now, database,
    }), null);
    assert.equal(await getAdminContentViewSummary({
      entityType: "ARTICLE", entityId: 1.25, now, database,
    }), null);
  } finally {
    sqlite.close();
  }
});

test("articles remain available when unactivated D1 migration 0167 is missing", async () => {
  const { sqlite, database } = fixture(false);
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await getAdminContentViewSummary({
      entityType: "ARTICLE", entityId: 1, now, database,
    })).all, 28);
    assert.equal(await getAdminContentViewSummary({
      entityType: "DIRECTORY_PROFILE", entityId: 1, now, database,
    }), null);
  } finally {
    console.error = originalError;
    sqlite.close();
  }
});

test("article and profile editors show the read-only panel only after admin auth", async () => {
  const article = await readFile(
    new URL("../app/admin/clanky/[id]/page.tsx", import.meta.url), "utf8",
  );
  const profile = await readFile(
    new URL("../app/admin/adresar/[id]/page.tsx", import.meta.url), "utf8",
  );
  const panel = await readFile(
    new URL("../components/admin-record-view-stats.tsx", import.meta.url), "utf8",
  );
  const css = await readFile(
    new URL("../components/admin-record-view-stats.module.css", import.meta.url), "utf8",
  );

  assert.ok(article.indexOf("requireAdminPageUser(") < article.indexOf("<AdminRecordViewStats"));
  assert.ok(profile.indexOf("requireAdminPageUser(") < profile.indexOf("<AdminRecordViewStats"));
  assert.match(article, /entityType="ARTICLE" entityId=\{numericId\}/);
  assert.match(profile, /entityType="DIRECTORY_PROFILE" entityId=\{profile\.id\}/);
  assert.match(article, /<Suspense fallback=\{null\}>/);
  assert.match(profile, /<Suspense fallback=\{null\}>/);
  assert.ok(article.indexOf("<AdminRecordViewStats") < article.indexOf("<AdminArticleEditor"));
  assert.ok(profile.indexOf("<AdminRecordViewStats") < profile.indexOf("<AdminDirectoryEditor"));
  assert.match(panel, /len na čítanie/);
  assert.match(panel, /Všetky štatistiky/);
  assert.match(panel, /getAdminContentViewSummary/);
  assert.match(panel, /formatter\.format\(summary\[key\]\)/);
  assert.match(panel, /summary === null/);
  assert.doesNotMatch(panel, /use client|fetch\(|POST|PATCH|PUT|save|mutate/);
  assert.match(css, /max-width:\s*600px/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("profile statistics are not introduced on a public profile detail page", async () => {
  const publicPage = await readFile(
    new URL("../app/adresar/[category]/[slug]/page.tsx", import.meta.url), "utf8",
  );
  const publicDetail = await readFile(
    new URL("../components/directory-profile-detail.tsx", import.meta.url), "utf8",
  );
  assert.doesNotMatch(publicPage, /AdminRecordViewStats|data-admin-record-view-stats/);
  assert.doesNotMatch(publicDetail, /AdminRecordViewStats|data-admin-record-view-stats/);
});
