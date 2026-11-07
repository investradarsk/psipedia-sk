#!/usr/bin/env node
/**
 * Owner-dispatched 0160 schema-only rollout, independent of held migration 0158.
 * audit: read-only; apply: exact pinned 0160 SQL after Time Travel bookmark.
 * Does not change d1_migrations, 0159 breed workcopy, Notion or production flags.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EVENT_0160_MIGRATION, EVENT_0160_SQL_BLOB, classifyEvent0160,
  assertEvent0160Postflight,
} from "../lib/production-d1-0160-guard.mjs";

const database = "psipedia-sk-db";
const expectedAccountId = "5ff902d3d80376478b9213b2b8ae8d6e";
const expectedDbId = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const reportDir = resolve(".production-d1-0160");
const configPath = resolve(reportDir, "wrangler.json");
const sqlPath = resolve("drizzle", EVENT_0160_MIGRATION);
const mode = process.argv[2] || "";

function ensure(condition, code) {
  if (!condition) throw Error(code);
}
function verifyOperator() {
  ensure(mode === "audit" || mode === "apply", "EVENT_0160_MODE_INVALID");
  ensure(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "EVENT_0160_MANUAL_ONLY");
  ensure(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk", "EVENT_0160_REPOSITORY_MISMATCH");
  ensure(process.env.GITHUB_REF === "refs/heads/main", "EVENT_0160_MAIN_ONLY");
  const expected = (mode === "apply" ? "APPLY" : "AUDIT") + "-0160-psipedia-sk-db";
  ensure(process.env.EVENT_0160_CONFIRMATION === expected, "EVENT_0160_CONFIRMATION_REQUIRED");
  ensure(Boolean(process.env.CLOUDFLARE_API_TOKEN), "EVENT_0160_TOKEN_REQUIRED");
  ensure(process.env.CLOUDFLARE_ACCOUNT_ID === expectedAccountId, "EVENT_0160_ACCOUNT_MISMATCH");
}
function verifySql() {
  const bytes = readFileSync(sqlPath);
  const sha = createHash("sha1").update(Buffer.concat([
    Buffer.from("blob " + bytes.length + "\0"), bytes,
  ])).digest("hex");
  ensure(sha === EVENT_0160_SQL_BLOB, "EVENT_0160_SQL_BLOB_MISMATCH");
  const code = bytes.toString("utf8").replace(/--[^\n]*(?:\n|$)/g, "")
    .trim().replace(/\s+/g, " ").replace(/\s*;\s*/g, ";");
  const exact = "ALTER TABLE managed_events ADD COLUMN contact_phone TEXT;" +
    "ALTER TABLE managed_events ADD COLUMN contact_email TEXT;" +
    "ALTER TABLE managed_events ADD COLUMN admission_fee TEXT NOT NULL DEFAULT '';";
  ensure(code === exact, "EVENT_0160_SQL_NOT_EXACTLY_ADDITIVE");
  return sha;
}
function config() {
  const resources = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  ensure(resources.account_id === expectedAccountId &&
    resources.d1.database_name === database &&
    resources.d1.database_id === expectedDbId &&
    resources.d1.binding === "DB", "EVENT_0160_RESOURCE_MISMATCH");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    name: "psipedia-sk-0160-d1-only",
    compatibility_date: "2026-11-07",
    d1_databases: [{
      binding: "DB", database_name: database, database_id: expectedDbId,
    }],
  }, null, 2));
}
function runWrangler(args) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const run = spawnSync(command, ["wrangler", ...args], {
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
  });
  if (run.error) throw run.error;
  ensure(run.status === 0, "EVENT_0160_WRANGLER_FAILED");
  return run.stdout || "";
}
function parseJson(raw) {
  const output = raw.trim();
  try { return JSON.parse(output); } catch {
    for (const start of [output.indexOf("["), output.indexOf("{")]) {
      if (start < 0) continue;
      for (const endCharacter of ["]", "}"]) {
        const end = output.lastIndexOf(endCharacter);
        if (end > start) {
          try { return JSON.parse(output.slice(start, end + 1)); } catch { /* next wrapper */ }
        }
      }
    }
  }
  throw Error("EVENT_0160_JSON_INVALID");
}
function rows(sql) {
  const parsed = parseJson(runWrangler([
    "d1", "execute", database, "--remote", "--config", configPath,
    "--command", sql, "--json",
  ]));
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  ensure(batches.length > 0 && batches.every(x => x?.success === true && Array.isArray(x.results)),
    "EVENT_0160_SELECT_FAILED");
  return batches.flatMap(x => x.results);
}
function inspect() {
  const tables = rows("SELECT name FROM sqlite_master WHERE type='table' AND name='managed_events'");
  ensure(tables.length === 1, "EVENT_0160_MANAGED_EVENTS_MISSING");
  const columns = rows("SELECT name,type,\"notnull\",dflt_value,pk FROM pragma_table_info('managed_events')");
  const schema = classifyEvent0160(columns);
  const counts = rows("SELECT COUNT(*) AS count, MAX(id) AS max_id FROM managed_events");
  ensure(counts.length === 1, "EVENT_0160_COUNT_QUERY_FAILED");
  const count = Number(counts[0].count);
  const maxId = counts[0].max_id == null ? null : Number(counts[0].max_id);
  ensure(Number.isSafeInteger(count) && count >= 0 &&
    (maxId == null || Number.isSafeInteger(maxId)), "EVENT_0160_COUNTS_INVALID");
  return { schema, columns, count, maxId };
}
function recoveryBookmark() {
  const parsed = parseJson(runWrangler([
    "d1", "time-travel", "info", database, "--config", configPath, "--json",
  ]));
  function find(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.bookmark === "string" && value.bookmark) return value.bookmark;
    for (const child of Object.values(value)) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  }
  const bookmark = find(parsed);
  ensure(bookmark, "EVENT_0160_RECOVERY_BOOKMARK_MISSING");
  return bookmark;
}
function record(report) {
  writeFileSync(resolve(reportDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    phase: report.phase,
    success: report.success,
    installed: report.installed,
    eventCount: report.after?.eventCount ?? report.before?.eventCount,
  }) + "\n");
}
function brief(state) {
  return { installed: state.schema.alreadyInstalled, eventCount: state.count, maxEventId: state.maxId };
}
function main() {
  verifyOperator();
  const pinnedSqlBlob = verifySql();
  config();
  const first = inspect();
  const before = brief(first);
  if (mode === "audit" || first.schema.alreadyInstalled) {
    record({ phase: mode === "audit" ? "AUDIT" : "ALREADY_INSTALLED", success: true,
      installed: first.schema.alreadyInstalled, applied: false, before, after: before, pinnedSqlBlob });
    return;
  }
  const bookmark = recoveryBookmark();
  const fresh = inspect();
  ensure(!fresh.schema.alreadyInstalled, "EVENT_0160_ALREADY_APPLIED_DURING_PREFLIGHT");
  ensure(fresh.count === first.count && fresh.maxId === first.maxId,
    "EVENT_0160_EVENT_COUNT_CHANGED_BEFORE_APPLY");
  // Persist a recovery point before any DDL; failed/partial apply must be inspected manually.
  record({ phase: "RECOVERY_POINT", success: false, installed: false,
    applied: null, before, after: before, pinnedSqlBlob,
    recoveryBookmark: bookmark, note: "DDL not yet verified" });
  runWrangler(["d1", "execute", database, "--remote", "--config", configPath,
    "--file", sqlPath, "--yes", "--json"]);
  const after = inspect();
  assertEvent0160Postflight(after.columns);
  ensure(after.count === first.count && after.maxId === first.maxId,
    "EVENT_0160_EVENT_COUNT_CHANGED_AFTER_APPLY");
  ensure(Number(rows("SELECT COUNT(*) AS count FROM managed_events WHERE admission_fee IS NULL")[0]?.count) === 0,
    "EVENT_0160_ADMISSION_NOT_NULL_VIOLATION");
  record({ phase: "POSTFLIGHT", success: true, installed: true, applied: true,
    pinnedSqlBlob, recoveryBookmark: bookmark, before, after: brief(after),
    migrationHistoryRecorded: false,
    note: "0160 additive schema only. Migration 0158 held and 0159 breed identity untouched." });
}
try { main(); } catch (error) {
  console.error(JSON.stringify({ phase: "FAILED", code: error instanceof Error ? error.message : "EVENT_0160_UNKNOWN" }));
  process.exitCode = 1;
}
