import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { articleEffectiveStatusSql, effectiveArticleStatus, articleEffectiveStatusLabel } from "../lib/article-effective-status.ts";
import { buildArticleAdminListQuery } from "../lib/article-admin-query.ts";

const now = "2026-10-15T19:25:00.000Z";
const before = "2026-10-15T19:24:00.000Z";
const future = "2026-10-15T19:26:00.000Z";
const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("effective publication state uses the public gate at and after published_at, without rewriting the raw state", () => {
  for (const [raw, publishedAt, expected] of [
    ["draft", before, "draft"],
    ["draft", future, "draft"],
    ["scheduled", future, "scheduled"],
    ["scheduled", now, "published"],
    ["scheduled", before, "published"],
    ["scheduled", null, "scheduled"],
    ["scheduled", "invalid", "scheduled"],
    ["published", null, "published"],
    ["published", future, "published"],
  ]) {
    assert.equal(effectiveArticleStatus(raw, publishedAt, now), expected);
  }
  assert.equal(articleEffectiveStatusLabel("published"), "Publikovaný");
  assert.equal(articleEffectiveStatusLabel("scheduled"), "Naplánovaný");
  assert.equal(articleEffectiveStatusLabel("draft"), "Koncept");
});

test("admin list SQL filters, rows and counters agree on effective status with one clock snapshot", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_articles (id INTEGER PRIMARY KEY, status TEXT NOT NULL, published_at TEXT, portal_section TEXT)");
    db.prepare("INSERT INTO managed_articles (id, status, published_at, portal_section) VALUES (?, ?, ?, ?)").run(1, "scheduled", before, "clanky");
    db.prepare("INSERT INTO managed_articles (id, status, published_at, portal_section) VALUES (?, ?, ?, ?)").run(2, "scheduled", now, "clanky");
    db.prepare("INSERT INTO managed_articles (id, status, published_at, portal_section) VALUES (?, ?, ?, ?)").run(3, "scheduled", future, "clanky");
    db.prepare("INSERT INTO managed_articles (id, status, published_at, portal_section) VALUES (?, ?, ?, ?)").run(4, "published", null, "clanky");
    db.prepare("INSERT INTO managed_articles (id, status, published_at, portal_section) VALUES (?, ?, ?, ?)").run(5, "draft", null, "clanky");
    const base = { query: "", portalSection: "all", sort: "updated", direction: "desc", topicId: null, page: 1, pageSize: 50 };
    const buckets = { published: [1, 2, 4], scheduled: [3], draft: [5] };
    for (const [status, expected] of Object.entries(buckets)) {
      const sql = buildArticleAdminListQuery({ ...base, status }, "clanky", now);
      const actual = db.prepare("SELECT id, " + articleEffectiveStatusSql() + " AS effective_status FROM managed_articles " + sql.where + " ORDER BY id ASC")
        .all(now, ...sql.bindings).map(row => Number(row.id));
      assert.deepEqual(actual, expected, "filter " + status);
      assert.deepEqual(sql.bindings, [now, status]);
    }
    const expression = articleEffectiveStatusSql();
    const counters = db.prepare(`SELECT
      SUM(CASE WHEN effective_status = 'published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN effective_status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
      SUM(CASE WHEN effective_status = 'draft' THEN 1 ELSE 0 END) AS draft
      FROM (SELECT ${expression} AS effective_status FROM managed_articles)`).get(now);
    assert.equal(counters.published, 3);
    assert.equal(counters.scheduled, 1);
    assert.equal(counters.draft, 1);
  } finally {
    db.close();
  }
});

test("admin list/store and calendar all consume one effective lifecycle contract", () => {
  const query = read("lib/article-admin-query.ts");
  const store = read("lib/article-store.ts");
  const calendar = read("lib/editorial-calendar.ts");
  const calendarUi = read("components/admin-editorial-calendar.tsx");
  const editor = read("components/admin-article-editor.tsx");
  assert.match(query, /articleEffectiveStatusSql\(\)/);
  assert.match(store, /\$\{articleEffectiveStatusSql\(\)\} AS effective_status/);
  assert.match(store, /\$\{articleEffectiveStatusSql\(\)\} AS status/);
  assert.match(store, /buildArticleAdminListQuery\(filters, options.portalSection, now\)/);
  assert.match(store, /buildArticleAdminListQuery\(\{ \.\.\.filters, page \}, options.portalSection, now\)/);
  assert.match(calendar, /articleEffectiveStatusSql\(\)/);
  assert.match(calendarUi, /resolveArticleEffectiveStatus\(article.status, article.publishedAt\)/);
  assert.match(editor, /effectiveArticleStatus\(status, confirmedPublishedAt, statusClock\)/);
  assert.match(editor, /articleEffectiveStatusLabel\(displayedStatus\)/);
  assert.match(editor, /onSubmit=\{\(event\) => \{ event.preventDefault\(\); void save\(displayedStatus\); \}\}/);
  assert.match(editor, /status === "scheduled" && displayedStatus === "published" && confirmedPublishedAt/);
  assert.match(editor, /\? new Date\(confirmedPublishedAt\)/);
  assert.match(editor, /readOnly=\{displayedStatus === "published"\}/);
});

test("Notion import always creates drafts and never promotes or schedules by itself", () => {
  const notion = read("lib/notion-article-sync.ts");
  const worker = read("worker/index.ts");
  assert.match(notion, /status: "draft",/);
  assert.match(notion, /if \(existing.status !== "draft"\)/);
  assert.match(notion, /updatedAt: existing.updatedAt, status: "draft"/);
  assert.doesNotMatch(notion, /status: "scheduled",/);
  assert.match(worker, /runNotionArticleSyncSweep/);
  assert.doesNotMatch(worker, /UPDATE managed_articles SET status = 'published'/);
  const editor = read("components/admin-article-editor.tsx");
  assert.match(editor, /onClick=\{\(\) => void save\("published"\)\}/);
  assert.match(editor, /onClick=\{\(\) => void save\("scheduled"\)\}/);
});
