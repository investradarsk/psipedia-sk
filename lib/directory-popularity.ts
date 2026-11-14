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


/**
 * One D1 statement for both public ranking tabs. The 7-day scan computes the
 * 24-hour conditional sum and uses SQL window ranks to return at most 2*limit
 * rows; no cross-request global cache or full-directory client transfer.
 */
export async function getPopularDirectoryProfilesBothWindows(options: {
  now?: Date;
  limit?: number;
  database?: D1Database | null;
}): Promise<Record<ArticlePopularityWindow, PopularDirectoryProfileSummary[]>> {
  const empty = (): Record<ArticlePopularityWindow, PopularDirectoryProfileSummary[]> => ({
    "24h": [],
    "7d": [],
  });
  const database = options.database === undefined ? boundDatabase() : options.database;
  if (!database) return empty();

  const now = options.now ?? new Date();
  const start7d = articlePopularityWindowStart("7d", now);
  const start24h = articlePopularityWindowStart("24h", now);
  const end = articleReadHourBucket(now);
  const limit = Math.max(1, Math.min(20, Math.trunc(options.limit ?? 5)));

  type RankedProfileRow = DirectoryPopularityRow & {
    views24h: number;
    views7d: number;
    rank24h: number;
    rank7d: number;
  };

  try {
    const result = await database.prepare(`
      WITH profile_totals AS (
        SELECT p.id, p.slug, p.name, p.category, p.image_url,
          SUM(CASE WHEN h.bucket_hour >= ?2 THEN h.qualified_views ELSE 0 END) AS views24h,
          SUM(h.qualified_views) AS views7d
        FROM directory_profile_view_hourly h
        JOIN directory_profiles p ON p.id = h.profile_id
        WHERE h.bucket_hour >= ?1 AND h.bucket_hour <= ?3
          AND p.status = 'published'
        GROUP BY p.id, p.slug, p.name, p.category, p.image_url
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (ORDER BY views24h DESC, id DESC) AS rank24h,
          ROW_NUMBER() OVER (ORDER BY views7d DESC, id DESC) AS rank7d
        FROM profile_totals
      )
      SELECT id, slug, name, category, image_url,
        views24h, views7d, rank24h, rank7d
      FROM ranked
      WHERE (views24h > 0 AND rank24h <= ?4)
         OR (views7d > 0 AND rank7d <= ?4)
    `).bind(start7d, start24h, end, limit).all<RankedProfileRow>();

    const buckets = empty();
    for (const row of result.results ?? []) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= 0 || !isDirectoryCategory(row.category)) continue;
      for (const window of ["24h", "7d"] as const) {
        const views = Number(window === "24h" ? row.views24h : row.views7d);
        const rank = Number(window === "24h" ? row.rank24h : row.rank7d);
        if (!Number.isFinite(views) || views <= 0 || !Number.isSafeInteger(rank) || rank > limit) continue;
        buckets[window].push({
          id, slug: row.slug, name: row.name, category: row.category,
          imageUrl: row.image_url || undefined, qualifiedViews: views,
        });
      }
    }
    for (const window of ["24h", "7d"] as const) {
      buckets[window].sort((a, b) => b.qualifiedViews - a.qualifiedViews || b.id - a.id);
    }
    return buckets;
  } catch (error) {
    console.error("Directory popularity query unavailable", {
      window: "24h+7d",
      error: error instanceof Error ? error.message : String(error),
    });
    return empty();
  }
}
