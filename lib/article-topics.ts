import { env } from "cloudflare:workers";

export type ArticleTopic = {
  id: number;
  slug: string;
  label: string;
  normalizedKey: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  articleCount?: number;
};

type ArticleTopicRow = {
  id: number;
  slug: string;
  label: string;
  normalized_key: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  article_count?: number;
};

type RuntimeBindings = { DB?: D1Database };

export class ArticleTopicConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArticleTopicConflictError";
  }
}

export function isArticleTopicConflict(error: unknown) {
  return error instanceof ArticleTopicConflictError;
}

function getD1Binding() {
  const runtime = env as unknown as RuntimeBindings;
  return runtime.DB && typeof runtime.DB.prepare === "function" ? runtime.DB : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza redakcie zatiaľ nie je pripojená.");
  return database;
}

function compactLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeArticleTopicKey(value: string) {
  return compactLabel(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function slugifyArticleTopicLabel(value: string) {
  return normalizeArticleTopicKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "tema";
}

function rowToTopic(row: ArticleTopicRow): ArticleTopic {
  return {
    id: Number(row.id),
    slug: row.slug,
    label: row.label,
    normalizedKey: row.normalized_key,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    articleCount: row.article_count === undefined ? undefined : Number(row.article_count),
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function listArticleTopics(options: { includeInactive?: boolean; search?: string } = {}) {
  const database = requireD1Binding();
  const clauses: string[] = [];
  const bindings: Array<string | number> = [];
  if (!options.includeInactive) clauses.push("t.is_active = 1");
  const needle = normalizeArticleTopicKey(options.search ?? "");
  if (needle) {
    clauses.push("(t.normalized_key LIKE ? ESCAPE '\\' OR lower(t.label) LIKE ? ESCAPE '\\')");
    const pattern = `%${escapeLike(needle)}%`;
    bindings.push(pattern, pattern);
  }
  const result = await database.prepare(`
    SELECT t.*, COUNT(a.article_id) AS article_count
    FROM article_topics t
    LEFT JOIN article_topic_assignments a ON a.topic_id = t.id
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    GROUP BY t.id
    ORDER BY t.is_active DESC, t.label COLLATE NOCASE ASC, t.id ASC
  `).bind(...bindings).all<ArticleTopicRow>();
  return result.results.map(rowToTopic);
}

export async function getArticleTopicsByArticleId(database: D1Database, articleId: number) {
  const result = await database.prepare(`
    SELECT t.*
    FROM article_topics t
    INNER JOIN article_topic_assignments a ON a.topic_id = t.id
    WHERE a.article_id = ?
    ORDER BY t.label COLLATE NOCASE ASC, t.id ASC
  `).bind(articleId).all<ArticleTopicRow>();
  return result.results.map(rowToTopic);
}

export async function validateArticleTopicIds(database: D1Database, topicIds: number[]) {
  const ids = [...new Set(topicIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (ids.length !== topicIds.length) throw new Error("Témy článku obsahujú neplatné alebo duplicitné ID.");
  if (!ids.length) return ids;
  const placeholders = ids.map(() => "?").join(",");
  const result = await database.prepare(`SELECT id FROM article_topics WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<{ id: number }>();
  if (result.results.length !== ids.length) throw new Error("Aspoň jedna zvolená téma už neexistuje.");
  return ids;
}

export function replaceArticleTopicStatements(database: D1Database, articleId: number, topicIds: number[], createdAt: string) {
  return [
    database.prepare("DELETE FROM article_topic_assignments WHERE article_id = ?").bind(articleId),
    ...topicIds.map((topicId) => database.prepare(
      "INSERT INTO article_topic_assignments (article_id, topic_id, created_at) VALUES (?, ?, ?)",
    ).bind(articleId, topicId, createdAt)),
  ];
}

export function replaceArticleTopicStatementsBySlug(database: D1Database, articleSlug: string, topicIds: number[], createdAt: string) {
  return [
    database.prepare("DELETE FROM article_topic_assignments WHERE article_id = (SELECT id FROM managed_articles WHERE slug = ? LIMIT 1)")
      .bind(articleSlug),
    ...topicIds.map((topicId) => database.prepare(`
      INSERT INTO article_topic_assignments (article_id, topic_id, created_at)
      SELECT id, ?, ? FROM managed_articles WHERE slug = ? LIMIT 1
    `).bind(topicId, createdAt, articleSlug)),
  ];
}

export async function createArticleTopic(labelValue: string, editorEmail: string) {
  const database = requireD1Binding();
  const label = compactLabel(labelValue);
  if (!label) throw new Error("Názov témy je povinný.");
  if (label.length > 120) throw new Error("Názov témy môže mať najviac 120 znakov.");
  const normalizedKey = normalizeArticleTopicKey(label);
  const existing = await database.prepare("SELECT * FROM article_topics WHERE normalized_key = ? LIMIT 1")
    .bind(normalizedKey)
    .first<ArticleTopicRow>();
  if (existing) return { topic: rowToTopic(existing), created: false };

  const baseSlug = slugifyArticleTopicLabel(label);
  let slug = baseSlug;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const collision = await database.prepare("SELECT id FROM article_topics WHERE slug = ? LIMIT 1").bind(slug).first<{ id: number }>();
    if (!collision) break;
    slug = `${baseSlug}-${suffix}`;
  }
  const now = new Date().toISOString();
  try {
    const row = await database.prepare(`
      INSERT INTO article_topics (slug, label, normalized_key, is_active, created_at, updated_at, created_by, updated_by)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?)
      RETURNING *
    `).bind(slug, label, normalizedKey, now, now, editorEmail, editorEmail).first<ArticleTopicRow>();
    if (!row) throw new Error("Tému sa nepodarilo vytvoriť.");
    return { topic: rowToTopic(row), created: true };
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      throw new ArticleTopicConflictError("Rovnaká alebo ekvivalentná téma už existuje.");
    }
    throw error;
  }
}

export async function updateArticleTopic(
  id: number,
  payload: { label?: string; isActive?: boolean },
  editorEmail: string,
) {
  const database = requireD1Binding();
  const existing = await database.prepare("SELECT * FROM article_topics WHERE id = ? LIMIT 1").bind(id).first<ArticleTopicRow>();
  if (!existing) return null;

  const label = payload.label === undefined ? existing.label : compactLabel(payload.label);
  if (!label) throw new Error("Názov témy je povinný.");
  if (label.length > 120) throw new Error("Názov témy môže mať najviac 120 znakov.");
  const normalizedKey = payload.label === undefined ? existing.normalized_key : normalizeArticleTopicKey(label);
  if (payload.label !== undefined) {
    const duplicate = await database.prepare("SELECT id FROM article_topics WHERE normalized_key = ? AND id <> ? LIMIT 1")
      .bind(normalizedKey, id)
      .first<{ id: number }>();
    if (duplicate) throw new ArticleTopicConflictError("Rovnaká alebo ekvivalentná téma už existuje.");
  }

  const row = await database.prepare(`
    UPDATE article_topics
    SET label = ?, normalized_key = ?, is_active = ?, updated_at = ?, updated_by = ?
    WHERE id = ?
    RETURNING *
  `).bind(
    label,
    normalizedKey,
    payload.isActive === undefined ? existing.is_active : payload.isActive ? 1 : 0,
    new Date().toISOString(),
    editorEmail,
    id,
  ).first<ArticleTopicRow>();
  return row ? rowToTopic(row) : null;
}
