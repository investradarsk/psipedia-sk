import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isSafeSiteAnalyticsPath } from "../lib/site-analytics-public.ts";
import { recordSitePageView } from "../lib/site-analytics.ts";
import { loadSiteTrafficReport } from "../lib/site-analytics-report.ts";

const migration = await readFile(
  new URL("../drizzle/0168_sitewide_first_party_analytics.sql", import.meta.url),
  "utf8",
);
const now = new Date("2026-11-14T20:37:41.000Z");

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
  const queries = [];
  const database = {
    prepare(sql) {
      queries.push(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        runSync() { return sqlite.prepare(sql).run(...args); },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => ({
          meta: { changes: statement.runSync().changes },
        }));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, database, queries };
}

test("0168 creates exactly two aggregate-only tables with no visitor metadata", () => {
  const { sqlite } = fixture();
  try {
    const tables = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all().map((row) => row.name);
    assert.deepEqual(tables, [
      "site_analytics_hourly",
      "site_analytics_pages_hourly",
    ]);
    const schema = sqlite.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table'",
    ).all().map((row) => row.sql).join("\n");
    assert.doesNotMatch(schema, /visitor|session|source|device|referrer|user.agent|\bip\b|hash|cookie/i);
  } finally {
    sqlite.close();
  }
});

test("only eligible public page paths are counted, never a query or private route", () => {
  assert.equal(isSafeSiteAnalyticsPath("/"), true);
  assert.equal(isSafeSiteAnalyticsPath("/plemena/labradorsky-retriever"), true);
  assert.equal(isSafeSiteAnalyticsPath("/podujatia/psi-den-2026"), true);
  for (const unsafe of [
    "/admin", "/admin/clanky/1", "/partner/login", "/api/analytics/pageview",
    "/recenzia/prihlasenie", "/_next/static/chunk.js", "/?email=abc",
    "/foo#bar", "//other.example/", "/foo/../bar",
    "/adresar/foo/%40personal-email", "https://other.example/",
  ]) assert.equal(isSafeSiteAnalyticsPath(unsafe), false, unsafe);
});

test("single view increases two hourly counters, with zero individual events", async () => {
  const { sqlite, database, queries } = fixture();
  try {
    const first = await recordSitePageView({
      path: "/", now, database,
    });
    assert.deepEqual(first, { recorded: true });
    assert.equal(queries.length, 2);
    assert.ok(queries.every((sql) => /site_analytics_(?:pages_)?hourly/.test(sql)));
    assert.equal(sqlite.prepare("SELECT pageviews FROM site_analytics_hourly").get().pageviews, 1);
    assert.deepEqual(
      sqlite.prepare("SELECT path, pageviews FROM site_analytics_pages_hourly").get(),
      { path: "/", pageviews: 1 },
    );
    await recordSitePageView({ path: "/", now, database });
    await recordSitePageView({
      path: "/plemena/labradorsky-retriever", now, database,
    });
    assert.equal(sqlite.prepare("SELECT pageviews FROM site_analytics_hourly").get().pageviews, 3);
    assert.deepEqual(
      sqlite.prepare("SELECT path, pageviews FROM site_analytics_pages_hourly ORDER BY path").all(),
      [
        { path: "/", pageviews: 2 },
        { path: "/plemena/labradorsky-retriever", pageviews: 1 },
      ],
    );
  } finally {
    sqlite.close();
  }
});

test("hourly and page rollups remain consistent across midnight UTC", async () => {
  const { sqlite, database } = fixture();
  try {
    await recordSitePageView({
      path: "/clanky/jeden", database,
      now: new Date("2026-11-13T23:30:00Z"),
    });
    await recordSitePageView({
      path: "/clanky/dva", database,
      now: new Date("2026-11-14T00:30:00Z"),
    });
    const total = sqlite.prepare(
      "SELECT SUM(pageviews) AS n FROM site_analytics_hourly",
    ).get().n;
    const pages = sqlite.prepare(
      "SELECT SUM(pageviews) AS n FROM site_analytics_pages_hourly",
    ).get().n;
    assert.equal(total, 2);
    assert.equal(pages, 2);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS n FROM site_analytics_hourly",
    ).get().n, 2);
  } finally {
    sqlite.close();
  }
});

test("admin report returns only total, time-series and top public pages", async () => {
  const { sqlite, database } = fixture();
  try {
    for (const path of ["/", "/", "/plemena/labrador"]) {
      assert.deepEqual(
        await recordSitePageView({ path, now, database }),
        { recorded: true },
      );
    }
    const report = await loadSiteTrafficReport({
      window: "24h", now, database,
    });
    assert.equal(report.available, true);
    assert.equal(report.pageviews, 3);
    assert.equal(report.points.reduce((sum, point) => sum + point.pageviews, 0), 3);
    assert.deepEqual(report.topPages, [
      { path: "/", pageviews: 2 },
      { path: "/plemena/labrador", pageviews: 1 },
    ]);
    for (const banned of [
      "uniqueVisitors", "sessions", "activeSessions5m",
      "sources", "devices", "referrers", "ipAddresses",
    ]) assert.equal(banned in report, false, banned);
    const all = await loadSiteTrafficReport({
      window: "all", now, database,
    });
    assert.equal(all.pageviews, 3);
    assert.equal(all.points.length, 12);
  } finally {
    sqlite.close();
  }
});

test("unavailable data is distinct from a genuine zero count", async () => {
  const unavailable = await loadSiteTrafficReport({
    window: "30d", now, database: null,
  });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.pageviews, null);
  const { sqlite, database } = fixture();
  try {
    const empty = await loadSiteTrafficReport({
      window: "30d", now, database,
    });
    assert.equal(empty.available, true);
    assert.equal(empty.pageviews, 0);
    assert.deepEqual(empty.topPages, []);
  } finally {
    sqlite.close();
  }
});

test("global view tracker sends only a pathname and never touches browser identifiers", async () => {
  const tracker = await readFile(
    new URL("../components/site-analytics-tracker.tsx", import.meta.url),
    "utf8",
  );
  const schema = await readFile(
    new URL("../drizzle/0168_sitewide_first_party_analytics.sql", import.meta.url),
    "utf8",
  );
  assert.match(tracker, /JSON\.stringify\(\{ path: pathname \}\)/);
  assert.match(tracker, /credentials: "omit"/);
  assert.match(tracker, /visibilityState !== "visible"/);
  assert.doesNotMatch(tracker, /localStorage|sessionStorage|document\.cookie|document\.referrer|consent|gtag|randomUUID/);
  assert.doesNotMatch(schema, /HMAC|visitor|session|source|device|ip:|security_rate_limits|personal/i);
});

test("admin UI exposes a count, time-series and top pages only", async () => {
  const ui = await readFile(
    new URL("../components/admin-site-traffic-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(ui, /Zobrazenia stránok/);
  assert.match(ui, /Vývoj zobrazení/);
  assert.match(ui, /Najnavštevovanejšie stránky/);
  assert.doesNotMatch(ui, /Unikátni návštevníci|Aktívne relácie|Odkiaľ návštevníci|Zariadenia/);
});
