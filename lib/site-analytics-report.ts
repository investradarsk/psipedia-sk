import { env } from "cloudflare:workers";
import { articleReadHourBucket } from "@/lib/article-popularity";
import { contentAnalyticsWindowStart, type ContentAnalyticsWindow } from "@/lib/content-analytics";
import { trafficChartTimeline } from "@/lib/admin-traffic-analytics";

export type SiteTrafficWindow = ContentAnalyticsWindow;
export type SiteTrafficChartPoint = { key: string; label: string; pageviews: number };
export type SiteTrafficPage = { path: string; pageviews: number };
export type SiteTrafficReport = {
  window: SiteTrafficWindow;
  available: boolean;
  pageviews: number | null;
  points: SiteTrafficChartPoint[];
  topPages: SiteTrafficPage[];
};

type Bindings = { DB?: D1Database };
type TotalRow = { pageviews: number | null };
type ChartRow = { slot: string | number; pageviews: number };
type PageRow = { path: string; pageviews: number };

function lastTwelveMonthsStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString();
}

/** Only aggregate counts, never visitor/session identifiers or metadata. */
export async function loadSiteTrafficReport(input: {
  window: SiteTrafficWindow;
  now?: Date;
  database?: D1Database | null;
}): Promise<SiteTrafficReport> {
  const now = input.now ?? new Date();
  const timeline = trafficChartTimeline(input.window, now);
  const unavailable = (): SiteTrafficReport => ({
    window: input.window,
    available: false,
    pageviews: null,
    points: timeline.map(({ key, label }) => ({ key, label, pageviews: 0 })),
    topPages: [],
  });

  const database = input.database === undefined
    ? (env as unknown as Bindings).DB
    : input.database;
  if (!database || typeof database.prepare !== "function") return unavailable();

  const end = articleReadHourBucket(now);
  const start = contentAnalyticsWindowStart(input.window, now);
  const windowClause = start
    ? "bucket_hour >= ? AND bucket_hour <= ?"
    : "bucket_hour <= ?";
  const args = start ? [start, end] : [end];
  const slotSql = input.window === "all"
    ? "substr(bucket_hour, 1, 7)"
    : `CAST((unixepoch(bucket_hour) - unixepoch(?)) / ${input.window === "24h" ? 3600 : 86400} AS INTEGER)`;

  try {
    const [total, chart, pages] = await Promise.all([
      database.prepare(`
        SELECT COALESCE(SUM(pageviews), 0) AS pageviews
        FROM site_analytics_hourly WHERE ${windowClause}
      `).bind(...args).first<TotalRow>(),
      database.prepare(`
        SELECT ${slotSql} AS slot, SUM(pageviews) AS pageviews
        FROM site_analytics_hourly
        WHERE ${windowClause} ${input.window === "all" ? "AND bucket_hour >= ?" : ""}
        GROUP BY slot ORDER BY slot
      `).bind(...(input.window === "all"
        ? [...args, lastTwelveMonthsStart(now)]
        : [start, ...args])).all<ChartRow>(),
      database.prepare(`
        SELECT path, SUM(pageviews) AS pageviews
        FROM site_analytics_pages_hourly WHERE ${windowClause}
        GROUP BY path ORDER BY pageviews DESC, path ASC LIMIT 10
      `).bind(...args).all<PageRow>(),
    ]);
    const slots = new Map((chart.results ?? []).map((point) => [
      String(point.slot), Number(point.pageviews),
    ]));
    return {
      window: input.window,
      available: true,
      pageviews: Number(total?.pageviews ?? 0),
      points: timeline.map(({ key, label }) => ({
        key, label, pageviews: slots.get(key) ?? 0,
      })),
      topPages: (pages.results ?? []).map((row) => ({
        path: row.path, pageviews: Number(row.pageviews),
      })),
    };
  } catch (error) {
    console.error("Anonymous pageview report unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return unavailable();
  }
}
