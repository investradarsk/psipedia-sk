import { env } from "cloudflare:workers";

export type ArticleFeedback = {
  id: number;
  articlePath: string;
  articleTitle: string;
  helpful: boolean;
  missingText: string;
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
  created_at: string;
};

type RuntimeBindings = { DB?: D1Database };
let schemaReady: Promise<void> | null = null;

function requireDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza hodnotení zatiaľ nie je pripojená.");
  }
  return database;
}

async function ensureArticleFeedbackStore(database: D1Database) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await database.prepare(`
      CREATE TABLE IF NOT EXISTS article_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_path TEXT NOT NULL,
        article_title TEXT NOT NULL,
        helpful INTEGER NOT NULL,
        missing_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )
    `).run();
    await database.batch([
      database.prepare("CREATE INDEX IF NOT EXISTS article_feedback_path_created_idx ON article_feedback (article_path, created_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS article_feedback_helpful_created_idx ON article_feedback (helpful, created_at)"),
    ]);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function toFeedback(row: ArticleFeedbackRow): ArticleFeedback {
  return {
    id: row.id,
    articlePath: row.article_path,
    articleTitle: row.article_title,
    helpful: Boolean(row.helpful),
    missingText: row.missing_text,
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
  const row = await database.prepare(`
    INSERT INTO article_feedback (article_path, article_title, helpful, missing_text, created_at)
    VALUES (?, ?, ?, ?, ?) RETURNING *
  `).bind(
    input.articlePath,
    input.articleTitle,
    input.helpful ? 1 : 0,
    input.helpful ? "" : input.missingText,
    new Date().toISOString(),
  ).first<ArticleFeedbackRow>();
  if (!row) throw new Error("Hodnotenie sa nepodarilo uložiť.");
  return toFeedback(row);
}

export async function listArticleFeedback() {
  const database = requireDatabase();
  await ensureArticleFeedbackStore(database);
  const result = await database.prepare("SELECT * FROM article_feedback ORDER BY created_at DESC LIMIT 1000").all<ArticleFeedbackRow>();
  return result.results.map(toFeedback);
}
