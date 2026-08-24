import { env } from "cloudflare:workers";
import { articles as seedArticles, type Article, type ArticleSection } from "@/lib/content";
import {
  getPortalSubpage,
  isArticlePortalSection,
  type ArticlePortalSection,
} from "@/lib/portal";
import { isNewsCategory, type NewsCategorySlug } from "@/lib/news";
import {
  articleBlockSources,
  legacyArticleBlocks,
  normalizeArticleBlocks,
  type ArticleBlock,
} from "@/lib/article-blocks";

export type ArticleStatus = "draft" | "published";

export type ManagedArticle = Article & {
  id: number;
  portalSection: ArticlePortalSection;
  status: ArticleStatus;
  imageKey: string | null;
  readingMinutes: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
};

export type ManagedArticleInput = {
  slug?: string;
  title?: string;
  excerpt?: string;
  category?: string;
  portalSection?: string;
  newsCategory?: string | null;
  status?: string;
  accent?: string;
  author?: string;
  intro?: string;
  takeaway?: string;
  sections?: ArticleSection[];
  blocks?: ArticleBlock[];
  sources?: { label: string; url: string }[];
  imageUrl?: string | null;
  imageKey?: string | null;
  readingMinutes?: number;
};

type ArticleRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  portal_section: string;
  news_category: string | null;
  status: string;
  accent: string;
  author: string;
  intro: string;
  takeaway: string;
  sections_json: string;
  sources_json: string;
  blocks_json: string;
  image_url: string | null;
  image_key: string | null;
  reading_minutes: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by: string;
  updated_by: string;
};

type RuntimeBindings = {
  DB?: D1Database;
};

const ARTICLE_CATEGORIES = ["Výcvik", "Zdravie", "Výživa", "Život so psom"] as const;
const ARTICLE_ACCENTS = ["forest", "coral", "gold", "blue"] as const;

let schemaReady: Promise<void> | null = null;

function getD1Binding() {
  const runtime = env as unknown as RuntimeBindings;
  return runtime.DB && typeof runtime.DB.prepare === "function" ? runtime.DB : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) {
    throw new Error("Databáza redakcie zatiaľ nie je pripojená.");
  }
  return database;
}

async function ensureArticleStore(database: D1Database) {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await database.prepare(`
        CREATE TABLE IF NOT EXISTS managed_articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          excerpt TEXT NOT NULL,
          category TEXT NOT NULL,
          portal_section TEXT NOT NULL DEFAULT 'clanky',
          news_category TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          accent TEXT NOT NULL DEFAULT 'forest',
          author TEXT NOT NULL DEFAULT 'Redakcia Psipedia',
          intro TEXT NOT NULL,
          takeaway TEXT NOT NULL,
          sections_json TEXT NOT NULL DEFAULT '[]',
          sources_json TEXT NOT NULL DEFAULT '[]',
          blocks_json TEXT NOT NULL DEFAULT '[]',
          image_url TEXT,
          image_key TEXT,
          reading_minutes INTEGER NOT NULL DEFAULT 5,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          published_at TEXT,
          created_by TEXT NOT NULL,
          updated_by TEXT NOT NULL
        )
      `).run();

    const tableInfo = await database
      .prepare("PRAGMA table_info(managed_articles)")
      .all<{ name: string }>();
    if (!tableInfo.results.some((column) => column.name === "portal_section")) {
      await database
        .prepare("ALTER TABLE managed_articles ADD COLUMN portal_section TEXT NOT NULL DEFAULT 'clanky'")
        .run();
    }
    if (!tableInfo.results.some((column) => column.name === "news_category")) {
      await database
        .prepare("ALTER TABLE managed_articles ADD COLUMN news_category TEXT")
        .run();
    }
    if (!tableInfo.results.some((column) => column.name === "blocks_json")) {
      await database
        .prepare("ALTER TABLE managed_articles ADD COLUMN blocks_json TEXT NOT NULL DEFAULT '[]'")
        .run();
    }

    await database.batch([
      database.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS managed_articles_slug_unique ON managed_articles (slug)",
      ),
      database.prepare(
        "CREATE INDEX IF NOT EXISTS managed_articles_status_published_idx ON managed_articles (status, published_at)",
      ),
      database.prepare(
        "CREATE INDEX IF NOT EXISTS managed_articles_portal_status_idx ON managed_articles (portal_section, status, published_at)",
      ),
      database.prepare(
        "CREATE INDEX IF NOT EXISTS managed_articles_news_category_idx ON managed_articles (news_category, status, published_at)",
      ),
    ]);

    const seedStatements = seedArticles.map((article) => {
      const createdAt = `${article.dateIso}T08:00:00.000Z`;
      const updatedAt = `${article.updatedDateIso}T08:00:00.000Z`;
      return database
        .prepare(`
          INSERT OR IGNORE INTO managed_articles (
            slug, title, excerpt, category, portal_section, news_category, status, accent, author, intro,
            takeaway, sections_json, sources_json, blocks_json, image_url, image_key,
            reading_minutes, created_at, updated_at, published_at, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, '[]', ?, NULL, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          article.slug,
          article.title,
          article.excerpt,
          article.category,
          article.portalSection ?? "clanky",
          article.newsCategory ?? null,
          article.accent,
          article.author,
          article.intro,
          article.takeaway,
          JSON.stringify(article.sections),
          JSON.stringify(article.sources),
          article.image ?? null,
          parseReadingMinutes(article.readTime),
          createdAt,
          updatedAt,
          createdAt,
          "system@psipedia.sk",
          "system@psipedia.sk",
        );
    });

    if (seedStatements.length) await database.batch(seedStatements);

    const routeStatements = seedArticles
      .filter((article) => article.portalSection && article.portalSection !== "clanky")
      .map((article) => database
        .prepare(`
          UPDATE managed_articles
          SET portal_section = ?
          WHERE slug = ? AND portal_section = 'clanky'
            AND created_by = 'system@psipedia.sk' AND updated_by = 'system@psipedia.sk'
        `)
        .bind(article.portalSection, article.slug));
    if (routeStatements.length) await database.batch(routeStatements);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

function parseJsonArray<T>(value: string, fallback: T[]) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseReadingMinutes(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 5;
}

function formatSlovakDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const months = [
    "januára",
    "februára",
    "marca",
    "apríla",
    "mája",
    "júna",
    "júla",
    "augusta",
    "septembra",
    "októbra",
    "novembra",
    "decembra",
  ];
  return `${date.getUTCDate()}. ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function rowToManagedArticle(row: ArticleRow): ManagedArticle {
  const publishedAt = row.published_at ?? row.created_at;
  const sections = parseJsonArray<ArticleSection>(row.sections_json, []);
  const sources = parseJsonArray<{ label: string; url: string }>(row.sources_json, []);
  const storedBlocks = parseJsonArray<ArticleBlock>(row.blocks_json ?? "[]", []);
  const blocks = storedBlocks.length ? normalizeArticleBlocks(storedBlocks) : legacyArticleBlocks(sections, sources);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category as Article["category"],
    portalSection: isArticlePortalSection(row.portal_section) ? row.portal_section : "clanky",
    newsCategory: row.news_category && isNewsCategory(row.news_category) ? row.news_category : undefined,
    date: formatSlovakDate(publishedAt),
    dateIso: publishedAt.slice(0, 10),
    updatedDate: formatSlovakDate(row.updated_at),
    updatedDateIso: row.updated_at.slice(0, 10),
    readTime: `${row.reading_minutes} min`,
    image: row.image_url ?? undefined,
    accent: row.accent as Article["accent"],
    author: row.author,
    intro: row.intro,
    takeaway: row.takeaway,
    sections,
    sources,
    blocks,
    status: row.status === "published" ? "published" : "draft",
    imageKey: row.image_key,
    readingMinutes: row.reading_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export function slugifyArticleTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function normalizeInput(payload: ManagedArticleInput) {
  const title = payload.title?.trim() ?? "";
  const slug = slugifyArticleTitle(payload.slug?.trim() || title);
  const excerpt = payload.excerpt?.trim() ?? "";
  const intro = payload.intro?.trim() ?? "";
  const takeaway = payload.takeaway?.trim() ?? "";
  const author = payload.author?.trim() || "Redakcia Psipedia";
  const status: ArticleStatus = payload.status === "published" ? "published" : "draft";
  const category = ARTICLE_CATEGORIES.includes(payload.category as (typeof ARTICLE_CATEGORIES)[number])
    ? (payload.category as Article["category"])
    : null;
  const portalSection: ArticlePortalSection = payload.portalSection && isArticlePortalSection(payload.portalSection)
    ? payload.portalSection
    : "clanky";
  const newsCategory: NewsCategorySlug | null = portalSection === "novinky"
    ? payload.newsCategory && isNewsCategory(payload.newsCategory) ? payload.newsCategory : "zo-sveta"
    : null;
  const accent = ARTICLE_ACCENTS.includes(payload.accent as (typeof ARTICLE_ACCENTS)[number])
    ? (payload.accent as Article["accent"])
    : "forest";
  const readingMinutes = Math.min(60, Math.max(1, Math.round(Number(payload.readingMinutes) || 5)));
  const sections = (payload.sections ?? [])
    .map((section) => ({
      heading: section.heading?.trim() ?? "",
      paragraphs: (section.paragraphs ?? []).map((paragraph) => paragraph.trim()).filter(Boolean),
      bullets: (section.bullets ?? []).map((bullet) => bullet.trim()).filter(Boolean),
      tip: section.tip?.trim() || undefined,
    }))
    .filter((section) => section.heading || section.paragraphs.length || section.bullets?.length || section.tip);
  const blocks = normalizeArticleBlocks(payload.blocks ?? []);
  const blockSources = articleBlockSources(blocks);
  const sources = (blockSources.length ? blockSources : payload.sources ?? [])
    .map((source) => ({ label: source.label?.trim() ?? "", url: source.url?.trim() ?? "" }))
    .filter((source) => source.label || source.url);

  if (!title) throw new Error("Doplň názov článku.");
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Adresa článku nie je platná.");
  if (portalSection !== "clanky" && getPortalSubpage(portalSection, slug)) {
    throw new Error("Túto adresu už používa podsekcia portálu. Uprav adresu článku.");
  }
  if (!category) throw new Error("Vyber tému článku.");
  if (excerpt.length < 20) throw new Error("Perex by mal mať aspoň 20 znakov.");
  if (intro.length < 20) throw new Error("Úvod by mal mať aspoň 20 znakov.");
  if (takeaway.length < 10) throw new Error("Doplň hlavné posolstvo článku.");
  if (!blocks.length && !sections.length) throw new Error("Pridaj aspoň jeden obsahový blok.");
  if (portalSection === "novinky" && status === "published" && !sources.length) {
    throw new Error("Novinka potrebuje pred publikovaním aspoň jeden overiteľný zdroj.");
  }

  for (const source of sources) {
    if (!source.label || !source.url) throw new Error("Každý zdroj potrebuje názov aj odkaz.");
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      throw new Error(`Odkaz na zdroj „${source.label}“ nie je platný.`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`Odkaz na zdroj „${source.label}“ musí začínať http:// alebo https://.`);
    }
  }

  for (const block of blocks) {
    if ((block.type === "image" && block.url && !block.alt) || (block.type === "gallery" && block.images.some((image) => !image.alt))) {
      throw new Error("Každý obrázok v obsahu potrebuje alt text.");
    }
    if (block.type === "source" && (!block.label || !block.url)) {
      throw new Error("Každý odborný zdroj potrebuje názov aj odkaz.");
    }
    if (block.type === "related" && (!block.title || !block.href)) {
      throw new Error("Súvisiaci článok potrebuje názov aj odkaz.");
    }
  }

  const imageUrl = payload.imageUrl?.trim() || null;
  if (
    imageUrl &&
    !imageUrl.startsWith("/media/") &&
    !imageUrl.startsWith("/images/") &&
    !/^https:\/\//i.test(imageUrl)
  ) {
    throw new Error("Adresa titulného obrázka nie je platná.");
  }

  return {
    slug,
    title,
    excerpt,
    category,
    portalSection,
    newsCategory,
    status,
    accent,
    author,
    intro,
    takeaway,
    sections,
    sources,
    blocks,
    imageUrl,
    imageKey: payload.imageKey?.trim() || null,
    readingMinutes,
  };
}

export async function getPublishedArticles(): Promise<Article[]> {
  const database = getD1Binding();
  if (!database) return seedArticles;
  await ensureArticleStore(database);
  const result = await database
    .prepare(
      "SELECT * FROM managed_articles WHERE status = 'published' ORDER BY published_at DESC, updated_at DESC, id DESC",
    )
    .all<ArticleRow>();
  return result.results.map(rowToManagedArticle);
}

export async function getPublishedArticle(slug: string): Promise<Article | null> {
  const database = getD1Binding();
  if (!database) return seedArticles.find((article) => article.slug === slug) ?? null;
  await ensureArticleStore(database);
  const row = await database
    .prepare("SELECT * FROM managed_articles WHERE slug = ? AND status = 'published' LIMIT 1")
    .bind(slug)
    .first<ArticleRow>();
  return row ? rowToManagedArticle(row) : null;
}

export async function listManagedArticles() {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  const result = await database
    .prepare("SELECT * FROM managed_articles ORDER BY updated_at DESC, id DESC")
    .all<ArticleRow>();
  return result.results.map(rowToManagedArticle);
}

export async function getManagedArticleById(id: number) {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  const row = await database
    .prepare("SELECT * FROM managed_articles WHERE id = ? LIMIT 1")
    .bind(id)
    .first<ArticleRow>();
  return row ? rowToManagedArticle(row) : null;
}

export async function createManagedArticle(payload: ManagedArticleInput, editorEmail: string) {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? now : null;

  const result = await database
    .prepare(`
      INSERT INTO managed_articles (
        slug, title, excerpt, category, portal_section, news_category, status, accent, author, intro,
        takeaway, sections_json, sources_json, blocks_json, image_url, image_key,
        reading_minutes, created_at, updated_at, published_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
    .bind(
      input.slug,
      input.title,
      input.excerpt,
      input.category,
      input.portalSection,
      input.newsCategory,
      input.status,
      input.accent,
      input.author,
      input.intro,
      input.takeaway,
      JSON.stringify(input.sections),
      JSON.stringify(input.sources),
      JSON.stringify(input.blocks),
      input.imageUrl,
      input.imageKey,
      input.readingMinutes,
      now,
      now,
      publishedAt,
      editorEmail,
      editorEmail,
    )
    .first<ArticleRow>();

  if (!result) throw new Error("Článok sa nepodarilo vytvoriť.");
  return rowToManagedArticle(result);
}

export async function updateManagedArticle(
  id: number,
  payload: ManagedArticleInput,
  editorEmail: string,
) {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  const existing = await database
    .prepare("SELECT * FROM managed_articles WHERE id = ? LIMIT 1")
    .bind(id)
    .first<ArticleRow>();
  if (!existing) return null;

  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? existing.published_at ?? now : existing.published_at;
  const result = await database
    .prepare(`
      UPDATE managed_articles SET
        slug = ?, title = ?, excerpt = ?, category = ?, portal_section = ?, news_category = ?, status = ?, accent = ?,
        author = ?, intro = ?, takeaway = ?, sections_json = ?, sources_json = ?, blocks_json = ?,
        image_url = ?, image_key = ?, reading_minutes = ?, updated_at = ?,
        published_at = ?, updated_by = ?
      WHERE id = ?
      RETURNING *
    `)
    .bind(
      input.slug,
      input.title,
      input.excerpt,
      input.category,
      input.portalSection,
      input.newsCategory,
      input.status,
      input.accent,
      input.author,
      input.intro,
      input.takeaway,
      JSON.stringify(input.sections),
      JSON.stringify(input.sources),
      JSON.stringify(input.blocks),
      input.imageUrl,
      input.imageKey,
      input.readingMinutes,
      now,
      publishedAt,
      editorEmail,
      id,
    )
    .first<ArticleRow>();

  return result ? rowToManagedArticle(result) : null;
}

export async function deleteManagedArticle(id: number) {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  const row = await database
    .prepare("DELETE FROM managed_articles WHERE id = ? RETURNING *")
    .bind(id)
    .first<ArticleRow>();
  return row ? rowToManagedArticle(row) : null;
}

export function isArticleSlugConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed") || message.includes("managed_articles.slug");
}
