/**
 * Explicit, read-only D1 0127 audit. Never runs a migration.
 * Production credentials come solely from the protected GitHub environment.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const TARGET_0127 = "0127_gemini_notion_created_pages.sql";
export const PREVIOUS_0126 = "0126_gemini_scheduler_admin_v2.sql";
export const SQL_LEDGER = "SELECT name FROM d1_migrations ORDER BY id";
export const SQL_OBJECTS = "SELECT type,name,sql FROM sqlite_master WHERE name IN " +
  "('gemini_manual_background_jobs','gemini_notion_created_pages'," +
  "'idx_gemini_notion_created_pages_job','idx_gemini_notion_created_pages_pending') ORDER BY name";
const indexes = ["idx_gemini_notion_created_pages_job", "idx_gemini_notion_created_pages_pending"];
export function assertReadonly0127Query(sql) {
  if (sql !== SQL_LEDGER && sql !== SQL_OBJECTS) throw Error("0127_AUDIT_UNAUTHORIZED_SQL");
  return sql;
}
export function classify0127(mode, ledger, objects) {
  if (!["preflight", "postflight"].includes(mode) ||
      !Array.isArray(ledger) || !Array.isArray(objects) ||
      ledger.some(row => typeof row?.name !== "string") ||
      objects.some(row => typeof row?.name !== "string" || typeof row?.sql !== "string"))
    throw Error("0127_AUDIT_INVALID_INPUT");
  const names = ledger.map(row => row.name);
  if (new Set(names).size !== names.length || !names.includes(PREVIOUS_0126))
    throw Error("0127_AUDIT_LEDGER_MISMATCH");
  const entities = new Map(objects.map(row => [row.name, row]));
  if (entities.size !== objects.length || entities.get("gemini_manual_background_jobs")?.type !== "table")
    throw Error("0127_AUDIT_PARENT_MISSING");
  const child = entities.get("gemini_notion_created_pages");
  if (mode === "preflight") {
    if (names.includes(TARGET_0127) || child || indexes.some(name => entities.has(name)) ||
        names.at(-1) !== PREVIOUS_0126)
      throw Error("0127_AUDIT_NOT_CLEAN");
    return { mode, result: "READY_FOR_SEPARATE_APPLY_APPROVAL" };
  }
  if (names.filter(name => name === TARGET_0127).length !== 1 ||
      names.at(-1) !== TARGET_0127 || child?.type !== "table" ||
      !/notion_page_id TEXT PRIMARY KEY NOT NULL/.test(child.sql) ||
      !/REFERENCES gemini_manual_background_jobs\(id\)/.test(child.sql) ||
      !/UNIQUE \(import_agenda, canonical_entity_id\)/.test(child.sql) ||
      indexes.some(name => entities.get(name)?.type !== "index"))
    throw Error("0127_AUDIT_POSTFLIGHT_FAILED");
  return { mode, result: "APPLIED_AND_VERIFIED" };
}
function remoteRead(database, sql, env) {
  assertReadonly0127Query(sql);
  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const run = spawnSync(cmd, ["wrangler", "d1", "execute", database, "--remote",
    "--json", "--command", sql], { encoding: "utf8",
    env: { ...env, WRANGLER_SEND_METRICS: "false" }, maxBuffer: 8 * 1024 * 1024 });
  if (run.error || run.status !== 0) throw Error("0127_REMOTE_READ_FAILED");
  const decoded = JSON.parse(run.stdout);
  const response = Array.isArray(decoded) ? decoded[0] : decoded;
  if (!response?.success || !Array.isArray(response.results))
    throw Error("0127_REMOTE_READ_INCOMPLETE");
  return response.results;
}
export async function audit0127({ mode, resources, migration, env, query = remoteRead }) {
  if (!resources?.account_id || !resources?.d1?.database_name ||
      env.CLOUDFLARE_ACCOUNT_ID !== resources.account_id || !env.CLOUDFLARE_API_TOKEN)
    throw Error("0127_AUDIT_WRONG_PRODUCTION_ACCOUNT");
  if (!/CREATE TABLE gemini_notion_created_pages/.test(migration) ||
      !/REFERENCES gemini_manual_background_jobs\(id\)/.test(migration))
    throw Error("0127_AUDIT_WRONG_MIGRATION_BYTES");
  const ledger = await query(resources.d1.database_name, SQL_LEDGER, env);
  const objects = await query(resources.d1.database_name, SQL_OBJECTS, env);
  return {
    ...classify0127(mode, ledger, objects),
    database: resources.d1.database_name,
    migrationSha256: createHash("sha256").update(migration).digest("hex"),
  };
}
async function main() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const [resources, migration] = await Promise.all([
    readFile(path.join(root, "config/cloudflare-resources.json"), "utf8"),
    readFile(path.join(root, "drizzle", TARGET_0127), "utf8"),
  ]);
  const outcome = await audit0127({
    mode: process.env.D1_0127_AUDIT_MODE,
    resources: JSON.parse(resources), migration, env: process.env,
  });
  process.stdout.write(JSON.stringify(outcome, null, 2) + "\n");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(String(error.message).slice(0, 160) + "\n"); process.exitCode = 1; });
}
