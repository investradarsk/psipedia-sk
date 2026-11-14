import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const article = await readFile(new URL("../drizzle/0105_article_popularity.sql", import.meta.url), "utf8");
const profile = await readFile(new URL("../drizzle/0167_content_analytics_profile_views.sql", import.meta.url), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE managed_articles(id INTEGER PRIMARY KEY);
    CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE security_rate_limits (
      bucket_key TEXT PRIMARY KEY,
      window_started_at TEXT NOT NULL,
      count INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  db.exec(article);
  db.exec(profile);
  return db;
}

function explain(db, sql, ...args) {
  return db.prepare("EXPLAIN QUERY PLAN " + sql).all(...args)
    .map((row) => String(row.detail))
    .join("\n");
}

test("window-scoped public ranking uses migration 0167's bounded hour index", () => {
  const db = fixture();
  try {
    const plan = explain(db, `
      SELECT p.id, SUM(h.qualified_views)
      FROM directory_profile_view_hourly h
      JOIN directory_profiles p ON p.id = h.profile_id
      WHERE h.bucket_hour >= ?1 AND h.bucket_hour <= ?2 AND p.status='published'
      GROUP BY p.id
    `, "2026-11-07T21:00:00.000Z", "2026-11-14T20:00:00.000Z");
    assert.match(plan, /directory_profile_view_hourly_window_idx/);
    assert.doesNotMatch(plan, /SCAN h\b/);
  } finally {
    db.close();
  }
});

test("single editor profile read uses composite primary-key lookup rather than scanning hourly rows", () => {
  const db = fixture();
  try {
    const plan = explain(db, `
      SELECT COALESCE(SUM(qualified_views),0)
      FROM directory_profile_view_hourly
      WHERE profile_id = ?1 AND bucket_hour <= ?2
    `, 123, "2026-11-14T20:00:00.000Z");
    assert.match(plan, /SEARCH directory_profile_view_hourly USING INDEX sqlite_autoindex_directory_profile_view_hourly_1/);
  } finally {
    db.close();
  }
});

test("analytics retention deletes via partial expiry index, without unrelated security-key scans", () => {
  const db = fixture();
  try {
    const plan = explain(db, `
      DELETE FROM security_rate_limits
      WHERE bucket_key IN (
        SELECT bucket_key FROM security_rate_limits INDEXED BY profile_view_rate_expiry_idx
        WHERE bucket_key GLOB 'public-profile-view-*' AND expires_at < ?
        LIMIT 128
      )
    `, "2026-11-14T20:00:00.000Z");
    assert.match(plan, /profile_view_rate_expiry_idx/);
    assert.match(plan, /expires_at<\?/);
  } finally {
    db.close();
  }
});
