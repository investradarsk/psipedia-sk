#!/usr/bin/env node
/**
 * D1 Insights JSON -> privacy-safe aggregate report. Offline only, no network or database access.
 * Input: official "wrangler d1 insights --json" output (or { queries: [...] }).
 * node scripts/d1-insights-report.mjs --input insights.json --period 1d --origin production --output report.json
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_QUERIES = 5000;
const METRICS = {
  duration: { total: ["totalDurationMs", "total_duration_ms", "durationTotalMs"], average: ["avgDurationMs", "averageDurationMs", "avg_duration_ms"] },
  read: { total: ["totalRowsRead", "total_rows_read", "rows_read", "rowsRead"], average: ["avgRowsRead", "averageRowsRead", "avg_rows_read"] },
  written: { total: ["totalRowsWritten", "total_rows_written", "rows_written", "rowsWritten"], average: ["avgRowsWritten", "averageRowsWritten", "avg_rows_written"] },
};

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function pick(object, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(object, name) && object[name] !== null && object[name] !== undefined) {
      if (name === "count" && typeof object[name] === "object") continue;
      const parsed = finiteNonnegative(object[name]);
      if (parsed === null) throw new Error("Invalid numeric Insights metric.");
      return parsed;
    }
  }
  return null;
}
function queryRecords(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") throw new Error("Expected an Insights JSON array or recognized wrapper.");
  for (const key of ["queries", "results", "insights"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  const accounts = data.data?.viewer?.accounts ?? data.viewer?.accounts;
  if (Array.isArray(accounts)) {
    return accounts.flatMap((account) => Array.isArray(account.d1QueriesAdaptiveGroups) ? account.d1QueriesAdaptiveGroups : []);
  }
  throw new Error("Unrecognized Insights export; use wrangler d1 insights --json.");
}
/** SQL text is transient: only a hash of its normalized shape is retained. */
function sqlShape(sql) {
  // Strip SQL comments and string literals; never print SQL in either output.
  const masked = sql
    .replace(/'(?:''|[^'])*'/g, "?")
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\b(?:0x[0-9a-f]+|\d+(?:\.\d+)?)\b/gi, "?");
  return masked.replace(/\s+/g, " ").trim().toLowerCase();
}
function describeSql(sql) {
  const shape = sqlShape(sql);
  const fingerprint = createHash("sha256").update(shape).digest("hex").slice(0, 16);
  const operation = /^\s*(select|insert|update|delete|replace|pragma|explain|create|alter|drop)\b/i.exec(shape)?.[1]?.toUpperCase()
    ?? (/^\s*with\b/.test(shape) ? (/\b(insert|update|delete|replace)\b/i.exec(shape)?.[1]?.toUpperCase() ?? "SELECT") : "OTHER");
  // Classification deliberately uses known canonical production table names, not user literals.
  const directory = /\b(directory_profiles|directory_inquiries|directory_profile_change_requests)\b/i.test(shape);
  const event = /\b(managed_events|event_registrations|event_organizations)\b/i.test(shape);
  const category = directory && event ? "ostatné" : directory ? "adresár" : event ? "podujatia" : "ostatné";
  return { fingerprint, operation, category };
}
function extractMetric(row, key, executions) {
  const names = METRICS[key];
  const sums = row.sum && typeof row.sum === "object" ? row.sum : {};
  const avgs = row.avg && typeof row.avg === "object" ? row.avg : {};
  // Direct fields match Wrangler's documented JSON contract.
  const total = pick(row, names.total) ?? pick(sums, key === "duration" ? ["totalDurationMs", "durationMs"] : key === "read" ? ["rowsRead"] : ["rowsWritten"]);
  const average = pick(row, names.average) ?? pick(avgs, key === "duration" ? ["durationMs"] : key === "read" ? ["rowsRead"] : ["rowsWritten"]);
  if (total !== null) return { total, basis: "reported" };
  if (average !== null && executions !== null) {
    const estimated = average * executions;
    return Number.isFinite(estimated) ? { total: estimated, basis: "derived_from_average" } : { total: null, basis: null };
  }
  return { total: null, basis: null };
}
function buildRecord(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid Insights record.");
  const sql = row.query ?? row.sql ?? row.dimensions?.query;
  if (typeof sql !== "string" || !sql.trim()) throw new Error("Insights record is missing query text; cannot group accurately.");
  const identity = describeSql(sql);
  const rawExecutions = row.numberOfTimesRun ?? row.executions ?? row.count;
  if (typeof rawExecutions === "number" && (!Number.isSafeInteger(rawExecutions) || rawExecutions < 0)) {
    throw new Error("Invalid execution count.");
  }
  const executions = pick(row, ["numberOfTimesRun", "executions", "count"]) ?? pick(row.count && typeof row.count === "object" ? row.count : {}, ["count", "value"]);
  return { ...identity, executions, duration: extractMetric(row, "duration", executions), read: extractMetric(row, "read", executions), written: extractMetric(row, "written", executions) };
}
function aggregate(items, identity = {}) {
  // A ranking with no matching query rows does not prove that the database executed zero queries.
  if (items.length === 0) {
    const missing = { total: null, average: null, basis: null };
    return { ...identity, executions: null, duration_ms: { ...missing }, rows_read: { ...missing }, rows_written: { ...missing }, input_records: 0 };
  }
  const sums = { executions: 0, duration: 0, read: 0, written: 0 };
  const complete = { executions: items.length > 0, duration: items.length > 0, read: items.length > 0, written: items.length > 0 };
  const derived = { duration: false, read: false, written: false };
  for (const item of items) {
    if (item.executions === null) complete.executions = false;
    else sums.executions += item.executions;
    for (const key of ["duration", "read", "written"]) {
      if (item[key].total === null) complete[key] = false;
      else sums[key] += item[key].total;
      if (item[key].basis === "derived_from_average") derived[key] = true;
    }
  }
  const executions = complete.executions ? sums.executions : null;
  const metric = (key) => ({
    total: complete[key] ? Number(sums[key].toFixed(6)) : null,
    average: complete[key] && executions !== null && executions > 0 ? Number((sums[key] / executions).toFixed(6)) : null,
    basis: !complete[key] ? null : derived[key] ? "includes_derived_from_average" : "reported",
  });
  return { ...identity, executions, duration_ms: metric("duration"), rows_read: metric("read"), rows_written: metric("written"), input_records: items.length };
}
function orderByTotal(rows, name) {
  return rows.filter((r) => r[name].total !== null)
    .sort((a, b) => b[name].total - a[name].total || a.fingerprint.localeCompare(b.fingerprint))
    .slice(0, 10);
}
export function createReport(input, { period = "1d", origin = "fixture" } = {}) {
  if (!["1d", "7d"].includes(period)) throw new Error("Period must be 1d or 7d.");
  if (!["fixture", "production"].includes(origin)) throw new Error("Origin must be fixture or production.");
  const rows = queryRecords(input);
  if (rows.length > MAX_QUERIES) throw new Error("Export exceeds safety limit of 5000 records.");
  const parsed = rows.map(buildRecord);
  const groups = new Map();
  for (const row of parsed) {
    const key = row.fingerprint + ":" + row.operation + ":" + row.category;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const queries = [...groups.values()].map((records) => aggregate(records, {
    fingerprint: records[0].fingerprint,
    operation: records[0].operation,
    category: records[0].category,
  })).sort((a, b) => (b.duration_ms.total ?? -1) - (a.duration_ms.total ?? -1) || a.fingerprint.localeCompare(b.fingerprint));
  const byCategory = ["adresár", "podujatia", "ostatné"].map((category) => aggregate(parsed.filter((r) => r.category === category), { category }));
  const byType = [...new Set(parsed.map((r) => r.operation))].sort().map((operation) =>
    aggregate(parsed.filter((r) => r.operation === operation), { operation }));
  return {
    schema_version: 1,
    provenance: { origin, period, coverage: "ranked_insights_export_not_full_database", note: "Reported figures only cover exported query groups; absent metrics remain null." },
    summary: { exported_records: rows.length, normalized_queries: queries.length, ...aggregate(parsed) },
    by_category: byCategory,
    by_type: byType,
    queries,
    top_by_duration_ms: orderByTotal(queries, "duration_ms"),
    top_by_rows_read: orderByTotal(queries, "rows_read"),
  };
}
function display(value, digits = 2) {
  return value === null ? "nezískané" : Number(value.toFixed(digits)).toLocaleString("sk-SK");
}
export function renderMarkdown(report) {
  const line = (item, label) => "| " + label + " | " + display(item.executions, 0) + " | " + display(item.duration_ms.total) + " | " + display(item.duration_ms.average) + " | " + display(item.rows_read.total, 0) + " | " + display(item.rows_written.total, 0) + " |";
  const head = "| Skupina | Vykonaní | Celkom ms | Priemer ms | Riadkov čítaných | Riadkov zapísaných |\n|---|---:|---:|---:|---:|---:|";
  const ranked = (title, rows) => "\n## " + title + "\n" + head + "\n" + (rows.length ? rows.map((r) => line(r, r.operation + " " + r.category + " #" + r.fingerprint.slice(0, 8))).join("\n") : "| nezískané | nezískané | nezískané | nezískané | nezískané | nezískané |");
  return "# D1 Insights — " + report.provenance.origin + " / " + report.provenance.period + "\n\n" +
    "**Pozor:** Rebríčkový export, nie úplný účet D1. „nezískané“ neznamená nula. Odvodené súčty sú označené v JSON poli basis.\n\n" +
    "## Podľa kategórie\n" + head + "\n" + report.by_category.map((r) => line(r, r.category)).join("\n") +
    "\n\n## Podľa SQL typu\n" + head + "\n" + report.by_type.map((r) => line(r, r.operation)).join("\n") +
    ranked("Najvyššie celkové trvanie", report.top_by_duration_ms) +
    ranked("Najviac čítaných riadkov", report.top_by_rows_read) + "\n";
}
function cli(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--input", "--output", "--period", "--origin"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new Error("Usage: node scripts/d1-insights-report.mjs --input <export.json> --period <1d|7d> --origin <fixture|production> [--output <report.json>]");
    }
    if (flags[args[i]]) throw new Error("Duplicate option.");
    flags[args[i]] = args[i + 1];
  }
  if (!flags["--input"]) throw new Error("Missing --input.");
  const path = resolve(flags["--input"]);
  if (statSync(path).size > MAX_BYTES) throw new Error("Input exceeds 12 MiB limit.");
  const data = JSON.parse(readFileSync(path, "utf8"));
  const report = createReport(data, { period: flags["--period"] ?? "1d", origin: flags["--origin"] ?? "fixture" });
  // JSON is a sanitized aggregate only; input SQL and params are never serialized.
  if (flags["--output"]) writeFileSync(resolve(flags["--output"]), JSON.stringify(report, null, 2) + "\n", { flag: "w", mode: 0o600 });
  process.stdout.write(renderMarkdown(report));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(process.argv.slice(2)); }
  catch { console.error("D1 Insights report failed. Validate JSON format, arguments and output path; raw input is never logged."); process.exitCode = 1; }
}
