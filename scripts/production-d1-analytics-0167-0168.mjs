#!/usr/bin/env node
/**
 * Protected, owner-dispatched, ISOLATED D1 analytics migrations 0167/0168.
 *
 * audit: read-only schema/ledger inspection (no user rows)
 * apply: pin exact SQL, inspect, capture D1 Time Travel bookmark, re-inspect,
 *        execute exactly ONE selected SQL file, verify DDL/unchanged ledger.
 *
 * This never invokes wrangler d1 migrations apply or writes d1_migrations.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ANALYTICS_D1_TARGETS, assertAnalyticsPinnedDdl,
  assertAnalyticsD1State, assertAnalyticsDependencyColumns,
} from "../lib/production-d1-analytics-0167-0168-guard.mjs";

const mode = process.argv[2] ?? "";
const target = process.argv[3] ?? "";
const config = ANALYTICS_D1_TARGETS[target];
const DATABASE = "psipedia-sk-db";
const EXPECTED_ACCOUNT = "5ff902d3d80376478b9213b2b8ae8d6e";
const EXPECTED_DATABASE_ID = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const outDir = resolve(".production-d1-analytics-0167-0168");
const configPath = resolve(outDir, "wrangler.json");
const reportPath = resolve(outDir, "report.json");
const must = (value, code) => { if (!value) throw new Error("ANALYTICS_D1_" + code); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
let recoveryBookmark = null;
let step = "START";
let before = null;

function authorize() {
  must(config && ["audit", "apply"].includes(mode), "INVALID_TARGET_OR_MODE");
  must(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "MANUAL_ONLY");
  must(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk", "REPOSITORY_MISMATCH");
  must(process.env.GITHUB_REF === "refs/heads/main", "MAIN_ONLY");
  must(process.env.CLOUDFLARE_ACCOUNT_ID === EXPECTED_ACCOUNT, "ACCOUNT_MISMATCH");
  must(Boolean(process.env.CLOUDFLARE_API_TOKEN), "PROTECTED_TOKEN_MISSING");
  must(Boolean(process.env.GITHUB_SHA), "COMMIT_MISSING");
  const confirmation = (mode === "apply" ? "APPLY" : "AUDIT") +
    "-" + target + "-psipedia-sk-db";
  must(process.env.ANALYTICS_D1_CONFIRMATION === confirmation,
    "EXPLICIT_CONFIRMATION_REQUIRED");
}

function pinnedSql() {
  const file = resolve("drizzle", config.filename);
  const raw = readFileSync(file);
  const blob = createHash("sha1")
    .update(Buffer.concat([Buffer.from("blob " + raw.length + "\0"), raw]))
    .digest("hex");
  must(blob === config.gitBlobSha, "PINNED_SQL_CHANGED");
  const sql = raw.toString("utf8");
  assertAnalyticsPinnedDdl(target, sql);
  return { file, sql, blob };
}

function prepare() {
  const resources = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  must(resources.account_id === EXPECTED_ACCOUNT &&
    resources.d1?.binding === "DB" &&
    resources.d1?.database_name === DATABASE &&
    resources.d1?.database_id === EXPECTED_DATABASE_ID,
    "CANONICAL_D1_MISMATCH");
  mkdirSync(outDir, { recursive: true });
  // The temporary config purposefully has NO migrations_dir.
  writeFileSync(configPath, JSON.stringify({
    name: "psipedia-analytics-one-off-" + target,
    compatibility_date: "2026-11-14",
    d1_databases: [{
      binding: "DB",
      database_name: DATABASE,
      database_id: EXPECTED_DATABASE_ID,
    }],
  }, null, 2) + "\n");
}

function wrangler(args) {
  const runner = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(runner, ["--no-install", "wrangler", ...args], {
    encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
  });
  if (result.error) throw result.error;
  must(result.status === 0, "WRANGLER_COMMAND_FAILED");
  return result.stdout ?? "";
}

function parseJson(source) {
  const raw = source.trim();
  try { return JSON.parse(raw); } catch { /* Wrangler can prepend banner text */ }
  for (const start of [raw.indexOf("["), raw.indexOf("{")]) {
    if (start < 0) continue;
    for (const close of ["]", "}"]) {
      const end = raw.lastIndexOf(close);
      if (end <= start) continue;
      try { return JSON.parse(raw.slice(start, end + 1)); }
      catch { /* try another valid frame */ }
    }
  }
  throw new Error("ANALYTICS_D1_INVALID_WRANGLER_JSON");
}

function select(sql) {
  must(/^SELECT\s/i.test(sql) && !sql.includes(";"), "NON_READONLY_QUERY");
  const response = parseJson(wrangler([
    "d1", "execute", DATABASE, "--remote", "--config", configPath,
    "--command", sql, "--json",
  ]));
  const pages = Array.isArray(response) ? response : [response];
  must(pages.length > 0 &&
    pages.every(page => page?.success === true && Array.isArray(page?.results)),
    "REMOTE_READ_FAILED");
  return pages.flatMap(page => page.results);
}

function inspect(sql) {
  // Whitelisted source catalog and migration metadata only. No profile/article rows read.
  const names = [...new Set([...config.objects, ...config.dependencies])];
  const quotedNames = names.map(name => "'" + name + "'").join(",");
  const rows = select("SELECT type,name,sql FROM sqlite_master WHERE name IN (" +
    quotedNames + ") ORDER BY name");
  const history = select("SELECT id,name FROM d1_migrations ORDER BY id");
  const historyNames = history.map(row => row.name);
  const state = assertAnalyticsD1State({ target, sql, rows, historyNames });
  const byTable = {};
  if (target === "0167") {
    for (const table of ["directory_profiles", "article_read_hourly", "security_rate_limits"]) {
      byTable[table] = select("SELECT name FROM pragma_table_info('" + table + "')")
        .map(row => row.name);
    }
  }
  assertAnalyticsDependencyColumns(target, byTable);
  const dependencyRows = rows.filter(row => config.dependencies.includes(row.name));
  return {
    ...state,
    historyHash: sha256(JSON.stringify(history)),
    dependencyHash: sha256(JSON.stringify({ dependencyRows, byTable })),
  };
}

function findBookmark(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.bookmark === "string" && value.bookmark) return value.bookmark;
  for (const child of Object.values(value)) {
    const found = findBookmark(child);
    if (found) return found;
  }
  return null;
}

function getRecoveryBookmark() {
  const result = parseJson(wrangler([
    "d1", "time-travel", "info", DATABASE, "--config", configPath, "--json",
  ]));
  const bookmark = findBookmark(result);
  must(Boolean(bookmark), "RECOVERY_BOOKMARK_MISSING");
  return bookmark;
}

function receipt(phase, state, applied, errorCode = null) {
  step = phase;
  const payload = {
    phase, mode, target, database: DATABASE,
    sqlFile: config.filename, pinnedGitBlob: config.gitBlobSha,
    commit: process.env.GITHUB_SHA, capturedAt: new Date().toISOString(),
    installed: state?.installed ?? null,
    readyToApply: state?.readyToApply ?? null,
    historyHash: state?.historyHash ?? null,
    dependencyHash: state?.dependencyHash ?? null,
    originalHistoryHash: before?.historyHash ?? null,
    recoveryBookmark, applied,
    migrationLedgerWritten: false,
    ...(errorCode ? { errorCode } : {}),
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(JSON.stringify({ phase, target, installed: payload.installed, applied,
    migrationLedgerWritten: false, errorCode }));
}

function mustMatchPreflight(first, latest) {
  must(first.historyHash === latest.historyHash, "LEDGER_CHANGED_DURING_ROLLOUT");
  must(first.dependencyHash === latest.dependencyHash, "DEPENDENCIES_CHANGED_DURING_ROLLOUT");
  must(first.installed === latest.installed, "INSTALLATION_STATE_CHANGED");
}

function run() {
  authorize();
  const pinned = pinnedSql();
  prepare();
  before = inspect(pinned.sql);
  if (mode === "audit") {
    receipt("AUDIT", before, false);
    return;
  }
  if (before.installed) {
    receipt("ALREADY_INSTALLED", before, false);
    return;
  }
  must(before.readyToApply, "NOT_READY_TO_APPLY");
  recoveryBookmark = getRecoveryBookmark();
  const fresh = inspect(pinned.sql);
  mustMatchPreflight(before, fresh);
  must(!fresh.installed, "CONCURRENT_INSTALLATION");
  // Persist Time Travel recovery point BEFORE the only possible remote mutation.
  receipt("RECOVERY_POINT", fresh, null);
  // Execute ONE PINNED migration SQL file; never the generic sequential migrator.
  wrangler([
    "d1", "execute", DATABASE, "--remote", "--config", configPath,
    "--file", pinned.file, "--yes", "--json",
  ]);
  const after = inspect(pinned.sql);
  must(after.installed, "POSTFLIGHT_SCHEMA_MISSING");
  must(before.historyHash === after.historyHash, "POSTFLIGHT_LEDGER_CHANGED");
  must(before.dependencyHash === after.dependencyHash, "POSTFLIGHT_DEPENDENCIES_CHANGED");
  receipt("POSTFLIGHT", after, true);
}

try { run(); } catch (error) {
  const code = error instanceof Error ? error.message : "ANALYTICS_D1_UNKNOWN";
  console.error(JSON.stringify({ phase: "FAILED", step, code }));
  try { receipt("FAILED", before, null, code); } catch { /* failure already printed */ }
  process.exitCode = 1;
}
