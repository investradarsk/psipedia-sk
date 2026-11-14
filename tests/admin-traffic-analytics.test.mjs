import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  loadAdminTrafficReport,
  parseTrafficWindow,
  trafficChartTimeline,
} from "../lib/admin-traffic-analytics.ts";

const articleMigration = await readFile(
  new URL("../drizzle/0105_article_popularity.sql", import.meta.url),
  "utf8",
);
const profileMigration = await readFile(
  new URL("../drizzle/0167_content_analytics_profile_views.sql", import.meta.url),
  "utf8",
);
const now = new Date("2026-11-14T20:37:41.000Z");

function fixture(profileSchema = true) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managed_articles (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      portal_section TEXT NOT NULL,
      status TEXT NOT NULL,
      published_at TEXT
    );
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE security_rate_limits (
      bucket_key TEXT PRIMARY KEY,
      window_started_at TEXT NOT NULL,
      count INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  sqlite.exec(articleMigration);
  if (profileSchema) sqlite.exec(profileMigration);
  sqlite.exec(`
    INSERT INTO managed_articles(id, slug, title, portal_section, status, published_at)
    VALUES
      (1, 'published-a', 'Článok A', 'starostlivost', 'published', '2026-11-12T00:00:00.000Z'),
      (2, 'published-b', 'Článok B', 'aktivity', 'published', '2026-11-13T00:00:00.000Z'),
      (3, 'draft', 'Koncept', 'clanky', 'draft', NULL),
      (4, 'future', 'Budúci článok', 'clanky', 'scheduled', '2026-12-01T00:00:00.000Z'),
      (5, 'scheduled-old', 'Naplánovaný zverejnený', 'clanky', 'scheduled', '2026-11-10T00:00:00.000Z');
    INSERT INTO directory_profiles(id, slug, name, category, status)
    VALUES
      (1, 'sirius', 'Akadémia Sirius', 'treneri', 'published'),
      (2, 'secret', 'Archivovaný profil', 'veterinari', 'archived'),
      (3, 'concept', 'Koncept profilu', 'veterinari', 'draft');
  `);
  const addArticle = sqlite.prepare(`
    INSERT INTO article_read_hourly(article_id, bucket_hour, qualified_reads, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const [id, hour, views] of [
    [1, "2026-11-14T20:00:00.000Z", 9],
    [2, "2026-11-14T20:00:00.000Z", 4],
    [3, "2026-11-14T20:00:00.000Z", 99],
    [4, "2026-11-14T20:00:00.000Z", 99],
    [5, "2026-11-14T20:00:00.000Z", 3],
    [1, "2026-10-01T10:00:00.000Z", 13],
  ]) addArticle.run(id, hour, views, now.toISOString());
  if (profileSchema) {
    const addProfile = sqlite.prepare(`
      INSERT INTO directory_profile_view_hourly(profile_id, bucket_hour, qualified_views, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const [id, hour, views] of [
      [1, "2026-11-14T20:00:00.000Z", 6],
      [1, "2026-10-01T10:00:00.000Z", 7],
      [2, "2026-11-14T20:00:00.000Z", 99],
      [3, "2026-11-14T20:00:00.000Z", 99],
    ]) addProfile.run(id, hour, views, now.toISOString());
  }
  const database = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return sqlite.prepare(sql).get(...args) ?? null;
            },
            async all() {
              return { results: sqlite.prepare(sql).all(...args) };
            },
          };
        },
      };
    },
  };
  return { sqlite, database };
}

test("analytics period picker validates input and defaults safely", () => {
  for (const window of ["24h", "7d", "30d", "all"]) {
    assert.equal(parseTrafficWindow(window), window);
  }
  assert.equal(parseTrafficWindow("something-dangerous"), "7d");
  assert.equal(parseTrafficWindow(undefined), "7d");
  assert.equal(parseTrafficWindow(["24h", "all"]), "24h");
});

test("trend windows have stable 24/7/30/12 buckets without forecast or artificial visitors", () => {
  assert.equal(trafficChartTimeline("24h", now).length, 24);
  assert.equal(trafficChartTimeline("7d", now).length, 7);
  assert.equal(trafficChartTimeline("30d", now).length, 30);
  const months = trafficChartTimeline("all", now);
  assert.equal(months.length, 12);
  assert.equal(months[0].key, "2025-12");
  assert.equal(months[11].key, "2026-11");
});

test("stats aggregate only published content and keep article/profile IDs independent", async () => {
  const { sqlite, database } = fixture();
  try {
    const report = await loadAdminTrafficReport({ window: "24h", now, database });
    assert.equal(report.articles.available, true);
    assert.equal(report.profiles.available, true);
    assert.equal(report.articles.total, 16);
    assert.equal(report.profiles.total, 6);
    assert.equal(report.combined, 22);
    assert.deepEqual(report.articles.top.map((x) => [x.title, x.views]), [
      ["Článok A", 9],
      ["Článok B", 4],
      ["Naplánovaný zverejnený", 3],
    ]);
    assert.equal(report.articles.top[0].href, "/starostlivost/published-a");
    assert.equal(report.profiles.top[0].href, "/adresar/treneri/sirius");
    assert.equal(report.articles.points.reduce((s, row) => s + row.views, 0), 16);
    assert.equal(report.profiles.points.reduce((s, row) => s + row.views, 0), 6);
  } finally {
    sqlite.close();
  }
});

test("7d and 30d rolling views use bounded intervals and do not include old history", async () => {
  const { sqlite, database } = fixture();
  try {
    for (const period of ["7d", "30d"]) {
      const report = await loadAdminTrafficReport({ window: period, now, database });
      assert.equal(report.articles.total, 16);
      assert.equal(report.profiles.total, 6);
      assert.equal(report.articles.points.length, period === "7d" ? 7 : 30);
      assert.equal(report.articles.points.reduce((sum, row) => sum + row.views, 0), 16);
      assert.equal(report.profiles.points.reduce((sum, row) => sum + row.views, 0), 6);
    }
  } finally {
    sqlite.close();
  }
});

test("all-time totals preserve historical article counts while showing only 12 recent months in chart", async () => {
  const { sqlite, database } = fixture();
  try {
    const report = await loadAdminTrafficReport({ window: "all", now, database });
    assert.equal(report.articles.total, 29);
    assert.equal(report.profiles.total, 13);
    assert.equal(report.combined, 42);
    assert.equal(report.articles.points.length, 12);
    assert.equal(report.profiles.points.length, 12);
    assert.equal(report.articles.points.reduce((s, row) => s + row.views, 0), 29);
    assert.equal(report.profiles.points.reduce((s, row) => s + row.views, 0), 13);
  } finally {
    sqlite.close();
  }
});

test("dashboard leaves articles available if owner-only profile migration has not been applied", async () => {
  const { sqlite, database } = fixture(false);
  const original = console.error;
  console.error = () => {};
  try {
    const report = await loadAdminTrafficReport({ window: "7d", now, database });
    assert.equal(report.articles.available, true);
    assert.equal(report.articles.total, 16);
    assert.equal(report.profiles.available, false);
    assert.equal(report.profiles.total, null);
    assert.equal(report.combined, null);
    assert.deepEqual(report.profiles.top, []);
  } finally {
    console.error = original;
    sqlite.close();
  }
});

test("missing D1 does not invent zero visits or crash authenticated admin", async () => {
  const report = await loadAdminTrafficReport({ window: "30d", now, database: null });
  assert.equal(report.articles.available, false);
  assert.equal(report.profiles.available, false);
  assert.equal(report.combined, null);
});

test("admin statistics remain an authenticated settings subroute, not a public metrics endpoint", async () => {
  const page = await readFile(new URL("../app/admin/nastavenia/statistiky/page.tsx", import.meta.url), "utf8");
  const nav = await readFile(new URL("../lib/admin-navigation.ts", import.meta.url), "utf8");
  const settings = await readFile(new URL("../app/admin/nastavenia/page.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../components/admin-traffic-dashboard.tsx", import.meta.url), "utf8");

  assert.ok(page.indexOf("requireAdminPageUser(") < page.indexOf("loadAdminTrafficReport("));
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /<AdminTrafficDashboard report=\{report\}/);
  assert.match(nav, /Štatistiky.*\/admin\/nastavenia\/statistiky/);
  assert.match(settings, /href="\/admin\/nastavenia\/statistiky"/);
  assert.match(dashboard, /"24h"/);
  assert.match(dashboard, /"7d"/);
  assert.match(dashboard, /"30d"/);
  assert.match(dashboard, /"all"/);
  assert.match(dashboard, /Návštevníci celej stránky a používatelia práve online sa zatiaľ v tomto prehľade nemerajú/);
});
