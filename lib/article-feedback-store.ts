import { env } from "cloudflare:workers";

export type ArticleFeedbackStatus = "new" | "reviewing" | "resolved" | "dismissed";

export type ArticleFeedback = {
  id: number;
  articlePath: string;
  articleTitle: string;
  helpful: boolean;
  missingText: string;
  status: ArticleFeedbackStatus;
  attentionUpdatedAt: string | null;
  createdAt: string;
};

export type ArticleFeedbackInput = {
  articlePath?: string;
  articleTitle?: string;
  helpful?: boolean;
  missingText?: string;
};

type ArticleFeedbackRow = {
  id: number;
  article_path: string;
  article_title: string;
  helpful: number;
  missing_text: string;
  status: string;
  attention_updated_at: string | null;
  created_at: string;
};

type RuntimeBindings = { DB?: D1Database };

const ARTICLE_FEEDBACK_COLUMNS = `
  id, article_path, article_title, helpful, missing_text, status, attention_updated_at, created_at
`;

function requireDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza hodnotení zatiaľ nie je pripojená.");
  }
  return database;
}

async function ensureArticleFeedbackStore(database: D1Database) {
  void database;
  // Schema creation and indexes are handled by deployment migrations.
}

export function isArticleFeedbackStatus(value: unknown): value is ArticleFeedbackStatus {
  return value === "new" || value === "reviewing" || value === "resolved" || value === "dismissed";
}

function normalizeStatus(value: string): ArticleFeedbackStatus {
  return isArticleFeedbackStatus(value) ? value : "resolved";
}

function toFeedback(row: ArticleFeedbackRow): ArticleFeedback {
  return {
    id: row.id,
    articlePath: row.article_path,
    articleTitle: row.article_title,
    helpful: Boolean(row.helpful),
    missingText: row.missing_text,
    status: normalizeStatus(row.status),
    attentionUpdatedAt: row.attention_updated_at,
    createdAt: row.created_at,
  };
}

function normalizeInput(payload: ArticleFeedbackInput) {
  const articlePath = payload.articlePath?.trim() ?? "";
  const articleTitle = payload.articleTitle?.trim() ?? "";
  const missingText = payload.missingText?.trim() ?? "";
  if (!/^\/[a-z0-9][a-z0-9\-/]*$/.test(articlePath) || articlePath.length > 300) {
    throw new Error("Adresa článku nie je platná.");
  }
  if (articleTitle.length < 2 || articleTitle.length > 220) {
    throw new Error("Názov článku nie je platný.");
  }
  if (typeof payload.helpful !== "boolean") {
    throw new Error("Vyberte odpoveď Áno alebo Nie.");
  }
  if (missingText.length > 500) {
    throw new Error("Odpoveď môže mať najviac 500 znakov.");
  }
  return { articlePath, articleTitle, helpful: payload.helpful, missingText };
}

export async function createArticleFeedback(payload: ArticleFeedbackInput) {
  const database = requireDatabase();
  await ensureArticleFeedbackStore(database);
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const status: ArticleFeedbackStatus = input.helpful ? "resolved" : "new";
  const row = await database.prepare(`
    INSERT INTO article_feedback (
      article_path, article_title, helpful, missing_text, status, attention_updated_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING ${ARTICLE_FEEDBACK_COLUMNS}
  `).bind(
    input.articlePath,
    input.articleTitle,
    input.helpful ? 1 : 0,
    input.helpful ? "" : input.missingText,
    status,
    input.helpful ? now : null,
    now,
  ).first<ArticleFeedbackRow>();
  if (!row) throw new Error("Hodnotenie sa nepodarilo uložiť.");
  return toFeedback(row);
}

export async function listArticleFeedback() {
  const database = requireDatabase();
  await ensureArticleFeedbackStore(database);
  const result = await database.prepare(`
    SELECT ${ARTICLE_FEEDBACK_COLUMNS}
    FROM article_feedback
    ORDER BY
      CASE WHEN helpful = 0 AND status IN ('new','reviewing') THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 250
  `).all<ArticleFeedbackRow>();
  return result.results.map(toFeedback);
}

export async function updateArticleFeedbackStatus(id: number, status: ArticleFeedbackStatus) {
  const database = requireDatabase();
  await ensureArticleFeedbackStore(database);
  const now = new Date().toISOString();
  const row = await database.prepare(`
    UPDATE article_feedback
    SET status = ?, attention_updated_at = ?
    WHERE id = ? AND helpful = 0
    RETURNING ${ARTICLE_FEEDBACK_COLUMNS}
  `).bind(status, now, id).first<ArticleFeedbackRow>();
  return row ? toFeedback(row) : null;
}
