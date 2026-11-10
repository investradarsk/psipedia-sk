#!/usr/bin/env node
/**
 * Manual, owner-approved production schema completion of 0158 and 0162.
 * Uses isolated, pinned D1 executes because 0159–0161 were already installed
 * outside the old sequential ledger. No migration ledger writes.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COMPLETION_0158_SQL, COMPLETION_0162_SQL,
  COMPLETION_0158_BLOB, COMPLETION_0162_BLOB,
  DIRECTORY_0158_INDEX_SQL, DIRECTORY_0158_INDEX_NAMES,
  normalizedDdl, classify0158, classify0162, assert0159to0161,
} from "../lib/production-d1-0158-0162-guard.mjs";

const mode = process.argv[2] ?? "";
const repo = "investradarsk/psipedia-sk";
const database = "psipedia-sk-db";
const accountId = "5ff902d3d80376478b9213b2b8ae8d6e";
const databaseId = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const reportDir = resolve(".production-d1-0158-0162");
const configPath = resolve(reportDir, "wrangler.json");

function must(value, code) {
  if (!value) throw new Error(code);
}
function verifyOperator() {
  must(mode === "audit" || mode === "apply", "D1_COMPLETION_MODE_INVALID");
  must(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "D1_COMPLETION_MANUAL_ONLY");
  must(process.env.GITHUB_REPOSITORY === repo, "D1_COMPLETION_REPOSITORY_MISMATCH");
  must(process.env.GITHUB_REF === "refs/heads/main", "D1_COMPLETION_MAIN_ONLY");
  must(process.env.CLOUDFLARE_ACCOUNT_ID === accountId, "D1_COMPLETION_ACCOUNT_MISMATCH");
  must(Boolean(process.env.CLOUDFLARE_API_TOKEN), "D1_COMPLETION_TOKEN_MISSING");
  const confirmation = (mode === "apply" ? "APPLY" : "AUDIT") + "-0158-0162-psipedia-sk-db";
  must(process.env.D1_COMPLETION_CONFIRMATION === confirmation, "D1_COMPLETION_CONFIRMATION_REQUIRED");
}
function executableStatements(bytes) {
  return bytes.toString("utf8").replace(/--[^\n]*/g, "")
    .split(";").map((part) => normalizedDdl(part)).filter(Boolean);
}
function verifySql() {
  const files = [
    { name: COMPLETION_0158_SQL, expectedBlob: COMPLETION_0158_BLOB,
      expectedStatements: DIRECTORY_0158_INDEX_SQL },
    { name: COMPLETION_0162_SQL, expectedBlob: COMPLETION_0162_BLOB,
      expectedStatements: ["ALTER TABLE lost_found_dog_reports ADD COLUMN short_description TEXT NOT NULL DEFAULT ''"] },
  ];
  for (const entry of files) {
    const bytes = readFileSync(resolve("drizzle", entry.name));
    const header = Buffer.from("blob " + bytes.length + "\0");
    const sha = createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
    must(sha === entry.expectedBlob, "D1_COMPLETION_SQL_BLOB_CHANGED_" + entry.name);
    const statements = executableStatements(bytes);
    must(JSON.stringify(statements) === JSON.stringify(entry.expectedStatements),
      "D1_COMPLETION_SQL_NOT_PINNED_ADDITIVE_" + entry.name);
  }
}
function prepareConfig() {
  const resources = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  must(resources.account_id === accountId && resources.d1?.database_name === database &&
    resources.d1?.database_id === databaseId && resources.d1?.binding === "DB",
    "D1_COMPLETION_TARGET_MISMATCH");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    name: "psipedia-sk-0158-0162-manual-only",
    compatibility_date: "2026-11-10",
    d1_databases: [{
      binding: "DB", database_name: database, database_id: databaseId,
    }],
  }, null, 2));
}
function wrangler(args) {
  const program = process.platform === "win32" ? "npx.cmd" : "npx";
  const p = spawnSync(program, ["wrangler", ...args], {
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
  });
  if (p.error) throw p.error;
  must(p.status === 0, "D1_COMPLETION_WRANGLER_FAILED");
  return p.stdout || "";
}
function parseJson(raw) {
  const output = raw.trim();
  try { return JSON.parse(output); } catch { /* Wrangler can prepend a banner */ }
  for (const start of [output.indexOf("["), output.indexOf("{")]) {
    if (start < 0) continue;
    for (const suffix of ["]", "}"]) {
      const end = output.lastIndexOf(suffix);
      if (end > start) {
        try { return JSON.parse(output.slice(start, end + 1)); } catch { /* next */ }
      }
    }
  }
  throw new Error("D1_COMPLETION_REMOTE_JSON_INVALID");
}
function select(sql) {
  const result = parseJson(wrangler([
    "d1", "execute", database, "--remote", "--config", configPath,
    "--command", sql, "--json",
  ]));
  const batches = Array.isArray(result) ? result : [result];
  must(batches.length > 0 &&
    batches.every((page) => page?.success === true && Array.isArray(page.results)),
    "D1_COMPLETION_REMOTE_READ_FAILED");
  return batches.flatMap((page) => page.results);
}
function columns(table) {
  return select("SELECT name,type,\"notnull\" AS nn,dflt_value FROM pragma_table_info('" + table + "')")
    .map((row) => ({ ...row, notnull: row.nn }));
}
function count(table) {
  const rows = select("SELECT COUNT(*) AS n FROM " + table);
  must(rows.length === 1 && Number.isSafeInteger(Number(rows[0].n)),
    "D1_COMPLETION_ROW_COUNT_UNAVAILABLE_" + table);
  return Number(rows[0].n);
}
function inspect() {
  const objectNames = [
    "directory_profiles", "lost_found_dog_reports",
    "breed_notion_workcopy_links", "idx_breed_notion_workcopy_status",
    ...DIRECTORY_0158_INDEX_NAMES,
  ];
  const query = "SELECT name,type,tbl_name,sql FROM sqlite_master WHERE name IN (" +
    objectNames.map((name) => "'" + name + "'").join(",") + ")";
  const objects = new Map(select(query).map((row) => [row.name, row]));
  return {
    indexes: classify0158({
      tablePresent: objects.get("directory_profiles")?.type === "table",
      columns: columns("directory_profiles"),
      indexes: DIRECTORY_0158_INDEX_NAMES.map((name) => objects.get(name)).filter(Boolean),
      count: count("directory_profiles"),
    }),
    shortDescription: classify0162({
      tablePresent: objects.get("lost_found_dog_reports")?.type === "table",
      columns: columns("lost_found_dog_reports"),
      count: count("lost_found_dog_reports"),
    }),
    existing: assert0159to0161({
      shadowTable: objects.get("breed_notion_workcopy_links"),
      shadowIndex: objects.get("idx_breed_notion_workcopy_status"),
      eventColumns: columns("managed_events"),
    }),
  };
}
function findBookmark(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.bookmark === "string" && value.bookmark) return value.bookmark;
  for (const part of Object.values(value)) {
    const found = findBookmark(part);
    if (found) return found;
  }
  return null;
}
function recoveryBookmark() {
  const payload = parseJson(wrangler([
    "d1", "time-travel", "info", database, "--config", configPath, "--json",
  ]));
  const bookmark = findBookmark(payload);
  must(bookmark, "D1_COMPLETION_RECOVERY_BOOKMARK_MISSING");
  return bookmark;
}
function report(phase, before, after, recovery = null) {
  const value = {
    phase, database, mode, checkedAt: new Date().toISOString(),
    before, after, recoveryBookmark: recovery,
    migrationHistoryRecorded: false,
    note: "Isolated additive DDL; 0159–0161 already installed independently. Sequential ledger untouched.",
  };
  writeFileSync(resolve(reportDir, "report.json"), JSON.stringify(value, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    phase, installed0158: after.indexes.installed,
    installed0159: after.existing.applied0159,
    installed0160: after.existing.applied0160,
    installed0161: after.existing.applied0161,
    installed0162: after.shortDescription.installed,
    migrationHistoryRecorded: false,
  }) + "\n");
}
function applyFile(name) {
  wrangler(["d1", "execute", database, "--remote", "--config", configPath,
    "--file", resolve("drizzle", name), "--yes", "--json"]);
}

function main() {
  verifyOperator();
  verifySql();
  prepareConfig();
  const initial = inspect();
  if (mode === "audit") {
    report("AUDIT", initial, initial);
    return;
  }
  if (initial.indexes.installed && initial.shortDescription.installed) {
    report("ALREADY_INSTALLED", initial, initial);
    return;
  }
  const recovery = recoveryBookmark();
  const fresh = inspect();
  must(initial.indexes.installed === fresh.indexes.installed &&
    initial.shortDescription.installed === fresh.shortDescription.installed,
    "D1_COMPLETION_SCHEMA_CHANGED_DURING_PREFLIGHT");
  report("RECOVERY_POINT", initial, fresh, recovery);
  let current = fresh;
  if (!current.indexes.installed) {
    applyFile(COMPLETION_0158_SQL);
    current = inspect();
    must(current.indexes.installed, "D1_0158_POSTFLIGHT_INDEXES_MISSING");
    report("INDEXES_APPLIED", initial, current, recovery);
  }
  if (!current.shortDescription.installed) {
    applyFile(COMPLETION_0162_SQL);
    current = inspect();
    must(current.shortDescription.installed, "D1_0162_POSTFLIGHT_COLUMN_MISSING");
    const nullCount = select("SELECT COUNT(*) AS n FROM lost_found_dog_reports WHERE short_description IS NULL");
    must(nullCount.length === 1 && Number(nullCount[0].n) === 0,
      "D1_0162_SHORT_DESCRIPTION_NULL_VALUES");
  }
  must(current.indexes.installed && current.shortDescription.installed,
    "D1_COMPLETION_POSTFLIGHT_INCOMPLETE");
  report("POSTFLIGHT", initial, current, recovery);
}
try { main(); } catch (error) {
  console.error(JSON.stringify({
    phase: "FAILED", code: error instanceof Error ? error.message : "D1_COMPLETION_UNKNOWN",
  }));
  process.exitCode = 1;
}
