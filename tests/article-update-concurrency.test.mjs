import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import vm from "node:vm";

// Execute the production PUT and updateManagedArticle functions against real
// SQLite. In particular, the race is injected after the route's initial read
// and before its conditional UPDATE, not approximated by a source-code regex.
const store = readFileSync(new URL("../lib/article-store.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/admin/articles/[id]/route.ts", import.meta.url), "utf8");

function sliceFunction(src, first, next) {
  const from = src.indexOf(first);
  const to = src.indexOf(next, from);
  assert.ok(from !== -1 && to > from, first);
  return src.slice(from, to).replace(/^export /, "");
}
const update = sliceFunction(store, "export async function updateManagedArticle(", "/**\n * Calendar-only scheduling adapter:");
const breedSync = sliceFunction(store, "async function syncArticleBreeds(", "export async function createManagedArticle(");
const routeError = sliceFunction(api, "function updateErrorResponse(", "export async function GET(");
const routePut = sliceFunction(api, "export async function PUT(", "/**\n * Calendar rescheduling");
const tick = String.fromCharCode(96);
const marker = "const articleStatement = database.prepare(" + tick;
const sql = update.slice(update.indexOf(marker) + marker.length, update.indexOf(tick + ").bind(", update.indexOf(marker)));
const columns = sql.slice(sql.indexOf("SET") + 3, sql.indexOf("WHERE id = ?"))
  .split(",").map((piece) => {
    const match = /^([a-z_]+)\s*=\s*\?$/.exec(piece.trim());
    assert.ok(match, "Invalid production UPDATE assignment: " + piece);
    return match[1];
  });

function createHarness(status, injectConcurrentWrite = null) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE managed_articles (id INTEGER PRIMARY KEY, " +
    [...new Set(columns)].map((col) => col + " TEXT").join(", ") + ")");
  sqlite.exec("CREATE TABLE article_topic_assignments (article_id INTEGER, topic_id INTEGER, created_at TEXT)");
  sqlite.exec("CREATE TABLE breed_article_relations (breed_id INTEGER, article_id INTEGER, created_at TEXT, created_by TEXT)");
  sqlite.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY)");
  sqlite.exec("INSERT INTO managed_breeds (id) VALUES (10), (20)");
  const version = "2026-10-13T20:00:00.000Z";
  sqlite.prepare("INSERT INTO managed_articles (id, updated_at, status, title, image_key, og_image_key) VALUES (7, ?, ?, 'Original', 'r2/old.webp', 'r2/og.webp')").run(version, status);
  sqlite.prepare("INSERT INTO article_topic_assignments VALUES (7, 1, ?)").run(version);
  sqlite.prepare("INSERT INTO breed_article_relations VALUES (10, 7, ?, 'first')").run(version);

  const prepared = (sql, args = []) => ({ sql, args, bind(...values) { return prepared(sql, values); } });
  const db = {
    prepare(sql) { return prepared(sql); },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(({ sql, args }) => {
          const stmt = sqlite.prepare(sql);
          return /\bRETURNING\b/i.test(sql)
            ? { results: stmt.all(...args) }
            : { results: [], meta: stmt.run(...args) };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };
  const deletes = [];
  let pendingWrite = injectConcurrentWrite;
  function readArticle() {
    const row = sqlite.prepare("SELECT * FROM managed_articles WHERE id = 7").get();
    return {
      id: 7, updatedAt: row.updated_at, status: row.status, title: row.title,
      authorProfileId: null, imageKey: row.image_key, ogImageKey: row.og_image_key,
      portalSection: "clanky", portalSubpage: null, imageDisplay: "auto",
      imageFocusX: null, imageFocusY: null, sections: [], sources: [],
      relatedBreedIds: [10], blocks: [], topics: [{ id: 1 }],
    };
  }
  class ArticleUpdateConflictError extends Error {
    constructor() { super("Článok sa medzičasom zmenil. Obnov editor a skontroluj údaje."); this.name = "ArticleUpdateConflictError"; }
  }
  class ArticleRescheduleConflictError extends Error {
    constructor() { super("Scheduling conflict"); this.name = "ArticleRescheduleConflictError"; }
  }
  const scope = {
    Date, Number, JSON, Response, Promise, Error,
    ArticleUpdateConflictError, ArticleRescheduleConflictError,
    requireD1Binding: () => db,
    ensureArticleStore: async () => {},
    getManagedArticleById: async () => readArticle(),
    normalizeInput: async (payload) => {
      if (pendingWrite) {
        const write = pendingWrite;
        pendingWrite = null;
        write(sqlite);
      }
      return {
        slug: "article-7", title: payload.title, excerpt: "Long enough article excerpt",
        category: "Zdravie", portalSection: "clanky", portalSubpage: null,
        newsCategory: null, status: payload.status, accent: "forest",
        author: "Editor", authorProfileId: null,
        intro: "Long enough intro for article", introRichText: {}, takeaway: "",
        takeawayRichText: {}, sections: [], sources: [], blocks: [],
        imageUrl: "/media/articles/new.webp", imageKey: "r2/new.webp",
        imageDisplay: "auto", imageFocusX: null, imageFocusY: null,
        thumbnailImageDisplay: null, detailImageDisplay: null,
        imageAlt: null, imageCaption: null, imageCredit: null, imageCreditUrl: null,
        readingMinutes: 5, publishedAt: payload.status === "draft" ? null : "2026-10-13T12:00:00.000Z",
        contentUpdatedAt: null, showUpdated: false,
        seoTitle: "", metaDescription: "", canonicalUrl: "", noindex: false,
        focusKeyword: "", ogTitle: "", ogDescription: "", ogImageUrl: null,
        ogImageKey: "r2/og.webp", relatedBreedIds: payload.relatedBreedIds ?? [],
      };
    },
    validateArticleTopicIds: async (_, ids) => ids,
    replaceArticleTopicStatements: (database, id, ids, now) => [
      database.prepare("DELETE FROM article_topic_assignments WHERE article_id = ?").bind(id),
      ...ids.map((topicId) => database.prepare(
        "INSERT INTO article_topic_assignments (article_id, topic_id, created_at) VALUES (?, ?, ?)"
      ).bind(id, topicId, now)),
    ],
    getArticleTopicsByArticleId: async () => sqlite.prepare("SELECT topic_id AS id FROM article_topic_assignments ORDER BY topic_id").all(),
    rowToManagedArticle: (row, breeds, topics) => ({
      id: row.id, updatedAt: row.updated_at, status: row.status, title: row.title,
      imageKey: row.image_key, ogImageKey: row.og_image_key,
      blocks: [], relatedBreedIds: breeds, topics,
    }),
    getAdminApiUser: async () => ({ email: "admin@example.com" }),
    parsedId: async () => 7,
    env: { BUCKET: { async delete(key) { deletes.push(key); } } },
    articleBlockImageKeys: () => [],
    orphanedArticleMediaKeys: (previous, current) =>
      [...new Set(previous)].filter((key) => key && !current.includes(key)),
    isArticlePublishIntegrityError: () => false,
    isArticleSlugConflict: () => false,
  };
  const updateManagedArticle = vm.runInNewContext(
    stripTypeScriptTypes(breedSync + "\n" + update + "\nupdateManagedArticle"), scope);
  scope.updateManagedArticle = updateManagedArticle;
  const PUT = vm.runInNewContext(
    stripTypeScriptTypes(routeError + "\n" + routePut + "\nPUT"), scope);
  function request(expectedUpdatedAt = version) {
    return new Request("https://psipedia.sk/api/admin/articles/7", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Editor overwrite", status, expectedUpdatedAt,
        topicIds: [2], relatedBreedIds: [20],
      }),
    });
  }
  const article = () => sqlite.prepare("SELECT updated_at, status, title, image_key, og_image_key FROM managed_articles WHERE id = 7").get();
  const topics = () => sqlite.prepare("SELECT topic_id FROM article_topic_assignments ORDER BY topic_id").all().map((v) => v.topic_id);
  const breeds = () => sqlite.prepare("SELECT breed_id FROM breed_article_relations ORDER BY breed_id").all().map((v) => v.breed_id);
  return { sqlite, PUT, request, article, topics, breeds, deletes, updateManagedArticle, readArticle, version };
}

for (const status of ["draft", "scheduled", "published"]) {
  test("SQL CAS rejects a real concurrent Notion update of " + status + " before topic/breed/R2 effects", async () => {
    const h = createHarness(status, (db) => {
      db.prepare("UPDATE managed_articles SET title = 'New Notion content', updated_at = ?, image_key = 'r2/notion.webp' WHERE id = 7")
        .run("2026-10-13T20:00:02.000Z");
    });
    try {
      const response = await h.PUT(h.request(), { params: Promise.resolve({ id: "7" }) });
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /Článok sa medzičasom zmenil/);
      assert.equal(h.article().title, "New Notion content");
      assert.equal(h.article().status, status);
      assert.equal(h.article().image_key, "r2/notion.webp");
      assert.equal(h.article().og_image_key, "r2/og.webp");
      assert.deepEqual(h.topics(), [1]);
      assert.deepEqual(h.breeds(), [10]);
      assert.deepEqual(h.deletes, []);
    } finally {
      h.sqlite.close();
    }
  });
}

test("SQL CAS allows an unchanged published version and then updates relationships and R2", async () => {
  const h = createHarness("published");
  try {
    const response = await h.PUT(h.request(), { params: Promise.resolve({ id: "7" }) });
    assert.equal(response.status, 200);
    assert.equal(h.article().title, "Editor overwrite");
    assert.equal(h.article().status, "published");
    assert.notEqual(h.article().updated_at, h.version);
    assert.deepEqual(h.topics(), [2]);
    assert.deepEqual(h.breeds(), [20]);
    assert.deepEqual(h.deletes, ["r2/old.webp"]);
  } finally {
    h.sqlite.close();
  }
});

test("SQL CAS preserves scheduled-only precondition if status changes with identical timestamp", async () => {
  const h = createHarness("draft");
  try {
    const before = h.readArticle();
    await assert.rejects(
      h.updateManagedArticle(7, { title: "Edited", status: "scheduled", topicIds: [2], relatedBreedIds: [20] },
        "admin@example.com", before, { updatedAt: before.updatedAt, status: "scheduled" }),
      /ArticleRescheduleConflictError/,
    );
    assert.equal(h.article().status, "draft");
    assert.deepEqual(h.topics(), [1]);
    assert.deepEqual(h.breeds(), [10]);
  } finally {
    h.sqlite.close();
  }
});

test("PUT requires an optimistic version before touching SQL or R2", async () => {
  const h = createHarness("draft");
  try {
    const response = await h.PUT(h.request(""), { params: Promise.resolve({ id: "7" }) });
    assert.equal(response.status, 409);
    assert.deepEqual(h.topics(), [1]);
    assert.deepEqual(h.breeds(), [10]);
    assert.deepEqual(h.deletes, []);
  } finally {
    h.sqlite.close();
  }
});
