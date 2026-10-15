/**
 * Manual production D1 0128 audit. Executes ONLY two explicit read-only SELECTs.
 * No migration, deployment or mutation is possible from this script.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  APPROVED_0128_SHA256, assertApproved0128Target,
  assertFacebookImagePostsSchema, assertGeminiNotionCreatedPagesSchema,
  targetSchemaObjects, validateProductionTargetHistory,
} from "./production-d1-migrate.mjs";

export const TARGET_0128 = "0128_facebook_image_posts.sql";
export const SQL_LEDGER_0128 = "SELECT name FROM d1_migrations ORDER BY id";
export const SQL_OBJECTS_0128 = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name IN " +
  "('gemini_notion_created_pages','idx_gemini_notion_created_pages_job','idx_gemini_notion_created_pages_pending'," +
  "'facebook_image_posts','facebook_image_posts_schedule_idx','facebook_image_posts_updated_idx','facebook_image_posts_notion_idx') ORDER BY name";

export function assertReadonly0128Query(sql) {
  if (sql !== SQL_LEDGER_0128 && sql !== SQL_OBJECTS_0128) throw Error("0128_AUDIT_UNAUTHORIZED_SQL");
  return sql;
}

export function classify0128(mode, ledger, objects, canonicalNames) {
  if (!["preflight", "postflight"].includes(mode) || !Array.isArray(ledger) ||
      !Array.isArray(objects) || !Array.isArray(canonicalNames) ||
      ledger.some(row => typeof row?.name !== "string") ||
      objects.some(row => typeof row?.name !== "string" || typeof row?.sql !== "string" || typeof row?.type !== "string"))
    throw Error("0128_AUDIT_INVALID_INPUT");
  if (canonicalNames.at(-1) !== TARGET_0128 || new Set(objects.map(row => row.name)).size !== objects.length)
    throw Error("0128_AUDIT_INVALID_CANONICAL_STATE");
  const history = ledger.map(row => row.name);
  const status = validateProductionTargetHistory(history, canonicalNames, TARGET_0128);
  const schema = { objects };
  assertGeminiNotionCreatedPagesSchema(schema);
  if (mode === "preflight") {
    if (status.targetApplied || targetSchemaObjects(schema, TARGET_0128).partial)
      throw Error("0128_AUDIT_NOT_CLEAN");
    return { mode, result: "READY_FOR_SEPARATE_APPLY_APPROVAL" };
  }
  if (!status.targetApplied) throw Error("0128_AUDIT_NOT_APPLIED");
  assertFacebookImagePostsSchema(schema);
  return { mode, result: "APPLIED_AND_VERIFIED" };
}

function remoteRead(database, sql, env) {
  assertReadonly0128Query(sql);
  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const run = spawnSync(cmd, ["wrangler", "d1", "execute", database,
    "--remote", "--json", "--command", sql],
    { encoding: "utf8", env: { ...env, WRANGLER_SEND_METRICS: "false" }, maxBuffer: 8 * 1024 * 1024 });
  if (run.error || run.status !== 0) throw Error("0128_REMOTE_READ_FAILED");
  const decoded = JSON.parse(run.stdout);
  const result = Array.isArray(decoded) ? decoded[0] : decoded;
  if (!result?.success || !Array.isArray(result.results))
    throw Error("0128_REMOTE_READ_INCOMPLETE");
  return result.results;
}

export async function audit0128({ mode, resources, migration, canonicalNames, env, query = remoteRead }) {
  if (resources?.d1?.database_name !== "psipedia-sk-db" || !resources?.d1?.database_id ||
      !resources?.account_id || env?.CLOUDFLARE_ACCOUNT_ID !== resources.account_id ||
      !env?.CLOUDFLARE_API_TOKEN)
    throw Error("0128_AUDIT_WRONG_PRODUCTION_ACCOUNT");
  const hash = createHash("sha256").update(migration).digest("hex");
  assertApproved0128Target(resources.d1.database_name, hash);
  if (hash !== APPROVED_0128_SHA256) throw Error("0128_AUDIT_WRONG_MIGRATION_BYTES");
  const ledger = await query(resources.d1.database_name, SQL_LEDGER_0128, env);
  const objects = await query(resources.d1.database_name, SQL_OBJECTS_0128, env);
  return { ...classify0128(mode, ledger, objects, canonicalNames),
    database: resources.d1.database_name, migrationSha256: hash };
}

async function main() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const [resources, migration, allFiles] = await Promise.all([
    readFile(path.join(root, "config/cloudflare-resources.json"), "utf8"),
    readFile(path.join(root, "drizzle", TARGET_0128), "utf8"),
    readdir(path.join(root, "drizzle")),
  ]);
  const canonicalNames = allFiles.filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name) && Number(name.slice(0,4))<=128).sort();
  const outcome = await audit0128({ mode: process.env.D1_0128_AUDIT_MODE,
    resources: JSON.parse(resources), migration, canonicalNames, env: process.env });
  process.stdout.write(JSON.stringify(outcome, null, 2) + "\n");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { process.stderr.write(String(err.message).slice(0, 200) + "\n"); process.exitCode = 1; });
}
