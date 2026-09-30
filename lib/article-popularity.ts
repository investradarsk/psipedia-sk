import { env } from "cloudflare:workers";
import type { Article } from "@/lib/content";
import { isArticlePortalSection } from "@/lib/portal";
import { isNewsCategory, type NewsCategorySlug } from "@/lib/news";

export type ArticlePopularityWindow = "24h" | "7d";

export type PopularArticleSummary = Pick<
  Article,
  "slug" | "title" | "category" | "portalSection" | "portalSubpage" | "newsCategory" | "image"
> & {
  id: number;
  publishedAt: string;
  qualifiedReads: number;
};

type PopularArticleRow = {
  id: number;
  slug: string;
  title: string;
  category: string;
  portal_section: string;
  portal_subpage: string | null;
  news_category: string | null;
  image_url: string | null;
  published_at: string;
  updated_at: string;
  qualified_reads: number;
};

type RuntimeBindings = { DB?: D1Database };

function getD1Binding() {
  const runtime = env as unknown as RuntimeBindings;
  return runtime.DB && typeof runtime.DB.prepare === "function" ? runtime.DB : null;
}

export function articleReadHourBucket(now = new Date()) {
  const value = new Date(now);
  value.setUTCMinutes(0, 0, 0);
  return value.toISOString();
}

export function articlePopularityWindowStart(window: ArticlePopularityWindow, now = new Date()) {
  const currentBucket = new Date(articleReadHourBucket(now));
  const bucketCount = window === "24h" ? 24 : 168;
  currentBucket.setUTCHours(currentBucket.getUTCHours() - (bucketCount - 1));
  return currentBucket.toISOString();
}

function isPublicArticleStatus(status: string, publishedAt: string | null, nowIso: string) {
  return status === "published"
    || (status === "scheduled" && publishedAt !== null && publishedAt <= nowIso);
}

export async function recordQualifiedArticleRead(input: {
  articleSlug: string;
  now?: Date;
  database?: D1Database | null;
}) {
  const database = input.database === undefined ? getD1Binding() : input.database;
  if (!database) return { recorded: false as const, reason: "unavailable" as const };

  const articleSlug = input.articleSlug.trim();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const bucketHour = articleReadHourBucket(now);

  const article = await database.prepare(`
    SELECT id, status, published_at
    FROM managed_articles
    WHERE slug = ?
    LIMIT 1
  `).bind(articleSlug).first<{ id: number; status: string; published_at: string | null }>();

  if (!article || !isPublicArticleStatus(article.status, article.published_at, nowIso)) {
    return { recorded: false as const, reason: "article_unavailable" as const };
  }

  const row = await database.prepare(`
    INSERT INTO article_read_hourly (article_id, bucket_hour, qualified_reads, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(article_id, bucket_hour) DO UPDATE SET
      qualified_reads = article_read_hourly.qualified_reads + 1,
      updated_at = excluded.updated_at
    RETURNING qualified_reads
  `).bind(article.id, bucketHour, nowIso).first<{ qualified_reads: number }>();

  if (!row) throw new Error("Article popularity increment failed");
  return {
    recorded: true as const,
    bucketHour,
    qualifiedReads: Number(row.qualified_reads),
  };
}

export async function getPopularArticles(options: {
  window: ArticlePopularityWindow;
  limit?: number;
  excludeSlug?: string;
  now?: Date;
  database?: D1Database | null;
}): Promise<PopularArticleSummary[]> {
  const database = options.database === undefined ? getD1Binding() : options.database;
  if (!database) return [];

  const limit = Math.max(1, Math.min(20, Math.trunc(options.limit ?? 5)));
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const currentBucket = articleReadHourBucket(now);
  const startBucket = articlePopularityWindowStart(options.window, now);
  const excludeSlug = options.excludeSlug?.trim() || null;

  try {
    const result = await database.prepare(`
      SELECT
        a.id,
        a.slug,
        a.title,
        a.category,
        a.portal_section,
        a.portal_subpage,
        a.news_category,
        a.image_url,
        COALESCE(a.published_at, a.updated_at) AS published_at,
        a.updated_at,
        SUM(h.qualified_reads) AS qualified_reads
      FROM article_read_hourly h
      JOIN managed_articles a ON a.id = h.article_id
      WHERE h.bucket_hour >= ?1
        AND h.bucket_hour <= ?2
        AND (a.status = 'published' OR (a.status = 'scheduled' AND a.published_at <= ?3))
        AND (?4 IS NULL OR a.slug <> ?4)
      GROUP BY
        a.id, a.slug, a.title, a.category, a.portal_section, a.portal_subpage,
        a.news_category, a.image_url, a.published_at, a.updated_at
      ORDER BY qualified_reads DESC, published_at DESC, a.id DESC
      LIMIT ?5
    `).bind(startBucket, currentBucket, nowIso, excludeSlug, limit).all<PopularArticleRow>();

    return result.results.map((row) => ({
      id: Number(row.id),
      slug: row.slug,
      title: row.title,
      category: row.category as Article["category"],
      portalSection: isArticlePortalSection(row.portal_section) ? row.portal_section : "clanky",
      portalSubpage: row.portal_subpage || undefined,
      newsCategory: row.news_category && isNewsCategory(row.news_category)
        ? row.news_category as NewsCategorySlug
        : undefined,
      image: row.image_url || undefined,
      publishedAt: row.published_at || row.updated_at,
      qualifiedReads: Number(row.qualified_reads),
    }));
  } catch (error) {
    console.error("Article popularity query failed", {
      window: options.window,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
