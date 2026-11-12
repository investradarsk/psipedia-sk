#!/usr/bin/env node
/**
 * Production D1 0165: explicitly operator-dispatched, schema-only.
 * audit = remote read-only; apply = exact pinned five ALTER TABLE statements.
 * Does not touch Notion, existing rows, private reporter PII or d1_migrations.
 * Physical rollout remains independent from the held generic sequential ledger.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONTACTS_0165_TARGET, CONTACTS_0165_GIT_BLOB_SHA, CONTACTS_0165_SQL,
  CONTACTS_0165_TABLE, CONTACTS_0165_PRIVATE_TABLE,
  assertContacts0165Schema, assertContacts0165Postflight,
} from "../lib/production-d1-0165-contacts-guard.mjs";

const database = "psipedia-sk-db";
const accountId = "5ff902d3d80376478b9213b2b8ae8d6e";
const databaseId = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const mode = process.argv[2] ?? "";
const reportDirectory = resolve(".production-d1-0165");
const configPath = resolve(reportDirectory, "wrangler.json");
const sqlPath = resolve("drizzle", CONTACTS_0165_TARGET);
const must = (ok, code) => { if (!ok) throw new Error("CONTACTS_0165_" + code); };

let recovery = null;
let stage = "START";
let before = null;

function authorize() {
  must(["audit", "apply"].includes(mode), "INVALID_MODE");
  must(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "MANUAL_ONLY");
  must(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk", "REPOSITORY_MISMATCH");
  must(process.env.GITHUB_REF === "refs/heads/main", "MAIN_ONLY");
  must(process.env.CLOUDFLARE_ACCOUNT_ID === accountId, "ACCOUNT_MISMATCH");
  must(Boolean(process.env.CLOUDFLARE_API_TOKEN), "PROTECTED_TOKEN_MISSING");
  must(process.env.CONTACTS_0165_CONFIRMATION ===
    (mode === "audit" ? "AUDIT" : "APPLY") + "-0165-psipedia-sk-db",
    "EXPLICIT_CONFIRMATION_REQUIRED");
}

function verifyPinnedSql() {
  const bytes = readFileSync(sqlPath);
  const gitBlob = createHash("sha1")
    .update(Buffer.concat([Buffer.from("blob " + bytes.length + "\0"), bytes]))
    .digest("hex");
  must(gitBlob === CONTACTS_0165_GIT_BLOB_SHA, "PINNED_SQL_CHANGED");
  const statements = bytes.toString("utf8").split("\n")
    .map(line => line.trim()).filter(line => line && !line.startsWith("--"));
  must(statements.length === CONTACTS_0165_SQL.length &&
    statements.every((statement, index) => statement === CONTACTS_0165_SQL[index]),
    "SQL_NOT_EXACT_FIVE_ADDITIVE_COLUMNS");
  return gitBlob;
}

function prepareConfig() {
  const config = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  must(config.account_id === accountId &&
    config.d1?.binding === "DB" &&
    config.d1?.database_name === database &&
    config.d1?.database_id === databaseId, "CANONICAL_D1_MISMATCH");
  mkdirSync(reportDirectory, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    name: "psipedia-sk-0165-public-contacts-manual-only",
    compatibility_date: "2026-11-11",
    d1_databases: [{
      binding: "DB", database_name: database, database_id: databaseId,
    }],
  }, null, 2));
}

function wrangler(args) {
  const runner = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawnSync(runner, ["wrangler", ...args], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1", WRANGLER_SEND_METRICS: "false" },
  });
  if (child.error) throw child.error;
  must(child.status === 0, "WRANGLER_FAILED");
  return child.stdout ?? "";
}

function parseJson(text) {
  const raw = text.trim();
  try { return JSON.parse(raw); } catch { /* Wrangler banner before JSON */ }
  for (const start of [raw.indexOf("["), raw.indexOf("{")]) {
    if (start < 0) continue;
    for (const endChar of ["]", "}"]) {
      const end = raw.lastIndexOf(endChar);
      if (end > start) {
        try { return JSON.parse(raw.slice(start, end + 1)); }
        catch { /* other candidate */ }
      }
    }
  }
  throw Error("CONTACTS_0165_INVALID_WRANGLER_JSON");
}

function select(query) {
  must(/^\s*SELECT\b/i.test(query) && !query.includes(";"), "NON_READONLY_QUERY");
  const response = parseJson(wrangler([
    "d1", "execute", database, "--remote", "--config", configPath,
    "--command", query, "--json",
  ]));
  const pages = Array.isArray(response) ? response : [response];
  must(pages.length > 0 && pages.every(page => page?.success === true && Array.isArray(page.results)),
    "REMOTE_READ_FAILED");
  return pages.flatMap(page => page.results);
}

function inspect() {
  const tableRows = select("SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
    "('lost_found_dog_reports','lost_found_dog_private_details','d1_migrations')");
  const present = new Set(tableRows.map(x => x.name));
  must(present.has("d1_migrations"), "MIGRATION_LEDGER_MISSING");
  const columns = present.has(CONTACTS_0165_TABLE)
    ? select("SELECT name,type,pk,\"notnull\" AS is_not_null,dflt_value FROM pragma_table_info('lost_found_dog_reports')")
      .map(({ is_not_null, ...entry }) => ({ ...entry, notnull: is_not_null }))
    : [];
  const privateColumns = present.has(CONTACTS_0165_PRIVATE_TABLE)
    ? select("SELECT name FROM pragma_table_info('lost_found_dog_private_details')") : [];
  const rowCount = present.has(CONTACTS_0165_TABLE)
    ? Number(select("SELECT COUNT(*) AS n FROM lost_found_dog_reports")[0]?.n) : null;
  const privateCount = present.has(CONTACTS_0165_PRIVATE_TABLE)
    ? Number(select("SELECT COUNT(*) AS n FROM lost_found_dog_private_details")[0]?.n) : null;
  const ledgerCount = Number(select("SELECT COUNT(*) AS n FROM d1_migrations")[0]?.n);
  return {
    tablePresent: present.has(CONTACTS_0165_TABLE),
    privateTablePresent: present.has(CONTACTS_0165_PRIVATE_TABLE),
    columns, privateColumns, rowCount, privateCount, ledgerCount,
  };
}

function findBookmark(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.bookmark === "string" && value.bookmark) return value.bookmark;
  for (const nested of Object.values(value)) {
    const item = findBookmark(nested);
    if (item) return item;
  }
  return null;
}

function recoveryBookmark() {
  const info = parseJson(wrangler([
    "d1", "time-travel", "info", database, "--config", configPath, "--json",
  ]));
  const bookmark = findBookmark(info);
  must(Boolean(bookmark), "RECOVERY_BOOKMARK_MISSING");
  return bookmark;
}

function summary(snapshot) {
  return snapshot ? {
    installed: snapshot.installed, readyToApply: snapshot.readyToApply,
    presentColumns: snapshot.presentColumns, rowCount: snapshot.rowCount,
    privateCount: snapshot.privateCount, ledgerCount: snapshot.ledgerCount,
  } : null;
}

function evidence(phase, state, applied, code = null) {
  stage = phase;
  mkdirSync(reportDirectory, { recursive: true });
  const payload = {
    phase, mode, timestamp: new Date().toISOString(),
    repository: "investradarsk/psipedia-sk", database,
    pinnedSqlBlob: CONTACTS_0165_GIT_BLOB_SHA,
    ...(code ? { errorCode: code } : {}),
    state: summary(state), before: summary(before),
    recoveryBookmark: recovery,
    applied,
    migrationHistoryRecorded: false,
    note: "Five public-only additive D1 fields; no private contact values, Notion, or migration ledger written.",
  };
  writeFileSync(resolve(reportDirectory, "report.json"), JSON.stringify(payload, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    phase, installed: state?.installed ?? null,
    readyToApply: state?.readyToApply ?? null, applied,
    errorCode: code, migrationHistoryRecorded: false,
  }) + "\n");
}

/** Inspect snapshots must stay stable between recovery bookmark and DDL. */
function compareBeforeApply(first, second) {
  must(first.rowCount === second.rowCount, "PREFLIGHT_ROW_COUNT_CHANGED");
  must(first.privateCount === second.privateCount, "PREFLIGHT_PRIVATE_COUNT_CHANGED");
  must(first.ledgerCount === second.ledgerCount, "PREFLIGHT_LEDGER_CHANGED");
  must(JSON.stringify(first.columns) === JSON.stringify(second.columns),
    "PREFLIGHT_SOURCE_SCHEMA_CHANGED");
  must(JSON.stringify(first.privateColumns) === JSON.stringify(second.privateColumns),
    "PREFLIGHT_PRIVATE_SCHEMA_CHANGED");
}

function main() {
  authorize();
  verifyPinnedSql();
  prepareConfig();
  const initial = inspect();
  before = assertContacts0165Schema(initial);
  if (mode === "audit" || before.installed) {
    evidence(mode === "audit" ? "AUDIT" : "ALREADY_INSTALLED", before, false);
    return;
  }
  must(before.readyToApply, "NOT_READY_TO_APPLY");
  recovery = recoveryBookmark();
  const rawFresh = inspect();
  const fresh = assertContacts0165Schema(rawFresh);
  must(fresh.readyToApply, "CONCURRENTLY_INSTALLED");
  compareBeforeApply(initial, rawFresh);
  // Persist the bookmark BEFORE any DDL; failed or partial remote APPLY must not be retried blindly.
  evidence("RECOVERY_POINT", fresh, null);
  wrangler(["d1", "execute", database, "--remote", "--config", configPath,
    "--file", sqlPath, "--yes", "--json"]);
  const completed = assertContacts0165Postflight(fresh, inspect());
  evidence("POSTFLIGHT", completed, true);
}

try { main(); } catch (error) {
  const code = error instanceof Error ? error.message : "CONTACTS_0165_UNKNOWN";
  console.error(JSON.stringify({ phase: "FAILED", stage, code }));
  try { evidence("FAILED", before, null, code); } catch { /* stdout contains error code */ }
  process.exitCode = 1;
}
