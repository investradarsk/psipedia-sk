import { env } from "cloudflare:workers";
import { articleReadHourBucket } from "@/lib/article-popularity";

export type ContentAnalyticsEntityType = "ARTICLE" | "DIRECTORY_PROFILE";
export type ContentAnalyticsWindow = "24h" | "7d" | "30d" | "all";

type RuntimeBindings = { DB?: D1Database };

function getD1Binding() {
  const runtime = env as unknown as RuntimeBindings;
  return runtime.DB && typeof runtime.DB.prepare === "function" ? runtime.DB : null;
}

function validEntityId(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * The current UTC hour and the previous 23/167/719 hours form an inclusive
 * rolling window. An "all" window has no lower bound.
 */
export function contentAnalyticsWindowStart(
  window: ContentAnalyticsWindow,
  now = new Date(),
): string | null {
  if (window === "all") return null;
  const hours = window === "24h" ? 24 : window === "7d" ? 168 : 720;
  const bucket = new Date(articleReadHourBucket(now));
  bucket.setUTCHours(bucket.getUTCHours() - (hours - 1));
  return bucket.toISOString();
}

/**
 * Common, read-only metric for articles and directory profiles.
 * ARTICLE continues to read the original article_read_hourly data directly
 * (also before migration 0167), without changing its writer or copying history.
 *
 * null means that analytics storage is unavailable, not "zero views".
 */
export async function getQualifiedContentViewCount(input: {
  entityType: ContentAnalyticsEntityType;
  entityId: number;
  window: ContentAnalyticsWindow;
  now?: Date;
  database?: D1Database | null;
}): Promise<number | null> {
  if (!validEntityId(input.entityId)) return null;
  if (input.entityType !== "ARTICLE" && input.entityType !== "DIRECTORY_PROFILE") {
    return null;
  }
  const database = input.database === undefined ? getD1Binding() : input.database;
  if (!database) return null;

  const now = input.now ?? new Date();
  const currentBucket = articleReadHourBucket(now);
  const startBucket = contentAnalyticsWindowStart(input.window, now);

  try {
    // Read each source directly. Articles must remain readable before the
    // separately approved directory-profile migration (0167) is installed.
    const isArticle = input.entityType === "ARTICLE";
    const source = isArticle ? "article_read_hourly" : "directory_profile_view_hourly";
    const metric = isArticle ? "qualified_reads" : "qualified_views";
    const idColumn = isArticle ? "article_id" : "profile_id";
    const statement = startBucket === null
      ? database.prepare(`
        SELECT COALESCE(SUM(${metric}), 0) AS view_count
        FROM ${source}
        WHERE ${idColumn} = ? AND bucket_hour <= ?
      `).bind(input.entityId, currentBucket)
      : database.prepare(`
        SELECT COALESCE(SUM(${metric}), 0) AS view_count
        FROM ${source}
        WHERE ${idColumn} = ? AND bucket_hour >= ? AND bucket_hour <= ?
      `).bind(input.entityId, startBucket, currentBucket);

    const row = await statement.first<{ view_count: number }>();
    return row ? Number(row.view_count) : 0;
  } catch (error) {
    console.error("Content analytics read failed", {
      entityType: input.entityType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Server-side foundation only (step 2/8). The public request endpoint and
 * browser qualification will be wired in step 3 after the protected schema
 * migration is approved. Do not call this from page render or metadata.
 *
 * INSERT ... SELECT ensures a count is only written for a published profile.
 * Each qualified view is an atomic upsert into a single hour bucket.
 */
export async function recordQualifiedDirectoryProfileView(input: {
  profileId: number;
  now?: Date;
  database?: D1Database | null;
}) {
  if (!validEntityId(input.profileId)) {
    return { recorded: false as const, reason: "invalid_profile" as const };
  }

  const database = input.database === undefined ? getD1Binding() : input.database;
  if (!database) return { recorded: false as const, reason: "unavailable" as const };

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const bucketHour = articleReadHourBucket(now);

  const row = await database.prepare(`
    INSERT INTO directory_profile_view_hourly
      (profile_id, bucket_hour, qualified_views, updated_at)
    SELECT id, ?, 1, ?
    FROM directory_profiles
    WHERE id = ? AND status = 'published'
    ON CONFLICT(profile_id, bucket_hour) DO UPDATE SET
      qualified_views = directory_profile_view_hourly.qualified_views + 1,
      updated_at = excluded.updated_at
    RETURNING qualified_views
  `).bind(bucketHour, nowIso, input.profileId).first<{ qualified_views: number }>();

  if (!row) {
    return { recorded: false as const, reason: "profile_unavailable" as const };
  }
  return {
    recorded: true as const,
    bucketHour,
    qualifiedViews: Number(row.qualified_views),
  };
}
