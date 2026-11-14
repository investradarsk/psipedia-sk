import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getQualifiedContentViewCount } from "../lib/content-analytics.ts";

const source = await readFile(
  new URL("../drizzle/0105_article_popularity.sql", import.meta.url),
  "utf8",
);
const now = new Date("2026-11-14T20:37:41.000Z");

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managed_articles(id INTEGER PRIMARY KEY, status TEXT NOT NULL);
    INSERT INTO managed_articles(id, status) VALUES (1, 'published'), (2, 'published');
  `);
  // The historical article migration is sufficient: 0167 must not be required.
  sqlite.exec(source);
  const insert = sqlite.prepare(`
    INSERT INTO article_read_hourly(article_id, bucket_hour, qualified_reads, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const [id, hour, count] of [
    [1, "2026-11-14T20:00:00.000Z", 3],
    [1, "2026-11-13T21:00:00.000Z", 4],
    [1, "2026-10-10T20:00:00.000Z", 5],
    [1, "2026-11-15T20:00:00.000Z", 99],
    [2, "2026-11-14T20:00:00.000Z", 42],
  ]) insert.run(id, hour, count, now.toISOString());

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

test("public article count works against legacy article D1 table before profile migration", async () => {
  const { sqlite, database } = setup();
  try {
    const total = await getQualifiedContentViewCount({
      entityType: "ARTICLE", entityId: 1, window: "all", now, database,
    });
    assert.equal(total, 12);
    assert.equal(await getQualifiedContentViewCount({
      entityType: "ARTICLE", entityId: 1, window: "24h", now, database,
    }), 7);
    assert.equal(await getQualifiedContentViewCount({
      entityType: "ARTICLE", entityId: 2, window: "all", now, database,
    }), 42);
  } finally {
    sqlite.close();
  }
});

test("no reads is a real zero, while broken or missing database is unknown", async () => {
  const { sqlite, database } = setup();
  const originalError = console.error;
  try {
    assert.equal(await getQualifiedContentViewCount({
      entityType: "ARTICLE", entityId: 999, window: "all", now, database,
    }), 0);
    assert.equal(await getQualifiedContentViewCount({
      entityType: "ARTICLE", entityId: 1, window: "all", now, database: null,
    }), null);
    console.error = () => {};
    assert.equal(await getQualifiedContentViewCount({
      entityType: "DIRECTORY_PROFILE", entityId: 1, window: "all", now, database,
    }), null, "missing 0167 must not be shown as zero");
  } finally {
    console.error = originalError;
    sqlite.close();
  }
});

test("canonical and legacy public article routes pass real D1 counts into one detail component", async () => {
  const modern = await readFile(
    new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8",
  );
  const legacy = await readFile(
    new URL("../app/clanky/[slug]/page.tsx", import.meta.url), "utf8",
  );
  for (const route of [modern, legacy]) {
    assert.match(route, /getQualifiedContentViewCount\(\{/);
    assert.match(route, /entityType: "ARTICLE"/);
    assert.match(route, /entityId: storedArticle\.id/);
    assert.match(route, /window: "all"/);
    assert.match(route, /qualifiedReads=\{qualifiedReads\}/);
    assert.ok(route.indexOf("const canonical = articleHref(article)") < route.indexOf("getQualifiedContentViewCount({"),
      "do not query counts until after canonical redirect and publication checks");
  }
});

test("public detail displays exact localized reads beside date; unavailable count is omitted", async () => {
  const detail = await readFile(
    new URL("../components/article-detail.tsx", import.meta.url), "utf8",
  );
  const styles = await readFile(
    new URL("../components/article-detail.module.css", import.meta.url), "utf8",
  );
  const publicDirectory = await readFile(
    new URL("../components/directory-profile-detail.tsx", import.meta.url), "utf8",
  );
  assert.match(detail, /qualifiedReads = null/);
  assert.match(detail, /typeof qualifiedReads === "number"/);
  assert.match(detail, /Number\.isFinite\(qualifiedReads\)/);
  assert.match(detail, /data-article-qualified-reads/);
  assert.match(detail, /Prečítané <strong>/);
  assert.match(detail, /Intl\.NumberFormat\("sk-SK"\)\.format\(qualifiedReads\)/);
  assert.match(styles, /\.articleMeta \[data-article-qualified-reads\]/);
  assert.doesNotMatch(publicDirectory, /data-article-qualified-reads|qualifiedReads/);
});
