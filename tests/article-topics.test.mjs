import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeArticleTopicKey, slugifyArticleTopicLabel } from "../lib/article-topics.ts";

const migration = await readFile(new URL("../drizzle/0104_article_topics.sql", import.meta.url), "utf8");
const store = await readFile(new URL("../lib/article-store.ts", import.meta.url), "utf8");
const adminQuery = await readFile(new URL("../lib/article-admin-query.ts", import.meta.url), "utf8");
const editor = await readFile(new URL("../components/admin-article-editor.tsx", import.meta.url), "utf8");
const notionSync = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");

test("ARTICLE-TOPICS migration is schema-only and has normalized registry plus many-to-many assignments", () => {
  assert.match(migration, /CREATE TABLE article_topics/);
  assert.match(migration, /normalized_key TEXT NOT NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX article_topics_normalized_key_unique/);
  assert.match(migration, /CREATE TABLE article_topic_assignments/);
  assert.match(migration, /PRIMARY KEY \(article_id, topic_id\)/);
  assert.match(migration, /REFERENCES managed_articles\(id\) ON DELETE CASCADE/);
  assert.match(migration, /REFERENCES article_topics\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(migration, /UPDATE managed_articles|INSERT INTO managed_articles/i);
});

test("ARTICLE-TOPICS normalization catches case, whitespace and diacritics without fuzzy matching", () => {
  assert.equal(normalizeArticleTopicKey("  Prívólanie  "), normalizeArticleTopicKey("PRIVOLANIE"));
  assert.equal(normalizeArticleTopicKey("Field   trials"), "field trials");
  assert.notEqual(normalizeArticleTopicKey("Privolanie"), normalizeArticleTopicKey("Privolanie psa"));
  assert.equal(slugifyArticleTopicLabel("Dentálna hygiena"), "dentalna-hygiena");
});

test("ARTICLE-TOPICS keeps slug stable on rename and deactivation preserves assignments", () => {
  const source = await readFile(new URL("../lib/article-topics.ts", import.meta.url), "utf8");
  assert.match(source, /UPDATE article_topics[\s\S]*SET label = \?, normalized_key = \?, is_active = \?/);
  assert.doesNotMatch(source, /SET slug =/);
  assert.doesNotMatch(source, /DELETE FROM article_topic_assignments[\s\S]*updateArticleTopic/);
});

test("ARTICLE-TOPICS article update distinguishes omitted topicIds from explicit topicIds", () => {
  assert.match(store, /topicIds\?: number\[\]/);
  assert.match(store, /payload\.topicIds === undefined/);
  assert.match(store, /replaceArticleTopicStatements/);
  assert.match(store, /replaceArticleTopicStatementsBySlug/);
  assert.match(store, /getArticleTopicsByArticleId/);
});

test("ARTICLE-TOPICS admin editor writes explicit selected topics and admin list supports topic filter", () => {
  assert.match(editor, /topicIds/);
  assert.match(editor, /AdminArticleTopicPicker/);
  assert.match(adminQuery, /topicId/);
  assert.match(adminQuery, /article_topic_assignments/);
});

test("ARTICLE-TOPICS Notion sync does not take ownership of manual topics", () => {
  assert.doesNotMatch(notionSync, /topicIds\s*:/);
  assert.match(store, /payload\.topicIds === undefined/);
});
