import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STALE_RUN_MS = 20 * 60_000;

const CANONICAL_TABLE_BY_TYPE = Object.freeze({
  EVENT: "managed_events",
  ORGANIZATION: "help_organizations",
  DIRECTORY: "directory_profiles",
  ADOPTION: "adoption_dogs",
  FOSTER: "help_cases",
  HELP_ITEM: "help_cases",
  LOST_FOUND: "lost_found_dog_reports",
});

const CANONICAL_CONTENT_TABLES = Object.freeze([
  "managed_events",
  "directory_profiles",
  "adoption_dogs",
  "help_organizations",
  "help_cases",
  "lost_found_dog_reports",
]);

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
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "wrangler failed").trim());
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

function quote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function canonicalSnapshot(target) {
  return Object.fromEntries(CANONICAL_CONTENT_TABLES.map((table) => [
    table,
    scalar(target, `SELECT COUNT(*) AS count FROM "${table}"`),
  ]));
}

function canonicalStatus(target, entityType, canonicalEntityId) {
  const table = CANONICAL_TABLE_BY_TYPE[entityType];
  if (!table || !canonicalEntityId) return null;
  const rows = execute(target, `SELECT id,status,published_at FROM "${table}" WHERE id=${Number(canonicalEntityId)} LIMIT 1`);
  if (!rows.length) return { exists: false, status: null, publishedAt: null };
  return {
    exists: true,
    status: rows[0].status ?? null,
    publishedAt: rows[0].published_at ?? null,
  };
}

function possibleDuplicateCandidateIds(target, reason, createdCanonicalId) {
  const ids = new Set();
  for (const match of String(reason ?? "").matchAll(/(?:event|organization|directory|adoption|lost-found|help):(\d+)/gi)) {
    const id = Number(match[1]);
    if (Number.isSafeInteger(id) && id > 0 && id !== Number(createdCanonicalId)) ids.add(id);
  }
  const clusterMatch = String(reason ?? "").match(/kandidátne clustre:\s*([0-9,\s]+)/i);
  if (clusterMatch) {
    for (const raw of clusterMatch[1].split(",")) {
      const clusterId = Number(raw.trim());
      if (!Number.isSafeInteger(clusterId) || clusterId < 1) continue;
      const rows = execute(target, `SELECT canonical_entity_id FROM automation_entity_clusters WHERE id=${clusterId} LIMIT 1`);
      const id = Number(rows[0]?.canonical_entity_id ?? 0);
      if (Number.isSafeInteger(id) && id > 0 && id !== Number(createdCanonicalId)) ids.add(id);
    }
  }
  return [...ids];
}

function applicationAudit(target) {
  const rows = execute(target, `SELECT
      a.id,a.finding_id,a.entity_type,a.canonical_entity_id,a.application_type,a.applied_at,a.applied_by,
      f.source_id,f.observation_id,f.finding_type,f.reason,f.source_url AS finding_source_url,f.payload_hash,
      f.canonical_entity_id AS finding_canonical_entity_id,f.canonical_entity_key AS finding_canonical_entity_key,
      o.source_record_id,o.source_url AS observation_source_url,
      s.source_key
    FROM automation_applications a
    JOIN automation_findings f ON f.id=a.finding_id
    JOIN automation_sources s ON s.id=f.source_id
    LEFT JOIN automation_observations o ON o.id=f.observation_id
    ORDER BY a.id`);
  return rows.map((row) => ({
    ...row,
    canonicalStatus: canonicalStatus(target, row.entity_type, row.canonical_entity_id),
  }));
}

function clusterAudit(target) {
  const clusters = execute(target, `SELECT id,entity_type,canonical_entity_id,canonical_entity_key,created_at,updated_at
    FROM automation_entity_clusters
    WHERE canonical_entity_id IS NOT NULL OR canonical_entity_key IS NOT NULL
    ORDER BY id`);
  return clusters.map((cluster) => {
    const findings = execute(target, `SELECT
        f.id,f.finding_type,f.canonical_entity_id,f.canonical_entity_key,f.reason,f.review_status,
        a.id AS application_id,a.application_type,a.canonical_entity_id AS application_canonical_entity_id
      FROM automation_cluster_findings cf
      JOIN automation_findings f ON f.id=cf.finding_id
      LEFT JOIN automation_applications a ON a.finding_id=f.id
      WHERE cf.cluster_id=${Number(cluster.id)}
      ORDER BY f.id`);
    const sourceRecords = execute(target, `SELECT source_id,entity_type,source_record_id,first_seen_at,last_seen_at
      FROM automation_cluster_source_records WHERE cluster_id=${Number(cluster.id)}
      ORDER BY source_id,source_record_id`);
    const manualDecisionCount = scalar(target, `SELECT COUNT(*) AS count FROM automation_entity_match_decisions
      WHERE is_active=1 AND (source_cluster_id=${Number(cluster.id)} OR candidate_cluster_id=${Number(cluster.id)})`);
    const createDraftLink = findings.some((finding) =>
      finding.application_type === "CREATE_DRAFT"
      && Number(finding.application_canonical_entity_id) === Number(cluster.canonical_entity_id));
    const classification = createDraftLink
      ? "A_AUTOMATION_CREATED_DRAFT"
      : manualDecisionCount > 0
        ? "B_PREEXISTING_CANONICAL_MATCH_KEEP"
        : "B_PREEXISTING_CANONICAL_MATCH_TRANSIENT";
    return {
      ...cluster,
      canonicalStatus: canonicalStatus(target, cluster.entity_type, cluster.canonical_entity_id),
      findings,
      sourceRecords,
      manualDecisionCount,
      classification,
    };
  });
}

function preview(target, now = new Date()) {
  invariant(tableExists(target, "automation_ingestion_receipts"), "automation_ingestion_receipts migration missing");
  invariant(tableExists(target, "canonical_draft_flags"), "canonical_draft_flags migration missing");

  const staleBefore = new Date(now.getTime() - STALE_RUN_MS).toISOString();
  const runningRuns = execute(target, `SELECT r.id,r.source_id,s.source_key,r.started_at,r.status,
      CASE WHEN r.started_at < ${quote(staleBefore)} THEN 1 ELSE 0 END AS stale_by_policy
    FROM automation_runs r
    JOIN automation_sources s ON s.id=r.source_id
    WHERE r.status='RUNNING'
    ORDER BY r.started_at,r.id`).map((row) => ({
      ...row,
      staleByPolicy: Boolean(Number(row.stale_by_policy)),
      activeByPolicy: !Boolean(Number(row.stale_by_policy)),
    }));

  const applications = applicationAudit(target);
  const applicationsByType = {
    total: applications.length,
    CREATE_DRAFT: applications.filter((row) => row.application_type === "CREATE_DRAFT").length,
    UPDATE_EXISTING: applications.filter((row) => row.application_type === "UPDATE_EXISTING").length,
  };
  const claims = execute(target, `SELECT c.cluster_id,c.finding_id,c.canonical_entity_id,c.claimed_at,
      f.entity_type,f.finding_type,f.source_id,f.canonical_entity_id AS finding_canonical_entity_id,
      f.canonical_entity_key AS finding_canonical_entity_key
    FROM automation_cluster_canonical_claims c
    JOIN automation_findings f ON f.id=c.finding_id
    ORDER BY c.cluster_id`);
  const linkedClusters = clusterAudit(target);
  const draftFindings = execute(target, `SELECT DISTINCT
      f.id,f.source_id,s.source_key,f.observation_id,o.source_record_id,f.entity_type,f.finding_type,
      f.canonical_entity_id,f.canonical_entity_key,f.source_url,f.payload_hash,f.review_status,
      a.id AS application_id,a.application_type,a.canonical_entity_id AS application_canonical_entity_id
    FROM automation_findings f
    JOIN automation_sources s ON s.id=f.source_id
    LEFT JOIN automation_observations o ON o.id=f.observation_id
    LEFT JOIN automation_applications a ON a.finding_id=f.id
    WHERE f.finding_type IN ('NEW_ENTITY','DUPLICATE_CANDIDATE')
      AND (f.canonical_entity_id IS NOT NULL OR a.application_type='CREATE_DRAFT')
    ORDER BY f.id`);
  const applicationFk = execute(target, `PRAGMA foreign_key_list('automation_applications')`);

  const blockers = {
    nonStaleRunningRuns: runningRuns.filter((run) => !run.staleByPolicy).length,
    updateExistingApplications: applicationsByType.UPDATE_EXISTING,
    missingReceiptIdentity: applications.filter((row) =>
      row.application_type === "CREATE_DRAFT" && !String(row.source_record_id ?? "").trim()).length,
    canonicalMissingForCreateDraft: applications.filter((row) =>
      row.application_type === "CREATE_DRAFT" && row.canonicalStatus?.exists !== true).length,
    persistentMatchMemoryClusters: linkedClusters.filter((cluster) =>
      cluster.classification === "B_PREEXISTING_CANONICAL_MATCH_KEEP").length,
  };

  return {
    mode: "preview",
    stalePolicyMinutes: STALE_RUN_MS / 60_000,
    staleBefore,
    runningRuns,
    applicationsByType,
    applications,
    claims,
    linkedClusters,
    draftFindings,
    applicationFk,
    receiptCount: scalar(target, "SELECT COUNT(*) AS count FROM automation_ingestion_receipts"),
    canonicalDraftFlagCount: scalar(target, "SELECT COUNT(*) AS count FROM canonical_draft_flags"),
    canonical: canonicalSnapshot(target),
    blockers,
    applyAllowed: Object.values(blockers).every((count) => count === 0),
  };
}

function recoverStaleRuns(target, previewReport, now) {
  const stale = previewReport.runningRuns.filter((run) => run.staleByPolicy);
  for (const run of stale) {
    execute(target, `UPDATE automation_runs SET
        status='FAILED',
        completed_at=${quote(now.toISOString())},
        error_count=CASE WHEN error_count < 1 THEN 1 ELSE error_count END,
        error_summary=COALESCE(error_summary,'stale_run_recovered')
      WHERE id=${Number(run.id)} AND status='RUNNING'`);
  }
  return stale.map((run) => Number(run.id));
}

function backfillCreateDraft(target, row) {
  const sourceRecordId = String(row.source_record_id ?? "").trim();
  invariant(sourceRecordId, `CREATE_DRAFT application ${row.id} has no stable source_record_id`);
  invariant(row.canonicalStatus?.exists === true, `CREATE_DRAFT application ${row.id} canonical row is missing`);

  execute(target, `INSERT INTO automation_ingestion_receipts
      (source_id,entity_type,source_record_id,source_url,payload_hash,result,first_processed_at)
    VALUES (
      ${Number(row.source_id)},
      ${quote(row.entity_type)},
      ${quote(sourceRecordId)},
      ${quote(row.observation_source_url ?? row.finding_source_url ?? null)},
      ${quote(row.payload_hash ?? null)},
      'DRAFT_CREATED',
      ${quote(row.applied_at)}
    )
    ON CONFLICT(source_id,entity_type,source_record_id) DO NOTHING`);

  if (row.finding_type === "DUPLICATE_CANDIDATE") {
    const details = JSON.stringify({
      candidateIds: possibleDuplicateCandidateIds(target, row.reason, row.canonical_entity_id),
      sourceUrl: row.observation_source_url ?? row.finding_source_url ?? null,
    });
    execute(target, `INSERT INTO canonical_draft_flags
        (entity_type,canonical_entity_id,flag_type,details_json,created_at)
      VALUES (
        ${quote(row.entity_type)},
        ${Number(row.canonical_entity_id)},
        'POSSIBLE_DUPLICATE',
        ${quote(details)},
        ${quote(row.applied_at)}
      )
      ON CONFLICT(entity_type,canonical_entity_id,flag_type)
      DO UPDATE SET details_json=excluded.details_json`);
  }

  execute(target, `DELETE FROM automation_cluster_canonical_claims WHERE finding_id=${Number(row.finding_id)}`);
  execute(target, `UPDATE automation_findings SET canonical_entity_id=NULL,canonical_entity_key=NULL
    WHERE id=${Number(row.finding_id)}`);
  execute(target, `DELETE FROM automation_applications
    WHERE id=${Number(row.id)} AND application_type='CREATE_DRAFT'`);
}

function detachClusterLinks(target, linkedClusters) {
  const detached = [];
  for (const cluster of linkedClusters) {
    invariant(cluster.classification !== "B_PREEXISTING_CANONICAL_MATCH_KEEP",
      `cluster ${cluster.id} has persistent manual match memory`);
    execute(target, `UPDATE automation_entity_clusters
      SET canonical_entity_id=NULL,canonical_entity_key=NULL
      WHERE id=${Number(cluster.id)}`);
    detached.push(Number(cluster.id));
  }
  return detached;
}

function apply(target, before, now = new Date()) {
  invariant(before.blockers.updateExistingApplications === 0,
    "UPDATE_EXISTING automation_applications exist; detach apply is intentionally blocked");
  invariant(before.blockers.missingReceiptIdentity === 0, "CREATE_DRAFT receipt identity is incomplete");
  invariant(before.blockers.canonicalMissingForCreateDraft === 0, "CREATE_DRAFT canonical row is missing");
  invariant(before.blockers.persistentMatchMemoryClusters === 0, "persistent cluster match memory requires manual review");

  const canonicalBefore = canonicalSnapshot(target);
  const recoveredStaleRunIds = recoverStaleRuns(target, before, now);
  const remainingRunning = scalar(target, "SELECT COUNT(*) AS count FROM automation_runs WHERE status='RUNNING'");
  invariant(remainingRunning === 0, "a non-stale automation run is still active; destructive detach stopped");

  const createRows = before.applications.filter((row) => row.application_type === "CREATE_DRAFT");
  for (const row of createRows) backfillCreateDraft(target, row);
  const detachedClusterIds = detachClusterLinks(target, before.linkedClusters);

  invariant(scalar(target, "SELECT COUNT(*) AS count FROM automation_applications WHERE application_type='CREATE_DRAFT'") === 0,
    "CREATE_DRAFT automation applications remain after detach");
  invariant(scalar(target, "SELECT COUNT(*) AS count FROM automation_cluster_canonical_claims") === 0,
    "cluster canonical claims remain after detach");
  invariant(scalar(target, "SELECT COUNT(*) AS count FROM automation_entity_clusters WHERE canonical_entity_id IS NOT NULL OR canonical_entity_key IS NOT NULL") === 0,
    "canonical-linked clusters remain after detach");
  invariant(scalar(target, "SELECT COUNT(*) AS count FROM automation_findings WHERE finding_type IN ('NEW_ENTITY','DUPLICATE_CANDIDATE') AND (canonical_entity_id IS NOT NULL OR canonical_entity_key IS NOT NULL)") === 0,
    "draft findings retain canonical linkage after detach");

  const canonicalAfter = canonicalSnapshot(target);
  invariant(JSON.stringify(canonicalAfter) === JSON.stringify(canonicalBefore), "canonical content row counts changed during detach");

  return {
    mode: "apply",
    recoveredStaleRunIds,
    detachedCreateDraftApplicationIds: createRows.map((row) => Number(row.id)),
    detachedClusterIds,
    canonicalBefore,
    canonicalAfter,
    receiptCountAfter: scalar(target, "SELECT COUNT(*) AS count FROM automation_ingestion_receipts"),
    canonicalDraftFlagCountAfter: scalar(target, "SELECT COUNT(*) AS count FROM canonical_draft_flags"),
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
  console.log(JSON.stringify(preview(target), null, 2));
}

export { preview, apply, possibleDuplicateCandidateIds };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
