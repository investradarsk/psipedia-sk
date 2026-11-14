import { env } from "cloudflare:workers";
import { articleReadHourBucket } from "@/lib/article-popularity";
import { deriveRateLimitKey } from "@/lib/rate-limit";
import { classifySiteTrafficDevice, isSafeSiteAnalyticsPath, validSiteTrafficSource, type SiteTrafficSource } from "@/lib/site-analytics-public";

export const SITE_ANALYTICS_SESSION_IDLE_MS = 30 * 60_000;
export const SITE_ANALYTICS_VISITOR_LIFETIME_MS = 30 * 86_400_000;
export const SITE_ANALYTICS_RETENTION_MS = 35 * 86_400_000;

type Bindings = { DB?: D1Database; PII_HASH_KEY?: string };
type SitePageView = {
  path: string;
  /** Present together only when the visitor opted into browser-level analytics. */
  visitorToken?: string;
  sessionToken?: string;
  source: SiteTrafficSource;
  userAgent: string;
  database?: D1Database | null;
  hashKey?: string;
  now?: Date;
};
export type SiteAnalyticsRecordResult = {
  recorded: boolean;
  startedSession?: boolean;
  reason?: "unavailable" | "invalid" | "failed";
};

export async function recordSitePageView(input: SitePageView): Promise<SiteAnalyticsRecordResult> {
  if (!isSafeSiteAnalyticsPath(input.path) || !validSiteTrafficSource(input.source)) {
    return { recorded: false, reason: "invalid" };
  }
  const bindings = env as unknown as Bindings;
  const database = input.database === undefined ? bindings.DB : input.database;
  const hashKey = input.hashKey ?? bindings.PII_HASH_KEY;
  if (!database || typeof database.prepare !== "function") {
    return { recorded: false, reason: "unavailable" };
  }
  const hasVisitor = typeof input.visitorToken === "string";
  const hasSession = typeof input.sessionToken === "string";
  if (hasVisitor !== hasSession || (hasVisitor && !hashKey)) {
    return { recorded: false, reason: "invalid" };
  }

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const hour = articleReadHourBucket(now);
  const day = nowIso.slice(0, 10);
  const expires = new Date(now.getTime() + SITE_ANALYTICS_RETENTION_MS).toISOString();
  const device = classifySiteTrafficDevice(input.userAgent);
  const statements: D1PreparedStatement[] = [];
  let startedSession = false;

  try {
    if (hasVisitor && hasSession && hashKey) {
      // Only opted-in requests create browser-related HMAC rows.
      const visitorHash = await deriveRateLimitKey("site-visitor", input.visitorToken!, hashKey);
      const sessionHash = await deriveRateLimitKey("site-session", input.sessionToken!, hashKey);
      const created = await database.prepare(`
        INSERT OR IGNORE INTO site_analytics_sessions
          (session_hash, visitor_hash, started_at, last_seen, source, device, expires_at)
        VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6)
      `).bind(sessionHash, visitorHash, nowIso, input.source, device, expires).run();
      startedSession = Number(created.meta?.changes ?? 0) === 1;

      if (!startedSession) {
        const updated = await database.prepare(`
          UPDATE site_analytics_sessions
          SET last_seen = ?3, expires_at = ?4
          WHERE session_hash = ?1 AND visitor_hash = ?2 AND last_seen <= ?3
        `).bind(sessionHash, visitorHash, nowIso, expires).run();
        if (Number(updated.meta?.changes ?? 0) < 1) {
          return { recorded: false, reason: "invalid" };
        }
      }

      statements.push(database.prepare(`
        INSERT INTO site_analytics_visitors_daily(day, visitor_hash, last_seen, expires_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(day, visitor_hash) DO UPDATE SET
          last_seen = MAX(site_analytics_visitors_daily.last_seen, excluded.last_seen),
          expires_at = excluded.expires_at
      `).bind(day, visitorHash, nowIso, expires));
    }

    // Anonymous mode has exactly three aggregate rollup writes, no local
    // or server visitor/session identifier. Opted-in mode adds HMAC rows.
    statements.push(
      database.prepare(`
        INSERT INTO site_analytics_hourly(bucket_hour, pageviews, sessions)
        VALUES (?1, 1, ?2)
        ON CONFLICT(bucket_hour) DO UPDATE SET
          pageviews = site_analytics_hourly.pageviews + 1,
          sessions = site_analytics_hourly.sessions + excluded.sessions
      `).bind(hour, startedSession ? 1 : 0),
      database.prepare(`
        INSERT INTO site_analytics_pages_hourly(bucket_hour, path, pageviews)
        VALUES (?1, ?2, 1)
        ON CONFLICT(bucket_hour, path) DO UPDATE SET
          pageviews = site_analytics_pages_hourly.pageviews + 1
      `).bind(hour, input.path),
      database.prepare(`
        INSERT INTO site_analytics_sources_hourly(bucket_hour, source, device, pageviews, sessions)
        VALUES (?1, ?2, ?3, 1, ?4)
        ON CONFLICT(bucket_hour, source, device) DO UPDATE SET
          pageviews = site_analytics_sources_hourly.pageviews + 1,
          sessions = site_analytics_sources_hourly.sessions + excluded.sessions
      `).bind(hour, input.source, device, startedSession ? 1 : 0),
    );
    await database.batch(statements);
    return { recorded: true, startedSession };
  } catch (cause) {
    console.error("Site analytics write unavailable", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return { recorded: false, reason: "failed" };
  }
}

/** Small, bounded expiry maintenance on a fraction of sitewide pageview writes. */
export async function pruneSiteAnalyticsIdentityRows(database: D1Database, now = new Date()) {
  const current = now.toISOString();
  return database.batch([
    database.prepare(`
      DELETE FROM site_analytics_sessions WHERE session_hash IN
      (SELECT session_hash FROM site_analytics_sessions INDEXED BY site_analytics_sessions_expiry_idx
       WHERE expires_at < ? LIMIT 128)
    `).bind(current),
    database.prepare(`
      DELETE FROM site_analytics_visitors_daily WHERE (day, visitor_hash) IN
      (SELECT day, visitor_hash FROM site_analytics_visitors_daily INDEXED BY site_analytics_visitors_daily_expiry_idx
       WHERE expires_at < ? LIMIT 128)
    `).bind(current),
    database.prepare(`
      DELETE FROM security_rate_limits WHERE bucket_key IN
      (SELECT bucket_key FROM security_rate_limits INDEXED BY site_analytics_security_rate_expiry_idx
       WHERE bucket_key GLOB 'site-traffic-ip:*' AND expires_at < ? LIMIT 128)
    `).bind(current),
  ]);
}
