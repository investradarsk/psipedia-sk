#!/usr/bin/env node
/**
 * Owner-dispatched, independent D1 schema-only rollout for event metadata 0161.
 * audit: read-only. apply: pinned two-column ALTER only.
 * Deliberately does not touch d1_migrations: 0158-0160 are not authorized in
 * the sequential runner. Future ledger reconciliation is a separate decision.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EVENT_0161_TARGET, EVENT_0161_GIT_BLOB_SHA,
  assertEvent0161Schema, assertEvent0161Postflight,
} from "../lib/production-d1-0161-event-metadata-guard.mjs";

const mode = process.argv[2] || "";
const database = "psipedia-sk-db";
const accountId = "5ff902d3d80376478b9213b2b8ae8d6e";
const databaseId = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const reportDir = resolve(".production-d1-0161");
const configPath = resolve(reportDir, "wrangler.json");
const sqlPath = resolve("drizzle", EVENT_0161_TARGET);

function requireCondition(ok, code) {
  if (!ok) throw new Error(code);
}
function requireOperator() {
  requireCondition(mode === "audit" || mode === "apply", "EVENT_0161_INVALID_MODE");
  requireCondition(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "EVENT_0161_DISPATCH_ONLY");
  requireCondition(process.env.GITHUB_REF === "refs/heads/main", "EVENT_0161_MAIN_ONLY");
  requireCondition(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk", "EVENT_0161_REPO_MISMATCH");
  requireCondition(process.env.CLOUDFLARE_ACCOUNT_ID === accountId, "EVENT_0161_ACCOUNT_MISMATCH");
  requireCondition(Boolean(process.env.CLOUDFLARE_API_TOKEN), "EVENT_0161_PROTECTED_TOKEN_MISSING");
  const confirmation = mode === "apply" ? "APPLY-0161-psipedia-sk-db" : "AUDIT-0161-psipedia-sk-db";
  requireCondition(process.env.EVENT_0161_CONFIRMATION === confirmation, "EVENT_0161_EXPLICIT_CONFIRMATION_REQUIRED");
}
function verifyExactSql() {
  const bytes = readFileSync(sqlPath);
  const header = Buffer.from("blob " + bytes.length + "\0");
  const blobSha = createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
  requireCondition(blobSha === EVENT_0161_GIT_BLOB_SHA, "EVENT_0161_SQL_CHANGED");
  const statements = bytes.toString("utf8").split("\n")
    .map((line) => line.trim()).filter((line) => line && !line.startsWith("--"));
  requireCondition(statements.length === 2, "EVENT_0161_UNEXPECTED_SQL_STATEMENTS");
  requireCondition(
    statements[0] === "ALTER TABLE managed_events ADD COLUMN image_alt TEXT NOT NULL DEFAULT '';"
    && statements[1] === "ALTER TABLE managed_events ADD COLUMN internal_notes TEXT NOT NULL DEFAULT '';",
    "EVENT_0161_SQL_NOT_ADDITIVE",
  );
  return blobSha;
}
function prepareConfig() {
  const resources = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  requireCondition(
    resources.account_id === accountId &&
    resources.d1?.database_name === database &&
    resources.d1?.database_id === databaseId &&
    resources.d1?.binding === "DB",
    "EVENT_0161_D1_TARGET_MISMATCH",
  );
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    name: "psipedia-sk-0161-d1-only",
    compatibility_date: "2026-11-08",
    d1_databases: [{
      binding: resources.d1.binding,
      database_name: resources.d1.database_name,
      database_id: resources.d1.database_id,
    }],
  }, null, 2));
}
function runWrangler(args) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const p = spawnSync(command, ["wrangler", ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1", WRANGLER_SEND_METRICS: "false" },
  });
  if (p.error) throw p.error;
  requireCondition(p.status === 0, "EVENT_0161_WRANGLER_FAILED");
  return p.stdout || "";
}
function parseJson(text) {
  const raw = text.trim();
  try { return JSON.parse(raw); } catch { /* stdout may include Wrangler banners */ }
  for (const start of [raw.indexOf("["), raw.indexOf("{")]) {
    if (start < 0) continue;
    for (const ending of ["]", "}"]) {
      const end = raw.lastIndexOf(ending);
      if (end <= start) continue;
      try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* try next */ }
    }
  }
  throw new Error("EVENT_0161_BAD_WRANGLER_JSON");
}
function select(sql) {
  const response = parseJson(runWrangler([
    "d1", "execute", database, "--remote", "--config", configPath,
    "--command", sql, "--json",
  ]));
  const pages = Array.isArray(response) ? response : [response];
  requireCondition(pages.length > 0 &&
    pages.every((page) => page?.success === true && Array.isArray(page.results)),
    "EVENT_0161_REMOTE_READ_FAILED");
  return pages.flatMap((page) => page.results);
}
function inspect() {
  const tables = select("SELECT name FROM sqlite_master WHERE type='table' AND name='managed_events'");
  requireCondition(tables.length <= 1, "EVENT_0161_UNEXPECTED_TABLE_COUNT");
  if (tables.length === 0) return { tablePresent: false, columns: [], rowCount: null };
  const columns = select('SELECT name,type,"notnull" AS is_not_null,dflt_value FROM pragma_table_info(\'managed_events\')')
    .map((row) => ({ ...row, notnull: row.is_not_null }));
  const count = select("SELECT COUNT(*) AS n FROM managed_events");
  requireCondition(count.length === 1, "EVENT_0161_ROW_COUNT_UNAVAILABLE");
  return { tablePresent: true, columns, rowCount: Number(count[0].n) };
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
  const payload = parseJson(runWrangler([
    "d1", "time-travel", "info", database, "--config", configPath, "--json",
  ]));
  const bookmark = findBookmark(payload);
  requireCondition(bookmark, "EVENT_0161_RECOVERY_BOOKMARK_MISSING");
  return bookmark;
}
function report(payload) {
  writeFileSync(resolve(reportDir, "report.json"), JSON.stringify(payload, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    phase: payload.phase, success: payload.success, installed: payload.installed,
    existingRows: payload.rowCount, applied: payload.applied,
    migrationHistoryRecorded: false,
  }) + "\n");
}
async function main() {
  requireOperator();
  const pinnedBlob = verifyExactSql();
  prepareConfig();
  const before = assertEvent0161Schema(inspect());
  if (mode === "audit" || before.installed) {
    report({ phase: mode === "audit" ? "AUDIT" : "ALREADY_INSTALLED",
      success: true, installed: before.installed, applied: false,
      rowCount: before.rowCount, pinnedBlob, migrationHistoryRecorded: false });
    return;
  }
  // Save a verified D1 recovery bookmark before sending any ALTER statement.
  const bookmark = recoveryBookmark();
  const fresh = assertEvent0161Schema(inspect());
  requireCondition(!fresh.installed, "EVENT_0161_CONCURRENTLY_INSTALLED");
  requireCondition(fresh.rowCount === before.rowCount, "EVENT_0161_ROW_COUNT_CHANGED_BEFORE_APPLY");
  report({ phase: "RECOVERY_POINT", success: false, installed: false,
    applied: null, rowCount: before.rowCount, pinnedBlob,
    recoveryBookmark: bookmark, migrationHistoryRecorded: false,
    note: "Apply outcome is unknown until postflight succeeds." });
  runWrangler(["d1", "execute", database, "--remote", "--config", configPath,
    "--file", sqlPath, "--yes", "--json"]);
  const after = assertEvent0161Postflight(fresh, inspect());
  report({ phase: "POSTFLIGHT", success: true, installed: true,
    applied: true, rowCount: after.rowCount, pinnedBlob,
    recoveryBookmark: bookmark, migrationHistoryRecorded: false,
    note: "Two additive columns only; sequential migration ledger left unchanged." });
}
main().catch((error) => {
  console.error(JSON.stringify({ phase: "FAILED", code: error instanceof Error
    ? error.message : "EVENT_0161_UNKNOWN_ERROR" }));
  process.exitCode = 1;
});
