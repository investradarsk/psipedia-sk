/**
 * Manual, fail-closed, SELECT-only audit of the canonical production D1.
 *
 * Never performs database writes, migrations, repairs, deploys or backfills.
 * The companion scripts only generate static SELECTs. This runner checks the
 * canonical target and returns aggregate counts + at most 500 numeric IDs.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDirectoryLegacyCutoverReadinessSql } from "./directory-legacy-cutover-readiness.mjs";
import { buildDirectoryLegacyCutoverCandidatesSql } from "./directory-legacy-cutover-candidates.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const DATABASE = "psipedia-sk-db";
const BINDING = "DB";
const EXPECTED_DATABASE_ID = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const WRITABLE_SQL = /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM|ATTACH|DETACH|PRAGMA|BEGIN|COMMIT|ROLLBACK|TRUNCATE)\b/i;

export function assertDirectoryAuditSelect(sql) {
  if (typeof sql !== "string" || !/^SELECT\s/i.test(sql.trim()) ||
      (sql.match(/;/g) ?? []).length !== 1 ||
      !sql.trimEnd().endsWith(";") ||
      /--|\/\*/.test(sql) || WRITABLE_SQL.test(sql))
    throw new Error("DIRECTORY_LEGACY_AUDIT_NOT_READONLY_SELECT");
  return sql;
}

export function unwrapD1Results(text, label) {
  let payload;
  try { payload = JSON.parse(text.trim()); }
  catch { throw new Error("DIRECTORY_LEGACY_AUDIT_INVALID_JSON_" + label); }
  const batches = Array.isArray(payload) ? payload : [payload];
  if (!batches.length || batches.some(batch => batch?.success !== true ||
      !Array.isArray(batch?.results))) {
    throw new Error("DIRECTORY_LEGACY_AUDIT_UNSUCCESSFUL_QUERY_" + label);
  }
  return batches.flatMap(batch => batch.results);
}

/** Extract only fixed SQL error classes from Wrangler output; never log raw SQL,
 * query results, account identifiers, URLs or a Cloudflare token. */
export function safeDirectoryD1ErrorHint(stderr = "", stdout = "") {
  const message = String(stderr) + "\n" + String(stdout);
  const patterns = [
    /no such column:\\s*[A-Za-z_][A-Za-z_0-9]*/i,
    /no such table:\\s*[A-Za-z_][A-Za-z_0-9]*/i,
    /no such function:\\s*[A-Za-z_][A-Za-z_0-9]*/i,
    /too many terms in compound SELECT/i,
    /expression tree is too large/i,
    /malformed JSON/i,
    /JSON path error/i,
    /database is locked/i,
    /query timed out/i,
    /SQLITE_[A-Z_]+/i,
    /D1_ERROR/i,
    /code:\\s*(?:400|401|403|404|409|413|422|429|500|502|503|504)\\b/i,
  ];
  const hints = [...new Set(patterns.map(pattern => message.match(pattern)?.[0]).filter(Boolean))];
  return hints.length ? hints.join(" | ").slice(0, 240) : "NO_SAFE_DIAGNOSTIC";
}

function wranglerRead(sql, configPath, label) {
  assertDirectoryAuditSelect(sql);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const run = spawnSync(npx, ["--no-install", "wrangler", "d1", "execute", DATABASE,
    "--remote", "--config", configPath, "--json", "--command", sql], {
    cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
  });
  if (run.error || run.status !== 0)
    throw new Error("DIRECTORY_LEGACY_AUDIT_D1_QUERY_FAILED_" + label +
      ": " + (run.error ? "SPAWN_FAILED" : "exit " + run.status) +
      " [" + safeDirectoryD1ErrorHint(run.stderr, run.stdout) + "]");
  return unwrapD1Results(run.stdout, label);
}

export function summarizeDirectoryLegacyAudit(summary, candidates) {
  if (!Array.isArray(summary) || !Array.isArray(candidates)) throw new Error("AUDIT_UNEXPECTED_ROWS");
  const columns = ["category", "status", "total_profiles", "invalid_json",
    "district_legacy_only", "district_conflict", "organization_legacy_only",
    "organization_conflict_or_cleared", "breed_legacy_only", "breed_conflict_or_cleared",
    "fci_legacy_only", "fci_conflict_or_cleared", "hours_legacy_only",
    "coverage_legacy_only", "profiles_with_technical_json_dependencies"];
  if (summary.some(row => columns.some(k => !Object.hasOwn(row, k))) ||
      candidates.length > 500 ||
      candidates.some(row =>
        !Number.isSafeInteger(Number(row.psipedia_id)) || Number(row.psipedia_id) <= 0 ||
        !["invalid_json", "district", "organization", "breed", "fci_group", "hours", "coverage"].includes(row.field) ||
        !["legacy_only", "conflict", "explicit_clear_with_legacy", "invalid_json"].includes(row.issue)))
    throw new Error("AUDIT_D1_UNEXPECTED_REPORT_SCHEMA");
  const totals = Object.fromEntries(columns.slice(2).map(key => [key,
    summary.reduce((sum, row) => sum + Number(row[key] ?? 0), 0)]));
  const candidatesByIssue = Object.fromEntries([...new Set(candidates.map(r => r.issue))]
    .sort().map(key => [key, candidates.filter(r => r.issue === key).length]));
  return { totals, candidatesByIssue, candidateCount: candidates.length,
    candidateLimit: 500, candidateListMayBeTruncated: candidates.length === 500 };
}

async function main() {
  const config = JSON.parse(await readFile(join(root, "config/cloudflare-resources.json"), "utf8"));
  if (config.account_id !== process.env.CLOUDFLARE_ACCOUNT_ID ||
      config.d1?.database_name !== DATABASE ||
      config.d1?.database_id !== EXPECTED_DATABASE_ID ||
      config.d1?.binding !== BINDING ||
      !process.env.CLOUDFLARE_API_TOKEN)
    throw new Error("DIRECTORY_LEGACY_AUDIT_WRONG_TARGET_OR_MISSING_PROTECTED_TOKEN");

  const reportDir = join(root, ".production-directory-legacy-readonly");
  await mkdir(reportDir, { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), "psipedia-directory-readonly-"));
  try {
    const configPath = join(tempDir, "wrangler.json");
    await writeFile(configPath, JSON.stringify({
      name: "psipedia-directory-legacy-audit-only",
      compatibility_date: "2026-08-23",
      d1_databases: [{ binding: BINDING, database_name: DATABASE,
        database_id: EXPECTED_DATABASE_ID }],
    }));
    const summary = wranglerRead(buildDirectoryLegacyCutoverReadinessSql(), configPath, "SUMMARY");
    const candidates = wranglerRead(buildDirectoryLegacyCutoverCandidatesSql(), configPath, "CANDIDATES");
    const overview = summarizeDirectoryLegacyAudit(summary, candidates);
    const report = {
      executedAt: new Date().toISOString(),
      gitRevision: process.env.GITHUB_SHA ?? null,
      database: DATABASE,
      readOnly: true,
      scope: "directory_profiles (no changes made)",
      ...overview,
      byCategoryAndStatus: summary,
      candidateRows: candidates.map(row => ({
        psipedia_id: Number(row.psipedia_id),
        category: row.category, status: row.status,
        field: row.field, canonical_key: row.canonical_key, issue: row.issue,
      })),
    };
    await writeFile(join(reportDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
    const lines = [
      "### Psipedia Directory — production D1 legacy read-only audit",
      "",
      "| Measure | Count |", "| --- | ---: |",
      ...Object.entries(overview.totals).map(([key, value]) => `| ${key} | ${value} |`),
      ...Object.entries(overview.candidatesByIssue).map(([key, value]) => `| candidates: ${key} (top 500) | ${value} |`),
      "",
      `Candidates listed: **${overview.candidateCount}** / maximum 500. ${overview.candidateListMayBeTruncated
        ? "LIMIT HIT: candidate list is incomplete. Aggregate report covers all rows."
        : "Candidate list not truncated."}`,
      "",
      "No D1 row changes, no migration, no backup/export of contact data.",
      "Download the restricted numeric-ID candidate report from this run's artifact.",
    ];
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
    process.stdout.write(JSON.stringify({ result: "READ_ONLY_COMPLETE", database: DATABASE,
      totals: overview.totals, candidateCount: overview.candidateCount,
      candidateListMayBeTruncated: overview.candidateListMayBeTruncated }) + "\n");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "DIRECTORY_LEGACY_AUDIT_FAILED");
    process.exitCode = 1;
  });
}
