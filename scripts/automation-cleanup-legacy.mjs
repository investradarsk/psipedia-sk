import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CANONICAL_TABLES = Object.freeze([
  "managed_events",
  "directory_profiles",
  "adoption_dogs",
  "help_organizations",
  "help_cases",
  "lost_found_dog_reports",
  "articles",
  "geo_points",
]);

export const KEEP_TABLES = Object.freeze([
  "automation_sources",
  "automation_discovery_roots",
  "automation_source_authority",
  "automation_search_usage",
  "automation_governance_reviews",
  "automation_governance_review_history",
  "automation_entity_match_decisions",
  "automation_canonical_apply_operations",
]);

export const DELETE_TABLE_ORDER = Object.freeze([
  "automation_source_candidate_evidence",
  "automation_cluster_findings",
  "automation_cluster_match_candidates",
  "automation_field_conflicts",
  "automation_field_evidence",
  "automation_entity_candidate_keys",
  "automation_cluster_observations",
  "automation_cluster_source_records",
  "automation_findings",
  "automation_observations",
  "automation_runs",
  "automation_discovery_runs",
  "automation_source_candidates",
  "automation_entity_clusters",
]);

export const RESET_ONLY_FIELDS = Object.freeze([
  "automation_discovery_roots.last_error_code",
  "automation_discovery_roots.last_error_at",
]);

export const BLOCKER_QUERIES = Object.freeze({
  runningAutomationRuns: "SELECT COUNT(*) AS count FROM automation_runs WHERE status='RUNNING'",
  runningDiscoveryRuns: "SELECT COUNT(*) AS count FROM automation_discovery_runs WHERE completed_at IS NULL",
  manualMatchDecisions: "SELECT COUNT(*) AS count FROM automation_entity_match_decisions",
  canonicalApplyOperations: "SELECT COUNT(*) AS count FROM automation_canonical_apply_operations",
  canonicalClusterClaims: "SELECT COUNT(*) AS count FROM automation_cluster_canonical_claims",
  duplicateDraftWarnings: "SELECT COUNT(*) AS count FROM automation_findings WHERE finding_type='DUPLICATE_CANDIDATE' AND canonical_entity_id IS NOT NULL",
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function runWrangler(args, { capture = false } = {}) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["wrangler", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      NO_UPDATE_NOTIFIER: "1",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "wrangler failed").trim());
  }
  if (!capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return result.stdout || "";
}

function parseRows(output) {
  const text = output.trim();
  if (!text) return [];
  const payload = JSON.parse(text);
  const batches = Array.isArray(payload) ? payload : [payload];
  return batches.flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

async function loadProductionTarget() {
  invariant(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  const resources = JSON.parse(await fs.readFile(path.join(repoRoot, "config/cloudflare-resources.json"), "utf8"));
  const generated = JSON.parse(await fs.readFile(path.join(repoRoot, "dist/server/wrangler.json"), "utf8"));
  invariant(resources?.d1?.database_name, "canonical D1 database_name missing");
  invariant(resources?.d1?.database_id, "canonical D1 database_id missing");
  invariant(resources?.account_id, "canonical Cloudflare account_id missing");
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID === resources.account_id, "Cloudflare account mismatch");
  const binding = (generated.d1_databases || []).find((item) => item.binding === resources.d1.binding);
  invariant(binding, "generated Wrangler config missing canonical D1 binding");
  invariant(binding.database_name === resources.d1.database_name, "generated D1 name mismatch");
  invariant(binding.database_id === resources.d1.database_id, "generated D1 id mismatch");
  return { databaseName: resources.d1.database_name, configPath: path.join(repoRoot, "dist/server/wrangler.json") };
}

function execute(target, sql) {
  return parseRows(runWrangler([
    "d1", "execute", target.databaseName,
    "--remote",
    "--config", target.configPath,
    "--command", sql,
    "--json",
  ], { capture: true }));
}

function scalar(target, sql) {
  const rows = execute(target, sql);
  return Number(rows[0]?.count ?? 0);
}

function tableExists(target, table) {
  const safe = table.replace(/'/g, "''");
  return scalar(target, `SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='${safe}'`) === 1;
}

function countTable(target, table) {
  return tableExists(target, table) ? scalar(target, `SELECT COUNT(*) AS count FROM "${table}"`) : null;
}

function canonicalSnapshot(target) {
  return Object.fromEntries(CANONICAL_TABLES.map((table) => [table, countTable(target, table)]));
}

function countsFor(target, tables) {
  return Object.fromEntries(tables.map((table) => [table, countTable(target, table)]));
}

function requiredCount(target, table) {
  invariant(tableExists(target, table), `required table missing: ${table}`);
  return countTable(target, table);
}

export function assertStaticSafety() {
  const canonical = new Set(CANONICAL_TABLES);
  const keep = new Set(KEEP_TABLES);
  for (const table of DELETE_TABLE_ORDER) {
    invariant(!canonical.has(table), `canonical table in delete allowlist: ${table}`);
    invariant(!keep.has(table), `KEEP table in delete allowlist: ${table}`);
  }
  invariant(!DELETE_TABLE_ORDER.some((table) => table === "automation_sources"), "automation_sources must never be deleted");
  invariant(!DELETE_TABLE_ORDER.some((table) => table === "automation_discovery_roots"), "discovery roots must never be deleted");
  invariant(!DELETE_TABLE_ORDER.some((table) => table === "automation_search_usage"), "search usage must never be deleted");
  invariant(!DELETE_TABLE_ORDER.some((table) => table.startsWith("*")), "wildcard destructive cleanup is forbidden");
}

function preview(target) {
  assertStaticSafety();

  const deleteCounts = countsFor(target, DELETE_TABLE_ORDER);
  const keepCounts = countsFor(target, KEEP_TABLES);
  const canonical = canonicalSnapshot(target);

  const blockers = {};
  for (const [key, sql] of Object.entries(BLOCKER_QUERIES)) {
    blockers[key] = execute(target, sql)[0]?.count == null ? 0 : Number(execute(target, sql)[0].count);
  }

  const attention = {
    editorialAutomationFinding: tableExists(target, "editorial_notifications")
      ? scalar(target, "SELECT COUNT(*) AS count FROM editorial_notifications WHERE resource_type='automation_finding'")
      : 0,
  };

  const report = {
    mode: "preview",
    deleteCounts,
    keepCounts,
    canonical,
    blockers,
    attention,
    applyAllowed: Object.values(blockers).every((count) => count === 0),
  };
  return report;
}

function deleteIfExists(target, table) {
  if (!tableExists(target, table)) return 0;
  const before = requiredCount(target, table);
  execute(target, `DELETE FROM "${table}"`);
  const after = requiredCount(target, table);
  invariant(after === 0, `${table} cleanup incomplete`);
  return before;
}

function apply(target, before) {
  invariant(before.applyAllowed, `cleanup blocked: ${JSON.stringify(before.blockers)}`);

  const keepBefore = before.keepCounts;
  const canonicalBefore = before.canonical;

  if (tableExists(target, "editorial_notifications")) {
    execute(target, "DELETE FROM editorial_notifications WHERE resource_type='automation_finding'");
  }

  const deleted = {};
  for (const table of DELETE_TABLE_ORDER) deleted[table] = deleteIfExists(target, table);

  const keepAfter = countsFor(target, KEEP_TABLES);
  const canonicalAfter = canonicalSnapshot(target);

  invariant(JSON.stringify(canonicalAfter) === JSON.stringify(canonicalBefore), "canonical row counts changed");
  invariant(keepAfter.automation_sources === keepBefore.automation_sources, "automation_sources count changed");
  invariant(keepAfter.automation_discovery_roots === keepBefore.automation_discovery_roots, "discovery roots count changed");
  invariant(keepAfter.automation_search_usage === keepBefore.automation_search_usage, "Tavily/search usage count changed");
  invariant(keepAfter.automation_governance_reviews === keepBefore.automation_governance_reviews, "governance review count changed");
  invariant(keepAfter.automation_governance_review_history === keepBefore.automation_governance_review_history, "governance history count changed");
  invariant(keepAfter.automation_entity_match_decisions === keepBefore.automation_entity_match_decisions, "manual match-memory count changed");
  invariant(keepAfter.automation_canonical_apply_operations === keepBefore.automation_canonical_apply_operations, "canonical apply provenance count changed");

  for (const table of DELETE_TABLE_ORDER) {
    if (tableExists(target, table)) invariant(requiredCount(target, table) === 0, `${table} is not empty after cleanup`);
  }

  return {
    mode: "apply",
    deleted,
    canonicalBefore,
    canonicalAfter,
    keepBefore,
    keepAfter,
  };
}

async function main() {
  const applyRequested = process.argv.includes("--apply");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--preview" && arg !== "--apply");
  invariant(unknown.length === 0, `unknown arguments: ${unknown.join(", ")}`);
  const target = await loadProductionTarget();
  const before = preview(target);
  console.log(JSON.stringify(before, null, 2));
  if (!applyRequested) return;
  const result = apply(target, before);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
