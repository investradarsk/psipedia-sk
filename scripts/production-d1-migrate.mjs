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
  "0065_partner_profile_changes.sql",
  "0066_partner_new_profile_submissions.sql",
  "0067_partner_events.sql",
  "0068_partner_commercial_activation.sql",
  "0069_partner_auth_onboarding_hardening.sql",
  "0070_partner_multimethod_auth.sql",
  "0071_admin_universal_notifications.sql",
  "0072_partner_media_uploads.sql",
  "0073_automation_multisource_entity_resolution.sql",
  "0074_directory_service_address.sql",
  "0075_automation_zsk_event_source.sql",
  "0076_automation_non_event_entity_resolution_foundation.sql",
  "0077_directory_geo_provider_result_id.sql",
  "0078_automation_possible_match_reviews.sql",
  "0079_automation_agility_event_source.sql",
  "0080_automation_canonical_apply.sql",
  "0081_automation_mushing_event_source.sql",
  "0082_automation_discovery_candidate_evidence.sql",
]);

export const AUTOMATION_ENTITY_RESOLUTION_TABLES = Object.freeze([
  "automation_source_authority",
  "automation_entity_clusters",
  "automation_cluster_observations",
  "automation_cluster_match_candidates",
  "automation_cluster_source_records",
  "automation_field_evidence",
  "automation_field_conflicts",
  "automation_cluster_findings",
  "automation_cluster_canonical_claims",
]);

export const AUTOMATION_CANONICAL_APPLY_INDEXES = Object.freeze([
  "automation_canonical_apply_operations_fingerprint_unique",
  "automation_canonical_apply_operations_entity_idx",
  "automation_canonical_apply_operations_review_idx",
]);

export const AUTOMATION_DISCOVERY_EVIDENCE_INDEXES = Object.freeze([
  "automation_source_candidate_evidence_identity_unique",
  "automation_source_candidate_evidence_candidate_idx",
  "automation_source_candidate_evidence_root_idx",
  "automation_source_candidate_evidence_run_idx",
  "automation_source_candidate_evidence_last_seen_idx",
]);

export const AUTOMATION_NON_EVENT_FOUNDATION_TABLES = Object.freeze([
  "automation_entity_candidate_keys",
]);

export const AUTOMATION_NON_EVENT_FOUNDATION_INDEXES = Object.freeze([
  "automation_entity_clusters_type_semantic_updated_idx",
  "automation_entity_candidate_keys_cluster_key_unique",
  "automation_entity_candidate_keys_lookup_idx",
]);

export const AUTOMATION_ENTITY_RESOLUTION_INDEXES = Object.freeze([
  "automation_entity_clusters_type_updated_idx",
  "automation_entity_clusters_canonical_unique",
  "automation_cluster_observation_unique",
  "automation_cluster_match_candidates_cluster_idx",
  "automation_cluster_source_records_cluster_idx",
  "automation_field_evidence_observation_field_unique",
  "automation_field_evidence_current_idx",
  "automation_field_evidence_source_record_idx",
  "automation_field_conflicts_open_unique",
  "automation_field_conflicts_status_idx",
  "automation_cluster_findings_finding_unique",
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

export const PARTNER_PROFILE_CHANGE_INDEXES = Object.freeze([
  "partner_profile_change_active_unique",
  "partner_profile_change_resource_created_idx",
  "partner_profile_change_account_created_idx",
]);

export const PARTNER_NEW_PROFILE_INDEXES = Object.freeze([
  "partner_new_profile_active_identity_unique",
  "partner_new_profile_account_created_idx",
  "partner_new_profile_duplicate_created_idx",
  "partner_new_profile_resolution_idx",
]);

export const PARTNER_EVENT_INDEXES = Object.freeze([
  "partner_event_submission_active_dedupe_unique",
  "partner_event_submission_resource_created_idx",
  "partner_event_submission_account_created_idx",
  "partner_event_submission_duplicate_created_idx",
  "partner_event_submission_resolution_idx",
]);

export const PARTNER_COMMERCIAL_INDEXES = Object.freeze([
  "partner_commercial_agreement_interest_active_unique",
  "partner_commercial_agreement_account_created_idx",
  "partner_commercial_agreement_resource_status_idx",
  "partner_commercial_agreement_payment_status_idx",
  "partner_commercial_promotion_provenance_unique",
  "partner_entitlement_agreement_type_unique",
  "partner_entitlement_current_resource_type_unique",
  "partner_entitlement_public_window_idx",
  "partner_entitlement_end_status_idx",
]);

export const PARTNER_CONTACT_PROFILE_INDEXES = Object.freeze([
  "partner_account_profiles_updated_idx",
]);

export const PARTNER_MULTIMETHOD_AUTH_TABLES = Object.freeze([
  "partner_password_credentials",
  "partner_auth_identities",
]);

export const PARTNER_MULTIMETHOD_AUTH_INDEXES = Object.freeze([
  "partner_auth_identities_provider_subject_unique",
  "partner_auth_identities_account_provider_unique",
]);

export const ADMIN_NOTIFICATION_TABLES = Object.freeze([
  "admin_notification_runtime",
  "admin_notification_events",
  "admin_push_event_deliveries",
]);

export const ADMIN_NOTIFICATION_INDEXES = Object.freeze([
  "admin_notification_events_dedupe_unique",
  "admin_notification_events_created_idx",
  "admin_push_event_deliveries_event_subscription_unique",
  "admin_push_event_deliveries_status_updated_idx",
]);

export const PARTNER_MEDIA_INDEXES = Object.freeze([
  "moderation_submissions_media_asset_unique",
]);

export const PARTNER_MEDIA_TRIGGERS = Object.freeze([
  "moderation_partner_media_submitter_guard",
  "moderation_partner_media_attach_guard",
  "moderation_partner_media_attach_state",
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

export function validateProductionTargetHistory(historyNames, expectedNames, targetMigration) {
  invariant(SUPPORTED_PRODUCTION_TARGETS.includes(targetMigration), `Unsupported production migration target: ${targetMigration}`);
  invariant(expectedNames.at(-1) === targetMigration, "Expected migration chain must end at the requested target");
  const targetIndex = migrationIndex(targetMigration);
  const indexes = historyNames.map((name) => {
    try { return migrationIndex(name); } catch { return -1; }
  });
  const latestIndex = indexes.length ? Math.max(...indexes) : -1;
  const targetApplied = historyNames.includes(targetMigration);
  if (targetApplied) {
    invariant(
      latestIndex === targetIndex,
      `Target ${targetMigration} is already applied, but production history continues through ${String(latestIndex).padStart(4, "0")}; refusing an older target`,
    );
  } else {
    invariant(
      latestIndex === targetIndex - 1,
      `Target ${targetMigration} is pending, but latest applied migration is ${latestIndex < 0 ? "<unknown>" : String(latestIndex).padStart(4, "0")}; expected exactly ${String(targetIndex - 1).padStart(4, "0")}`,
    );
  }
  const expectedHistory = targetApplied ? expectedNames : expectedNames.slice(0, -1);
  assertExactMigrationHistory(historyNames, expectedHistory, "Target history guard");
  return { latestIndex, targetApplied };
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
  const targetMigrationBytes = await fs.readFile(path.join(repoRoot, "drizzle", targetMigration));
  const targetMigrationSha256 = createHash("sha256").update(targetMigrationBytes).digest("hex");
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
    targetMigrationSha256,
    includedMigrations: selection.selected,
    excludedFutureMigrations: selection.excludedFuture,
    databaseName: resources.d1.database_name,
    databaseId: resources.d1.database_id,
    accountId: resources.account_id,
    workerName: generated.name ?? null,
  }, null, 2)}\n`);
  return { resources, generated, selection, targetMigrationSha256, workDir, scopedDir, configPath: path.join(scopedDir, "wrangler.json") };
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
  const eventNotionSyncColumns = d1Execute(databaseName, configPath, "PRAGMA table_info('event_notion_sync')");
  const partnerAccountColumns = d1Execute(databaseName, configPath, "PRAGMA table_info('partner_accounts')");
  const partnerSessionColumns = d1Execute(databaseName, configPath, "PRAGMA table_info('resource_management_sessions')");
  const partnerAccessTokenColumns = d1Execute(databaseName, configPath, "PRAGMA table_info('resource_access_tokens')");
  const partnerPasswordCredentialColumns = d1Execute(databaseName, configPath, "PRAGMA table_info('partner_password_credentials')");
  const partnerAuthIdentityColumns = d1Execute(databaseName, configPath, "PRAGMA table_info('partner_auth_identities')");
  const moderationSubmissionColumns = d1Execute(databaseName, configPath, "PRAGMA table_info('moderation_submissions')");
  const geoPointColumns = d1Execute(databaseName, configPath, "PRAGMA table_info('geo_points')");
  const partnerPasswordCredentialForeignKeys = d1Execute(databaseName, configPath, "PRAGMA foreign_key_list('partner_password_credentials')");
  const partnerAuthIdentityForeignKeys = d1Execute(databaseName, configPath, "PRAGMA foreign_key_list('partner_auth_identities')");
  const moderationSubmissionForeignKeys = d1Execute(databaseName, configPath, "PRAGMA foreign_key_list('moderation_submissions')");
  const objects = d1Execute(
    databaseName,
    configPath,
    "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name",
  );
  return {
    columns,
    eventNotionSyncColumns,
    partnerAccountColumns,
    partnerSessionColumns,
    partnerAccessTokenColumns,
    partnerPasswordCredentialColumns,
    partnerAuthIdentityColumns,
    moderationSubmissionColumns,
    geoPointColumns,
    partnerPasswordCredentialForeignKeys,
    partnerAuthIdentityForeignKeys,
    moderationSubmissionForeignKeys,
    objects,
  };
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
  const outboxSql = String(names.get("partner_notification_outbox")?.sql ?? "");
  const auditSql = String(names.get("partner_audit_events")?.sql ?? "");
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
  if (targetMigration === "0065_partner_profile_changes.sql") {
    return {
      partial: names.has("partner_profile_change_metadata")
        || PARTNER_PROFILE_CHANGE_INDEXES.some((index) => names.has(index))
        || outboxSql.includes("PROFILE_CHANGE_SUBMITTED")
        || auditSql.includes("PROFILE_CHANGE_SUBMITTED"),
    };
  }
  if (targetMigration === "0066_partner_new_profile_submissions.sql") {
    return {
      partial: names.has("partner_new_profile_metadata")
        || PARTNER_NEW_PROFILE_INDEXES.some((index) => names.has(index))
        || outboxSql.includes("NEW_PROFILE_SUBMITTED")
        || auditSql.includes("NEW_PROFILE_SUBMITTED"),
    };
  }
  if (targetMigration === "0067_partner_events.sql") {
    return {
      partial: names.has("partner_event_submission_metadata")
        || PARTNER_EVENT_INDEXES.some((index) => names.has(index))
        || schema.eventNotionSyncColumns.some((column) => column.name === "inbound_locked_at" || column.name === "inbound_lock_reason")
        || outboxSql.includes("EVENT_SUBMITTED")
        || auditSql.includes("EVENT_SUBMITTED"),
    };
  }
  if (targetMigration === "0068_partner_commercial_activation.sql") {
    return {
      partial: names.has("partner_commercial_agreements")
        || names.has("partner_entitlements")
        || PARTNER_COMMERCIAL_INDEXES.some((index) => names.has(index))
        || outboxSql.includes("COMMERCIAL_OFFER_CREATED")
        || auditSql.includes("COMMERCIAL_AGREEMENT_CREATED"),
    };
  }
  if (targetMigration === "0069_partner_auth_onboarding_hardening.sql") {
    return {
      partial: names.has("partner_account_profiles")
        || PARTNER_CONTACT_PROFILE_INDEXES.some((index) => names.has(index))
        || auditSql.includes("CONTACT_PROFILE_COMPLETED")
        || auditSql.includes("CONTACT_PROFILE_UPDATED"),
    };
  }
  if (targetMigration === "0070_partner_multimethod_auth.sql") {
    return {
      partial: PARTNER_MULTIMETHOD_AUTH_TABLES.some((table) => names.has(table))
        || PARTNER_MULTIMETHOD_AUTH_INDEXES.some((index) => names.has(index))
        || outboxSql.includes("PASSWORD_RESET")
        || auditSql.includes("PASSWORD_SET")
        || auditSql.includes("PASSWORD_CHANGED")
        || auditSql.includes("PASSWORD_RESET_COMPLETED")
        || auditSql.includes("GOOGLE_IDENTITY_LINKED"),
    };
  }
  if (targetMigration === "0071_admin_universal_notifications.sql") {
    return {
      partial: ADMIN_NOTIFICATION_TABLES.some((table) => names.has(table))
        || ADMIN_NOTIFICATION_INDEXES.some((index) => names.has(index)),
    };
  }
  if (targetMigration === "0072_partner_media_uploads.sql") {
    return {
      partial: schema.moderationSubmissionColumns.some((column) => String(column.name) === "media_asset_id")
        || PARTNER_MEDIA_INDEXES.some((index) => names.has(index))
        || PARTNER_MEDIA_TRIGGERS.some((trigger) => names.has(trigger)),
    };
  }
  if (targetMigration === "0073_automation_multisource_entity_resolution.sql") {
    return {
      partial: AUTOMATION_ENTITY_RESOLUTION_TABLES.some((table) => names.has(table))
        || AUTOMATION_ENTITY_RESOLUTION_INDEXES.some((index) => names.has(index)),
    };
  }
  if (targetMigration === "0074_directory_service_address.sql") {
    const serviceAddressColumns = new Set(["postal_code", "street", "house_number", "address_format", "service_address_confirmation"]);
    return {
      partial: schema.columns.some((column) => serviceAddressColumns.has(String(column.name))),
    };
  }
  if (targetMigration === "0075_automation_zsk_event_source.sql") {
    return { partial: false };
  }
  if (targetMigration === "0076_automation_non_event_entity_resolution_foundation.sql") {
    const clusterSql = String(names.get("automation_entity_clusters")?.sql ?? "");
    return {
      partial: clusterSql.includes("semantic_kind")
        || AUTOMATION_NON_EVENT_FOUNDATION_TABLES.some((table) => names.has(table))
        || AUTOMATION_NON_EVENT_FOUNDATION_INDEXES.some((index) => names.has(index)),
    };
  }
  if (targetMigration === "0077_directory_geo_provider_result_id.sql") {
    return {
      partial: schema.geoPointColumns.some((column) => String(column.name) === "provider_result_id"),
    };
  }
  if (targetMigration === "0078_automation_possible_match_reviews.sql") {
    const names = objectMap(schema.objects);
    return { partial: names.has("automation_entity_match_decisions") };
  }
  if (targetMigration === "0079_automation_agility_event_source.sql") {
    return { partial: false };
  }
  if (targetMigration === "0080_automation_canonical_apply.sql") {
    const names = objectMap(schema.objects);
    return { partial: names.has("automation_canonical_apply_operations") || AUTOMATION_CANONICAL_APPLY_INDEXES.some((index) => names.has(index)) };
  }
  if (targetMigration === "0081_automation_mushing_event_source.sql") {
    return { partial: false };
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

function assertPartnerNotificationAuditSchema(schema, notificationTypes, auditActions) {
  const names = objectMap(schema.objects);
  invariant(names.get("partner_notification_outbox")?.type === "table", "Missing partner_notification_outbox table");
  invariant(names.get("partner_audit_events")?.type === "table", "Missing partner_audit_events table");
  for (const index of [
    "partner_notification_outbox_dedupe_unique",
    "partner_notification_outbox_status_expiry_idx",
    "partner_notification_outbox_account_created_idx",
    "partner_audit_target_created_idx",
    "partner_audit_actor_created_idx",
  ]) invariant(names.get(index)?.type === "index", `Missing partner rebuild index: ${index}`);
  for (const trigger of PARTNER_CLAIM_TRIGGERS) invariant(names.get(trigger)?.type === "trigger", `Missing append-only partner audit trigger: ${trigger}`);

  const outboxSql = String(names.get("partner_notification_outbox")?.sql ?? "");
  const auditSql = String(names.get("partner_audit_events")?.sql ?? "");
  for (const notificationType of notificationTypes) {
    invariant(outboxSql.includes(notificationType), `partner_notification_outbox does not allow ${notificationType}`);
  }
  for (const auditAction of auditActions) {
    invariant(auditSql.includes(auditAction), `partner_audit_events does not allow ${auditAction}`);
  }
}

function assertPartnerProfileChangesSchema(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("partner_profile_change_metadata")?.type === "table", "Missing partner_profile_change_metadata table");
  for (const index of PARTNER_PROFILE_CHANGE_INDEXES) invariant(names.get(index)?.type === "index", `Missing partner profile change index: ${index}`);
  const tableSql = String(names.get("partner_profile_change_metadata")?.sql ?? "");
  invariant(tableSql.includes("base_snapshot_json") && tableSql.includes("changed_field_count"), "partner_profile_change_metadata signature is incomplete");
  assertPartnerNotificationAuditSchema(
    schema,
    ["PROFILE_CHANGE_SUBMITTED", "PROFILE_CHANGE_APPROVED", "PROFILE_CHANGE_REJECTED"],
    ["PROFILE_CHANGE_SUBMITTED", "PROFILE_CHANGE_WITHDRAWN", "PROFILE_CHANGE_APPROVED", "PROFILE_CHANGE_REJECTED"],
  );
}

function assertPartnerNewProfileSchema(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("partner_new_profile_metadata")?.type === "table", "Missing partner_new_profile_metadata table");
  for (const index of PARTNER_NEW_PROFILE_INDEXES) invariant(names.get(index)?.type === "index", `Missing partner new-profile index: ${index}`);
  const tableSql = String(names.get("partner_new_profile_metadata")?.sql ?? "");
  invariant(tableSql.includes("identity_fingerprint") && tableSql.includes("duplicate_confidence") && tableSql.includes("resolution_type"), "partner_new_profile_metadata signature is incomplete");
  assertPartnerNotificationAuditSchema(
    schema,
    ["NEW_PROFILE_SUBMITTED", "NEW_PROFILE_CREATED", "NEW_PROFILE_LINKED_EXISTING", "NEW_PROFILE_REJECTED"],
    ["NEW_PROFILE_SUBMITTED", "NEW_PROFILE_WITHDRAWN", "NEW_PROFILE_CREATED", "NEW_PROFILE_LINKED_EXISTING", "NEW_PROFILE_REJECTED"],
  );
}

function assertPartnerEventsSchema(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("partner_event_submission_metadata")?.type === "table", "Missing partner_event_submission_metadata table");
  for (const index of PARTNER_EVENT_INDEXES) invariant(names.get(index)?.type === "index", `Missing partner event index: ${index}`);
  const columnNames = new Set(schema.eventNotionSyncColumns.map((column) => String(column.name)));
  invariant(columnNames.has("inbound_locked_at"), "event_notion_sync.inbound_locked_at is missing");
  invariant(columnNames.has("inbound_lock_reason"), "event_notion_sync.inbound_lock_reason is missing");
  const syncSql = String(names.get("event_notion_sync")?.sql ?? "");
  invariant(syncSql.includes("inbound_lock_reason") && syncSql.includes("PARTNER_MODERATION"), "event_notion_sync inbound lock signature is incomplete");
  assertPartnerNotificationAuditSchema(
    schema,
    ["EVENT_SUBMITTED", "EVENT_CREATED", "EVENT_LINKED_EXISTING", "EVENT_CHANGE_APPROVED", "EVENT_REJECTED"],
    ["EVENT_SUBMITTED", "EVENT_CHANGE_SUBMITTED", "EVENT_WITHDRAWN", "EVENT_CREATED", "EVENT_LINKED_EXISTING", "EVENT_CHANGE_APPROVED", "EVENT_REJECTED"],
  );
}

function assertPartnerCommercialSchema(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("partner_commercial_agreements")?.type === "table", "Missing partner_commercial_agreements table");
  invariant(names.get("partner_entitlements")?.type === "table", "Missing partner_entitlements table");
  for (const index of PARTNER_COMMERCIAL_INDEXES) invariant(names.get(index)?.type === "index", `Missing partner commercial index: ${index}`);

  for (const uniqueIndex of [
    "partner_commercial_agreement_interest_active_unique",
    "partner_commercial_promotion_provenance_unique",
    "partner_entitlement_agreement_type_unique",
    "partner_entitlement_current_resource_type_unique",
  ]) {
    invariant(/CREATE\s+UNIQUE\s+INDEX/i.test(String(names.get(uniqueIndex)?.sql ?? "")), `Partner commercial unique constraint is missing: ${uniqueIndex}`);
  }
  const agreementUniqueSql = String(names.get("partner_commercial_agreement_interest_active_unique")?.sql ?? "");
  const currentEntitlementSql = String(names.get("partner_entitlement_current_resource_type_unique")?.sql ?? "");
  const promotionSql = String(names.get("partner_commercial_promotion_provenance_unique")?.sql ?? "");
  invariant(agreementUniqueSql.includes("CANCELLED"), "Commercial agreement active-interest partial unique constraint is incomplete");
  invariant(currentEntitlementSql.includes("SCHEDULED") && currentEntitlementSql.includes("ACTIVE") && currentEntitlementSql.includes("PAUSED"), "Current entitlement partial unique constraint is incomplete");
  invariant(promotionSql.includes("provenance") && promotionSql.includes("partner-agreement:"), "Promotion provenance unique constraint is incomplete");

  assertPartnerNotificationAuditSchema(
    schema,
    ["COMMERCIAL_OFFER_CREATED", "COMMERCIAL_AGREEMENT_UPDATED", "PAYMENT_MARKED_PAID", "ENTITLEMENT_ACTIVATED", "ENTITLEMENT_EXPIRING", "ENTITLEMENT_EXPIRED"],
    ["COMMERCIAL_AGREEMENT_CREATED", "COMMERCIAL_AGREEMENT_UPDATED", "COMMERCIAL_PAYMENT_MARKED_PAID", "ENTITLEMENT_ACTIVATED", "ENTITLEMENT_PAUSED", "ENTITLEMENT_CANCELLED", "ENTITLEMENT_EXPIRED", "COMMERCIAL_PROMOTION_LINKED", "COMMERCIAL_CAMPAIGN_LINKED"],
  );
}

function assertPartnerContactProfileSchema(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("partner_account_profiles")?.type === "table", "Missing partner_account_profiles table");
  for (const index of PARTNER_CONTACT_PROFILE_INDEXES) invariant(names.get(index)?.type === "index", `Missing partner contact profile index: ${index}`);

  const profileSql = String(names.get("partner_account_profiles")?.sql ?? "");
  invariant(profileSql.includes("contact_name_ciphertext"), "partner_account_profiles.contact_name_ciphertext is missing");
  invariant(profileSql.includes("phone_ciphertext"), "partner_account_profiles.phone_ciphertext is missing");
  invariant(profileSql.includes("relationship_ciphertext"), "partner_account_profiles.relationship_ciphertext is missing");
  invariant(profileSql.includes("completed_at"), "partner_account_profiles.completed_at is missing");
  invariant(profileSql.includes("REFERENCES `partner_accounts`"), "partner_account_profiles account foreign key is missing");

  assertPartnerNotificationAuditSchema(
    schema,
    [],
    ["CONTACT_PROFILE_COMPLETED", "CONTACT_PROFILE_UPDATED"],
  );
}

function assertRequiredColumns(columns, tableName, requiredColumns) {
  const names = new Set(columns.map((column) => String(column.name)));
  for (const column of requiredColumns) {
    invariant(names.has(column), `${tableName}.${column} is missing`);
  }
}

function assertPartnerAuthCompatibilitySchema(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("partner_accounts")?.type === "table", "Missing partner_accounts table");
  invariant(names.get("resource_management_sessions")?.type === "table", "Missing resource_management_sessions table");
  invariant(names.get("resource_access_tokens")?.type === "table", "Missing resource_access_tokens table");
  assertRequiredColumns(schema.partnerAccountColumns, "partner_accounts", [
    "id", "email_ciphertext", "email_hash", "status", "email_verified_at",
    "suspended_at", "deactivated_at", "created_at", "updated_at",
  ]);
  assertRequiredColumns(schema.partnerSessionColumns, "resource_management_sessions", [
    "id", "resource_type", "subject_id", "session_hash", "permissions_json",
    "expires_at", "created_at", "last_used_at", "revoked_at",
  ]);
  assertRequiredColumns(schema.partnerAccessTokenColumns, "resource_access_tokens", [
    "id", "resource_type", "subject_id", "purpose", "token_hash",
    "expires_at", "used_at", "revoked_at", "created_at",
  ]);
  for (const index of ["resource_access_tokens_hash_unique", "resource_access_tokens_subject_purpose_idx"]) {
    invariant(names.get(index)?.type === "index", `Missing reset-token storage index: ${index}`);
  }
  invariant(
    /CREATE\s+UNIQUE\s+INDEX/i.test(String(names.get("resource_access_tokens_hash_unique")?.sql ?? "")),
    "resource_access_tokens token-hash uniqueness contract is missing",
  );
  assertPartnerContactProfileSchema(schema);
}

function assertPartnerMultimethodAuthSchema(schema) {
  const names = objectMap(schema.objects);
  assertPartnerAuthCompatibilitySchema(schema);
  for (const table of PARTNER_MULTIMETHOD_AUTH_TABLES) {
    invariant(names.get(table)?.type === "table", `Missing Partner H3 auth table: ${table}`);
  }
  for (const index of PARTNER_MULTIMETHOD_AUTH_INDEXES) {
    invariant(names.get(index)?.type === "index", `Missing Partner H3 auth index: ${index}`);
    invariant(/CREATE\s+UNIQUE\s+INDEX/i.test(String(names.get(index)?.sql ?? "")), `Partner H3 auth unique constraint is missing: ${index}`);
  }

  assertRequiredColumns(schema.partnerPasswordCredentialColumns, "partner_password_credentials", [
    "account_id", "password_hash", "hash_version", "created_at", "updated_at",
  ]);
  assertRequiredColumns(schema.partnerAuthIdentityColumns, "partner_auth_identities", [
    "id", "account_id", "provider", "provider_subject", "linked_at", "created_at", "updated_at",
  ]);

  const passwordAccount = schema.partnerPasswordCredentialColumns.find((column) => String(column.name) === "account_id");
  invariant(Number(passwordAccount?.pk ?? 0) === 1, "partner_password_credentials account_id primary-key uniqueness is missing");
  const identityId = schema.partnerAuthIdentityColumns.find((column) => String(column.name) === "id");
  invariant(Number(identityId?.pk ?? 0) === 1, "partner_auth_identities id primary key is missing");

  const passwordSql = String(names.get("partner_password_credentials")?.sql ?? "");
  const identitySql = String(names.get("partner_auth_identities")?.sql ?? "");
  invariant(passwordSql.includes("CHECK (`hash_version` = 1)"), "partner_password_credentials hash_version CHECK is missing");
  invariant(identitySql.includes("CHECK (`provider` IN ('GOOGLE'))"), "partner_auth_identities provider CHECK is missing");

  const passwordFk = schema.partnerPasswordCredentialForeignKeys.find((fk) =>
    String(fk.from) === "account_id" && String(fk.table) === "partner_accounts" && String(fk.to) === "id");
  invariant(passwordFk && String(passwordFk.on_delete).toUpperCase() === "RESTRICT", "partner_password_credentials account foreign key is missing or unsafe");
  const identityFk = schema.partnerAuthIdentityForeignKeys.find((fk) =>
    String(fk.from) === "account_id" && String(fk.table) === "partner_accounts" && String(fk.to) === "id");
  invariant(identityFk && String(identityFk.on_delete).toUpperCase() === "RESTRICT", "partner_auth_identities account foreign key is missing or unsafe");

  assertPartnerNotificationAuditSchema(
    schema,
    ["AUTH_MAGIC_LINK", "PASSWORD_RESET"],
    ["CONTACT_PROFILE_COMPLETED", "CONTACT_PROFILE_UPDATED", "PASSWORD_SET", "PASSWORD_CHANGED", "PASSWORD_RESET_COMPLETED", "GOOGLE_IDENTITY_LINKED"],
  );
}

function assertAdminNotificationPrerequisites(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("admin_push_subscriptions")?.type === "table", "Missing admin_push_subscriptions table for universal admin notifications");
}

function assertAdminUniversalNotificationsSchema(schema) {
  const names = objectMap(schema.objects);
  assertAdminNotificationPrerequisites(schema);
  for (const table of ADMIN_NOTIFICATION_TABLES) {
    invariant(names.get(table)?.type === "table", `Missing admin notification table: ${table}`);
  }
  for (const index of ADMIN_NOTIFICATION_INDEXES) {
    invariant(names.get(index)?.type === "index", `Missing admin notification index: ${index}`);
  }
  for (const uniqueIndex of [
    "admin_notification_events_dedupe_unique",
    "admin_push_event_deliveries_event_subscription_unique",
  ]) {
    invariant(/CREATE\s+UNIQUE\s+INDEX/i.test(String(names.get(uniqueIndex)?.sql ?? "")), `Admin notification unique constraint is missing: ${uniqueIndex}`);
  }

  const runtimeSql = String(names.get("admin_notification_runtime")?.sql ?? "");
  const eventsSql = String(names.get("admin_notification_events")?.sql ?? "");
  const deliveriesSql = String(names.get("admin_push_event_deliveries")?.sql ?? "");
  invariant(runtimeSql.includes("rollout_started_at"), "admin_notification_runtime rollout watermark is missing");
  invariant(eventsSql.includes("dedupe_key") && eventsSql.includes("/admin/%"), "admin_notification_events safety signature is incomplete");
  invariant(deliveriesSql.includes("admin_notification_events") && deliveriesSql.includes("admin_push_subscriptions"), "admin_push_event_deliveries foreign-key signature is incomplete");
}

function assertPartnerMediaPrerequisites(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("moderation_submissions")?.type === "table", "Missing moderation_submissions table for Partner Media");
  invariant(names.get("media_assets")?.type === "table", "Missing media_assets table for Partner Media");
}

function assertPartnerMediaSchema(schema) {
  const names = objectMap(schema.objects);
  assertPartnerMediaPrerequisites(schema);
  assertRequiredColumns(schema.moderationSubmissionColumns, "moderation_submissions", ["media_asset_id"]);
  for (const index of PARTNER_MEDIA_INDEXES) {
    invariant(names.get(index)?.type === "index", `Missing Partner Media index: ${index}`);
    invariant(/CREATE\s+UNIQUE\s+INDEX/i.test(String(names.get(index)?.sql ?? "")), `Partner Media unique constraint is missing: ${index}`);
  }
  for (const trigger of PARTNER_MEDIA_TRIGGERS) {
    invariant(names.get(trigger)?.type === "trigger", `Missing Partner Media trigger: ${trigger}`);
  }

  const submitterGuardSql = String(names.get("moderation_partner_media_submitter_guard")?.sql ?? "");
  const guardSql = String(names.get("moderation_partner_media_attach_guard")?.sql ?? "");
  const stateSql = String(names.get("moderation_partner_media_attach_state")?.sql ?? "");
  invariant(
    submitterGuardSql.includes("PARTNER_ACCOUNT") && submitterGuardSql.includes("partner media requires Partner submission"),
    "Partner Media submitter guard signature is incomplete",
  );
  invariant(
    guardSql.includes("PARTNER_ACCOUNT")
      && guardSql.includes("PENDING")
      && guardSql.includes("PARTNER_PROFILE_CREATE")
      && guardSql.includes("PARTNER_PROFILE_UPDATE")
      && guardSql.includes("PARTNER_EVENT_CREATE")
      && guardSql.includes("PARTNER_EVENT_UPDATE")
      && guardSql.includes("invalid partner media attachment"),
    "Partner Media attach guard signature is incomplete",
  );
  invariant(stateSql.includes("ATTACHED"), "Partner Media attach-state trigger signature is incomplete");
  const mediaFk = schema.moderationSubmissionForeignKeys.find((fk) =>
    String(fk.from) === "media_asset_id" && String(fk.table) === "media_assets" && String(fk.to) === "id");
  invariant(mediaFk && String(mediaFk.on_delete).toUpperCase() === "RESTRICT", "moderation_submissions.media_asset_id foreign key is missing or unsafe");
}

function assertAutomationEntityResolutionPrerequisites(schema) {
  const names = objectMap(schema.objects);
  for (const table of ["automation_sources", "automation_observations", "automation_findings"]) {
    invariant(names.get(table)?.type === "table", `Missing automation entity-resolution prerequisite: ${table}`);
  }
}

function assertAutomationEntityResolutionSchema(schema) {
  const names = objectMap(schema.objects);
  assertAutomationEntityResolutionPrerequisites(schema);
  for (const table of AUTOMATION_ENTITY_RESOLUTION_TABLES) {
    invariant(names.get(table)?.type === "table", `Missing automation entity-resolution table: ${table}`);
  }
  for (const index of AUTOMATION_ENTITY_RESOLUTION_INDEXES) {
    invariant(names.get(index)?.type === "index", `Missing automation entity-resolution index: ${index}`);
  }
  const clusterSql = String(names.get("automation_entity_clusters")?.sql ?? "");
  const evidenceSql = String(names.get("automation_field_evidence")?.sql ?? "");
  const conflictSql = String(names.get("automation_field_conflicts")?.sql ?? "");
  invariant(clusterSql.includes("canonical_entity_id"), "automation_entity_clusters canonical linkage is missing");
  invariant(evidenceSql.includes("authority_score") && evidenceSql.includes("is_preferred"), "automation_field_evidence provenance signature is incomplete");
  invariant(conflictSql.includes("OPEN") && conflictSql.includes("RESOLVED"), "automation_field_conflicts lifecycle signature is incomplete");
}

function assertAutomationNonEventFoundationSchema(schema) {
  const names = objectMap(schema.objects);
  for (const table of AUTOMATION_NON_EVENT_FOUNDATION_TABLES) {
    invariant(names.get(table)?.type === "table", `Missing non-event automation foundation table: ${table}`);
  }
  for (const index of AUTOMATION_NON_EVENT_FOUNDATION_INDEXES) {
    invariant(names.get(index)?.type === "index", `Missing non-event automation foundation index: ${index}`);
  }
  const clusterSql = String(names.get("automation_entity_clusters")?.sql ?? "");
  const candidateSql = String(names.get("automation_entity_candidate_keys")?.sql ?? "");
  invariant(clusterSql.includes("semantic_kind"), "automation_entity_clusters semantic_kind is missing");
  invariant(clusterSql.includes("PERSON") && clusterSql.includes("FACILITY_OR_SERVICE_PROFILE"), "directory semantic-kind guard signature is incomplete");
  invariant(clusterSql.includes("LEGAL_ORGANIZATION") && clusterSql.includes("FACILITY"), "organization semantic-kind guard signature is incomplete");
  invariant(candidateSql.includes("REGISTRY_ID") && candidateSql.includes("ICO") && candidateSql.includes("DOMAIN"), "automation candidate-key identity signature is incomplete");
}

function assertDirectoryServiceAddressSchema(schema) {
  assertRequiredColumns(schema.columns, "directory_profiles", [
    "postal_code",
    "street",
    "house_number",
    "address_format",
    "service_address_confirmation",
  ]);
  const names = objectMap(schema.objects);
  const directorySql = String(names.get("directory_profiles")?.sql ?? "");
  invariant(directorySql.includes("MUNICIPALITY_NUMBER"), "directory_profiles address_format constraint is incomplete");
  invariant(directorySql.includes("CONFIRMED_SERVICE_LOCATION") && directorySql.includes("LEGACY_UNCONFIRMED"),
    "directory_profiles service-address confirmation constraint is incomplete");
}

function assertDirectoryGeoProviderResultIdSchema(schema) {
  assertRequiredColumns(schema.geoPointColumns, "geo_points", ["provider_result_id"]);
}

function assertAutomationPossibleMatchReviewsSchema(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("automation_entity_match_decisions")?.type === "table", "Missing automation POSSIBLE review decision table");
  invariant(names.get("automation_entity_match_decisions_active_pair_unique")?.type === "index", "Missing active POSSIBLE review decision uniqueness guard");
  invariant(names.get("automation_entity_match_decisions_pair_history_idx")?.type === "index", "Missing POSSIBLE review history index");
}

function assertAutomationCanonicalApplySchema(schema) {
  const names = objectMap(schema.objects);
  invariant(names.get("automation_canonical_apply_operations")?.type === "table", "Missing G5 canonical apply audit table");
  for (const index of AUTOMATION_CANONICAL_APPLY_INDEXES) {
    invariant(names.get(index)?.type === "index", `Missing G5 canonical apply index: ${index}`);
  }
  const sql = String(names.get("automation_canonical_apply_operations")?.sql ?? "");
  invariant(sql.includes("review_decision_id") && sql.includes("evidence_fingerprint"), "G5 decision/evidence linkage is incomplete");
  invariant(sql.includes("before_json") && sql.includes("after_json") && sql.includes("provenance_json"), "G5 audit snapshots/provenance are incomplete");
  invariant(sql.includes("SUCCESS") && sql.includes("FAILED"), "G5 apply status audit signature is incomplete");
}

function assertAutomationDiscoveryEvidenceSchema(schema) {
  const names = objectMap(schema.objects);
  invariant(
    names.get("automation_source_candidate_evidence")?.type === "table",
    "Missing automation_source_candidate_evidence table",
  );
  for (const index of AUTOMATION_DISCOVERY_EVIDENCE_INDEXES) {
    invariant(names.get(index)?.type === "index", `Missing discovery evidence index: ${index}`);
  }
  const tableSql = String(names.get("automation_source_candidate_evidence")?.sql ?? "");
  for (const column of [
    "candidate_id", "root_id", "discovery_run_id", "discovery_type", "discovery_context",
    "discovery_context_key", "result_rank", "title", "snippet", "external_id", "metadata_json",
    "first_seen_at", "last_seen_at", "created_at", "updated_at",
  ]) {
    invariant(tableSql.includes(column), `automation_source_candidate_evidence.${column} is missing`);
  }
  const uniqueSql = String(names.get("automation_source_candidate_evidence_identity_unique")?.sql ?? "");
  invariant(
    /CREATE\s+UNIQUE\s+INDEX/i.test(uniqueSql)
      && uniqueSql.includes("candidate_id")
      && uniqueSql.includes("root_id")
      && uniqueSql.includes("discovery_context_key"),
    "Discovery evidence identity contract is incomplete",
  );
}

function assertTargetSchema(schema, targetMigration) {
  assertFoundationSchema(schema);
  if (migrationIndex(targetMigration) >= 63) assertPartnerClaimsSchema(schema);
  if (migrationIndex(targetMigration) >= 64) assertGeoFoundationSchema(schema);
  if (migrationIndex(targetMigration) >= 65) assertPartnerProfileChangesSchema(schema);
  if (migrationIndex(targetMigration) >= 66) assertPartnerNewProfileSchema(schema);
  if (migrationIndex(targetMigration) >= 67) assertPartnerEventsSchema(schema);
  if (migrationIndex(targetMigration) >= 68) assertPartnerCommercialSchema(schema);
  if (migrationIndex(targetMigration) >= 69) assertPartnerContactProfileSchema(schema);
  if (migrationIndex(targetMigration) >= 70) assertPartnerMultimethodAuthSchema(schema);
  if (migrationIndex(targetMigration) >= 71) assertAdminUniversalNotificationsSchema(schema);
  if (migrationIndex(targetMigration) >= 72) assertPartnerMediaSchema(schema);
  if (migrationIndex(targetMigration) >= 73) assertAutomationEntityResolutionSchema(schema);
  if (migrationIndex(targetMigration) >= 74) assertDirectoryServiceAddressSchema(schema);
  if (migrationIndex(targetMigration) >= 76) assertAutomationNonEventFoundationSchema(schema);
  if (migrationIndex(targetMigration) >= 77) assertDirectoryGeoProviderResultIdSchema(schema);
  if (migrationIndex(targetMigration) >= 78) assertAutomationPossibleMatchReviewsSchema(schema);
  if (migrationIndex(targetMigration) >= 80) assertAutomationCanonicalApplySchema(schema);
  if (migrationIndex(targetMigration) >= 82) assertAutomationDiscoveryEvidenceSchema(schema);
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

function partnerRebuildSnapshot(databaseName, configPath) {
  const outboxRows = d1Execute(databaseName, configPath, `
    SELECT id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,
      attempts,last_attempt_at,provider_message_id,last_error,sent_at,created_at,updated_at
    FROM partner_notification_outbox ORDER BY id
  `);
  const auditRows = d1Execute(databaseName, configPath, `
    SELECT id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at
    FROM partner_audit_events ORDER BY id
  `);
  return {
    outboxCount: outboxRows.length,
    auditCount: auditRows.length,
    outboxDigest: stableHash(outboxRows),
    auditDigest: stableHash(auditRows),
  };
}

function partnerAuthPreservationSnapshot(databaseName, configPath) {
  const datasets = {
    partnerAccounts: d1Execute(databaseName, configPath, `
      SELECT id,email_ciphertext,email_hash,status,email_verified_at,suspended_at,deactivated_at,created_at,updated_at
      FROM partner_accounts ORDER BY id
    `),
    partnerSessions: d1Execute(databaseName, configPath, `
      SELECT id,resource_type,subject_id,session_hash,permissions_json,expires_at,created_at,last_used_at,revoked_at
      FROM resource_management_sessions
      WHERE resource_type='PARTNER_ACCOUNT'
      ORDER BY id
    `),
    partnerAccessTokens: d1Execute(databaseName, configPath, `
      SELECT id,resource_type,subject_id,purpose,token_hash,expires_at,used_at,revoked_at,created_at
      FROM resource_access_tokens
      WHERE resource_type='PARTNER_ACCOUNT'
      ORDER BY id
    `),
    partnerAccountProfiles: d1Execute(databaseName, configPath, `
      SELECT account_id,contact_name_ciphertext,phone_ciphertext,relationship_ciphertext,completed_at,created_at,updated_at
      FROM partner_account_profiles ORDER BY account_id
    `),
    partnerMemberships: d1Execute(databaseName, configPath, `
      SELECT id,account_id,resource_id,role,created_at,created_by,updated_at,revoked_at,revoked_by
      FROM partner_memberships ORDER BY id
    `),
    partnerClaims: d1Execute(databaseName, configPath, `
      SELECT id,account_id,resource_id,status,request_message,created_at,updated_at,reviewed_at,reviewed_by,decision_note,cancelled_at
      FROM partner_claims ORDER BY id
    `),
    partnerNotificationOutbox: d1Execute(databaseName, configPath, `
      SELECT id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,
        attempts,last_attempt_at,provider_message_id,last_error,sent_at,created_at,updated_at
      FROM partner_notification_outbox ORDER BY id
    `),
    partnerAuditEvents: d1Execute(databaseName, configPath, `
      SELECT id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at
      FROM partner_audit_events ORDER BY id
    `),
  };
  return Object.fromEntries(Object.entries(datasets).map(([name, rows]) => [
    name,
    { count: rows.length, digest: stableHash(rows) },
  ]));
}

export function assertPartnerAuthPreserved(before, after) {
  invariant(before && after, "Partner auth preservation snapshots are required");
  for (const [name, expected] of Object.entries(before)) {
    const actual = after[name];
    invariant(actual, `Missing postflight preservation snapshot: ${name}`);
    invariant(
      actual.count === expected.count && actual.digest === expected.digest,
      `${name} data changed unexpectedly`,
    );
  }
}

function partnerH3IntegritySnapshot(databaseName, configPath) {
  return {
    passwordCredentialCount: scalarCount(databaseName, configPath, "SELECT COUNT(*) AS count FROM partner_password_credentials"),
    googleIdentityCount: scalarCount(databaseName, configPath, "SELECT COUNT(*) AS count FROM partner_auth_identities"),
    orphanPasswordCredentials: scalarCount(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM partner_password_credentials c WHERE NOT EXISTS (SELECT 1 FROM partner_accounts a WHERE a.id=c.account_id)"),
    orphanAuthIdentities: scalarCount(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM partner_auth_identities i WHERE NOT EXISTS (SELECT 1 FROM partner_accounts a WHERE a.id=i.account_id)"),
    invalidHashVersions: scalarCount(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM partner_password_credentials WHERE hash_version<>1"),
    invalidIdentityProviders: scalarCount(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM partner_auth_identities WHERE provider<>'GOOGLE'"),
    duplicateProviderSubjects: scalarCount(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM (SELECT provider,provider_subject FROM partner_auth_identities GROUP BY provider,provider_subject HAVING COUNT(*)>1)"),
    duplicateAccountProviders: scalarCount(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM (SELECT account_id,provider FROM partner_auth_identities GROUP BY account_id,provider HAVING COUNT(*)>1)"),
  };
}

function assertPartnerH3Integrity(snapshot) {
  invariant(snapshot.orphanPasswordCredentials === 0, "Orphan partner_password_credentials rows detected");
  invariant(snapshot.orphanAuthIdentities === 0, "Orphan partner_auth_identities rows detected");
  invariant(snapshot.invalidHashVersions === 0, "Invalid partner password hash_version detected");
  invariant(snapshot.invalidIdentityProviders === 0, "Invalid Partner auth identity provider detected");
  invariant(snapshot.duplicateProviderSubjects === 0, "Duplicate Google provider_subject identity detected");
  invariant(snapshot.duplicateAccountProviders === 0, "Duplicate account/provider identity detected");
}

export function assertPendingTargetSchemaClean(targetMigration, targetObjects) {
  invariant(
    !targetObjects?.partial,
    `Migration ${String(migrationIndex(targetMigration)).padStart(4, "0")} is not recorded, but target schema objects already exist; possible partial/manual drift`,
  );
}

function targetState(history, schema, targetMigration, expectedHistory) {
  const targetIndex = migrationIndex(targetMigration);
  const historyNames = history.map((row) => String(row.name));
  const historyState = validateProductionTargetHistory(historyNames, expectedHistory, targetMigration);
  const targetObjects = targetSchemaObjects(schema, targetMigration);

  if (!historyState.targetApplied) {
    assertPendingTargetSchemaClean(targetMigration, targetObjects);
    if (targetIndex > 62) assertFoundationSchema(schema);
    if (targetIndex > 63) assertPartnerClaimsSchema(schema);
    if (targetIndex > 64) assertGeoFoundationSchema(schema);
    if (targetIndex > 65) assertPartnerProfileChangesSchema(schema);
    if (targetIndex > 66) assertPartnerNewProfileSchema(schema);
    if (targetIndex > 67) assertPartnerEventsSchema(schema);
    if (targetIndex > 68) assertPartnerCommercialSchema(schema);
    if (targetIndex > 69) assertPartnerAuthCompatibilitySchema(schema);
    if (targetIndex > 70) {
      assertPartnerMultimethodAuthSchema(schema);
      assertAdminNotificationPrerequisites(schema);
    }
    if (targetIndex > 71) {
      assertAdminUniversalNotificationsSchema(schema);
      assertPartnerMediaPrerequisites(schema);
    }
    if (targetIndex > 72) {
      assertPartnerMediaSchema(schema);
      assertAutomationEntityResolutionPrerequisites(schema);
    }
  } else {
    assertTargetSchema(schema, targetMigration);
  }

  return { historyNames, latestIndex: historyState.latestIndex, targetApplied: historyState.targetApplied };
}

function assertExactMigrationHistory(historyNames, expectedNames, phase) {
  invariant(
    historyNames.length === expectedNames.length
      && historyNames.every((name, index) => name === expectedNames[index]),
    `${phase} production migration history does not exactly match the repository chain through ${expectedNames.at(-1) ?? "<none>"}`,
  );
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
  const state = targetState(history, schema, targetMigration, prepared.selection.selected);
  const expectedPreflightHistory = state.targetApplied
    ? prepared.selection.selected
    : prepared.selection.selected.slice(0, -1);
  assertExactMigrationHistory(state.historyNames, expectedPreflightHistory, "Preflight");
  const snapshot = dataSnapshot(databaseName, prepared.configPath);
  const targetIndex = prepared.selection.targetIndex;
  const reviewCountBefore = targetIndex >= 63
    ? scalarCount(databaseName, prepared.configPath, "SELECT COUNT(*) AS count FROM profile_reviews")
    : null;
  const partnerRebuildBefore = targetIndex >= 63
    ? partnerRebuildSnapshot(databaseName, prepared.configPath)
    : null;
  const geoCountBefore = targetIndex > 64
    ? scalarCount(databaseName, prepared.configPath, "SELECT COUNT(*) AS count FROM geo_points")
    : null;
  const partnerAuthBefore = targetIndex >= 70
    ? partnerAuthPreservationSnapshot(databaseName, prepared.configPath)
    : null;

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
    targetMigrationSha256: prepared.targetMigrationSha256,
    reviewCountBefore,
    partnerRebuildBefore,
    geoCountBefore,
    partnerAuthBefore,
    before: snapshot,
  };
  await writeJson(".production-d1/preflight-internal.json", internal);
  await writeJson(".production-d1/preflight-report.json", {
    targetMigration,
    targetMigrationSha256: prepared.targetMigrationSha256,
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
    reviewCountBefore,
    partnerRebuildBefore,
    geoCountBefore,
    partnerAuthBefore,
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
  invariant(internal.targetMigrationSha256 === prepared.targetMigrationSha256, "Target migration content changed after preflight");
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
  invariant(internal.targetMigrationSha256 === prepared.targetMigrationSha256, "Target migration content changed after preflight");
  const databaseName = prepared.resources.d1.database_name;
  const history = migrationHistory(databaseName, prepared.configPath);
  const schema = schemaState(databaseName, prepared.configPath);
  const state = targetState(history, schema, targetMigration, prepared.selection.selected);
  invariant(state.targetApplied, `Target migration is still not recorded as applied: ${targetMigration}`);
  assertExactMigrationHistory(state.historyNames, prepared.selection.selected, "Postflight");
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
  const targetIndex = migrationIndex(targetMigration);
  if (targetIndex === 62 && !internal.targetApplied) {
    invariant(reviewCount === 0, "profile_reviews must remain empty on first 0062 foundation rollout");
  }
  if (targetIndex >= 63) {
    invariant(
      reviewCount === internal.reviewCountBefore,
      `profile_reviews count changed unexpectedly: before=${internal.reviewCountBefore}, after=${reviewCount}`,
    );
    const partnerRebuildAfter = partnerRebuildSnapshot(databaseName, prepared.configPath);
    invariant(
      partnerRebuildAfter.outboxCount === internal.partnerRebuildBefore.outboxCount
        && partnerRebuildAfter.outboxDigest === internal.partnerRebuildBefore.outboxDigest,
      "partner_notification_outbox data changed unexpectedly",
    );
    invariant(
      partnerRebuildAfter.auditCount === internal.partnerRebuildBefore.auditCount
        && partnerRebuildAfter.auditDigest === internal.partnerRebuildBefore.auditDigest,
      "partner_audit_events data changed unexpectedly",
    );
  }

  
  let geoFoundation = null;
  if (targetIndex >= 64) {
    const geoCount = scalarCount(databaseName, prepared.configPath, "SELECT COUNT(*) AS count FROM geo_points");
    if (targetIndex === 64 && !internal.targetApplied) {
      invariant(geoCount === 0, "0064 is schema-only; geo_points must remain empty immediately after migration");
    }
    if (targetIndex > 64) {
      invariant(
        geoCount === internal.geoCountBefore,
        `geo_points count changed unexpectedly: before=${internal.geoCountBefore}, after=${geoCount}`,
      );
    }
    geoFoundation = {
      geoCount,
      schemaOnlyMigration: targetIndex === 64,
      preservedFromPreflight: targetIndex > 64 ? geoCount === internal.geoCountBefore : null,
    };
  }

  let partnerAuthPreservation = null;
  let partnerH3Integrity = null;
  if (targetIndex >= 70) {
    const partnerAuthAfter = partnerAuthPreservationSnapshot(databaseName, prepared.configPath);
    assertPartnerAuthPreserved(internal.partnerAuthBefore, partnerAuthAfter);
    partnerAuthPreservation = partnerAuthAfter;
    partnerH3Integrity = partnerH3IntegritySnapshot(databaseName, prepared.configPath);
    assertPartnerH3Integrity(partnerH3Integrity);
  }

  let partnerContactProfileCount = null;
  if (targetIndex >= 69) {
    partnerContactProfileCount = scalarCount(databaseName, prepared.configPath, "SELECT COUNT(*) AS count FROM partner_account_profiles");
    if (targetIndex === 69 && !internal.targetApplied) {
      invariant(partnerContactProfileCount === 0, "0069 is schema/onboarding foundation only; partner_account_profiles must be empty immediately after migration");
    }
  }

  await writeJson(".production-d1/postflight-report.json", {
    targetMigration,
    targetMigrationSha256: prepared.targetMigrationSha256,
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
    reviewCountPreserved: targetIndex >= 63 ? reviewCount === internal.reviewCountBefore : true,
    partnerRebuildPreserved: targetIndex >= 63,
    partnerClaims: targetIndex >= 63 ? {
      tables: PARTNER_CLAIM_TABLES,
      indexes: PARTNER_CLAIM_INDEXES,
      triggers: PARTNER_CLAIM_TRIGGERS,
    } : null,
    partnerProfileChanges: targetIndex >= 65 ? {
      table: "partner_profile_change_metadata",
      indexes: PARTNER_PROFILE_CHANGE_INDEXES,
    } : null,
    partnerNewProfiles: targetIndex >= 66 ? {
      table: "partner_new_profile_metadata",
      indexes: PARTNER_NEW_PROFILE_INDEXES,
    } : null,
    partnerEvents: targetIndex >= 67 ? {
      table: "partner_event_submission_metadata",
      indexes: PARTNER_EVENT_INDEXES,
      notionSyncColumns: ["inbound_locked_at", "inbound_lock_reason"],
    } : null,
    partnerCommercial: targetIndex >= 68 ? {
      tables: ["partner_commercial_agreements", "partner_entitlements"],
      indexes: PARTNER_COMMERCIAL_INDEXES,
    } : null,
    partnerContactProfile: targetIndex >= 69 ? {
      table: "partner_account_profiles",
      indexes: PARTNER_CONTACT_PROFILE_INDEXES,
      count: partnerContactProfileCount,
      encryptedColumns: ["contact_name_ciphertext", "phone_ciphertext", "relationship_ciphertext"],
      auditActions: ["CONTACT_PROFILE_COMPLETED", "CONTACT_PROFILE_UPDATED"],
    } : null,
    partnerMultimethodAuth: targetIndex >= 70 ? {
      tables: PARTNER_MULTIMETHOD_AUTH_TABLES,
      uniqueIndexes: PARTNER_MULTIMETHOD_AUTH_INDEXES,
      notificationTypes: ["AUTH_MAGIC_LINK", "PASSWORD_RESET"],
      resetTokenStorage: {
        table: "resource_access_tokens",
        purpose: "PARTNER_PASSWORD_RESET",
        uniqueIndex: "resource_access_tokens_hash_unique",
        lookupIndex: "resource_access_tokens_subject_purpose_idx",
      },
      auditActions: ["PASSWORD_SET", "PASSWORD_CHANGED", "PASSWORD_RESET_COMPLETED", "GOOGLE_IDENTITY_LINKED"],
      preservation: partnerAuthPreservation,
      integrity: partnerH3Integrity,
    } : null,
    historyVerifiedThrough: targetMigration,
    geoFoundation,
    counts: safeCounts(after),
    dataIntegrity: "PASS",
    canonicalResourcesPreserved: "PASS",
    resourceBackfill: targetIndex === 62 ? "PASS" : "NOT_APPLICABLE",
    unexpectedMigrationsApplied: false,
  });

  console.log(`[production-d1] verification PASS — ${targetMigration} applied; archived_at=yes; reviewTables=${REVIEW_TABLES.length}; reviewCount=${reviewCount}`);
  if (geoFoundation) console.log(`[production-d1] geo schema PASS — geo_points=${geoFoundation.geoCount}; schemaOnly=${geoFoundation.schemaOnlyMigration}`);
  console.log(`[production-d1] canonical resources PASS — missingDirectory=0; missingOrganizations=0; resources=${after.partnerResources}; memberships preserved=${after.partnerMemberships}`);
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
  const publicDirectoryEligible = scalarCount(databaseName, configPath, `
    SELECT COUNT(*) AS count
    FROM geo_points g JOIN directory_profiles d ON d.id=g.directory_profile_id
    WHERE g.target_type='DIRECTORY_PROFILE'
      AND g.public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
      AND g.geocode_status='RESOLVED'
      AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL
      AND g.resolved_source_fingerprint IS NOT NULL
      AND g.source_fingerprint=g.resolved_source_fingerprint
      AND d.status='published' AND d.archived_at IS NULL AND d.online=0
  `);
  const publicOrganizationEligible = scalarCount(databaseName, configPath, `
    SELECT COUNT(*) AS count
    FROM geo_points g
    JOIN organization_locations l ON l.id=g.organization_location_id
    JOIN help_organizations o ON o.id=l.organization_id
    WHERE g.target_type='ORGANIZATION_LOCATION'
      AND g.public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
      AND g.geocode_status='RESOLVED'
      AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL
      AND g.resolved_source_fingerprint IS NOT NULL
      AND g.source_fingerprint=g.resolved_source_fingerprint
      AND o.status='PUBLISHED' AND o.archived_at IS NULL
  `);
  const publicEventEligible = scalarCount(databaseName, configPath, `
    SELECT COUNT(*) AS count
    FROM geo_points g JOIN managed_events e ON e.id=g.managed_event_id
    WHERE g.target_type='MANAGED_EVENT'
      AND g.public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
      AND g.geocode_status='RESOLVED'
      AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL
      AND g.resolved_source_fingerprint IS NOT NULL
      AND g.source_fingerprint=g.resolved_source_fingerprint
      AND e.status='published' AND e.cancelled=0 AND e.region<>'Online'
      AND COALESCE(e.end_date,e.start_date) >= date('now')
  `);
  const publicMapEligible = {
    directoryProfiles: publicDirectoryEligible,
    organizationLocations: publicOrganizationEligible,
    activePhysicalEvents: publicEventEligible,
    total: publicDirectoryEligible + publicOrganizationEligible + publicEventEligible,
  };

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
    publicMapEligible,
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
  const historyNames = history.map((row) => String(row.name));
  const schemaRecorded = historyNames.includes("0064_geo_foundation.sql");
  const schemaObjectPresent = objectMap(schema.objects).get("geo_points")?.type === "table";

  if (!schemaRecorded || !schemaObjectPresent) {
    const report = {
      checkedAt: new Date().toISOString(),
      targetMigration: "0064_geo_foundation.sql",
      databaseName,
      databaseId: prepared.resources.d1.database_id,
      schemaReady: false,
      latestAppliedMigration: historyNames.at(-1) ?? null,
      historyRecorded: schemaRecorded,
      geoTablePresent: schemaObjectPresent,
      dataReady: false,
      dataReadinessReason: "GEO_SCHEMA_NOT_APPLIED",
    };
    await writeJson(".production-d1/geo-readiness-report.json", report);
    console.log(`[production-d1] geo readiness — schemaReady=false; latest=${report.latestAppliedMigration ?? "<none>"}`);
    return report;
  }

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
    latestAppliedMigration: historyNames.at(-1) ?? null,
    ...snapshot,
    dataReady: snapshot.publicMapEligible.total > 0,
    dataReadinessReason: snapshot.publicMapEligible.total > 0 ? "PUBLIC_CANONICAL_MAP_ROWS_AVAILABLE" : "NO_PUBLIC_CANONICAL_MAP_ROWS",
  };
  await writeJson(".production-d1/geo-readiness-report.json", report);
  console.log(`[production-d1] geo readiness — sources=${snapshot.sources.total}; geoRows=${snapshot.geoTotal}; publicResolved=${snapshot.publicResolvedCurrent}; publicCanonical=${snapshot.publicMapEligible.total}; dataReady=${report.dataReady}`);
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
