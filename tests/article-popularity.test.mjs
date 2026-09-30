import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  articlePopularityWindowStart,
  articleReadHourBucket,
  getPopularArticles,
  recordQualifiedArticleRead,
} from "../lib/article-popularity.ts";
import {
  ARTICLE_READ_COOLDOWN_MS,
  ARTICLE_READ_QUALIFY_MS,
  articleReadIsCoolingDown,
  createArticleReadClock,
  markArticleReadCooldown,
  sendQualifiedArticleRead,
  updateArticleReadClock,
} from "../lib/article-read-tracking.ts";
import { hasInternalTrafficCookie } from "../lib/internal-traffic.ts";
import { POST as postArticleRead } from "../app/api/articles/read/route.ts";

const migration = await readFile(new URL("../drizzle/0105_article_popularity.sql", import.meta.url), "utf8");
const endpoint = await readFile(new URL("../app/api/articles/read/route.ts", import.meta.url), "utf8");
const tracker = await readFile(new URL("../components/article-read-tracker.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../components/article-detail.tsx", import.meta.url), "utf8");

function fakeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function publicAt(article, nowIso) {
  return article.status === "published"
    || (article.status === "scheduled" && Boolean(article.published_at) && article.published_at <= nowIso);
}

function fakeDatabase(articles, reads = []) {
  const readMap = new Map(reads.map((row) => [`${row.article_id}|${row.bucket_hour}`, { ...row }]));
  return {
    readMap,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM managed_articles") && sql.includes("WHERE slug = ?")) {
                const article = articles.find((item) => item.slug === args[0]);
                return article ? { id: article.id, status: article.status, published_at: article.published_at } : null;
              }
              if (sql.includes("INSERT INTO article_read_hourly")) {
                const [articleId, bucketHour, updatedAt] = args;
                const key = `${articleId}|${bucketHour}`;
                const current = readMap.get(key);
                const next = {
                  article_id: articleId,
                  bucket_hour: bucketHour,
                  qualified_reads: (current?.qualified_reads ?? 0) + 1,
                  updated_at: updatedAt,
                };
                readMap.set(key, next);
                return { qualified_reads: next.qualified_reads };
              }
              throw new Error("Unexpected first query");
            },
            async all() {
              if (!sql.includes("FROM article_read_hourly h")) throw new Error("Unexpected all query");
              const [startBucket, currentBucket, nowIso, excludeSlug, limit] = args;
              const grouped = new Map();
              for (const row of readMap.values()) {
                if (row.bucket_hour < startBucket || row.bucket_hour > currentBucket) continue;
                const article = articles.find((item) => item.id === row.article_id);
                if (!article || !publicAt(article, nowIso) || (excludeSlug && article.slug === excludeSlug)) continue;
                const current = grouped.get(article.id) ?? { article, qualified_reads: 0 };
                current.qualified_reads += row.qualified_reads;
                grouped.set(article.id, current);
              }
              const results = [...grouped.values()]
                .sort((a, b) => (
                  b.qualified_reads - a.qualified_reads
                  || String(b.article.published_at ?? b.article.updated_at).localeCompare(String(a.article.published_at ?? a.article.updated_at))
                  || b.article.id - a.article.id
                ))
                .slice(0, limit)
                .map(({ article, qualified_reads }) => ({
                  id: article.id,
                  slug: article.slug,
                  title: article.title,
                  category: article.category,
                  portal_section: article.portal_section,
                  portal_subpage: article.portal_subpage ?? null,
                  news_category: article.news_category ?? null,
                  image_url: article.image_url ?? null,
                  published_at: article.published_at ?? article.updated_at,
                  updated_at: article.updated_at,
                  qualified_reads,
                }));
              return { results };
            },
          };
        },
      };
    },
  };
}

const now = new Date("2026-09-30T20:37:41.000Z");
const articles = [
  { id: 1, slug: "published-a", title: "A", category: "Zdravie", portal_section: "starostlivost", status: "published", published_at: "2026-09-29T10:00:00.000Z", updated_at: "2026-09-29T10:00:00.000Z" },
  { id: 2, slug: "published-b", title: "B", category: "Výcvik", portal_section: "aktivity", status: "published", published_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:00:00.000Z" },
  { id: 3, slug: "draft", title: "Draft", category: "Zdravie", portal_section: "starostlivost", status: "draft", published_at: null, updated_at: "2026-09-30T10:00:00.000Z" },
  { id: 4, slug: "future", title: "Future", category: "Zdravie", portal_section: "starostlivost", status: "scheduled", published_at: "2026-10-01T10:00:00.000Z", updated_at: "2026-09-30T10:00:00.000Z" },
  { id: 5, slug: "past-scheduled", title: "Past scheduled", category: "Zdravie", portal_section: "starostlivost", status: "scheduled", published_at: "2026-09-30T19:00:00.000Z", updated_at: "2026-09-30T19:00:00.000Z" },
];

test("ARTICLE-POPULARITY migration is schema-only with composite identity, FK and rolling index", () => {
  assert.match(migration, /CREATE TABLE article_read_hourly/);
  assert.match(migration, /PRIMARY KEY \(article_id, bucket_hour\)/);
  assert.match(migration, /REFERENCES managed_articles\(id\) ON DELETE CASCADE/);
  assert.match(migration, /qualified_reads INTEGER NOT NULL DEFAULT 0 CHECK \(qualified_reads >= 0\)/);
  assert.match(migration, /CREATE INDEX article_read_hourly_bucket_idx/);
  assert.doesNotMatch(migration, /INSERT INTO managed_articles|UPDATE managed_articles|INSERT INTO article_read_hourly/i);
});

test("hour bucket and rolling boundaries are inclusive 24/168-bucket windows", () => {
  assert.equal(articleReadHourBucket(now), "2026-09-30T20:00:00.000Z");
  assert.equal(articlePopularityWindowStart("24h", now), "2026-09-29T21:00:00.000Z");
  assert.equal(articlePopularityWindowStart("7d", now), "2026-09-23T21:00:00.000Z");
});

test("qualified writes atomically increment current bucket and create a later-hour bucket", async () => {
  const database = fakeDatabase(articles);
  assert.equal((await recordQualifiedArticleRead({ articleSlug: "published-a", now, database })).qualifiedReads, 1);
  assert.equal((await recordQualifiedArticleRead({ articleSlug: "published-a", now, database })).qualifiedReads, 2);
  assert.equal((await recordQualifiedArticleRead({ articleSlug: "published-a", now: new Date("2026-09-30T21:01:00.000Z"), database })).qualifiedReads, 1);
  assert.equal(database.readMap.size, 2);
});

test("writes reject unknown, draft and future scheduled articles but accept a public scheduled article", async () => {
  const database = fakeDatabase(articles);
  for (const articleSlug of ["missing", "draft", "future"]) {
    assert.equal((await recordQualifiedArticleRead({ articleSlug, now, database })).recorded, false);
  }
  assert.equal((await recordQualifiedArticleRead({ articleSlug: "past-scheduled", now, database })).recorded, true);
});

test("popularity query enforces rolling windows, publication state, sorting, tie-break and excludeSlug", async () => {
  const current = articleReadHourBucket(now);
  const database = fakeDatabase(articles, [
    { article_id: 1, bucket_hour: current, qualified_reads: 4, updated_at: now.toISOString() },
    { article_id: 2, bucket_hour: current, qualified_reads: 4, updated_at: now.toISOString() },
    { article_id: 3, bucket_hour: current, qualified_reads: 99, updated_at: now.toISOString() },
    { article_id: 4, bucket_hour: current, qualified_reads: 99, updated_at: now.toISOString() },
    { article_id: 1, bucket_hour: "2026-09-29T20:00:00.000Z", qualified_reads: 50, updated_at: now.toISOString() },
    { article_id: 1, bucket_hour: "2026-09-24T20:00:00.000Z", qualified_reads: 3, updated_at: now.toISOString() },
    { article_id: 1, bucket_hour: "2026-09-23T20:00:00.000Z", qualified_reads: 500, updated_at: now.toISOString() },
  ]);
  assert.deepEqual((await getPopularArticles({ window: "24h", now, limit: 10, database })).map((x) => [x.slug, x.qualifiedReads]), [
    ["published-b", 4],
    ["published-a", 4],
  ]);
  assert.deepEqual((await getPopularArticles({ window: "7d", now, limit: 10, database })).map((x) => [x.slug, x.qualifiedReads]), [
    ["published-a", 57],
    ["published-b", 4],
  ]);
  assert.deepEqual((await getPopularArticles({ window: "7d", now, excludeSlug: "published-a", database })).map((x) => x.slug), ["published-b"]);
});

test("popularity query fails soft when D1 analytics storage is unavailable", async () => {
  const database = {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              throw new Error("D1 unavailable");
            },
          };
        },
      };
    },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await getPopularArticles({ window: "24h", now, database }), []);
  } finally {
    console.error = originalError;
  }
});

test("visible-time clock ignores hidden time and qualifies after cumulative ten seconds", () => {
  let clock = createArticleReadClock(0, true);
  clock = updateArticleReadClock(clock, 5_000, false);
  assert.equal(clock.visibleAccumulatedMs, 5_000);
  assert.equal(clock.qualified, false);
  clock = updateArticleReadClock(clock, 55_000, true);
  assert.equal(clock.visibleAccumulatedMs, 5_000);
  clock = updateArticleReadClock(clock, 60_000, true);
  assert.equal(clock.visibleAccumulatedMs, 10_000);
  assert.equal(clock.qualified, true);
  assert.equal(ARTICLE_READ_QUALIFY_MS, 10_000);
});

test("browser cooldown is per article, blocks refresh spam for six hours, and expires", () => {
  const storage = fakeStorage();
  const started = 1_000_000;
  markArticleReadCooldown(storage, "published-a", started);
  assert.equal(articleReadIsCoolingDown(storage, "published-a", started + ARTICLE_READ_COOLDOWN_MS - 1), true);
  assert.equal(articleReadIsCoolingDown(storage, "published-a", started + ARTICLE_READ_COOLDOWN_MS), false);
  assert.equal(articleReadIsCoolingDown(storage, "published-b", started + 1), false);
});

test("network failure is fail-soft and tracker is invisible with visibility lifecycle handling", async () => {
  await assert.doesNotReject(() => sendQualifiedArticleRead("published-a", async () => { throw new Error("offline"); }));
  assert.match(tracker, /visibilitychange/);
  assert.match(tracker, /pagehide/);
  assert.match(tracker, /return null/);
  assert.match(detail, /<ArticleReadTracker articleSlug=\{article\.slug\} \/>/);
});

test("internal traffic uses existing client marker and authoritative psipedia_internal server cookie", () => {
  assert.equal(hasInternalTrafficCookie("a=1; psipedia_internal=1; b=2"), true);
  assert.equal(hasInternalTrafficCookie("psipedia_internal=0"), false);
  assert.match(tracker, /isInternalArticleReadBrowser/);
  assert.match(endpoint, /isInternalTrafficRequest\(request\)/);
});

function readRequest(body, headers = {}) {
  return new Request("https://psipedia.sk/api/articles/read", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://psipedia.sk",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body,
  });
}

test("read endpoint rejects cross-site, invalid JSON and missing slug", async () => {
  const crossSite = await postArticleRead(readRequest(JSON.stringify({ articleSlug: "published-a" }), {
    origin: "https://example.com",
    "sec-fetch-site": "cross-site",
  }));
  assert.equal(crossSite.status, 403);

  const invalidJson = await postArticleRead(readRequest("{"));
  assert.equal(invalidJson.status, 400);

  const missingSlug = await postArticleRead(readRequest("{}"));
  assert.equal(missingSlug.status, 400);
});

test("read endpoint returns 404 for unknown article and 204 for a public article", async () => {
  const database = fakeDatabase(articles);
  (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {}).DB = database;

  const missing = await postArticleRead(readRequest(JSON.stringify({ articleSlug: "missing" })));
  assert.equal(missing.status, 404);

  const accepted = await postArticleRead(readRequest(JSON.stringify({ articleSlug: "published-a" })));
  assert.equal(accepted.status, 204);
  assert.equal(database.readMap.size, 1);
});

test("server internal-traffic cookie is authoritative and prevents any popularity write", async () => {
  const database = {
    prepare() {
      throw new Error("database must not be touched for internal traffic");
    },
  };
  (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {}).DB = database;

  const response = await postArticleRead(readRequest(JSON.stringify({ articleSlug: "published-a" }), {
    cookie: "psipedia_internal=1",
  }));
  assert.equal(response.status, 204);
});

test("read endpoint is POST-only by route contract and narrowly bounded", () => {
  assert.match(endpoint, /export async function POST/);
  assert.doesNotMatch(endpoint, /export async function (GET|PUT|PATCH|DELETE)/);
  assert.match(endpoint, /sec-fetch-site/);
  assert.match(endpoint, /origin/);
  assert.match(endpoint, /referer/);
  assert.match(endpoint, /MAX_BODY_BYTES = 512/);
  assert.match(endpoint, /application\/json/);
  assert.match(endpoint, /recordQualifiedArticleRead/);
});
