import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_TARGET_MIGRATION = "0062_profile_reviews_foundation.sql";

export const REVIEW_TABLES = Object.freeze([
  "review_authors",
  "review_auth_notification_outbox",
  "profile_reviews",
  "profile_review_rating_values",
  "profile_review_provider_replies",
  "profile_review_helpful_votes",
  "profile_review_reports",
]);

export const REVIEW_INDEXES = Object.freeze([
  "directory_profiles_archive_idx",
  "review_authors_email_hash_unique",
  "review_authors_status_updated_idx",
  "review_auth_notification_dedupe_unique",
  "review_auth_notification_status_expiry_idx",
  "review_auth_notification_author_created_idx",
  "profile_reviews_resource_author_unique",
  "profile_reviews_resource_status_created_idx",
  "profile_reviews_resource_status_rating_idx",
  "profile_reviews_author_created_idx",
  "profile_reviews_status_created_idx",
  "profile_review_rating_values_review_dimension_unique",
  "profile_review_rating_values_review_idx",
  "profile_review_rating_values_dimension_idx",
  "profile_review_provider_replies_review_unique",
  "profile_review_provider_replies_account_created_idx",
  "profile_review_helpful_votes_review_author_unique",
  "profile_review_helpful_votes_review_created_idx",
  "profile_review_helpful_votes_author_created_idx",
  "profile_review_reports_review_author_unique",
  "profile_review_reports_review_partner_unique",
  "profile_review_reports_reply_author_unique",
  "profile_review_reports_reply_partner_unique",
  "profile_review_reports_status_created_idx",
  "profile_review_reports_review_status_idx",
]);

export const REVIEW_TRIGGERS = Object.freeze([
  "profile_reviews_reviewable_resource_insert",
  "profile_reviews_resource_immutable",
  "moderation_events_no_update",
  "moderation_events_no_delete",
]);

export const SUPPORTED_PRODUCTION_TARGETS = Object.freeze([
  "0062_profile_reviews_foundation.sql",
  "0063_partner_claims_verification.sql",
  "0064_geo_foundation.sql",
]);

export const PARTNER_CLAIM_TABLES = Object.freeze([
  "partner_claims",
  "partner_resource_verifications",
]);

export const PARTNER_CLAIM_INDEXES = Object.freeze([
  "partner_claims_pending_unique",
  "partner_claims_status_created_idx",
  "partner_claims_account_created_idx",
  "partner_claims_resource_status_idx",
  "partner_resource_verifications_account_resource_unique",
  "partner_resource_verifications_status_submitted_idx",
  "partner_resource_verifications_resource_status_idx",
  "partner_notification_outbox_dedupe_unique",
  "partner_notification_outbox_status_expiry_idx",
  "partner_notification_outbox_account_created_idx",
  "partner_audit_target_created_idx",
  "partner_audit_actor_created_idx",
]);

export const PARTNER_CLAIM_TRIGGERS = Object.freeze([
  "partner_audit_events_no_update",
  "partner_audit_events_no_delete",
]);

export const GEO_INDEXES = Object.freeze([
  "geo_points_directory_unique",
  "geo_points_organization_location_unique",
  "geo_points_event_unique",
  "geo_points_status_updated_idx",
  "geo_points_public_spatial_idx",
  "geo_points_provider_query_idx",
]);

export const SENSITIVE_DIRECTORY_CATEGORIES = Object.freeze([
  "chovatelske-stanice",
  "chovatelske-kluby",
  "treneri",
  "vencenie",
  "kynologicke-kluby",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function migrationIndex(fileName) {
  const match = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.exec(fileName);
  invariant(match, `Invalid migration filename: ${fileName}`);
  return Number(match[1]);
}

export function selectMigrationsThrough(fileNames, targetMigration = DEFAULT_TARGET_MIGRATION) {
  const targetIndex = migrationIndex(targetMigration);
  const migrations = fileNames
    .filter((name) => /^\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.test(name))
    .sort((a, b) => migrationIndex(a) - migrationIndex(b));
  invariant(migrations.includes(targetMigration), `Target migration is missing: ${targetMigration}`);
  const selected = migrations.filter((name) => migrationIndex(name) <= targetIndex);
  for (let index = 0; index <= targetIndex; index += 1) {
    invariant(
      selected.some((name) => migrationIndex(name) === index),
      `Migration chain has a gap before target: ${String(index).padStart(4, "0")}`,
    );
  }
  return Object.freeze({
    targetIndex,
    selected,
    excludedFuture: migrations.filter((name) => migrationIndex(name) > targetIndex),
  });
}

export function buildScopedWranglerConfig(generatedConfig, resources) {
  const canonical = resources?.d1;
  invariant(canonical?.binding, "Canonical D1 binding is missing");
  invariant(canonical?.database_name, "Canonical D1 database_name is missing");
  invariant(canonical?.database_id, "Canonical D1 database_id is missing");

  const bindings = Array.isArray(generatedConfig?.d1_databases) ? generatedConfig.d1_databases : [];
  const binding = bindings.find((entry) => entry?.binding === canonical.binding);
  invariant(binding, `Generated Wrangler config is missing D1 binding ${canonical.binding}`);
  invariant(binding.database_name === canonical.database_name, "Generated D1 database_name does not match canonical config");
  invariant(binding.database_id === canonical.database_id, "Generated D1 database_id does not match canonical config");

  return {
    ...generatedConfig,
    d1_databases: bindings.map((entry) => entry?.binding === canonical.binding
      ? { ...entry, migrations_dir: "./migrations" }
      : entry),
  };
}

function parseJsonOutput(output, label) {
  const text = output.trim();
  if (!text) throw new Error(`${label} returned empty output`);
  try {
    return JSON.parse(text);
  } catch {
    const starts = [text.indexOf("["), text.indexOf("{")].filter((index) => index >= 0).sort((a, b) => a - b);
    for (const start of starts) {
      for (const endChar of ["]", "}"]) {
        const end = text.lastIndexOf(endChar);
        if (end <= start) continue;
        try {
          return JSON.parse(text.slice(start, end + 1));
        } catch {
          // Try the next candidate.
        }
      }
    }
  }
  throw new Error(`${label} did not return parseable JSON`);
}

function rowsFromD1Json(payload) {
  const batches = Array.isArray(payload) ? payload : [payload];
  return batches.flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

function findStringByKey(value, key) {
  if (!value || typeof value !== "object") return null;
  if (typeof value[key] === "string" && value[key]) return value[key];
  for (const child of Object.values(value)) {
    const found = findStringByKey(child, key);
    if (found) return found;
  }
  return null;
}

function stableHash(rows) {
  const normalized = rows
    .map((row) => JSON.stringify(row, Object.keys(row).sort()))
    .sort()
    .join("\n");
  return createHash("sha256").update(normalized).digest("hex");
}

function runWrangler(args, { capture = false, env = process.env } = {}) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["wrangler", ...args], {
    encoding: "utf8",
    env: {
      ...env,
      WRANGLER_SEND_METRICS: "false",
      NO_UPDATE_NOTIFIER: "1",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    throw new Error(`wrangler ${args.slice(0, 3).join(" ")} failed with exit code ${result.status}: ${stderr || "<no stderr>"}`);
  }
  if (!capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return result.stdout ?? "";
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
}

function assertCredentialContract(resources) {
  invariant(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required from the protected production environment");
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID is required from the protected production environment");
  invariant(resources.account_id, "config/cloudflare-resources.json must declare canonical account_id");
  invariant(
    process.env.CLOUDFLARE_ACCOUNT_ID === resources.account_id,
    `Cloudflare account mismatch: expected ${resources.account_id}, received a different account`,
  );
}

async function migrationFileNames() {
  const entries = await fs.readdir(path.join(repoRoot, "drizzle"), { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql")).map((entry) => entry.name);
}

export async function prepareScopedMigration({ targetMigration = DEFAULT_TARGET_MIGRATION } = {}) {
  invariant(SUPPORTED_PRODUCTION_TARGETS.includes(targetMigration), `Unsupported production migration target: ${targetMigration}`);
  const [files, resources, generated] = await Promise.all([
    migrationFileNames(),
    readJson("config/cloudflare-resources.json"),
    readJson("dist/server/wrangler.json"),
  ]);
  const selection = selectMigrationsThrough(files, targetMigration);
  const scopedConfig = buildScopedWranglerConfig(generated, resources);
  const workDir = path.join(repoRoot, ".production-d1");
  await fs.mkdir(workDir, { recursive: true });
  const scopedDir = await fs.mkdtemp(path.join(workDir, "scoped-"));
  const migrationsDir = path.join(scopedDir, "migrations");
  await fs.mkdir(migrationsDir, { recursive: true });
  for (const fileName of selection.selected) {
    await fs.copyFile(path.join(repoRoot, "drizzle", fileName), path.join(migrationsDir, fileName));
  }
  await fs.writeFile(path.join(scopedDir, "wrangler.json"), `${JSON.stringify(scopedConfig, null, 2)}\n`);
  await fs.writeFile(path.join(workDir, "manifest.json"), `${JSON.stringify({
    targetMigration,
    targetIndex: selection.targetIndex,
    includedMigrations: selection.selected,
    excludedFutureMigrations: selection.excludedFuture,
    databaseName: resources.d1.database_name,
    databaseId: resources.d1.database_id,
    accountId: resources.account_id,
    workerName: generated.name ?? null,
  }, null, 2)}\n`);
  return { resources, generated, selection, workDir, scopedDir, configPath: path.join(scopedDir, "wrangler.json") };
}

function d1Execute(databaseName, configPath, sql) {
  const output = runWrangler([
    "d1", "execute", databaseName,
    "--remote",
    "--config", configPath,
    "--command", sql,
    "--json",
  ], { capture: true });
  return rowsFromD1Json(parseJsonOutput(output, "wrangler d1 execute"));
}

function scalarCount(databaseName, configPath, sql) {
  const rows = d1Execute(databaseName, configPath, sql);
  return Number(rows[0]?.count ?? 0);
}

function schemaState(databaseName, configPath) {
  const columns = d1Execute(databaseName, configPath, "PRAGMA table_info('directory_profiles')");
  const objects = d1Execute(
    databaseName,
    configPath,
    "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name",
  );
  return { columns, objects };
}

function objectMap(objects) {
  return new Map(objects.map((row) => [String(row.name), row]));
}

function assertFoundationSchema(schema) {
  const names = objectMap(schema.objects);
  invariant(schema.columns.some((column) => column.name === "archived_at"), "directory_profiles.archived_at is missing");
  for (const table of REVIEW_TABLES) invariant(names.get(table)?.type === "table", `Missing review table: ${table}`);
  for (const index of REVIEW_INDEXES) invariant(names.get(index)?.type === "index", `Missing review index: ${index}`);
  for (const trigger of REVIEW_TRIGGERS) invariant(names.get(trigger)?.type === "trigger", `Missing review trigger: ${trigger}`);

  const reviewsSql = String(names.get("profile_reviews")?.sql ?? "");
  const ratingSql = String(names.get("profile_review_rating_values")?.sql ?? "");
  const reportSql = String(names.get("profile_review_reports")?.sql ?? "");
  const reviewableTriggerSql = String(names.get("profile_reviews_reviewable_resource_insert")?.sql ?? "");
  invariant(reviewsSql.includes("BETWEEN 1 AND 5"), "profile_reviews rating bounds constraint is missing");
  invariant(reviewsSql.includes("length(\`body\`) BETWEEN 20 AND 5000"), "profile_reviews body bounds constraint is missing");
  invariant(ratingSql.includes("BETWEEN 1 AND 5"), "rating dimension bounds constraint is missing");
  invariant(reportSql.includes("target_type"), "profile_review_reports target constraint foundation is missing");
  invariant(
    reviewableTriggerSql.includes("DIRECTORY_PROFILE") && reviewableTriggerSql.includes("HELP_ORGANIZATION"),
    "reviewable-resource trigger does not enforce the supported entity types",
  );
}


function targetSchemaObjects(schema, targetMigration) {
  const names = objectMap(schema.objects);
  if (targetMigration === "0062_profile_reviews_foundation.sql") {
    return {
      partial: schema.columns.some((column) => column.name === "archived_at")
        || REVIEW_TABLES.some((table) => names.has(table))
        || names.has("directory_profiles_archive_idx"),
    };
  }
  if (targetMigration === "0063_partner_claims_verification.sql") {
    return {
      partial: PARTNER_CLAIM_TABLES.some((table) => names.has(table))
        || PARTNER_CLAIM_INDEXES.slice(0, 7).some((index) => names.has(index)),
    };
  }
  if (targetMigration === "0064_geo_foundation.sql") {
    return {
      partial: names.has("geo_points") || GEO_INDEXES.some((index) => names.has(index)),
    };
  }
  throw new Error(`Unsupported production migration target: ${targetMigration}`);
}

function assertPartnerClaimsSchema(schema) {
  const names = objectMap(schema.objects);
  for (const table of PARTNER_CLAIM_TABLES) invariant(names.get(table)?.type === "table", `Missing partner claim table: ${table}`);
  for (const index of PARTNER_CLAIM_INDEXES) invariant(names.get(index)?.type === "index", `Missing partner claim index: ${index}`);
  for (const trigger of PARTNER_CLAIM_TRIGGERS) invariant(names.get(trigger)?.type === "trigger", `Missing partner audit trigger: ${trigger}`);

  const outboxSql = String(names.get("partner_notification_outbox")?.sql ?? "");
  const auditSql = String(names.get("partner_audit_events")?.sql ?? "");
  invariant(outboxSql.includes("CLAIM_SUBMITTED"), "partner_notification_outbox does not allow claim notifications");
  invariant(outboxSql.includes("VERIFICATION_APPROVED"), "partner_notification_outbox does not allow verification notifications");
  invariant(auditSql.includes("CLAIM_SUBMITTED"), "partner_audit_events does not allow claim audit actions");
  invariant(auditSql.includes("VERIFICATION_REQUESTED"), "partner_audit_events does not allow verification audit actions");
}

function assertGeoFoundationSchema(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("geo_points")?.type === "table", "Missing geo_points table");
  for (const index of GEO_INDEXES) invariant(names.get(index)?.type === "index", `Missing geo index: ${index}`);
  const geoSql = String(names.get("geo_points")?.sql ?? "");
  invariant(geoSql.includes("DIRECTORY_PROFILE"), "geo_points target constraint is missing DIRECTORY_PROFILE");
  invariant(geoSql.includes("ORGANIZATION_LOCATION"), "geo_points target constraint is missing ORGANIZATION_LOCATION");
  invariant(geoSql.includes("MANAGED_EVENT"), "geo_points target constraint is missing MANAGED_EVENT");
  invariant(geoSql.includes("APPROXIMATE_PUBLIC"), "geo_points public visibility constraint is incomplete");
  invariant(geoSql.includes("resolved_source_fingerprint"), "geo_points resolved fingerprint column is missing");
  invariant(!/lost_found/i.test(geoSql), "generic geo_points schema must not contain lost/found private location data");
}

function assertTargetSchema(schema, targetMigration) {
  assertFoundationSchema(schema);
  if (migrationIndex(targetMigration) >= 63) assertPartnerClaimsSchema(schema);
  if (migrationIndex(targetMigration) >= 64) assertGeoFoundationSchema(schema);
}

function migrationHistory(databaseName, configPath) {
  return d1Execute(databaseName, configPath, "SELECT id,name,applied_at FROM d1_migrations ORDER BY id");
}

function dataSnapshot(databaseName, configPath) {
  const directoryProfiles = scalarCount(databaseName, configPath, "SELECT COUNT(*) AS count FROM directory_profiles");
  const helpOrganizations = scalarCount(databaseName, configPath, "SELECT COUNT(*) AS count FROM help_organizations");
  const partnerResources = scalarCount(databaseName, configPath, "SELECT COUNT(*) AS count FROM partner_resources");
  const partnerMemberships = scalarCount(databaseName, configPath, "SELECT COUNT(*) AS count FROM partner_memberships");
  const missingDirectoryAnchors = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM directory_profiles d WHERE NOT EXISTS (SELECT 1 FROM partner_resources r WHERE r.directory_profile_id=d.id)");
  const missingOrganizationAnchors = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM help_organizations o WHERE NOT EXISTS (SELECT 1 FROM partner_resources r WHERE r.help_organization_id=o.id)");
  const duplicateDirectoryAnchors = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM (SELECT directory_profile_id FROM partner_resources WHERE directory_profile_id IS NOT NULL GROUP BY directory_profile_id HAVING COUNT(*)>1)");
  const duplicateOrganizationAnchors = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM (SELECT help_organization_id FROM partner_resources WHERE help_organization_id IS NOT NULL GROUP BY help_organization_id HAVING COUNT(*)>1)");
  const orphanedResources = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM partner_resources r WHERE (r.directory_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM directory_profiles d WHERE d.id=r.directory_profile_id)) OR (r.help_organization_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM help_organizations o WHERE o.id=r.help_organization_id)) OR (r.managed_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM managed_events e WHERE e.id=r.managed_event_id))");
  const typeCounts = d1Execute(databaseName, configPath,
    "SELECT entity_type,COUNT(*) AS count FROM partner_resources GROUP BY entity_type ORDER BY entity_type");
  const resourceRows = d1Execute(databaseName, configPath,
    "SELECT id,entity_type,directory_profile_id,help_organization_id,managed_event_id FROM partner_resources ORDER BY id");
  const membershipRows = d1Execute(databaseName, configPath,
    "SELECT id,resource_id,role,revoked_at FROM partner_memberships ORDER BY id");

  return {
    directoryProfiles,
    helpOrganizations,
    partnerResources,
    partnerMemberships,
    missingDirectoryAnchors,
    missingOrganizationAnchors,
    duplicateDirectoryAnchors,
    duplicateOrganizationAnchors,
    orphanedResources,
    typeCounts,
    resourceRows,
    membershipRows,
    resourceDigest: stableHash(resourceRows),
    membershipDigest: stableHash(membershipRows),
  };
}

function safeCounts(snapshot) {
  return {
    directoryProfiles: snapshot.directoryProfiles,
    helpOrganizations: snapshot.helpOrganizations,
    partnerResources: snapshot.partnerResources,
    partnerMemberships: snapshot.partnerMemberships,
    missingDirectoryAnchors: snapshot.missingDirectoryAnchors,
    missingOrganizationAnchors: snapshot.missingOrganizationAnchors,
    duplicateDirectoryAnchors: snapshot.duplicateDirectoryAnchors,
    duplicateOrganizationAnchors: snapshot.duplicateOrganizationAnchors,
    orphanedResources: snapshot.orphanedResources,
    typeCounts: snapshot.typeCounts,
    resourceDigest: snapshot.resourceDigest,
    membershipDigest: snapshot.membershipDigest,
  };
}

function targetState(history, schema, targetMigration) {
  invariant(SUPPORTED_PRODUCTION_TARGETS.includes(targetMigration), `Unsupported production migration target: ${targetMigration}`);
  const targetIndex = migrationIndex(targetMigration);
  const historyNames = history.map((row) => String(row.name));
  const indexes = historyNames.map((name) => {
    try { return migrationIndex(name); } catch { return -1; }
  });
  const latestIndex = indexes.length ? Math.max(...indexes) : -1;
  const targetApplied = historyNames.includes(targetMigration);
  const targetObjects = targetSchemaObjects(schema, targetMigration);

  if (!targetApplied) {
    invariant(latestIndex === targetIndex - 1,
      `Target ${targetMigration} is pending, but latest applied migration is ${latestIndex < 0 ? "<unknown>" : String(latestIndex).padStart(4, "0")}; expected exactly ${String(targetIndex - 1).padStart(4, "0")}`);
    invariant(!targetObjects.partial,
      `Migration ${String(targetIndex).padStart(4, "0")} is not recorded, but target schema objects already exist; possible partial/manual drift`);
    if (targetIndex > 62) assertFoundationSchema(schema);
    if (targetIndex > 63) assertPartnerClaimsSchema(schema);
  } else {
    assertTargetSchema(schema, targetMigration);
  }

  return { historyNames, latestIndex, targetApplied };
}

function assertProductionIdentity(resources, generated, infoPayload) {
  invariant(generated.name === "psipedia-sk", `Unexpected Worker name: ${generated.name ?? "<missing>"}`);
  const serialized = JSON.stringify(infoPayload);
  invariant(serialized.includes(resources.d1.database_id), "D1 info does not match canonical database_id");
  invariant(serialized.includes(resources.d1.database_name), "D1 info does not match canonical database_name");
}

async function remoteInfo(databaseName, configPath) {
  const output = runWrangler(["d1", "info", databaseName, "--config", configPath, "--json"], { capture: true });
  return parseJsonOutput(output, "wrangler d1 info");
}

async function recoveryBookmark(databaseName, configPath) {
  const output = runWrangler(["d1", "time-travel", "info", databaseName, "--config", configPath, "--json"], { capture: true });
  const payload = parseJsonOutput(output, "wrangler d1 time-travel info");
  const bookmark = findStringByKey(payload, "bookmark");
  invariant(bookmark, "D1 Time Travel did not return a recovery bookmark; refusing production mutation");
  return bookmark;
}

async function writeJson(relativePath, value) {
  const target = path.join(repoRoot, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function preflight(targetMigration) {
  const prepared = await prepareScopedMigration({ targetMigration });
  assertCredentialContract(prepared.resources);
  const databaseName = prepared.resources.d1.database_name;
  const [info, history] = await Promise.all([
    remoteInfo(databaseName, prepared.configPath),
    Promise.resolve(migrationHistory(databaseName, prepared.configPath)),
  ]);
  assertProductionIdentity(prepared.resources, prepared.generated, info);
  const schema = schemaState(databaseName, prepared.configPath);
  const state = targetState(history, schema, targetMigration);
  const snapshot = dataSnapshot(databaseName, prepared.configPath);

  invariant(snapshot.duplicateDirectoryAnchors === 0, "Duplicate directory canonical resources detected");
  invariant(snapshot.duplicateOrganizationAnchors === 0, "Duplicate organization canonical resources detected");
  invariant(snapshot.orphanedResources === 0, "Orphaned canonical resources detected");

  const bookmark = await recoveryBookmark(databaseName, prepared.configPath);
  const pending = runWrangler([
    "d1", "migrations", "list", databaseName,
    "--remote",
    "--config", prepared.configPath,
  ], { capture: true }).trim();

  const internal = {
    targetMigration,
    targetIndex: prepared.selection.targetIndex,
    targetApplied: state.targetApplied,
    latestAppliedIndex: state.latestIndex,
    historyNames: state.historyNames,
    databaseName,
    databaseId: prepared.resources.d1.database_id,
    accountId: prepared.resources.account_id,
    workerName: prepared.generated.name,
    recoveryBookmark: bookmark,
    before: snapshot,
  };
  await writeJson(".production-d1/preflight-internal.json", internal);
  await writeJson(".production-d1/preflight-report.json", {
    targetMigration,
    targetApplied: state.targetApplied,
    latestAppliedMigration: state.historyNames.at(-1) ?? null,
    repositoryExcludedFutureMigrations: prepared.selection.excludedFuture,
    databaseName,
    databaseId: prepared.resources.d1.database_id,
    accountId: prepared.resources.account_id,
    workerName: prepared.generated.name,
    recoveryMechanism: "D1 Time Travel",
    recoveryBookmark: bookmark,
    counts: safeCounts(snapshot),
    pendingScopedMigrations: pending.split(/\r?\n/).filter(Boolean),
    schemaDrift: false,
  });

  console.log(`[production-d1] preflight PASS — target=${targetMigration}; applied=${state.targetApplied}; latest=${state.historyNames.at(-1) ?? "<none>"}`);
  console.log(`[production-d1] target DB — account=${prepared.resources.account_id}; name=${databaseName}; id=${prepared.resources.d1.database_id}; worker=${prepared.generated.name}`);
  console.log(`[production-d1] recovery bookmark — ${bookmark}`);
  console.log(`[production-d1] counts — directory=${snapshot.directoryProfiles}; organizations=${snapshot.helpOrganizations}; resources=${snapshot.partnerResources}; memberships=${snapshot.partnerMemberships}; missingDirectory=${snapshot.missingDirectoryAnchors}; missingOrganizations=${snapshot.missingOrganizationAnchors}`);
}

async function apply(targetMigration) {
  const prepared = await prepareScopedMigration({ targetMigration });
  assertCredentialContract(prepared.resources);
  const internal = await readJson(".production-d1/preflight-internal.json");
  invariant(internal.targetMigration === targetMigration, "Preflight target does not match requested target");
  invariant(internal.databaseId === prepared.resources.d1.database_id, "Preflight database does not match canonical target");
  if (internal.targetApplied) {
    console.log(`[production-d1] ${targetMigration} is already applied; apply is a no-op`);
    return;
  }
  runWrangler([
    "d1", "migrations", "apply", prepared.resources.d1.database_name,
    "--remote",
    "--config", prepared.configPath,
  ]);
}

function assertPreservedResources(beforeRows, afterRows) {
  const after = new Map(afterRows.map((row) => [row.id, row]));
  for (const row of beforeRows) {
    invariant(after.has(row.id), `Existing canonical resource disappeared: ${row.id}`);
    invariant(JSON.stringify(after.get(row.id)) === JSON.stringify(row), `Existing canonical resource identity changed: ${row.id}`);
  }
}

async function verify(targetMigration) {
  const prepared = await prepareScopedMigration({ targetMigration });
  assertCredentialContract(prepared.resources);
  const internal = await readJson(".production-d1/preflight-internal.json");
  invariant(internal.targetMigration === targetMigration, "Preflight target does not match verification target");
  const databaseName = prepared.resources.d1.database_name;
  const history = migrationHistory(databaseName, prepared.configPath);
  const schema = schemaState(databaseName, prepared.configPath);
  const state = targetState(history, schema, targetMigration);
  invariant(state.targetApplied, `Target migration is still not recorded as applied: ${targetMigration}`);
  assertTargetSchema(schema, targetMigration);

  const after = dataSnapshot(databaseName, prepared.configPath);
  const before = internal.before;
  invariant(after.directoryProfiles === before.directoryProfiles, "directory_profiles count changed unexpectedly");
  invariant(after.helpOrganizations === before.helpOrganizations, "help_organizations count changed unexpectedly");
  invariant(after.partnerMemberships === before.partnerMemberships, "partner_memberships count changed unexpectedly");
  invariant(after.membershipDigest === before.membershipDigest, "Partner memberships changed unexpectedly");
  invariant(after.missingDirectoryAnchors === 0, "Directory profiles without canonical resource anchor remain");
  invariant(after.missingOrganizationAnchors === 0, "Help organizations without canonical resource anchor remain");
  invariant(after.duplicateDirectoryAnchors === 0, "Duplicate directory canonical resources detected after migration");
  invariant(after.duplicateOrganizationAnchors === 0, "Duplicate organization canonical resources detected after migration");
  invariant(after.orphanedResources === 0, "Orphaned canonical resources detected after migration");
  const expectedResourceCount = before.partnerResources + before.missingDirectoryAnchors + before.missingOrganizationAnchors;
  invariant(after.partnerResources === expectedResourceCount,
    `partner_resources count mismatch: expected ${expectedResourceCount}, got ${after.partnerResources}`);
  assertPreservedResources(before.resourceRows, after.resourceRows);

  if (!internal.targetApplied) {
    const beforeNames = new Set(internal.historyNames);
    const newlyApplied = state.historyNames.filter((name) => !beforeNames.has(name));
    invariant(
      newlyApplied.length === 1 && newlyApplied[0] === targetMigration,
      `Unexpected migrations applied with target: ${newlyApplied.join(", ") || "<none>"}`,
    );
  }

  const reviewCount = scalarCount(databaseName, prepared.configPath, "SELECT COUNT(*) AS count FROM profile_reviews");
  invariant(reviewCount === 0, "profile_reviews must remain empty in REVIEWS-1A-MIG; fake or unexpected reviews are not allowed");

  const targetIndex = migrationIndex(targetMigration);
  let geoFoundation = null;
  if (targetIndex >= 64) {
    const geoCount = scalarCount(databaseName, prepared.configPath, "SELECT COUNT(*) AS count FROM geo_points");
    if (!internal.targetApplied) invariant(geoCount === 0, "0064 is schema-only; geo_points must remain empty immediately after migration");
    geoFoundation = { geoCount, schemaOnlyMigration: true };
  }

  await writeJson(".production-d1/postflight-report.json", {
    targetMigration,
    applied: true,
    latestAppliedMigration: state.historyNames.at(-1) ?? null,
    databaseName,
    databaseId: prepared.resources.d1.database_id,
    accountId: prepared.resources.account_id,
    workerName: prepared.generated.name,
    verifiedTargetIndex: targetIndex,
    archivedAt: true,
    reviewTables: REVIEW_TABLES,
    reviewIndexes: REVIEW_INDEXES,
    reviewTriggers: REVIEW_TRIGGERS,
    reviewCount,
    partnerClaims: targetIndex >= 63 ? {
      tables: PARTNER_CLAIM_TABLES,
      indexes: PARTNER_CLAIM_INDEXES,
      triggers: PARTNER_CLAIM_TRIGGERS,
    } : null,
    geoFoundation,
    counts: safeCounts(after),
    dataIntegrity: "PASS",
    resourceBackfill: "PASS",
    unexpectedMigrationsApplied: false,
  });

  console.log(`[production-d1] verification PASS — ${targetMigration} applied; archived_at=yes; reviewTables=${REVIEW_TABLES.length}; reviewCount=0`);
  if (geoFoundation) console.log(`[production-d1] geo schema PASS — geo_points=${geoFoundation.geoCount}; schemaOnly=${geoFoundation.schemaOnlyMigration}`);
  console.log(`[production-d1] backfill PASS — missingDirectory=0; missingOrganizations=0; resources=${after.partnerResources}; memberships preserved=${after.partnerMemberships}`);
}


function geoReadinessSnapshot(databaseName, configPath) {
  const geoTotal = scalarCount(databaseName, configPath, "SELECT COUNT(*) AS count FROM geo_points");
  const geoByTarget = d1Execute(databaseName, configPath,
    "SELECT target_type,COUNT(*) AS count FROM geo_points GROUP BY target_type ORDER BY target_type");
  const geoByStatus = d1Execute(databaseName, configPath,
    "SELECT geocode_status,COUNT(*) AS count FROM geo_points GROUP BY geocode_status ORDER BY geocode_status");
  const geoByVisibility = d1Execute(databaseName, configPath,
    "SELECT COALESCE(public_visibility,'UNCLASSIFIED') AS public_visibility,COUNT(*) AS count FROM geo_points GROUP BY COALESCE(public_visibility,'UNCLASSIFIED') ORDER BY public_visibility");
  const publicResolvedCurrent = scalarCount(databaseName, configPath, `
    SELECT COUNT(*) AS count FROM geo_points
    WHERE public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
      AND geocode_status='RESOLVED'
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND resolved_source_fingerprint IS NOT NULL
      AND source_fingerprint=resolved_source_fingerprint
  `);
  const sensitiveExactPublic = scalarCount(databaseName, configPath, `
    SELECT COUNT(*) AS count
    FROM geo_points g JOIN directory_profiles d ON d.id=g.directory_profile_id
    WHERE g.target_type='DIRECTORY_PROFILE'
      AND g.public_visibility='EXACT_PUBLIC'
      AND g.geocode_status='RESOLVED'
      AND d.category IN ('${SENSITIVE_DIRECTORY_CATEGORIES.join("','")}')
  `);
  const legalSeatExactPublic = scalarCount(databaseName, configPath, `
    SELECT COUNT(*) AS count
    FROM geo_points g JOIN organization_locations l ON l.id=g.organization_location_id
    WHERE g.target_type='ORGANIZATION_LOCATION'
      AND l.role='LEGAL_SEAT'
      AND g.public_visibility='EXACT_PUBLIC'
      AND g.geocode_status='RESOLVED'
  `);
  const hiddenWithCoordinates = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM geo_points WHERE public_visibility='HIDDEN' AND (latitude IS NOT NULL OR longitude IS NOT NULL)");
  const unclassifiedWithCoordinates = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM geo_points WHERE public_visibility IS NULL AND (latitude IS NOT NULL OR longitude IS NOT NULL)");

  const sourceDirectory = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM directory_profiles WHERE status='published' AND archived_at IS NULL AND online=0");
  const sourceOrganizationLocations = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM organization_locations l JOIN help_organizations o ON o.id=l.organization_id WHERE o.status='PUBLISHED' AND o.archived_at IS NULL");
  const sourceEvents = scalarCount(databaseName, configPath,
    "SELECT COUNT(*) AS count FROM managed_events WHERE status='published' AND cancelled=0 AND region<>'Online' AND COALESCE(end_date,start_date) >= date('now')");

  return {
    schemaReady: true,
    geoTotal,
    geoByTarget,
    geoByStatus,
    geoByVisibility,
    publicResolvedCurrent,
    privacy: {
      sensitiveExactPublic,
      legalSeatExactPublic,
      hiddenWithCoordinates,
      unclassifiedWithCoordinates,
    },
    sources: {
      directoryProfiles: sourceDirectory,
      organizationLocations: sourceOrganizationLocations,
      activePhysicalEvents: sourceEvents,
      total: sourceDirectory + sourceOrganizationLocations + sourceEvents,
    },
  };
}

async function geoReadiness(targetMigration) {
  invariant(migrationIndex(targetMigration) >= 64, "Geo readiness requires target migration 0064 or later");
  const prepared = await prepareScopedMigration({ targetMigration });
  assertCredentialContract(prepared.resources);
  const databaseName = prepared.resources.d1.database_name;
  const history = migrationHistory(databaseName, prepared.configPath);
  const schema = schemaState(databaseName, prepared.configPath);
  const state = targetState(history, schema, "0064_geo_foundation.sql");
  invariant(state.targetApplied, "0064_geo_foundation.sql is not applied in production");
  assertTargetSchema(schema, "0064_geo_foundation.sql");

  const snapshot = geoReadinessSnapshot(databaseName, prepared.configPath);
  invariant(snapshot.privacy.sensitiveExactPublic === 0, "P1 privacy blocker: sensitive directory category has EXACT_PUBLIC resolved coordinates");
  invariant(snapshot.privacy.legalSeatExactPublic === 0, "P1 privacy blocker: LEGAL_SEAT has EXACT_PUBLIC resolved coordinates");
  invariant(snapshot.privacy.hiddenWithCoordinates === 0, "P1 privacy blocker: HIDDEN geo rows contain coordinates");
  invariant(snapshot.privacy.unclassifiedWithCoordinates === 0, "P1 privacy blocker: unclassified geo rows contain coordinates");

  const report = {
    checkedAt: new Date().toISOString(),
    targetMigration: "0064_geo_foundation.sql",
    databaseName,
    databaseId: prepared.resources.d1.database_id,
    ...snapshot,
    dataReady: snapshot.publicResolvedCurrent > 0,
    dataReadinessReason: snapshot.publicResolvedCurrent > 0 ? "PUBLIC_RESOLVED_ROWS_AVAILABLE" : "NO_PUBLIC_RESOLVED_ROWS",
  };
  await writeJson(".production-d1/geo-readiness-report.json", report);
  console.log(`[production-d1] geo readiness — sources=${snapshot.sources.total}; geoRows=${snapshot.geoTotal}; publicResolved=${snapshot.publicResolvedCurrent}; dataReady=${report.dataReady}`);
  return report;
}

async function runCli() {
  const command = process.argv[2];
  const targetMigration = process.env.TARGET_MIGRATION || DEFAULT_TARGET_MIGRATION;
  if (command === "prepare") {
    const prepared = await prepareScopedMigration({ targetMigration });
    console.log(`[production-d1] prepared ${prepared.selection.selected.length} migrations through ${targetMigration}; excluded future: ${prepared.selection.excludedFuture.join(", ") || "<none>"}`);
    return;
  }
  if (command === "preflight") return preflight(targetMigration);
  if (command === "apply") return apply(targetMigration);
  if (command === "verify") return verify(targetMigration);
  if (command === "geo-readiness") return geoReadiness(targetMigration);
  throw new Error("Usage: node scripts/production-d1-migrate.mjs <prepare|preflight|apply|verify|geo-readiness>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
