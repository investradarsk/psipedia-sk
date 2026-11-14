import { env } from "cloudflare:workers";
import { articleReadHourBucket } from "@/lib/article-popularity";
import { contentAnalyticsWindowStart, type ContentAnalyticsWindow } from "@/lib/content-analytics";
import { trafficChartTimeline } from "@/lib/admin-traffic-analytics";
import { SITE_SOURCES } from "@/lib/site-analytics-public";

export type SiteTrafficWindow = ContentAnalyticsWindow;
export type SiteTrafficChartPoint = { key: string; label: string; pageviews: number; sessions: number };
export type SiteTrafficDimension = { label: string; pageviews: number };
export type SiteTrafficPage = { path: string; pageviews: number };
export type SiteTrafficReport = {
  window: SiteTrafficWindow;
  available: boolean;
  pageviews: number | null;
  sessions: number | null;
  uniqueVisitors: number | null;
  activeSessions5m: number | null;
  points: SiteTrafficChartPoint[];
  sources: SiteTrafficDimension[];
  devices: SiteTrafficDimension[];
  topPages: SiteTrafficPage[];
};

type Bindings = { DB?: D1Database };
type TotalRow = { pageviews: number | null; sessions: number | null };
type NumberRow = { total: number };
type PointRow = { slot: number | string; pageviews: number; sessions: number };
type DimensionRow = { source: string; device: string; pageviews: number };
type PageRow = { path: string; pageviews: number };

function monthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString();
}

function emptyReport(window: SiteTrafficWindow): SiteTrafficReport {
  return {
    window,
    available: false,
    pageviews: null,
    sessions: null,
    uniqueVisitors: null,
    activeSessions5m: null,
    points: trafficChartTimeline(window).map((point) => ({ ...point, pageviews: 0, sessions: 0 })),
    sources: [],
    devices: [],
    topPages: [],
  };
}

/**
 * Sitewide aggregate pageviews are tracked without analytics consent. Session and visitor counts
 * remain consented-only estimates. Independent of GA4. Query compact, server-owned
 * hourly rollups and recent pseudonymous visitor/session identity rows.
 * An all-time unique visitor count is deliberately not claimed: identity
 * hashes expire after 35 days.
 */
export async function loadSiteTrafficReport(input: {
  window: SiteTrafficWindow;
  now?: Date;
  database?: D1Database | null;
}): Promise<SiteTrafficReport> {
  const now = input.now ?? new Date();
  const database = input.database === undefined
    ? (env as unknown as Bindings).DB
    : input.database;
  const unavailable = () => ({
    ...emptyReport(input.window),
    points: trafficChartTimeline(input.window, now).map((point) => ({
      ...point, pageviews: 0, sessions: 0,
    })),
  });

  if (!database || typeof database.prepare !== "function") return unavailable();

  const end = articleReadHourBucket(now);
  const start = contentAnalyticsWindowStart(input.window, now);
  const period = start ? "bucket_hour >= ? AND bucket_hour <= ?" : "bucket_hour <= ?";
  const params = start ? [start, end] : [end];
  const firstDay = input.window === "all" ? monthStart(now) : (start ?? end);

  const dateField = input.window === "all"
    ? "substr(bucket_hour, 1, 7)"
    : `CAST((unixepoch(bucket_hour) - unixepoch(?)) / ${input.window === "24h" ? 3600 : 86400} AS INTEGER)`;
  const timeParams = input.window === "all" ? params : [start ?? end, ...params];
  const graphClause = input.window === "all" ? "AND bucket_hour >= ?" : "";
  const graphParams = input.window === "all"
    ? [...timeParams, monthStart(now)] : timeParams;

  try {
    const [totals, graph, categories, pages, active, unique] = await Promise.all([
      database.prepare(`
        SELECT COALESCE(SUM(pageviews), 0) AS pageviews,
               COALESCE(SUM(sessions), 0) AS sessions
        FROM site_analytics_hourly WHERE ${period}
      `).bind(...params).first<TotalRow>(),
      database.prepare(`
        SELECT ${dateField} AS slot,
               SUM(pageviews) AS pageviews, SUM(sessions) AS sessions
        FROM site_analytics_hourly WHERE ${period} ${graphClause}
        GROUP BY slot ORDER BY slot
      `).bind(...graphParams).all<PointRow>(),
      database.prepare(`
        SELECT source, device, SUM(pageviews) AS pageviews
        FROM site_analytics_sources_hourly WHERE ${period}
        GROUP BY source, device
      `).bind(...params).all<DimensionRow>(),
      database.prepare(`
        SELECT path, SUM(pageviews) AS pageviews
        FROM site_analytics_pages_hourly WHERE ${period}
        GROUP BY path ORDER BY pageviews DESC, path ASC LIMIT 10
      `).bind(...params).all<PageRow>(),
      database.prepare(`
        SELECT COUNT(*) AS total FROM site_analytics_sessions WHERE last_seen >= ?
      `).bind(new Date(now.getTime() - 5 * 60_000).toISOString()).first<NumberRow>(),
      input.window === "all"
        ? Promise.resolve(null)
        : database.prepare(`
          SELECT COUNT(DISTINCT visitor_hash) AS total
          FROM site_analytics_visitors_daily
          WHERE last_seen >= ? AND last_seen <= ?
        `).bind(firstDay, now.toISOString()).first<NumberRow>(),
    ]);

    const graphRows = new Map((graph.results ?? []).map((row) => [String(row.slot), row]));
    const points = trafficChartTimeline(input.window, now).map((point) => ({
      key: point.key,
      label: point.label,
      pageviews: Number(graphRows.get(point.key)?.pageviews ?? 0),
      sessions: Number(graphRows.get(point.key)?.sessions ?? 0),
    }));

    const dimensionValues = (key: "source" | "device") => {
      const summary = new Map<string, number>();
      for (const row of categories.results ?? []) {
        const label = row[key];
        summary.set(label, (summary.get(label) ?? 0) + Number(row.pageviews));
      }
      return [...summary].map(([label, pageviews]) => ({ label, pageviews }))
        .sort((a, b) => b.pageviews - a.pageviews || a.label.localeCompare(b.label));
    };

    return {
      window: input.window,
      available: true,
      pageviews: Number(totals?.pageviews ?? 0),
      sessions: Number(totals?.sessions ?? 0),
      uniqueVisitors: unique === null ? null : Number(unique?.total ?? 0),
      activeSessions5m: Number(active?.total ?? 0),
      points,
      sources: dimensionValues("source").filter((row) =>
        (SITE_SOURCES as readonly string[]).includes(row.label)),
      devices: dimensionValues("device").filter((row) =>
        ["mobile", "tablet", "desktop"].includes(row.label)),
      topPages: (pages.results ?? []).map((row) => ({
        path: row.path, pageviews: Number(row.pageviews),
      })),
    };
  } catch (cause) {
    console.error("Site traffic report unavailable", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return unavailable();
  }
}
