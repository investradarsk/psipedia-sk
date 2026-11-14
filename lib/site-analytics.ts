import { env } from "cloudflare:workers";
import { articleReadHourBucket } from "@/lib/article-popularity";
import { isSafeSiteAnalyticsPath } from "@/lib/site-analytics-public";

type Bindings = { DB?: D1Database };
export type SitePageViewResult = {
  recorded: boolean;
  reason?: "invalid" | "unavailable" | "failed";
};

/**
 * Count only one pageview. Exactly two aggregate upserts; no visitor, session,
 * source, device, IP, HMAC, cookies or per-request event log is persisted.
 */
export async function recordSitePageView(input: {
  path: string;
  database?: D1Database | null;
  now?: Date;
}): Promise<SitePageViewResult> {
  if (!isSafeSiteAnalyticsPath(input.path)) {
    return { recorded: false, reason: "invalid" };
  }

  const database = input.database === undefined
    ? (env as unknown as Bindings).DB
    : input.database;
  if (!database || typeof database.batch !== "function") {
    return { recorded: false, reason: "unavailable" };
  }

  const hour = articleReadHourBucket(input.now ?? new Date());
  try {
    await database.batch([
      database.prepare(`
        INSERT INTO site_analytics_hourly(bucket_hour, pageviews)
        VALUES (?1, 1)
        ON CONFLICT(bucket_hour) DO UPDATE SET
          pageviews = site_analytics_hourly.pageviews + 1
      `).bind(hour),
      database.prepare(`
        INSERT INTO site_analytics_pages_hourly(bucket_hour, path, pageviews)
        VALUES (?1, ?2, 1)
        ON CONFLICT(bucket_hour, path) DO UPDATE SET
          pageviews = site_analytics_pages_hourly.pageviews + 1
      `).bind(hour, input.path),
    ]);
    return { recorded: true };
  } catch (error) {
    console.error("Anonymous site pageview aggregation unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { recorded: false, reason: "failed" };
  }
}
