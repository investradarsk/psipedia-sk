#!/usr/bin/env node
/**
 * Manual D1 0164 lifecycle rollout. AUDIT is SELECT-only.
 * APPLY uses only the exact pinned additive schema file, protected by a
 * Time Travel recovery bookmark and full preflight/postflight verification.
 * Never writes d1_migrations, Notion pages, or existing canonical records.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LIFECYCLE_0164_FILE, LIFECYCLE_0164_SQL_BLOB, LIFECYCLE_0164_SOURCES,
  LIFECYCLE_0164_OBJECTS, classifyLifecycle0164,
  assertLifecycle0164ApplyReady, assertLifecycle0164Postflight,
} from "../lib/production-d1-0164-guard.mjs";

const repository = "investradarsk/psipedia-sk";
const database = "psipedia-sk-db";
const accountId = "5ff902d3d80376478b9213b2b8ae8d6e";
const databaseId = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const mode = process.argv[2] ?? "";
const folder = resolve(".production-d1-0164");
const configPath = resolve(folder, "wrangler.json");
const sqlPath = resolve("drizzle", LIFECYCLE_0164_FILE);
const ensure = (condition, code) => { if (!condition) throw Error(code); };

function authorize() {
  ensure(mode === "audit" || mode === "apply", "LIFECYCLE_0164_INVALID_MODE");
  ensure(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "LIFECYCLE_0164_MANUAL_ONLY");
  ensure(process.env.GITHUB_REPOSITORY === repository, "LIFECYCLE_0164_WRONG_REPOSITORY");
  ensure(process.env.GITHUB_REF === "refs/heads/main", "LIFECYCLE_0164_MAIN_ONLY");
  ensure(process.env.CLOUDFLARE_ACCOUNT_ID === accountId, "LIFECYCLE_0164_WRONG_ACCOUNT");
  ensure(Boolean(process.env.CLOUDFLARE_API_TOKEN), "LIFECYCLE_0164_TOKEN_MISSING");
  const expected = (mode === "apply" ? "APPLY" : "AUDIT") + "-0164-psipedia-sk-db";
  ensure(process.env.LIFECYCLE_0164_CONFIRMATION === expected,
    "LIFECYCLE_0164_CONFIRMATION_REQUIRED");
}
function pinnedSql() {
  const bytes = readFileSync(sqlPath);
  const header = Buffer.from("blob " + bytes.length + "\0");
  const sha = createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
  ensure(sha === LIFECYCLE_0164_SQL_BLOB, "LIFECYCLE_0164_SQL_CHANGED");
  const clean = bytes.toString("utf8").replace(/--[^\n]*(?:\n|$)/g, "");
  const heads = clean.match(/\bCREATE\s+(?:TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
  ensure(heads.length === LIFECYCLE_0164_OBJECTS.length &&
    !/^\s*(?:ALTER|DROP|INSERT|UPDATE|DELETE|REPLACE)\b/im.test(clean),
    "LIFECYCLE_0164_SQL_NOT_EXACT_SCHEMA_ONLY");
  return sha;
}
function configure() {
  const resource = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  ensure(resource.account_id === accountId && resource.d1?.binding === "DB" &&
    resource.d1?.database_name === database && resource.d1?.database_id === databaseId,
    "LIFECYCLE_0164_WRONG_DATABASE");
  mkdirSync(folder, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    name: "psipedia-sk-0164-lifecycle-manual-only",
    compatibility_date: "2026-11-11",
    d1_databases: [{ binding: "DB", database_name: database, database_id: databaseId }],
  }, null, 2));
}
function wrangler(args) {
  const runner = process.platform === "win32" ? "npx.cmd" : "npx";
  const run = spawnSync(runner, ["wrangler", ...args], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1", WRANGLER_SEND_METRICS: "false" },
  });
  if (run.error) throw run.error;
  ensure(run.status === 0, "LIFECYCLE_0164_WRANGLER_FAILED");
  return run.stdout || "";
}
function parseJson(raw) {
  const source = raw.trim();
  try { return JSON.parse(source); } catch { /* Wrangler banner may precede JSON */ }
  for (const start of [source.indexOf("["), source.indexOf("{")]) {
    if (start < 0) continue;
    for (const ending of ["]", "}"]) {
      const end = source.lastIndexOf(ending);
      if (end > start) {
        try { return JSON.parse(source.slice(start, end + 1)); }
        catch { /* try next */ }
      }
    }
  }
  throw Error("LIFECYCLE_0164_INVALID_WRANGLER_JSON");
}
function select(statement) {
  ensure(/^\s*SELECT\b/i.test(statement) && !statement.includes(";"),
    "LIFECYCLE_0164_NON_READONLY_AUDIT_QUERY");
  const result = parseJson(wrangler([
    "d1", "execute", database, "--remote", "--config", configPath,
    "--command", statement, "--json",
  ]));
  const batches = Array.isArray(result) ? result : [result];
  ensure(batches.length > 0 && batches.every(x => x?.success === true && Array.isArray(x.results)),
    "LIFECYCLE_0164_REMOTE_READ_FAILED");
  return batches.flatMap(x => x.results);
}
const quoted = (names) => names.map(x => "'" + x.replace(/'/g, "''") + "'").join(",");
function inspect() {
  const sourceTables = Object.values(LIFECYCLE_0164_SOURCES).map(x => x.table);
  const names = [...new Set([...sourceTables, ...LIFECYCLE_0164_OBJECTS, "d1_migrations",
    "breed_notion_workcopy_links", "breed_notion_controlled_values"])];
  const objects = select("SELECT name,type,tbl_name,sql FROM sqlite_master WHERE name IN (" +
    quoted(names) + ")");
  const presentTables = new Set(objects.filter(x => x.type === "table").map(x => x.name));
  const columns = {};
  for (const table of [...sourceTables, "admin_record_tombstones", "admin_record_publication_guards"]) {
    if (presentTables.has(table)) {
      columns[table] = select("SELECT name,type,pk,"notnull" AS notnull_value,dflt_value FROM pragma_table_info('" +
        table + "')");
    }
  }
  const counts = {};
  for (const table of sourceTables) {
    if (presentTables.has(table)) {
      const value = Number(select("SELECT COUNT(*) AS n FROM " + table)[0]?.n);
      ensure(Number.isSafeInteger(value) && value >= 0,
        "LIFECYCLE_0164_SOURCE_COUNT_UNAVAILABLE_" + table);
      counts[table] = value;
    }
  }
  const ledgerCount = presentTables.has("d1_migrations")
    ? Number(select("SELECT COUNT(*) AS n FROM d1_migrations")[0]?.n) : null;
  const state = classifyLifecycle0164({ objects, columns, counts, ledgerCount });
  return { state, adjacent: {
    breedWorkcopyPresent: presentTables.has("breed_notion_workcopy_links"),
    breedControlledPresent: presentTables.has("breed_notion_controlled_values"),
  } };
}
function findBookmark(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.bookmark === "string" && value.bookmark) return value.bookmark;
  for (const nested of Object.values(value)) {
    const found = findBookmark(nested);
    if (found) return found;
  }
  return null;
}
function recoveryBookmark() {
  const data = parseJson(wrangler([
    "d1", "time-travel", "info", database, "--config", configPath, "--json",
  ]));
  const bookmark = findBookmark(data);
  ensure(bookmark, "LIFECYCLE_0164_RECOVERY_BOOKMARK_MISSING");
  return bookmark;
}
function record(phase, before, after, recovery = null, applied = false) {
  const result = {
    phase, mode, database, at: new Date().toISOString(),
    success: phase === "AUDIT" ? before.state.blockers.length === 0
      : phase === "POSTFLIGHT" || phase === "ALREADY_INSTALLED",
    applied, before, after, recoveryBookmark: recovery,
    migrationHistoryRecorded: false,
    note: "Only 0164 DDL; no existing D1 records, Notion, R2, or d1_migrations changed by the script.",
  };
  writeFileSync(resolve(folder, "report.json"), JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    phase, success: result.success, installed: after.state.installed,
    readyToApply: after.state.readyToApply, objects: after.state.presentObjects,
    blockers: after.state.blockers, applied,
  }) + "\n");
}
function main() {
  authorize();
  const approvedBlob = pinnedSql();
  configure();
  const initial = inspect();
  if (mode === "audit") {
    record("AUDIT", initial, initial);
    ensure(initial.state.blockers.length === 0, "LIFECYCLE_0164_AUDIT_BLOCKED");
    return;
  }
  if (initial.state.installed && initial.state.blockers.length === 0) {
    record("ALREADY_INSTALLED", initial, initial);
    return;
  }
  assertLifecycle0164ApplyReady(initial.state);
  const bookmark = recoveryBookmark();
  const fresh = inspect();
  assertLifecycle0164ApplyReady(fresh.state);
  ensure(fresh.state.ledgerCount === initial.state.ledgerCount &&
    fresh.state.presentObjects === initial.state.presentObjects,
    "LIFECYCLE_0164_PREFLIGHT_CHANGED");
  record("RECOVERY_POINT", initial, fresh, bookmark, null);
  wrangler(["d1", "execute", database, "--remote", "--config", configPath,
    "--file", sqlPath, "--yes", "--json"]);
  const final = inspect();
  assertLifecycle0164Postflight(fresh.state, final.state);
  record("POSTFLIGHT", fresh, final, bookmark, true);
  process.stdout.write(JSON.stringify({ approvedSqlBlob: approvedBlob,
    migrationHistoryRecorded: false }) + "\n");
}
try { main(); } catch (error) {
  console.error(JSON.stringify({ phase: "FAILED",
    code: error instanceof Error ? error.message : "LIFECYCLE_0164_UNKNOWN" }));
  process.exitCode = 1;
}
