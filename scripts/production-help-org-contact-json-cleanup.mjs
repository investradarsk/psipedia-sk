#!/usr/bin/env node
/**
 * Owner-dispatched, one-operation cleanup of two historical Organization
 * contact aliases. SQL public_email/public_phone always remain untouched.
 * No Notion access, backfill, migration or profile mutation.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const OUT = resolve(ROOT, ".production-help-org-contact-json-cleanup");
const DB = "psipedia-sk-db";
const DB_ID = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT = "5ff902d3d80376478b9213b2b8ae8d6e";
const CONFIRM = "DEPLOYED-SQL-HELP-ORGANIZATIONS-CLEANUP-psipedia-sk-db";

export const CLEANUP_SQL = `UPDATE help_organizations
SET source_data_json = json_remove(
  source_data_json,
  '$.publicEmailsRaw',
  '$.publicPhonesRaw'
)
WHERE json_valid(source_data_json)
  AND (
    json_type(source_data_json, '$.publicEmailsRaw') IS NOT NULL
    OR json_type(source_data_json, '$.publicPhonesRaw') IS NOT NULL
  )`;

export const SCHEMA_SQL =
  "SELECT name FROM pragma_table_info('help_organizations') WHERE name IN " +
  "('id','source_data_json','public_email','public_phone')";

export const AGGREGATE_SQL = `SELECT
  COUNT(*) AS profiles,
  COALESCE(SUM(id),0) AS id_sum,
  COUNT(public_email) AS email_sql_non_null,
  COUNT(public_phone) AS phone_sql_non_null,
  COALESCE(SUM(CASE WHEN NOT json_valid(source_data_json) THEN 1 ELSE 0 END),0) AS invalid_json,
  COALESCE(SUM(CASE WHEN json_valid(source_data_json) THEN
    CASE WHEN json_type(source_data_json,'$.publicEmailsRaw') IS NOT NULL
      OR json_type(source_data_json,'$.publicPhonesRaw') IS NOT NULL
    THEN 1 ELSE 0 END
  ELSE 0 END),0) AS rows_with_legacy_contacts
FROM help_organizations`;

function requireContext() {
  const env = process.env;
  const config = JSON.parse(readFileSync(resolve(ROOT, "config/cloudflare-resources.json"), "utf8"));
  if (env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_REPOSITORY !== "investradarsk/psipedia-sk" ||
      env.GITHUB_REF !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "") ||
      env.HELP_ORG_CONTACT_CLEANUP_CONFIRMATION !== CONFIRM ||
      !env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT ||
      config.account_id !== ACCOUNT || config.d1?.binding !== "DB" ||
      config.d1?.database_name !== DB || config.d1?.database_id !== DB_ID) {
    throw new Error("HELP_ORG_CONTACT_CLEANUP_CONTEXT_REJECTED");
  }
}

function remote(sql, write, configPath) {
  if ((write && sql !== CLEANUP_SQL) ||
      (!write && sql !== SCHEMA_SQL && sql !== AGGREGATE_SQL)) {
    throw new Error("HELP_ORG_CONTACT_CLEANUP_SQL_REJECTED");
  }
  const run = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx",
    ["--no-install", "wrangler", "d1", "execute", DB,
      "--remote", "--config", configPath, "--command", sql, "--json",
      ...(write ? ["--yes"] : [])], {
      cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
    });
  // Never print Wrangler stdout/stderr: remote data stays private.
  if (run.error || run.status !== 0)
    throw new Error("HELP_ORG_CONTACT_CLEANUP_REMOTE_COMMAND_FAILED");
  let payload;
  try { payload = JSON.parse(run.stdout); }
  catch { throw new Error("HELP_ORG_CONTACT_CLEANUP_INVALID_REMOTE_RESPONSE"); }
  const pages = Array.isArray(payload) ? payload : [payload];
  if (!pages.length || pages.some(p => p?.success !== true || !Array.isArray(p.results)))
    throw new Error("HELP_ORG_CONTACT_CLEANUP_D1_QUERY_FAILED");
  return pages.flatMap(p => p.results);
}

function summary(row) {
  const keys = ["profiles", "id_sum", "email_sql_non_null", "phone_sql_non_null",
    "invalid_json", "rows_with_legacy_contacts"];
  if (!row) throw new Error("HELP_ORG_CONTACT_CLEANUP_MISSING_AGGREGATES");
  const result = {};
  for (const key of keys) {
    const value = Number(row[key]);
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("HELP_ORG_CONTACT_CLEANUP_INVALID_AGGREGATES");
    result[key] = value;
  }
  return result;
}

export function verifyCleanup(before, after) {
  return after.rows_with_legacy_contacts === 0 &&
    ["profiles", "id_sum", "email_sql_non_null", "phone_sql_non_null", "invalid_json"]
      .every(key => before[key] === after[key]);
}

async function main() {
  let state = "BLOCKED";
  let before;
  mkdirSync(OUT, { recursive: true });
  const reportPath = resolve(OUT, "report.json");
  try {
    requireContext();
    const configPath = resolve(OUT, "wrangler.json");
    writeFileSync(configPath, JSON.stringify({
      name: "help-org-contact-json-cleanup",
      compatibility_date: "2026-11-21",
      d1_databases: [{ binding: "DB", database_name: DB, database_id: DB_ID }],
    }));
    const columns = new Set(remote(SCHEMA_SQL, false, configPath).map(row => row.name));
    if (["id", "source_data_json", "public_email", "public_phone"].some(key => !columns.has(key)))
      throw new Error("HELP_ORG_CONTACT_CLEANUP_SCHEMA_MISSING");
    before = summary(remote(AGGREGATE_SQL, false, configPath)[0]);
    remote(CLEANUP_SQL, true, configPath);
    const after = summary(remote(AGGREGATE_SQL, false, configPath)[0]);
    if (!verifyCleanup(before, after))
      throw new Error("HELP_ORG_CONTACT_CLEANUP_POSTFLIGHT_FAILED");
    state = "APPLIED_AND_VERIFIED";
    writeFileSync(reportPath, JSON.stringify({
      status: state, commit: process.env.GITHUB_SHA, database: DB,
      before, after, removedLegacyRows: before.rows_with_legacy_contacts,
      sqlContactValuesUpdated: false, notionCalled: false, migrationCreated: false,
    }, null, 2) + "\n");
    console.log(JSON.stringify({ status: state, removedLegacyRows: before.rows_with_legacy_contacts,
      remainingLegacyRows: after.rows_with_legacy_contacts, sqlContactValuesUpdated: false }));
  } catch (error) {
    const code = error instanceof Error && /^HELP_ORG_CONTACT_CLEANUP_[A-Z_]+$/.test(error.message)
      ? error.message : "HELP_ORG_CONTACT_CLEANUP_FAILED";
    writeFileSync(reportPath, JSON.stringify({ status: state, before: before ?? null, error: code }, null, 2) + "\n");
    console.error(code);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
