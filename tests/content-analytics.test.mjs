import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  contentAnalyticsWindowStart,
  getQualifiedContentViewCount,
  recordQualifiedDirectoryProfileView,
} from "../lib/content-analytics.ts";

const articleMigration = await readFile(
  new URL("../drizzle/0105_article_popularity.sql", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../drizzle/0167_content_analytics_profile_views.sql", import.meta.url),
  "utf8",
);

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managed_articles (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL
    );
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL
    );
  `);
  sqlite.exec(articleMigration);
  sqlite.exec(migration);
  sqlite.exec(`
    INSERT INTO managed_articles(id, status) VALUES (1, 'published');
    INSERT INTO directory_profiles(id, status)
    VALUES (1, 'published'), (2, 'draft'), (3, 'archived');
  `);

  const database = {
    prepare(sql) {
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
  return { sqlite, database };
}

test("step 2 analytics migration is additive and preserves article popularity storage", () => {
  assert.match(migration, /CREATE TABLE directory_profile_view_hourly/);
  assert.match(migration, /PRIMARY KEY \(profile_id, bucket_hour\)/);
  assert.match(migration, /REFERENCES directory_profiles\(id\) ON DELETE CASCADE/);
  assert.match(migration, /CREATE VIEW content_qualified_views_hourly/);
  assert.match(migration, /FROM article_read_hourly[\s\S]*UNION ALL[\s\S]*FROM directory_profile_view_hourly/);
  assert.doesNotMatch(migration, /(?:INSERT INTO|UPDATE|DELETE FROM) article_read_hourly/i);
  assert.doesNotMatch(migration, /INSERT INTO directory_profile_view_hourly/i);
});

test("window boundaries match existing article 24h/7d and include 30d and all", () => {
  const now = new Date("2026-11-14T20:37:41.000Z");
  assert.equal(contentAnalyticsWindowStart("24h", now), "2026-11-13T21:00:00.000Z");
  assert.equal(contentAnalyticsWindowStart("7d", now), "2026-11-07T21:00:00.000Z");
  assert.equal(contentAnalyticsWindowStart("30d", now), "2026-10-15T21:00:00.000Z");
  assert.equal(contentAnalyticsWindowStart("all", now), null);
});

test("profile writes only count published IDs, upsert hourly and never alter articles", async () => {
  const { sqlite, database } = fixture();
  try {
    const now = new Date("2026-11-14T20:37:41.000Z");
    assert.deepEqual(await recordQualifiedDirectoryProfileView({ profileId: 0, now, database }), {
      recorded: false,
      reason: "invalid_profile",
    });
    assert.deepEqual(await recordQualifiedDirectoryProfileView({ profileId: 2, now, database }), {
      recorded: false,
      reason: "profile_unavailable",
    });
    assert.equal((await recordQualifiedDirectoryProfileView({ profileId: 3, now, database })).recorded, false);
    assert.equal((await recordQualifiedDirectoryProfileView({ profileId: 999, now, database })).recorded, false);
    assert.equal((await recordQualifiedDirectoryProfileView({ profileId: 1, now, database })).qualifiedViews, 1);
    assert.equal((await recordQualifiedDirectoryProfileView({ profileId: 1, now, database })).qualifiedViews, 2);
    assert.equal((await recordQualifiedDirectoryProfileView({
      profileId: 1,
      now: new Date("2026-11-14T21:01:00.000Z"),
      database,
    })).qualifiedViews, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profile_view_hourly").get().n, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM article_read_hourly").get().n, 0);
  } finally {
    sqlite.close();
  }
});

test("shared read view retains real article reads and separates same numeric profile ID", async () => {
  const { sqlite, database } = fixture();
  try {
    const now = new Date("2026-11-14T20:37:41.000Z");
    sqlite.prepare(`
      INSERT INTO article_read_hourly(article_id, bucket_hour, qualified_reads, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(1, "2026-11-14T20:00:00.000Z", 4, now.toISOString());

    await recordQualifiedDirectoryProfileView({ profileId: 1, now, database });
    assert.equal(await getQualifiedContentViewCount({
      entityType: "ARTICLE", entityId: 1, window: "24h", now, database,
    }), 4);
    assert.equal(await getQualifiedContentViewCount({
      entityType: "DIRECTORY_PROFILE", entityId: 1, window: "24h", now, database,
    }), 1);
    assert.equal(await getQualifiedContentViewCount({
      entityType: "DIRECTORY_PROFILE", entityId: 999, window: "all", now, database,
    }), 0);

    sqlite.prepare(`
      INSERT INTO directory_profile_view_hourly(profile_id, bucket_hour, qualified_views, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(1, "2026-10-01T10:00:00.000Z", 12, now.toISOString());

    assert.equal(await getQualifiedContentViewCount({
      entityType: "DIRECTORY_PROFILE", entityId: 1, window: "7d", now, database,
    }), 1);
    assert.equal(await getQualifiedContentViewCount({
      entityType: "DIRECTORY_PROFILE", entityId: 1, window: "all", now, database,
    }), 13);

    sqlite.exec("DELETE FROM directory_profiles WHERE id = 1");
    assert.equal(await getQualifiedContentViewCount({
      entityType: "DIRECTORY_PROFILE", entityId: 1, window: "all", now, database,
    }), 0);
    assert.equal(await getQualifiedContentViewCount({
      entityType: "ARTICLE", entityId: 1, window: "all", now, database,
    }), 4);
  } finally {
    sqlite.close();
  }
});

test("unavailable analytics is distinguishable from a genuine zero", async () => {
  assert.equal(await getQualifiedContentViewCount({
    entityType: "ARTICLE", entityId: 1, window: "24h", database: null,
  }), null);
  assert.deepEqual(await recordQualifiedDirectoryProfileView({ profileId: 1, database: null }), {
    recorded: false,
    reason: "unavailable",
  });
});
