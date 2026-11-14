import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPopularDirectoryProfiles, getPopularDirectoryProfilesBothWindows } from "../lib/directory-popularity.ts";
import { mergePopularContent } from "../lib/article-discovery.ts";

const profileMigration = await readFile(
  new URL("../drizzle/0167_content_analytics_profile_views.sql", import.meta.url),
  "utf8",
);
const articleMigration = await readFile(
  new URL("../drizzle/0105_article_popularity.sql", import.meta.url),
  "utf8",
);

const now = new Date("2026-11-14T20:37:41.000Z");

function fixture(withProfileMigration = true) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managed_articles(id INTEGER PRIMARY KEY);
    CREATE TABLE directory_profiles(
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT,
      status TEXT NOT NULL
    );
    CREATE TABLE security_rate_limits(
      bucket_key TEXT PRIMARY KEY NOT NULL,
      window_started_at TEXT NOT NULL,
      count INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  sqlite.exec(articleMigration);
  if (withProfileMigration) sqlite.exec(profileMigration);
  sqlite.exec(`
    INSERT INTO managed_articles(id) VALUES (1);
    INSERT INTO directory_profiles(id, slug, name, category, image_url, status)
    VALUES
      (1, 'sirius', 'Akadémia Sirius', 'treneri', 'https://psipedia.sk/media/sirius.jpg', 'published'),
      (2, 'vet-help', 'Veterinárna ambulancia', 'veterinari', NULL, 'published'),
      (3, 'concept', 'Koncept', 'treneri', NULL, 'draft'),
      (4, 'archived', 'Archivovaný profil', 'treneri', NULL, 'archived');
  `);
  if (withProfileMigration) {
    const add = sqlite.prepare(`
      INSERT INTO directory_profile_view_hourly
        (profile_id, bucket_hour, qualified_views, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const [id, hour, views] of [
      [1, "2026-11-14T20:00:00.000Z", 12],
      [1, "2026-11-12T20:00:00.000Z", 3],
      [2, "2026-11-14T20:00:00.000Z", 5],
      [3, "2026-11-14T20:00:00.000Z", 100],
      [4, "2026-11-14T20:00:00.000Z", 100],
      [1, "2026-10-20T10:00:00.000Z", 50],
    ]) add.run(id, hour, views, now.toISOString());
  }
  const database = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
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

function article(slug, qualifiedReads) {
  return {
    slug,
    title: slug,
    href: `/clanky/${slug}`,
    label: "Článok",
    qualifiedReads,
  };
}

function profile(slug, qualifiedViews) {
  return {
    slug,
    title: slug,
    href: `/adresar/treneri/${slug}`,
    label: "Tréneri psov",
    qualifiedViews,
    contentType: "profile",
  };
}

test("profile popularity reads only published canonical profiles and actual qualified counts", async () => {
  const { sqlite, database } = fixture();
  try {
    const recent = await getPopularDirectoryProfiles({ window: "24h", now, limit: 5, database });
    assert.equal(recent.length, 2);
    assert.deepEqual(recent.map((item) => [item.id, item.slug, item.qualifiedViews]), [
      [1, "sirius", 12],
      [2, "vet-help", 5],
    ]);
    assert.equal(recent[0].category, "treneri");
    assert.equal(recent[0].imageUrl, "https://psipedia.sk/media/sirius.jpg");

    const week = await getPopularDirectoryProfiles({ window: "7d", now, database });
    assert.deepEqual(week.map((item) => [item.slug, item.qualifiedViews]), [
      ["sirius", 15],
      ["vet-help", 5],
    ]);
  } finally {
    sqlite.close();
  }
});

test("both public tabs use only one D1 read and preserve exact period ordering", async () => {
  const { sqlite, database } = fixture();
  let statementCount = 0;
  const measured = {
    prepare(sql) {
      statementCount += 1;
      return database.prepare(sql);
    },
  };
  try {
    const rankings = await getPopularDirectoryProfilesBothWindows({
      now, limit: 5, database: measured,
    });
    assert.equal(statementCount, 1);
    assert.deepEqual(rankings["24h"].map((item) => [item.slug, item.qualifiedViews]), [
      ["sirius", 12],
      ["vet-help", 5],
    ]);
    assert.deepEqual(rankings["7d"].map((item) => [item.slug, item.qualifiedViews]), [
      ["sirius", 15],
      ["vet-help", 5],
    ]);
  } finally {
    sqlite.close();
  }
});

test("one-query public profile popularity fails softly before approved migration 0167", async () => {
  const { sqlite, database } = fixture(false);
  const oldError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await getPopularDirectoryProfilesBothWindows({
      now, database,
    }), { "24h": [], "7d": [] });
  } finally {
    console.error = oldError;
    sqlite.close();
  }
});

test("profile popularity honors limit and rejects fake or unavailable content", async () => {
  const { sqlite, database } = fixture();
  try {
    const one = await getPopularDirectoryProfiles({ window: "24h", now, limit: 1, database });
    assert.equal(one.length, 1);
    assert.equal(one[0].slug, "sirius");
    sqlite.prepare("UPDATE directory_profiles SET category='invalid-category' WHERE id=1").run();
    const safe = await getPopularDirectoryProfiles({ window: "24h", now, database });
    assert.deepEqual(safe.map((item) => item.slug), ["vet-help"]);
  } finally {
    sqlite.close();
  }
});

test("before D1 0167, missing profile table fails softly and preserves article-only sidebar", async () => {
  const { sqlite, database } = fixture(false);
  const previous = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await getPopularDirectoryProfiles({ window: "24h", now, database }), []);
    assert.deepEqual(mergePopularContent([article("real-article", 5)], []), [article("real-article", 5)]);
  } finally {
    console.error = previous;
    sqlite.close();
  }
});

test("combined ranking chooses real highest views from either type and keeps exact profile link", () => {
  const combined = mergePopularContent(
    [article("article-top", 18), article("article-small", 3)],
    [profile("profile-top", 20), profile("profile-low", 2)],
  );
  assert.deepEqual(combined.map((item) => item.href), [
    "/adresar/treneri/profile-top",
    "/clanky/article-top",
    "/clanky/article-small",
    "/adresar/treneri/profile-low",
  ]);
  assert.equal(combined[0].qualifiedViews, 20);
  assert.equal(combined[1].qualifiedReads, 18);
  assert.equal(combined[0].contentType, "profile");
});

test("only five actual qualified items are displayed; no guessed or duplicate slug identity", () => {
  const ordered = mergePopularContent(
    [article("same", 8), article("second", 7), article("third", 6)],
    [profile("same", 9), profile("second", 0), profile("third", 5)],
  );
  assert.equal(ordered.length, 5);
  assert.equal(new Set(ordered.map((item) => item.href)).size, 5);
  assert.equal(ordered[0].href, "/adresar/treneri/same");
  assert.equal(ordered[1].href, "/clanky/same");
  assert.ok(ordered.every((item) => (item.qualifiedViews ?? item.qualifiedReads ?? 0) > 0));
});

test("existing article, listing and directory route share the same visual component", async () => {
  const sidebar = await readFile(
    new URL("../components/article-popularity-sidebar.tsx", import.meta.url),
    "utf8",
  );
  const discovery = await readFile(
    new URL("../lib/article-discovery.ts", import.meta.url),
    "utf8",
  );
  const detail = await readFile(
    new URL("../components/article-detail.tsx", import.meta.url),
    "utf8",
  );
  const listing = await readFile(
    new URL("../app/clanky/page.tsx", import.meta.url),
    "utf8",
  );
  const directory = await readFile(
    new URL("../components/directory-page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(discovery, /getPopularDirectoryProfiles/);
  assert.match(discovery, /getPopularArticles/);
  assert.match(discovery, /mergePopularContent/);
  assert.match(sidebar, /Najčítanejšie/);
  assert.match(sidebar, /Zobrazenia profilu:/);
  assert.match(sidebar, /Počet prečítaní:/);
  assert.match(sidebar, /data-popularity-window=\{activeWindow\}/);
  assert.match(sidebar, /role="tablist"/);
  assert.match(sidebar, /data-popularity-type/);
  assert.match(detail, /<ArticlePopularitySidebar/);
  assert.match(listing, /<ArticlePopularitySidebar/);
  assert.match(directory, /<ArticlePopularitySidebar/);
  assert.match(directory, /initialWindow=\{discovery.initialWindow\}/);
});
