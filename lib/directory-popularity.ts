import { env } from "cloudflare:workers";
import { articlePopularityWindowStart, articleReadHourBucket, type ArticlePopularityWindow } from "@/lib/article-popularity";
import { isDirectoryCategory, type DirectoryCategorySlug } from "@/lib/directory";

export type PopularDirectoryProfileSummary = {
  id: number;
  slug: string;
  name: string;
  category: DirectoryCategorySlug;
  imageUrl?: string;
  qualifiedViews: number;
};

type DirectoryPopularityRow = {
  id: number;
  slug: string;
  name: string;
  category: string;
  image_url: string | null;
  qualified_views: number;
};

type Bindings = { DB?: D1Database };

function boundDatabase(): D1Database | null {
  const database = (env as unknown as Bindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

/**
 * Real, qualified views only. Never produce a ranking of random/newest profiles.
 * The profile table is intentionally separate from the existing article reader.
 * Before owner-approved D1 migration 0167, return [] without breaking articles.
 */
export async function getPopularDirectoryProfiles(options: {
  window: ArticlePopularityWindow;
  now?: Date;
  limit?: number;
  database?: D1Database | null;
}): Promise<PopularDirectoryProfileSummary[]> {
  const database = options.database === undefined ? boundDatabase() : options.database;
  if (!database) return [];

  const now = options.now ?? new Date();
  const start = articlePopularityWindowStart(options.window, now);
  const end = articleReadHourBucket(now);
  const limit = Math.max(1, Math.min(20, Math.trunc(options.limit ?? 5)));

  try {
    const rows = await database.prepare(`
      SELECT p.id, p.slug, p.name, p.category, p.image_url,
        SUM(h.qualified_views) AS qualified_views
      FROM directory_profile_view_hourly h
      JOIN directory_profiles p ON p.id = h.profile_id
      WHERE h.bucket_hour >= ?
        AND h.bucket_hour <= ?
        AND p.status = 'published'
      GROUP BY p.id, p.slug, p.name, p.category, p.image_url
      ORDER BY qualified_views DESC, p.id DESC
      LIMIT ?
    `).bind(start, end, limit).all<DirectoryPopularityRow>();

    return (rows.results ?? []).flatMap((row) => {
      const id = Number(row.id);
      const qualifiedViews = Number(row.qualified_views);
      if (
        !Number.isSafeInteger(id)
        || id <= 0
        || !isDirectoryCategory(row.category)
        || !Number.isFinite(qualifiedViews)
        || qualifiedViews <= 0
      ) return [];
      return [{
        id,
        slug: row.slug,
        name: row.name,
        category: row.category,
        imageUrl: row.image_url || undefined,
        qualifiedViews,
      }];
    });
  } catch (error) {
    console.error("Directory popularity query unavailable", {
      window: options.window,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
