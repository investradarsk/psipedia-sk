/** Read-only, fail-closed audit of prepared D1 migrations 0123 and 0124. */
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(root, ".production-d1-0123-0124-preflight");
const addressFields = {
  managed_events: ["district", "postal_code", "street", "house_number", "address_format"],
  organization_locations: ["postal_code", "street", "house_number", "address_format"],
};
const requiredNames = ["0123_event_organization_structured_address.sql", "0124_gemini_notion_review_locks.sql"];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const simplified = (str) => String(str ?? "").replace(/\s+/g, " ").trim();

function addressState(columnsByTable, sqlByTable) {
  let present = 0, valid = 0;
  const problems = [];
  for (const [table, expected] of Object.entries(addressFields)) {
    const columns = new Map((columnsByTable[table] ?? []).map(c => [String(c.name), c]));
    assert(columns.has("id"), "Missing canonical table " + table);
    for (const name of expected) {
      const c = columns.get(name);
      if (!c) continue;
      present++;
      if (String(c.type).toUpperCase() === "TEXT" && Number(c.notnull) === 1 && simplified(c.dflt_value) === "''") valid++;
      else problems.push(table + "." + name + " must be TEXT NOT NULL DEFAULT ''");
    }
    if (columns.has("address_format")) {
      const sql = simplified(sqlByTable[table]);
      if (!sql.includes(table + "_address_format_check") ||
          !/address_format\s+IN\s*\(\s*''\s*,\s*'STREET'\s*,\s*'MUNICIPALITY_NUMBER'\s*\)/i.test(sql))
        problems.push(table + " address_format CHECK constraint missing");
    }
  }
  const total = 9;
  return { state: present === 0 ? "NONE" : present === total && valid === total && !problems.length ? "FULL" : "PARTIAL", present, total, problems };
}
function lockState(columns = [], sql = "") {
  if (!sql && !columns.length) return { state: "NONE", problems: [] };
  const byName = new Map(columns.map(c => [String(c.name), c]));
  const problems = [];
  if (columns.length !== 3) problems.push("lock table must have three columns");
  for (const name of ["notion_page_id", "owner", "created_at"]) {
    const c = byName.get(name);
    if (!c || String(c.type).toUpperCase() !== "TEXT" || Number(c.notnull) !== 1)
      problems.push("Invalid lock column " + name);
  }
  if (Number(byName.get("notion_page_id")?.pk) !== 1) problems.push("Missing lock page primary key");
  if (!String(byName.get("created_at")?.dflt_value ?? "").includes("strftime"))
    problems.push("Missing lock timestamp default");
  if (!sql) problems.push("Missing lock sqlite_schema table");
  return { state: problems.length ? "PARTIAL" : "FULL", problems };
}

export function classifyPreparedMigrations({ historyNames, expectedNames, columnsByTable, tableSql }) {
  assert(Array.isArray(historyNames) && historyNames.length > 0, "Missing D1 migration history");
  assert(Array.isArray(expectedNames) && expectedNames.length >= 125, "Incomplete repository chain");
  assert(expectedNames[123] === requiredNames[0] && expectedNames[124] === requiredNames[1],
    "Prepared migrations have unexpected names");
  const address = addressState(columnsByTable, tableSql);
  const locks = lockState(columnsByTable.gemini_notion_review_locks, tableSql.gemini_notion_review_locks);
  const prefix = historyNames.every((name, i) => expectedNames[i] === name);
  const lastIndex = historyNames.length - 1;
  let classification = "STOP_HISTORY_DRIFT";
  if (prefix && lastIndex < 122 && address.state === "NONE" && locks.state === "NONE")
    classification = "STOP_BACKLOG_BEFORE_0122";
  else if (prefix && lastIndex === 122 && address.state === "NONE" && locks.state === "NONE")
    classification = "READY_0123";
  else if (prefix && lastIndex === 123 && address.state === "FULL" && locks.state === "NONE")
    classification = "READY_0124";
  else if (prefix && lastIndex === 124 && address.state === "FULL" && locks.state === "FULL")
    classification = "COMPLETE";
  else if (prefix && lastIndex > 124)
    classification = "STOP_FUTURE_HISTORY_REQUIRES_NEW_AUDIT";
  else if (prefix) classification = "STOP_SCHEMA_HISTORY_DRIFT";
  return { classification, safeReadiness: ["READY_0123", "READY_0124", "COMPLETE"].includes(classification),
    exactHistoryPrefix: prefix, lastApplied: historyNames.at(-1), historyLength: historyNames.length, address, locks };
}
function parseJson(out) {
  const data = String(out ?? "").trim();
  try { return JSON.parse(data); } catch {}
  for (const [begin, end] of [["[", "]"], ["{", "}"]]) {
    const first = data.indexOf(begin), last = data.lastIndexOf(end);
    if (first >= 0 && last > first) { try { return JSON.parse(data.slice(first, last + 1)); } catch {} }
  }
  throw new Error("Wrangler returned invalid JSON");
}
function invoke(args) {
  const binary = process.platform === "win32" ? "npx.cmd" : "npx";
  const run = spawnSync(binary, ["wrangler", ...args], { cwd: root, encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" } });
  if (run.error) throw run.error;
  assert(run.status === 0, "Wrangler read-only query failed: " + String(run.stderr).slice(0, 500));
  return parseJson(run.stdout);
}
function query(database, config, sql) {
  assert(/^\s*(SELECT|PRAGMA table_info\s*\()/i.test(sql), "Refusing non-read-only SQL");
  const payload = invoke(["d1", "execute", database, "--remote", "--config", config, "--command", sql, "--json"]);
  return (Array.isArray(payload) ? payload : [payload]).flatMap(x => Array.isArray(x.results) ? x.results : []);
}
export async function inspectProduction() {
  const resources = JSON.parse(await fs.readFile(path.join(root, "config/cloudflare-resources.json"), "utf8"));
  assert(process.env.CLOUDFLARE_API_TOKEN, "Missing protected Cloudflare token");
  assert(process.env.CLOUDFLARE_ACCOUNT_ID === resources.account_id, "Cloudflare account mismatch");
  const db = resources.d1;
  assert(db?.binding === "DB" && db.database_name && db.database_id, "Invalid canonical D1 identity");
  const migrationFiles = (await fs.readdir(path.join(root, "drizzle")))
    .filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  assert(migrationFiles.length >= 125 && migrationFiles.slice(0, 125).every((name, i) => Number(name.slice(0, 4)) === i),
    "Missing/duplicate repository migrations");
  await fs.mkdir(reportDir, { recursive: true });
  const config = path.join(reportDir, "wrangler.json");
  await fs.writeFile(config, JSON.stringify({ name: "psipedia-sk", compatibility_date: "2026-08-23",
    d1_databases: [{ binding: db.binding, database_name: db.database_name, database_id: db.database_id }] }));
  const info = JSON.stringify(invoke(["d1", "info", db.database_name, "--config", config, "--json"]));
  assert(info.includes(db.database_id) && info.includes(db.database_name), "Remote database identity mismatch");
  const history = query(db.database_name, config, "SELECT id,name,applied_at FROM d1_migrations ORDER BY id");
  const objects = query(db.database_name, config,
    "SELECT name,sql FROM sqlite_schema WHERE type='table' AND name IN ('managed_events','organization_locations','gemini_notion_review_locks')");
  const tableSql = Object.fromEntries(objects.map(row => [String(row.name), String(row.sql ?? "")]));
  const columnsByTable = Object.fromEntries(["managed_events", "organization_locations", "gemini_notion_review_locks"]
    .map(table => [table, query(db.database_name, config, "PRAGMA table_info('" + table + "')")]));
  return { ...classifyPreparedMigrations({ historyNames: history.map(row => String(row.name)),
    expectedNames: migrationFiles, columnsByTable, tableSql }),
    checkedAt: new Date().toISOString(), repositoryRevision: process.env.GITHUB_SHA ?? null,
    databaseName: db.database_name, databaseId: db.database_id, readOnly: true, migrationsExecuted: false };
}
async function main() {
  let report;
  try { report = await inspectProduction(); }
  catch (error) { report = { classification: "STOP_AUDIT_ERROR", safeReadiness: false,
    error: String(error?.message ?? error), readOnly: true, migrationsExecuted: false }; }
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("[D1 0123/0124 read-only] " + report.classification + " latest=" + (report.lastApplied ?? "unknown"));
  if (!report.safeReadiness) { if (report.error) console.error(report.error); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
