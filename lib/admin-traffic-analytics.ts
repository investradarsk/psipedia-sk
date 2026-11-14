import { env } from "cloudflare:workers";
import { articleReadHourBucket } from "@/lib/article-popularity";
import { contentAnalyticsWindowStart, type ContentAnalyticsWindow } from "@/lib/content-analytics";
import { directoryCategoryLabel, directoryProfileHref, isDirectoryCategory } from "@/lib/directory";
import { articleHref, isArticlePortalSection, portalSectionLabel } from "@/lib/portal";

export type TrafficWindow = ContentAnalyticsWindow;
export type TrafficSource = "articles" | "profiles";

export type TrafficPoint = {
  key: string;
  label: string;
  views: number;
};

export type TrafficRank = {
  id: number;
  title: string;
  description: string;
  href: string;
  views: number;
};

export type TrafficSeries = {
  available: boolean;
  total: number | null;
  points: TrafficPoint[];
  top: TrafficRank[];
};

export type AdminTrafficReport = {
  window: TrafficWindow;
  generatedAt: string;
  articles: TrafficSeries;
  profiles: TrafficSeries;
  /** null if either source is unavailable, never a fabricated combined zero. */
  combined: number | null;
};

type DbBindings = { DB?: D1Database };
type CountRow = { views: number | null };
type BucketRow = { slot: number | string; views: number };
type RankingRow = {
  id: number;
  slug: string;
  title: string;
  section: string;
  views: number;
};

const SLOTS: Record<TrafficWindow, number> = {
  "24h": 24,
  "7d": 7,
  "30d": 30,
  all: 12,
};

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

export function parseTrafficWindow(value: string | string[] | undefined): TrafficWindow {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected === "24h" || selected === "7d" || selected === "30d" || selected === "all"
    ? selected
    : "7d";
}

function graphStartMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
}

export function trafficChartTimeline(window: TrafficWindow, now = new Date()): TrafficPoint[] {
  const hourStart = new Date(contentAnalyticsWindowStart(window, now) ?? articleReadHourBucket(now));
  const monthStart = graphStartMonth(now);
  return Array.from({ length: SLOTS[window] }, (_, index) => {
    if (window === "all") {
      const month = new Date(Date.UTC(
        monthStart.getUTCFullYear(),
        monthStart.getUTCMonth() + index,
        1,
      ));
      return {
        key: month.toISOString().slice(0, 7),
        label: new Intl.DateTimeFormat("sk-SK", { month: "short", year: "2-digit", timeZone: "UTC" }).format(month),
        views: 0,
      };
    }

    const step = window === "24h" ? MS_HOUR : MS_DAY;
    const labelAt = new Date(hourStart.getTime() + index * step + (step - 1));
    return {
      key: String(index),
      label: window === "24h"
        ? new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", timeZone: "UTC" }).format(labelAt)
        : new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric", timeZone: "UTC" }).format(labelAt),
      views: 0,
    };
  });
}

function sourceSql(source: TrafficSource, now: Date, window: TrafficWindow) {
  // These are closed-set SQL identifiers, never caller-controlled strings.
  const articles = source === "articles";
  const table = articles ? "article_read_hourly" : "directory_profile_view_hourly";
  const idColumn = articles ? "article_id" : "profile_id";
  const metricColumn = articles ? "qualified_reads" : "qualified_views";
  const entityTable = articles ? "managed_articles" : "directory_profiles";
  const scope = articles
    ? "(e.status = 'published' OR (e.status = 'scheduled' AND e.published_at <= ?))"
    : "e.status = 'published'";
  const args: Array<string> = articles ? [now.toISOString()] : [];

  const clauses = [scope, "h.bucket_hour <= ?"];
  args.push(articleReadHourBucket(now));

  const start = contentAnalyticsWindowStart(window, now);
  if (start) {
    clauses.push("h.bucket_hour >= ?");
    args.push(start);
  }

  return {
    from: `FROM ${table} h JOIN ${entityTable} e ON e.id = h.${idColumn}`,
    where: `WHERE ${clauses.join(" AND ")}`,
    args,
    metric: `h.${metricColumn}`,
    articles,
    start,
  };
}

async function readSource(input: {
  database: D1Database;
  source: TrafficSource;
  window: TrafficWindow;
  now: Date;
}): Promise<TrafficSeries> {
  const { database, source, window, now } = input;
  const sql = sourceSql(source, now, window);
  const timeField = window === "all"
    ? "substr(h.bucket_hour, 1, 7)"
    : `CAST((unixepoch(h.bucket_hour) - unixepoch(?)) / ${window === "24h" ? 3600 : 86400} AS INTEGER)`;

  const timeArgs = window === "all"
    ? sql.args
    : [sql.start ?? articleReadHourBucket(now), ...sql.args];
  const timeline = trafficChartTimeline(window, now);
  const chartFilter = window === "all" ? "AND h.bucket_hour >= ?" : "";
  const chartArgs = window === "all"
    ? [...timeArgs, graphStartMonth(now).toISOString()]
    : timeArgs;

  const [summary, grouped, ranked] = await Promise.all([
    database.prepare(`
      SELECT COALESCE(SUM(${sql.metric}), 0) AS views
      ${sql.from} ${sql.where}
    `).bind(...sql.args).first<CountRow>(),
    database.prepare(`
      SELECT ${timeField} AS slot, SUM(${sql.metric}) AS views
      ${sql.from} ${sql.where} ${chartFilter}
      GROUP BY slot ORDER BY slot ASC
    `).bind(...chartArgs).all<BucketRow>(),
    database.prepare(`
      SELECT e.id, e.slug, ${sql.articles ? "e.title" : "e.name"} AS title,
        ${sql.articles ? "e.portal_section" : "e.category"} AS section,
        SUM(${sql.metric}) AS views
      ${sql.from} ${sql.where}
      GROUP BY e.id, e.slug, title, section
      ORDER BY views DESC, e.id DESC
      LIMIT 10
    `).bind(...sql.args).all<RankingRow>(),
  ]);

  const bucketValues = new Map(
    (grouped.results ?? []).map((row) => [String(row.slot), Number(row.views)]),
  );

  const top = (ranked.results ?? []).flatMap((row) => {
    const id = Number(row.id);
    const views = Number(row.views);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(views) || views < 0) return [];
    if (sql.articles) {
      const section = isArticlePortalSection(row.section) ? row.section : "clanky";
      return [{
        id,
        title: row.title,
        description: portalSectionLabel(section),
        href: articleHref({ slug: row.slug, portalSection: section }),
        views,
      }];
    }
    if (!isDirectoryCategory(row.section)) return [];
    return [{
      id,
      title: row.title,
      description: directoryCategoryLabel(row.section),
      href: directoryProfileHref({ slug: row.slug, category: row.section }),
      views,
    }];
  });

  return {
    available: true,
    total: Number(summary?.views ?? 0),
    points: timeline.map((point) => ({
      ...point,
      views: bucketValues.get(point.key) ?? 0,
    })),
    top,
  };
}

function unavailable(window: TrafficWindow, now: Date): TrafficSeries {
  return {
    available: false,
    total: null,
    points: trafficChartTimeline(window, now),
    top: [],
  };
}

/**
 * Admin-only read model. Always call from an authenticated server route after
 * requireAdminPageUser, never from a public page or a browser-facing API.
 *
 * The article table remains usable if protected migration 0167 is not applied.
 * Source failure is reported as unavailable, never displayed as zero.
 */
export async function loadAdminTrafficReport(input: {
  window: TrafficWindow;
  now?: Date;
  database?: D1Database | null;
}): Promise<AdminTrafficReport> {
  const now = input.now ?? new Date();
  const database = input.database === undefined
    ? (env as unknown as DbBindings).DB
    : input.database;

  if (!database || typeof database.prepare !== "function") {
    return {
      window: input.window,
      generatedAt: now.toISOString(),
      articles: unavailable(input.window, now),
      profiles: unavailable(input.window, now),
      combined: null,
    };
  }

  const safeSource = async (source: TrafficSource) => {
    try {
      return await readSource({ database, source, now, window: input.window });
    } catch (cause) {
      console.error("Admin traffic metrics unavailable", {
        source,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      return unavailable(input.window, now);
    }
  };

  const [articles, profiles] = await Promise.all([
    safeSource("articles"),
    safeSource("profiles"),
  ]);

  return {
    window: input.window,
    generatedAt: now.toISOString(),
    articles,
    profiles,
    combined: articles.total !== null && profiles.total !== null
      ? articles.total + profiles.total
      : null,
  };
}
