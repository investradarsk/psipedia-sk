/**
 * Independent, owner-dispatched 0133 postflight. Every remote command is an
 * immutable SELECT from an exact allowlist. Never import the mutation runner.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const TARGET_0133 = "0133_services_canonical_admin_foundation.sql";
export const PINNED_SHA256_0133 = "656fcd963394076bfd5a7829e71b52a3bb83427e38a16f275e63af21b0f6eaef";
const IDENTITY = Object.freeze({
  account: "5ff902d3d80376478b9213b2b8ae8d6e",
  database: "psipedia-sk-db",
  databaseId: "8f7a0c3e-4d77-4a35-8192-a7bd57147950",
  binding: "DB",
});
export const SERVICE_TABLES_0133 = Object.freeze([
  "service_catalog_admin_options", "service_profile_option_choices", "service_profile_property_values",
]);
export const SERVICE_INDEXES_0133 = Object.freeze([
  "service_catalog_admin_options_status_idx", "service_catalog_admin_options_mirror_idx",
  "service_profile_option_choices_option_idx",
]);
const AUTO_INDEXES = Object.freeze([
  "sqlite_autoindex_service_catalog_admin_options_1",
  "sqlite_autoindex_service_catalog_admin_options_2",
  "sqlite_autoindex_service_profile_option_choices_1",
  "sqlite_autoindex_service_profile_property_values_1",
]);
export const SQL_LEDGER_0133 = "SELECT id,name FROM d1_migrations ORDER BY id";
export const SQL_OBJECTS_0133 = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ('service_catalog_admin_options','service_profile_option_choices','service_profile_property_values') ORDER BY type,name";
export const SQL_METRICS_0133 = "SELECT " +
  "(SELECT COUNT(*) FROM service_catalog_admin_options) AS options_count," +
  "(SELECT COUNT(*) FROM service_profile_option_choices) AS choices_count," +
  "(SELECT COUNT(*) FROM service_profile_property_values) AS properties_count," +
  "(SELECT COUNT(*) FROM service_profile_option_choices c LEFT JOIN directory_profiles p ON p.id=c.profile_id WHERE p.id IS NULL) AS choice_orphans," +
  "(SELECT COUNT(*) FROM service_profile_property_values v LEFT JOIN directory_profiles p ON p.id=v.profile_id WHERE p.id IS NULL) AS property_orphans";
const QUERIES = Object.freeze([SQL_LEDGER_0133, SQL_OBJECTS_0133, SQL_METRICS_0133]);

export function assertReadonly0133Query(sql) {
  if (!QUERIES.includes(sql)) throw Error("0133_AUDIT_UNAUTHORIZED_SQL");
  return sql;
}
export function buildReadonly0133Command(database, sql) {
  if (database !== IDENTITY.database) throw Error("0133_AUDIT_INVALID_DATABASE");
  return ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", assertReadonly0133Query(sql)];
}

function remoteRead(database, sql, env) {
  const args = buildReadonly0133Command(database, sql);
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const run = spawnSync(command, args, {
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    env: { ...env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
  });
  if (run.error || run.status !== 0) throw Error("0133_AUDIT_REMOTE_READ_FAILED");
  let decoded;
  try { decoded = JSON.parse(run.stdout); }
  catch { throw Error("0133_AUDIT_REMOTE_JSON_INVALID"); }
  const batches = Array.isArray(decoded) ? decoded : [decoded];
  if (batches.length !== 1 || !batches[0]?.success || !Array.isArray(batches[0]?.results))
    throw Error("0133_AUDIT_REMOTE_RESULT_INVALID");
  return batches[0].results;
}

function normalizeDDL(sql) {
  return String(sql ?? "").replace(/\s+/g, " ").trim().replace(/;$/, "").trim().toLowerCase();
}
export function expected0133Objects(migration) {
  // The approved migration contains only CREATE TABLE / CREATE INDEX statements.
  const stripped = migration.split(/\r?\n/).filter(line => !/^\s*--/.test(line)).join("\n");
  const statements = stripped.split(";").map(s => s.trim()).filter(Boolean);
  if (statements.length !== 6) throw Error("0133_AUDIT_CANONICAL_DDL_INVALID");
  const expected = new Map();
  for (const statement of statements) {
    const match = /^CREATE\s+(TABLE|INDEX)\s+([a-z][a-z0-9_]*)\s*[\s(]/i.exec(statement);
    if (!match || expected.has(match[2])) throw Error("0133_AUDIT_CANONICAL_DDL_INVALID");
    expected.set(match[2], { type: match[1].toLowerCase() === "table" ? "table" : "index", sql: normalizeDDL(statement) });
  }
  if ([...SERVICE_TABLES_0133, ...SERVICE_INDEXES_0133].some(name => !expected.has(name)))
    throw Error("0133_AUDIT_CANONICAL_DDL_INVALID");
  return expected;
}

export function classify0133(ledger, objects, metrics, canonicalNames, migration) {
  if (!Array.isArray(ledger) || !Array.isArray(objects) || !Array.isArray(metrics) ||
      !Array.isArray(canonicalNames) || metrics.length !== 1)
    throw Error("0133_AUDIT_INVALID_RESULT");
  const expectedNames = canonicalNames.filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name) && Number(name.slice(0,4)) <= 133).sort();
  if (expectedNames.length !== 134 || expectedNames.at(-1) !== TARGET_0133 ||
      expectedNames.some((name,i) => Number(name.slice(0,4)) !== i) ||
      ledger.length !== expectedNames.length ||
      ledger.some((row,i) => row?.name !== expectedNames[i] || !Number.isSafeInteger(row.id) ||
        (i > 0 && row.id <= ledger[i-1]?.id)))
    throw Error("0133_AUDIT_HISTORY_MISMATCH");

  const expected = expected0133Objects(migration);
  const allowed = new Set([...expected.keys(), ...AUTO_INDEXES]);
  if (objects.length !== allowed.size || objects.some(row => !row || !allowed.has(row.name)) ||
      new Set(objects.map(row => row.name)).size !== allowed.size)
    throw Error("0133_AUDIT_OBJECT_SET_DRIFT");
  for (const row of objects) {
    if (!SERVICE_TABLES_0133.includes(row.tbl_name)) throw Error("0133_AUDIT_OBJECT_PARENT_DRIFT");
    if (expected.has(row.name)) {
      const want = expected.get(row.name);
      if (row.type !== want.type || normalizeDDL(row.sql) !== want.sql)
        throw Error("0133_AUDIT_SCHEMA_OR_CONSTRAINT_DRIFT:" + row.name);
    } else if (row.type !== "index" || row.sql !== null)
      throw Error("0133_AUDIT_AUTO_INDEX_DRIFT:" + row.name);
  }
  const m = metrics[0];
  const numbers = ["options_count", "choices_count", "properties_count", "choice_orphans", "property_orphans"];
  if (numbers.some(key => !Number.isSafeInteger(m?.[key]) || m[key] < 0))
    throw Error("0133_AUDIT_INVALID_AGGREGATES");
  if (m.choice_orphans !== 0 || m.property_orphans !== 0)
    throw Error("0133_AUDIT_REFERENTIAL_INTEGRITY_FAILED");
  return {
    result: "APPLIED_AND_VERIFIED", migration: TARGET_0133,
    applied: true, migrationSha256: PINNED_SHA256_0133,
    inspectedTables: [...SERVICE_TABLES_0133], inspectedIndexes: [...SERVICE_INDEXES_0133, ...AUTO_INDEXES],
    constraintVerification: "exact-approved-DDL-and-implicit-unique-indexes",
    referentialIntegrity: "PASS", counts: Object.fromEntries(numbers.map(key => [key,m[key]])),
  };
}

export async function audit0133({ resources, migration, canonicalNames, env, query = remoteRead }) {
  if (env?.GITHUB_ACTIONS !== "true" || env?.GITHUB_REF !== "refs/heads/main" ||
      !env?.CLOUDFLARE_API_TOKEN || env?.CLOUDFLARE_ACCOUNT_ID !== IDENTITY.account ||
      resources?.account_id !== IDENTITY.account || resources?.d1?.database_id !== IDENTITY.databaseId ||
      resources?.d1?.database_name !== IDENTITY.database || resources?.d1?.binding !== IDENTITY.binding)
    throw Error("0133_AUDIT_IDENTITY_OR_ACTIONS_GUARD");
  if (createHash("sha256").update(migration).digest("hex") !== PINNED_SHA256_0133)
    throw Error("0133_AUDIT_MIGRATION_BYTES_CHANGED");
  const ledger = await query(IDENTITY.database, SQL_LEDGER_0133, env);
  const objects = await query(IDENTITY.database, SQL_OBJECTS_0133, env);
  const metrics = await query(IDENTITY.database, SQL_METRICS_0133, env);
  return { ...classify0133(ledger, objects, metrics, canonicalNames, migration),
    database: IDENTITY.database, databaseId: IDENTITY.databaseId };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const [resources, migration, names] = await Promise.all([
    readFile(path.join(root,"config/cloudflare-resources.json"),"utf8"),
    readFile(path.join(root,"drizzle",TARGET_0133),"utf8"),
    readdir(path.join(root,"drizzle")),
  ]);
  const report = await audit0133({ resources: JSON.parse(resources), migration,
    canonicalNames: names, env: process.env });
  process.stdout.write(JSON.stringify(report,null,2) + "\n");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { process.stderr.write(String(e.message).slice(0, 180) + "\n"); process.exitCode=1; });
}
