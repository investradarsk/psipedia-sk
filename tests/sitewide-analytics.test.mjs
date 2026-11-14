import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifySiteTrafficSource,
  classifySiteTrafficDevice,
  isSafeSiteAnalyticsPath,
} from "../lib/site-analytics-public.ts";
import {
  recordSitePageView,
  pruneSiteAnalyticsIdentityRows,
} from "../lib/site-analytics.ts";
import { loadSiteTrafficReport } from "../lib/site-analytics-report.ts";
import { anonymousSitePageview, reserveSiteAnalyticsVisit } from "../lib/site-analytics-client.ts";

const migration = await readFile(new URL("../drizzle/0168_sitewide_first_party_analytics.sql", import.meta.url), "utf8");
const hashKey = Buffer.alloc(32, 7).toString("base64url");
const now = new Date("2026-11-14T20:37:41.000Z");
const visitorA = "550e8400-e29b-41d4-a716-446655440000";
const visitorB = "550e8400-e29b-41d4-a716-446655440001";
const sessionA = "550e8400-e29b-41d4-a716-446655440002";
const sessionB = "550e8400-e29b-41d4-a716-446655440003";
const mobileAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Mobile/15E148 Safari/604.1";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE security_rate_limits(
      bucket_key TEXT PRIMARY KEY NOT NULL,
      window_started_at TEXT NOT NULL,
      count INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  db.exec(migration);
  const statements = [];
  const database = {
    prepare(sql) {
      statements.push(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() {
          const result = db.prepare(sql).run(...args);
          return { meta: { changes: result.changes }, success: true };
        },
        _run() { return db.prepare(sql).run(...args); },
      };
    },
    async batch(queries) {
      db.exec("BEGIN");
      try {
        const results = queries.map((query) => ({ meta: { changes: query._run().changes } }));
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, database, statements };
}

function consentStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    key(index) { return [...data.keys()][index] ?? null; },
    get length() { return data.size; },
  };
}

async function view(database, input = {}) {
  return recordSitePageView({
    path: input.path ?? "/starostlivost/preco-pes-zerie-travu",
    visitorToken: input.visitorToken ?? visitorA,
    sessionToken: input.sessionToken ?? sessionA,
    source: input.source ?? "google",
    userAgent: input.userAgent ?? mobileAgent,
    database,
    hashKey,
    now: input.now ?? now,
  });
}

test("site path classifier excludes internal and sensitive routes, never sends query strings", () => {
  assert.equal(isSafeSiteAnalyticsPath("/"), true);
  assert.equal(isSafeSiteAnalyticsPath("/plemena/labradorsky-retriever"), true);
  for (const invalid of [
    "/admin", "/admin/clanky/1", "/api/articles/read", "/partner/login",
    "/_next/static/chunk.js", "/recenzia/odoslat", "/foo?utm_source=google",
    "/foo#bar", "//other-host/evil", "/x/../admin", "https://other.test/",
  ]) assert.equal(isSafeSiteAnalyticsPath(invalid), false, invalid);
});

test("source and device classification uses finite categories, not full URL or fingerprint", () => {
  assert.equal(classifySiteTrafficSource("https://www.google.sk/search?q=dogs"), "google");
  assert.equal(classifySiteTrafficSource("https://l.facebook.com/l.php?u=x"), "facebook");
  assert.equal(classifySiteTrafficSource("https://www.instagram.com/p/example"), "instagram");
  assert.equal(classifySiteTrafficSource("https://psipedia.sk/plemena"), "direct");
  assert.equal(classifySiteTrafficSource("https://other.test/secret?x=1"), "referral");
  assert.equal(classifySiteTrafficDevice(mobileAgent), "mobile");
  assert.equal(classifySiteTrafficDevice("Mozilla/5.0 iPad Tablet"), "tablet");
  assert.equal(classifySiteTrafficDevice("Mozilla/5.0 Windows NT 10.0"), "desktop");
});

test("client tracking requires consent and starts new visits after 30 minutes", () => {
  const localStorage = consentStorage();
  const sessionStorage = consentStorage();
  const tokens = [visitorA, sessionA, sessionB, visitorB];
  const props = { localStorage, sessionStorage, path: "/", referrer: "https://www.google.sk", origin: "https://psipedia.sk", randomUUID: () => tokens.shift() };
  assert.equal(reserveSiteAnalyticsVisit({ ...props, nowMs: 1_000 }), null);
  localStorage.setItem("psipedia-cookie-consent", "analytics");
  const first = reserveSiteAnalyticsVisit({ ...props, nowMs: 1_000 });
  assert.equal(first.visitorToken, visitorA);
  assert.equal(first.sessionToken, sessionA);
  assert.equal(first.source, "google");
  const second = reserveSiteAnalyticsVisit({ ...props, path: "/plemena", nowMs: 5_000 });
  assert.equal(second.visitorToken, visitorA);
  assert.equal(second.sessionToken, sessionA);
  const newSession = reserveSiteAnalyticsVisit({ ...props, nowMs: 1_900_000 });
  assert.equal(newSession.visitorToken, visitorA);
  assert.equal(newSession.sessionToken, sessionB);
  assert.equal(newSession.source, "google");
  assert.equal(reserveSiteAnalyticsVisit({ ...props, path: "/admin", nowMs: 1_900_001 }), null);
});

test("cookieless pageviews work with no consent, no visitor token and no session hash", async () => {
  const { db, database, statements } = fixture();
  try {
    const aggregate = anonymousSitePageview("/", "https://www.google.sk/search?q=dog", "https://psipedia.sk");
    assert.deepEqual(aggregate, { path: "/", source: "google" });
    const result = await recordSitePageView({
      ...aggregate,
      userAgent: mobileAgent,
      database,
      now,
    });
    assert.deepEqual(result, { recorded: true, startedSession: false });
    assert.equal(db.prepare("SELECT pageviews FROM site_analytics_hourly").get().pageviews, 1);
    assert.equal(db.prepare("SELECT sessions FROM site_analytics_hourly").get().sessions, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM site_analytics_sessions").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM site_analytics_visitors_daily").get().n, 0);
    assert.deepEqual(
      db.prepare("SELECT source, device, pageviews, sessions FROM site_analytics_sources_hourly").get(),
      { source: "google", device: "mobile", pageviews: 1, sessions: 0 },
    );
    assert.ok(statements.every((sql) => !sql.includes("INSERT OR IGNORE INTO site_analytics_sessions")
      && !sql.includes("INSERT INTO site_analytics_visitors_daily")));
  } finally {
    db.close();
  }
});

test("anonymous plus consented events produce exact pageviews and source counts without double counting", async () => {
  const { db, database } = fixture();
  try {
    await recordSitePageView({
      path: "/", source: "direct", userAgent: mobileAgent, database, now,
    });
    await view(database, { path: "/plemena/labrador", source: "facebook" });
    assert.equal(db.prepare("SELECT pageviews FROM site_analytics_hourly").get().pageviews, 2);
    assert.equal(db.prepare("SELECT sessions FROM site_analytics_hourly").get().sessions, 1);
    assert.equal(db.prepare("SELECT SUM(pageviews) AS n FROM site_analytics_sources_hourly").get().n, 2);
    assert.equal(db.prepare("SELECT SUM(sessions) AS n FROM site_analytics_sources_hourly").get().n, 1);
    const report = await loadSiteTrafficReport({ window: "24h", now, database });
    assert.equal(report.pageviews, 2);
    assert.equal(report.sessions, 1);
    assert.equal(report.uniqueVisitors, 1);
    assert.equal(report.sources.find((x) => x.label === "direct").pageviews, 1);
    assert.equal(report.sources.find((x) => x.label === "facebook").pageviews, 1);
  } finally {
    db.close();
  }
});

test("pageviews count every navigation while visits and visitor identities are deduplicated", async () => {
  const { db, database } = fixture();
  try {
    assert.deepEqual(await view(database), { recorded: true, startedSession: true });
    assert.deepEqual(await view(database, { path: "/plemena/labrador" }), { recorded: true, startedSession: false });
    assert.deepEqual(await view(database, { sessionToken: sessionB, source: "facebook", path: "/" }), { recorded: true, startedSession: true });
    assert.equal(db.prepare("SELECT pageviews FROM site_analytics_hourly").get().pageviews, 3);
    assert.equal(db.prepare("SELECT sessions FROM site_analytics_hourly").get().sessions, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM site_analytics_sessions").get().n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM site_analytics_visitors_daily").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM site_analytics_pages_hourly").get().n, 3);
    assert.equal(db.prepare("SELECT SUM(sessions) AS n FROM site_analytics_sources_hourly").get().n, 2);
    assert.equal(db.prepare("SELECT visitor_hash FROM site_analytics_sessions LIMIT 1").get().visitor_hash.startsWith("site-visitor:"), true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM site_analytics_sessions WHERE visitor_hash=?").get(visitorA).n, 0);
  } finally {
    db.close();
  }
});

test("dashboard reads real traffic, source/device mixes, top pages, 30-day visitors and active sessions", async () => {
  const { db, database } = fixture();
  try {
    await view(database);
    await view(database, { path: "/", sessionToken: sessionB, visitorToken: visitorB, source: "facebook", userAgent: "Mozilla/5.0 Windows NT 10.0" });
    const report = await loadSiteTrafficReport({ window: "24h", now, database });
    assert.equal(report.available, true);
    assert.equal(report.pageviews, 2);
    assert.equal(report.sessions, 2);
    assert.equal(report.uniqueVisitors, 2);
    assert.equal(report.activeSessions5m, 2);
    assert.equal(report.sources.find((source) => source.label === "google").pageviews, 1);
    assert.equal(report.sources.find((source) => source.label === "facebook").pageviews, 1);
    assert.equal(report.devices.find((device) => device.label === "mobile").pageviews, 1);
    assert.equal(report.devices.find((device) => device.label === "desktop").pageviews, 1);
    assert.equal(report.points.reduce((sum, row) => sum + row.pageviews, 0), 2);
    assert.equal(report.topPages.length, 2);
    const lifetime = await loadSiteTrafficReport({ window: "all", now, database });
    assert.equal(lifetime.pageviews, 2);
    assert.equal(lifetime.uniqueVisitors, null, "do not fabricate lifetime uniques after deletion of identifiers");
    assert.equal(lifetime.points.length, 12);
  } finally {
    db.close();
  }
});

test("unavailable staging migration is distinct from a genuine zero", async () => {
  const unavailable = await loadSiteTrafficReport({ window: "7d", now, database: null });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.pageviews, null);
  const { db, database } = fixture();
  try {
    const blank = await loadSiteTrafficReport({ window: "7d", now, database });
    assert.equal(blank.available, true);
    assert.equal(blank.pageviews, 0);
    assert.equal(blank.sessions, 0);
    assert.equal(blank.uniqueVisitors, 0);
  } finally {
    db.close();
  }
});

test("old HMAC visitor identifiers are pruned without losing all-time aggregate counters", async () => {
  const { db, database } = fixture();
  try {
    await view(database);
    db.prepare("UPDATE site_analytics_sessions SET expires_at='2026-11-01T00:00:00.000Z'").run();
    db.prepare("UPDATE site_analytics_visitors_daily SET expires_at='2026-11-01T00:00:00.000Z'").run();
    await pruneSiteAnalyticsIdentityRows(database, now);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM site_analytics_sessions").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM site_analytics_visitors_daily").get().n, 0);
    assert.equal(db.prepare("SELECT pageviews FROM site_analytics_hourly").get().pageviews, 1);
  } finally {
    db.close();
  }
});

test("sitewide UI is mounted once and new reporting has no GA4 API dependencies", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/admin/nastavenia/statistiky/page.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../components/admin-site-traffic-panel.tsx", import.meta.url), "utf8");
  assert.equal((layout.match(/<SiteAnalyticsTracker\b/g) ?? []).length, 1);
  assert.match(route, /loadSiteTrafficReport/);
  assert.match(route, /requireAdminPageUser/);
  assert.match(panel, /Návštevnosť celého webu/);
  assert.match(panel, /Unikátni návštevníci/);
  assert.match(panel, /Najnavštevovanejšie stránky/);
  assert.doesNotMatch(panel, /gtag\(|GA4 API|googleAnalyticsData/);
});
