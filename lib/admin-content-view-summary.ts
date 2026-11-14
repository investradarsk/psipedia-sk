import { env } from "cloudflare:workers";
import { articleReadHourBucket } from "@/lib/article-popularity";
import {
  contentAnalyticsWindowStart,
  type ContentAnalyticsEntityType,
} from "@/lib/content-analytics";

/** Exactly one indexed D1 read per authenticated editor, no writes or tracking. */
export type AdminContentViewSummary = {
  "24h": number;
  "7d": number;
  "30d": number;
  all: number;
};

type AnalyticsBindings = { DB?: D1Database };
type ViewCountRow = {
  views24h: number | null;
  views7d: number | null;
  views30d: number | null;
  viewsAll: number | null;
};

const SOURCES = {
  ARTICLE: { table: "article_read_hourly", id: "article_id", count: "qualified_reads" },
  DIRECTORY_PROFILE: { table: "directory_profile_view_hourly", id: "profile_id", count: "qualified_views" },
} as const;

/**
 * Read-only admin summary for an existing record. Every source identifier is
 * from a closed constant map; record IDs and boundaries are SQL-bound.
 *
 * On missing DB/migration or a query failure, null means "not available".
 * The genuine zero for a record without any qualified views remains zero.
 * This never modifies article, directory or Notion editor payloads.
 */
export async function getAdminContentViewSummary(input: {
  entityType: ContentAnalyticsEntityType;
  entityId: number;
  now?: Date;
  database?: D1Database | null;
}): Promise<AdminContentViewSummary | null> {
  if (!Number.isSafeInteger(input.entityId) || input.entityId < 1) return null;
  if (input.entityType !== "ARTICLE" && input.entityType !== "DIRECTORY_PROFILE") return null;
  const database = input.database === undefined
    ? (env as unknown as AnalyticsBindings).DB
    : input.database;
  if (!database || typeof database.prepare !== "function") return null;

  const now = input.now ?? new Date();
  const current = articleReadHourBucket(now);
  const start24 = contentAnalyticsWindowStart("24h", now);
  const start7 = contentAnalyticsWindowStart("7d", now);
  const start30 = contentAnalyticsWindowStart("30d", now);
  const source = SOURCES[input.entityType];

  try {
    const row = await database.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN bucket_hour >= ?2 THEN ${source.count} ELSE 0 END), 0) AS views24h,
        COALESCE(SUM(CASE WHEN bucket_hour >= ?3 THEN ${source.count} ELSE 0 END), 0) AS views7d,
        COALESCE(SUM(CASE WHEN bucket_hour >= ?4 THEN ${source.count} ELSE 0 END), 0) AS views30d,
        COALESCE(SUM(${source.count}), 0) AS viewsAll
      FROM ${source.table}
      WHERE ${source.id} = ?1 AND bucket_hour <= ?5
    `).bind(input.entityId, start24, start7, start30, current).first<ViewCountRow>();

    if (!row) return null;
    const values = [row.views24h, row.views7d, row.views30d, row.viewsAll].map(Number);
    if (values.some((n) => !Number.isSafeInteger(n) || n < 0)) return null;
    return {
      "24h": values[0],
      "7d": values[1],
      "30d": values[2],
      all: values[3],
    };
  } catch (cause) {
    console.error("Admin record view counts unavailable", {
      entityType: input.entityType,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
}
