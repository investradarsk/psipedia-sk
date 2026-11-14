import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ANALYTICS_D1_TARGETS, pinnedAnalyticsDdlStatements, assertAnalyticsPinnedDdl,
  assertAnalyticsD1State, assertAnalyticsDependencyColumns,
} from "../lib/production-d1-analytics-0167-0168-guard.mjs";

const sql167 = readFileSync("drizzle/0167_content_analytics_profile_views.sql", "utf8");
const sql168 = readFileSync("drizzle/0168_sitewide_first_party_analytics.sql", "utf8");
const runner = readFileSync("scripts/production-d1-analytics-0167-0168.mjs", "utf8");
const workflow = readFileSync(".github/workflows/production-d1-analytics-0167-0168.yml", "utf8");
const productionMigrator = readFileSync("scripts/production-d1-migrate.mjs", "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec([
    "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT);",
    "INSERT INTO d1_migrations VALUES (157,'0157_facebook_weekly_plan_marks.sql','2026-11-14');",
    "CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, name TEXT);",
    "INSERT INTO directory_profiles VALUES (1,'Existing profile');",
    "CREATE TABLE article_read_hourly (article_id INTEGER NOT NULL, bucket_hour TEXT NOT NULL, qualified_reads INTEGER NOT NULL, PRIMARY KEY(article_id,bucket_hour));",
    "INSERT INTO article_read_hourly VALUES (23,'2026-11-14T18:00:00Z',45);",
    "CREATE TABLE security_rate_limits (bucket_key TEXT PRIMARY KEY, expires_at TEXT NOT NULL);",
    "INSERT INTO security_rate_limits VALUES ('existing-other-feature','2026-11-30');",
  ].join("\n"));
  return db;
}

function state(db, target, sql) {
  const rows = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const historyNames = db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map(row => row.name);
  return assertAnalyticsD1State({ target, sql, rows, historyNames });
}

function pinnedBlob(sql) {
  const bytes = Buffer.from(sql);
  return createHash("sha1").update(
    Buffer.concat([Buffer.from("blob " + bytes.length + "\0"), bytes]),
  ).digest("hex");
}

test("0167/0168 SHA-pinned additive schema and exactly expected objects", () => {
  for (const [target, sql] of [["0167", sql167], ["0168", sql168]]) {
    assert.equal(pinnedBlob(sql), ANALYTICS_D1_TARGETS[target].gitBlobSha);
    const expected = assertAnalyticsPinnedDdl(target, sql);
    assert.equal(expected.length, target === "0167" ? 4 : 2);
    assert.equal(pinnedAnalyticsDdlStatements(sql).length, expected.length);
    assert.ok(expected.every(row => ["table", "index", "view"].includes(row.type)));
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /\b(?:DROP|ALTER|UPDATE|DELETE|INSERT|REPLACE|ATTACH|DETACH)\b/i);
  }
  const objects168 = assertAnalyticsPinnedDdl("0168", sql168);
  assert.deepEqual(objects168.map(row => row.name),
    ["site_analytics_hourly", "site_analytics_pages_hourly"]);
  assert.doesNotMatch(sql168, /visitor_id|session_id|ip_hash|user_agent|referrer|device|cookie/i);
});

test("both pinned migrations apply to a clean SQLite fixture without altering history or old counts", () => {
  const db = fixture();
  try {
    assert.equal(state(db, "0167", sql167).installed, false);
    assert.equal(state(db, "0168", sql168).installed, false);
    const articleCount = db.prepare("SELECT qualified_reads AS n FROM article_read_hourly WHERE article_id=23").get().n;
    const otherLimiter = db.prepare("SELECT COUNT(*) AS n FROM security_rate_limits").get().n;
    const ledger = db.prepare("SELECT name FROM d1_migrations").all().map(row => row.name);
    assertAnalyticsDependencyColumns("0167", {
      directory_profiles: ["id", "name"],
      article_read_hourly: ["article_id", "bucket_hour", "qualified_reads"],
      security_rate_limits: ["bucket_key", "expires_at"],
    });
    db.exec(sql167);
    db.exec(sql168);
    assert.equal(state(db, "0167", sql167).installed, true);
    assert.equal(state(db, "0168", sql168).installed, true);
    assert.equal(db.prepare("SELECT qualified_reads AS n FROM article_read_hourly WHERE article_id=23").get().n,articleCount);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM security_rate_limits").get().n,otherLimiter);
    assert.deepEqual(db.prepare("SELECT name FROM d1_migrations").all().map(row => row.name),ledger);
    db.prepare("INSERT INTO site_analytics_hourly VALUES('2026-11-14T18:00:00Z',3)").run();
    db.prepare("INSERT INTO site_analytics_pages_hourly VALUES('2026-11-14T18:00:00Z','/clanky/test',3)").run();
    assert.equal(db.prepare("SELECT pageviews FROM site_analytics_hourly").get().pageviews,3);
    assert.equal(db.prepare("SELECT pageviews FROM site_analytics_pages_hourly").get().pageviews,3);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_view_hourly").get().n,0);
  } finally { db.close(); }
});

test("partial 0168 installation fails closed, not silently considered already installed", () => {
  const db = fixture();
  try {
    db.exec(pinnedAnalyticsDdlStatements(sql168)[0]);
    assert.throws(() => state(db, "0168", sql168), /ANALYTICS_D1_PARTIAL_SCHEMA_REFUSED/);
  } finally { db.close(); }
});

test("partial 0167 installation fails closed (including indexes/views)", () => {
  const db = fixture();
  try {
    db.exec(pinnedAnalyticsDdlStatements(sql167)[0]);
    assert.throws(() => state(db, "0167", sql167), /ANALYTICS_D1_PARTIAL_SCHEMA_REFUSED/);
  } finally { db.close(); }
});

test("existing divergent table DDL is rejected even if object names match", () => {
  const db = fixture();
  try {
    db.exec("CREATE TABLE site_analytics_hourly (bucket_hour TEXT PRIMARY KEY, pageviews TEXT)");
    db.exec("CREATE TABLE site_analytics_pages_hourly (bucket_hour TEXT, path TEXT, pageviews INTEGER)");
    assert.throws(() => state(db, "0168", sql168), /ANALYTICS_D1_INCOMPATIBLE_SCHEMA_/);
  } finally { db.close(); }
});

test("missing required source and missing migration history refuse apply", () => {
  const db = fixture();
  try {
    db.exec("DROP TABLE article_read_hourly");
    assert.throws(() => state(db, "0167", sql167), /ANALYTICS_D1_DEPENDENCY_MISSING_article_read_hourly/);
    assert.equal(state(db, "0168", sql168).installed,false);
  } finally { db.close(); }
  const invalid = fixture();
  try {
    invalid.exec("DELETE FROM d1_migrations");
    assert.throws(() => state(invalid, "0168", sql168), /ANALYTICS_D1_LEDGER_0157_MISSING/);
  } finally { invalid.close(); }
});

test("ledger cannot claim that a missing migration is already installed", () => {
  const db = fixture();
  try {
    db.prepare("INSERT INTO d1_migrations VALUES(168,?,?)")
      .run("0168_sitewide_first_party_analytics.sql","2026-11-14");
    assert.throws(() => state(db, "0168", sql168), /ANALYTICS_D1_LEDGER_CLAIMS_MISSING_SCHEMA/);
  } finally { db.close(); }
});

test("source column guard refuses 0167 when read counters or limiter prerequisites are missing", () => {
  assert.throws(() => assertAnalyticsDependencyColumns("0167", {
    directory_profiles: ["id"],
    article_read_hourly: ["article_id", "bucket_hour"],
    security_rate_limits: ["bucket_key", "expires_at"],
  }), /ANALYTICS_D1_DEPENDENCY_COLUMN_MISSING_article_read_hourly_qualified_reads/);
  assert.throws(() => assertAnalyticsPinnedDdl("0168", "DROP TABLE site_analytics_hourly;"),
    /ANALYTICS_D1_NON_ADDITIVE_DDL/);
});

test("protected workflow is owner-only, audit-default, serialized, and never auto-applies", () => {
  assert.match(workflow, /^on:\s*\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule):/m);
  assert.match(workflow, /default: audit/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /ANALYTICS_D1_CONFIRMATION/);
  assert.match(workflow, /CLOUDFLARE_D1_API_TOKEN/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /production-d1-analytics-0167-0168\.mjs/);
  assert.match(workflow, /production-d1-analytics-0167-0168\.test\.mjs/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test("isolated runner performs remote READs before one pinned SQL, recovery bookmark, no ledger writes", () => {
  assert.match(runner, /GITHUB_EVENT_NAME === "workflow_dispatch"/);
  assert.match(runner, /EXPLICIT_CONFIRMATION_REQUIRED/);
  assert.match(runner, /PINNED_SQL_CHANGED/);
  assert.match(runner, /RECOVERY_BOOKMARK_MISSING/);
  assert.match(runner, /DEPENDENCIES_CHANGED_DURING_ROLLOUT/);
  assert.match(runner, /POSTFLIGHT_LEDGER_CHANGED/);
  assert.match(runner, /receipt\("RECOVERY_POINT"/);
  assert.match(runner, /"d1", "time-travel", "info"/);
  assert.match(runner, /"d1", "execute", DATABASE, "--remote"/);
  assert.match(runner, /"--file", pinned\.file, "--yes", "--json"/);
  assert.match(runner, /migrationLedgerWritten: false/);
  assert.doesNotMatch(runner, /\b(?:INSERT|REPLACE|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?d1_migrations\b/i);
  assert.doesNotMatch(runner, /wrangler d1 migrations apply|d1", "migrations", "apply"/);
  const registry = productionMigrator.slice(
    productionMigrator.indexOf("export const SUPPORTED_PRODUCTION_TARGETS"),
    productionMigrator.indexOf("export const DYNAMIC_ENTITY_IDENTITY_INDEXES"),
  );
  assert.doesNotMatch(registry, /"0167_content_analytics_profile_views\.sql"/);
  assert.doesNotMatch(registry, /"0168_sitewide_first_party_analytics\.sql"/);
  assert.match(productionMigrator, /UNACTIVATED_PRODUCTION_TARGETS/);
});
