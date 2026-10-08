import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  AUTOMATION_SOURCE_PROVIDER_DIAGNOSTIC_COLUMNS,
  AUTOMATION_SOURCE_PROVIDER_TRANSPORT_PHASE_COLUMNS,
  DEFAULT_TARGET_MIGRATION,
  DYNAMIC_ENTITY_IDENTITY_INDEXES,
  PARTNER_MULTIMETHOD_AUTH_INDEXES,
  PARTNER_MULTIMETHOD_AUTH_TABLES,
  SUPPORTED_PRODUCTION_TARGETS,
  assertAutomationGovernanceSchema,
  assertGeminiRejectionSchema,
  assertAutomationSourceProviderDiagnosticsSchema,
  assertAutomationSourceProviderTransportPhaseSchema,
  assertDynamicEntityIdentitySchema,
  assertTavilyEventCadenceState,
  assertPartnerAuthPreserved,
  requiresExactPartnerAuthPreservation,
  assertPendingTargetSchemaClean,
  buildScopedWranglerConfig,
  selectMigrationsThrough,
  targetSchemaObjects,
  validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function supportedTargetsThrough(index) {
  return SUPPORTED_PRODUCTION_TARGETS.filter((name) => Number(name.slice(0, 4)) <= index);
}

test("REVIEWS-1A-MIG scopes repository migrations through 0062 and excludes 0063", () => {
  const files = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    DEFAULT_TARGET_MIGRATION,
    "0063_partner_claims_verification.sql",
  ];
  const result = selectMigrationsThrough(files, DEFAULT_TARGET_MIGRATION);
  assert.equal(result.targetIndex, 62);
  assert.equal(result.selected.at(-1), DEFAULT_TARGET_MIGRATION);
  assert.deepEqual(result.excludedFuture, ["0063_partner_claims_verification.sql"]);
  assert.equal(result.selected.some((name) => name.startsWith("0063_")), false);
});

test("REVIEWS-1A-MIG refuses a migration gap before target", () => {
  const files = Array.from({ length: 63 }, (_, index) =>
    index === 62 ? DEFAULT_TARGET_MIGRATION : `${String(index).padStart(4, "0")}_migration.sql`,
  ).filter((name) => !name.startsWith("0048_"));
  assert.throws(
    () => selectMigrationsThrough(files, DEFAULT_TARGET_MIGRATION),
    /gap before target: 0048/,
  );
});


test("MAP-1E scopes production geo rollout through 0064 and excludes 0065/0066", () => {
  const files = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    "0062_profile_reviews_foundation.sql",
    "0063_partner_claims_verification.sql",
    "0064_geo_foundation.sql",
    "0065_partner_profile_changes.sql",
    "0066_partner_new_profile_submissions.sql",
  ];
  const result = selectMigrationsThrough(files, "0064_geo_foundation.sql");
  assert.equal(result.targetIndex, 64);
  assert.equal(result.selected.at(-1), "0064_geo_foundation.sql");
  assert.deepEqual(result.excludedFuture, [
    "0065_partner_profile_changes.sql",
    "0066_partner_new_profile_submissions.sql",
  ]);
});

test("production D1 supported targets include G5 0080 canonical apply", () => {
  assert.deepEqual(SUPPORTED_PRODUCTION_TARGETS, [
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
    "0083_automation_search_budgets.sql",
    "0084_automation_governance_registry.sql",
    "0085_automation_tavily_discovery_root.sql",
    "0086_automation_tavily_event_cadence.sql",
    "0087_automation_tavily_help_roots.sql",
    "0088_automation_tavily_organization_root.sql",
    "0089_automation_tavily_directory_roots.sql",
    "0090_geo_google_place_identity.sql",
    "0091_automation_detach_drafts.sql",
    "0092_automation_product_model.sql",
    "0093_automation_address_review.sql",
    "0094_canonical_draft_delete.sql",
    "0095_automation_calendar_schedule.sql",
    "0096_automation_update_field_reviews.sql",
    "0097_automation_operations_metrics.sql",
    "0098_directory_notion_bidirectional_sync.sql",
    "0099_media_source_quality.sql",
    "0100_eshop_ratings.sql",
    "0101_eshop_profile_presentation.sql",
    "0102_eshop_notion_sync.sql",
    "0103_admin_entity_reviews.sql",
    "0104_article_topics.sql",
    "0105_article_popularity.sql",
    "0106_section_visuals.sql",
    "0107_section_hero_config.sql",
    "0108_notion_events_help_bidirectional_sync.sql",
    "0109_dynamic_entity_identity_indexes.sql",
    "0110_tavily_source_provider_usage.sql",
    "0111_tavily_provider_diagnostics.sql",
    "0112_tavily_transport_phase.sql",
    "0113_gemini_automation_foundation.sql",
    "0114_gemini_dedupe.sql",
  ]);
});

test("DISCOVERY-2C-E 0086 is a data-only production target with no schema drift surface", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0086_automation_tavily_event_cadence.sql"),
    { partial: false },
  );
});

test("DISCOVERY-CAT-1B 0088 is a data-only production target with no schema drift surface", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0088_automation_tavily_organization_root.sql"),
    { partial: false },
  );
});

test("DISCOVERY-CAT-1C 0089 is a data-only production target with no schema drift surface", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0089_automation_tavily_directory_roots.sql"),
    { partial: false },
  );
});

test("AUTOMATION-PRODUCT-MODEL-2 0092 detects partial schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({
      objects: [{ name: "canonical_external_provenance", type: "table", sql: "" }],
    }, "0092_automation_product_model.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0092_automation_product_model.sql"),
    { partial: false },
  );
});

test("AUTOMATION-ADDRESS-REVIEW-1 0093 detects partial schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({
      objects: [{ name: "automation_address_review_cases", type: "table", sql: "" }],
    }, "0093_automation_address_review.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0093_automation_address_review.sql"),
    { partial: false },
  );
});

test("CANONICAL-DRAFT-DELETE-1 0094 detects partial suppression schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "automation_record_suppressions", type: "table", sql: "" }] }, "0094_canonical_draft_delete.sql"),
    { partial: true },
  );
  assert.deepEqual(targetSchemaObjects({ objects: [] }, "0094_canonical_draft_delete.sql"), { partial: false });
});

test("AUTOMATION-SCHEDULE-2 0095 detects partial calendar schedule schema drift", () => {
  const oneColumn = [{ name: "schedule_mode" }];
  const empty = [];
  assert.deepEqual(
    targetSchemaObjects({
      objects: [],
      automationDiscoveryRootColumns: oneColumn,
      automationSourceColumns: empty,
      automationDirectRefreshColumns: empty,
    }, "0095_automation_calendar_schedule.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({
      objects: [],
      automationDiscoveryRootColumns: empty,
      automationSourceColumns: empty,
      automationDirectRefreshColumns: empty,
    }, "0095_automation_calendar_schedule.sql"),
    { partial: false },
  );
});

test("AUTOMATION-UPDATE-REVIEW-1 0096 detects partial schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "automation_update_field_reviews", type: "table", sql: "" }] }, "0096_automation_update_field_reviews.sql"),
    { partial: true },
  );
  assert.deepEqual(targetSchemaObjects({ objects: [] }, "0096_automation_update_field_reviews.sql"), { partial: false });
});

test("AUTOMATION-OPERATIONS-2 0097 detects partial metrics schema drift", () => {
  const empty = {
    objects: [],
    automationDiscoveryRunColumns: [],
    automationDirectRefreshColumns: [],
  };
  assert.deepEqual(targetSchemaObjects(empty, "0097_automation_operations_metrics.sql"), { partial: false });
  assert.deepEqual(targetSchemaObjects({
    ...empty,
    automationDiscoveryRunColumns: [{ name: "search_request_count" }],
  }, "0097_automation_operations_metrics.sql"), { partial: true });
  assert.deepEqual(targetSchemaObjects({
    ...empty,
    objects: [{ name: "automation_discovery_outcomes", type: "table", sql: "" }],
  }, "0097_automation_operations_metrics.sql"), { partial: true });
});

test("NOTION-DIRECTORY-1 0098 detects partial mirror schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "directory_notion_sync", type: "table", sql: "" }] }, "0098_directory_notion_bidirectional_sync.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "directory_notion_sync_last_synced_idx", type: "index", sql: "" }] }, "0098_directory_notion_bidirectional_sync.sql"),
    { partial: true },
  );
  assert.deepEqual(targetSchemaObjects({ objects: [] }, "0098_directory_notion_bidirectional_sync.sql"), { partial: false });
});

test("MEDIA-SOURCE-QUALITY-1 0099 detects partial monitoring schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "media_source_monitors", type: "table", sql: "" }] }, "0099_media_source_quality.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "media_source_monitors_status_idx", type: "index", sql: "" }] }, "0099_media_source_quality.sql"),
    { partial: true },
  );
  assert.deepEqual(targetSchemaObjects({ objects: [] }, "0099_media_source_quality.sql"), { partial: false });
});

test("ESHOP-REVIEWS-1 0100 detects partial e-shop rating schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "managed_eshops", type: "table", sql: "" }] }, "0100_eshop_ratings.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "eshop_ratings_eshop_updated_idx", type: "index", sql: "" }] }, "0100_eshop_ratings.sql"),
    { partial: true },
  );
  assert.deepEqual(targetSchemaObjects({ objects: [] }, "0100_eshop_ratings.sql"), { partial: false });
});

test("REVIEWS-ESHOP-PROFILES-1 0101 detects partial presentation schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [], managedEshopColumns: [{ name: "logo_url" }] }, "0101_eshop_profile_presentation.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [], managedEshopColumns: [{ name: "focus_tags_json" }] }, "0101_eshop_profile_presentation.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [], managedEshopColumns: [] }, "0101_eshop_profile_presentation.sql"),
    { partial: false },
  );
});

test("ESHOP-NOTION-1 0102 detects partial e-shop Notion sync schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "eshop_notion_sync", type: "table", sql: "" }] }, "0102_eshop_notion_sync.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "eshop_notion_sync_last_synced_idx", type: "index", sql: "" }] }, "0102_eshop_notion_sync.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0102_eshop_notion_sync.sql"),
    { partial: false },
  );
});

test("ADMIN-REVIEW-ALL-1 0103 detects partial admin review schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "admin_entity_reviews", type: "table", sql: "" }] }, "0103_admin_entity_reviews.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "admin_entity_reviews_reviewed_at_idx", type: "index", sql: "" }] }, "0103_admin_entity_reviews.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0103_admin_entity_reviews.sql"),
    { partial: false },
  );
});

test("ARTICLE-TOPICS-1 0104 detects partial article topic schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "article_topics", type: "table", sql: "" }] }, "0104_article_topics.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "article_topic_assignments_topic_idx", type: "index", sql: "" }] }, "0104_article_topics.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0104_article_topics.sql"),
    { partial: false },
  );
});

test("ARTICLE-POPULARITY-1 0105 detects partial popularity schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "article_read_hourly", type: "table", sql: "" }] }, "0105_article_popularity.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "article_read_hourly_bucket_idx", type: "index", sql: "" }] }, "0105_article_popularity.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0105_article_popularity.sql"),
    { partial: false },
  );
});

test("SECTION-VISUALS-1 0106 detects partial visual schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "section_visuals", type: "table", sql: "" }] }, "0106_section_visuals.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [{ name: "section_visuals_section_idx", type: "index", sql: "" }] }, "0106_section_visuals.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0106_section_visuals.sql"),
    { partial: false },
  );
});

test("SECTION-VISUALS-1 0106 migration persists normalized desktop/mobile crop fields", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0106_section_visuals.sql"), "utf8");
  assert.match(migration, /CREATE TABLE section_visuals/);
  assert.match(migration, /visual_key TEXT PRIMARY KEY NOT NULL/);
  for (const field of ["desktop_x", "desktop_y", "desktop_zoom", "mobile_x", "mobile_y", "mobile_zoom"]) {
    assert.match(migration, new RegExp(`\\b${field}\\b`));
  }
  assert.match(migration, /section_visuals_section_idx/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|UPDATE\s+/i);
});

test("SECTION-HERO-V2 0107 detects and persists the canonical hero config column", async () => {
  assert.deepEqual(
    targetSchemaObjects({ objects: [], portalSectionSettingsColumns: [{ name: "hero_config_json" }] }, "0107_section_hero_config.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [], portalSectionSettingsColumns: [] }, "0107_section_hero_config.sql"),
    { partial: false },
  );
  const migration = await readFile(path.join(repoRoot, "drizzle/0107_section_hero_config.sql"), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS portal_section_settings/);
  assert.match(migration, /ADD COLUMN hero_config_json TEXT NOT NULL DEFAULT '\{\}'/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|UPDATE\s+/i);
});

test("NOTION-BIDIRECTIONAL-EVENTS-HELP-1 0108 detects partial sync schema drift", () => {
  const base = { objects: [], eventNotionSyncColumns: [] };
  assert.deepEqual(
    targetSchemaObjects({
      ...base,
      eventNotionSyncColumns: [{ name: "psipedia_updated_at" }],
    }, "0108_notion_events_help_bidirectional_sync.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({
      ...base,
      objects: [{ name: "notion_agenda_sync", type: "table", sql: "" }],
    }, "0108_notion_events_help_bidirectional_sync.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects(base, "0108_notion_events_help_bidirectional_sync.sql"),
    { partial: false },
  );
});

test("NOTION-BIDIRECTIONAL-EVENTS-HELP-1 0108 migration is additive and identity-safe", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0108_notion_events_help_bidirectional_sync.sql"), "utf8");
  assert.match(migration, /ALTER TABLE event_notion_sync ADD COLUMN psipedia_updated_at TEXT/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS notion_agenda_sync/);
  assert.match(migration, /PRIMARY KEY \(agenda, notion_page_id\)/);
  assert.match(migration, /UNIQUE \(agenda, entity_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS notion_agenda_targets/);
  assert.doesNotMatch(migration, /\bDROP\b|\bDELETE\b/i);
});

test("PRODUCTION-D1-0109-PREFLIGHT-1 wires 0109 preflight, history and verification fail-closed", async () => {
  const target = "0109_dynamic_entity_identity_indexes.sql";
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.includes(target), true);
  assert.equal(DYNAMIC_ENTITY_IDENTITY_INDEXES.length, 11);

  const workflow = await readFile(path.join(repoRoot, ".github/workflows/production-d1-migrate.yml"), "utf8");
  assert.equal(workflow.includes("- 0109_dynamic_entity_identity_indexes.sql"), true);
  assert.equal(workflow.includes("APPLY-0109-psipedia-sk-db"), true);

  const cleanSchema = { objects: [] };
  assert.deepEqual(targetSchemaObjects(cleanSchema, target), { partial: false });

  for (const index of DYNAMIC_ENTITY_IDENTITY_INDEXES) {
    const detected = targetSchemaObjects({ objects: [{ name: index, type: "index", sql: "" }] }, target);
    assert.deepEqual(detected, { partial: true }, `0109 partial detection missed ${index}`);
    assert.throws(
      () => assertPendingTargetSchemaClean(target, detected),
      /target schema objects already exist; possible partial\/manual drift/,
    );
  }

  const fullyAppliedSchema = {
    objects: DYNAMIC_ENTITY_IDENTITY_INDEXES.map((name) => ({ name, type: "index", sql: "" })),
  };
  assert.doesNotThrow(() => assertDynamicEntityIdentitySchema(fullyAppliedSchema));

  const missingOneSchema = {
    objects: DYNAMIC_ENTITY_IDENTITY_INDEXES.slice(0, -1).map((name) => ({ name, type: "index", sql: "" })),
  };
  assert.throws(
    () => assertDynamicEntityIdentitySchema(missingOneSchema),
    new RegExp(`Missing dynamic entity identity index: ${DYNAMIC_ENTITY_IDENTITY_INDEXES.at(-1)}`),
  );

  const prefix = Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`);
  const expected = [...prefix, ...supportedTargetsThrough(109)];
  assert.deepEqual(
    validateProductionTargetHistory(expected.slice(0, -1), expected, target),
    { latestIndex: 108, targetApplied: false },
  );
  assert.deepEqual(
    validateProductionTargetHistory(expected, expected, target),
    { latestIndex: 109, targetApplied: true },
  );
});

test("TAVILY-SOURCE-SCOPED-1 0110 detects partial provider usage schema drift", () => {
  assert.deepEqual(
    targetSchemaObjects({
      objects: [{ name: "automation_source_provider_usage", type: "table", sql: "" }],
    }, "0110_tavily_source_provider_usage.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({
      objects: [{ name: "automation_source_provider_usage_source_day_idx", type: "index", sql: "" }],
    }, "0110_tavily_source_provider_usage.sql"),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({ objects: [] }, "0110_tavily_source_provider_usage.sql"),
    { partial: false },
  );
  assert.doesNotThrow(
    () => assertPendingTargetSchemaClean("0110_tavily_source_provider_usage.sql", { partial: false }),
  );
  assert.throws(
    () => assertPendingTargetSchemaClean("0110_tavily_source_provider_usage.sql", { partial: true }),
    /target schema objects already exist; possible partial\/manual drift/i,
  );
});

test("TAVILY-SOURCE-SCOPED-1 0110 migration is additive, bounded and operation-aware", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0110_tavily_source_provider_usage.sql"), "utf8");
  assert.match(migration, /CREATE TABLE `automation_source_provider_usage`/);
  assert.match(migration, /CHECK \(`operation` IN \('CRAWL','EXTRACT'\)\)/);
  assert.match(migration, /automation_source_provider_usage_source_day_idx/);
  assert.match(migration, /automation_source_provider_usage_run_idx/);
  assert.match(migration, /automation_source_provider_usage_operation_day_idx/);
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|INDEX)\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\s+SET\b/i);
});

test("AUTOMATION-TAVILY-PROVIDER-DIAGNOSTICS-1 0111 detects partial additive column drift", () => {
  const target = "0111_tavily_provider_diagnostics.sql";
  assert.deepEqual(
    targetSchemaObjects({
      objects: [{
        name: "automation_source_provider_usage",
        type: "table",
        sql: "CREATE TABLE automation_source_provider_usage (id integer, provider_http_status integer)",
      }],
    }, target),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({
      objects: [{
        name: "automation_source_provider_usage",
        type: "table",
        sql: "CREATE TABLE automation_source_provider_usage (id integer, status text)",
      }],
    }, target),
    { partial: false },
  );
});

test("AUTOMATION-TAVILY-PROVIDER-DIAGNOSTICS-1 0111 migration is additive and exposes all diagnostic columns", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0111_tavily_provider_diagnostics.sql"), "utf8");
  for (const column of AUTOMATION_SOURCE_PROVIDER_DIAGNOSTIC_COLUMNS) {
    assert.match(migration, new RegExp(`ADD COLUMN \\\`${column}\\\``));
  }
  assert.doesNotMatch(migration, /\bDROP\b|\bDELETE\b|\bUPDATE\b/i);

  const tableSql = `CREATE TABLE automation_source_provider_usage (
    id integer,
    ${AUTOMATION_SOURCE_PROVIDER_DIAGNOSTIC_COLUMNS.map((column) => column + " text").join(", ")}
  )`;
  assert.doesNotThrow(() => assertAutomationSourceProviderDiagnosticsSchema({
    objects: [{ name: "automation_source_provider_usage", type: "table", sql: tableSql }],
  }));
  assert.throws(
    () => assertAutomationSourceProviderDiagnosticsSchema({
      objects: [{
        name: "automation_source_provider_usage",
        type: "table",
        sql: "CREATE TABLE automation_source_provider_usage (id integer, provider_http_status integer)",
      }],
    }),
    /provider_error_code is missing/,
  );
});

test("AUTOMATION-TAVILY-TRANSPORT-DIAG-2 0112 detects partial additive column drift", () => {
  const target = "0112_tavily_transport_phase.sql";
  assert.deepEqual(
    targetSchemaObjects({
      objects: [{
        name: "automation_source_provider_usage",
        type: "table",
        sql: "CREATE TABLE automation_source_provider_usage (id integer, transport_phase text)",
      }],
    }, target),
    { partial: true },
  );
  assert.deepEqual(
    targetSchemaObjects({
      objects: [{
        name: "automation_source_provider_usage",
        type: "table",
        sql: "CREATE TABLE automation_source_provider_usage (id integer, transport_error_name text)",
      }],
    }, target),
    { partial: false },
  );
});

test("AUTOMATION-TAVILY-TRANSPORT-DIAG-2 0112 migration is additive and exposes transport_phase", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0112_tavily_transport_phase.sql"), "utf8");
  for (const column of AUTOMATION_SOURCE_PROVIDER_TRANSPORT_PHASE_COLUMNS) {
    assert.match(migration, new RegExp(`ADD COLUMN \\\`${column}\\\``));
  }
  assert.doesNotMatch(migration, /\bDROP\b|\bDELETE\b|\bUPDATE\b/i);

  const tableSql = `CREATE TABLE automation_source_provider_usage (
    id integer,
    ${AUTOMATION_SOURCE_PROVIDER_TRANSPORT_PHASE_COLUMNS.map((column) => column + " text").join(", ")}
  )`;
  assert.doesNotThrow(() => assertAutomationSourceProviderTransportPhaseSchema({
    objects: [{ name: "automation_source_provider_usage", type: "table", sql: tableSql }],
  }));
  assert.throws(
    () => assertAutomationSourceProviderTransportPhaseSchema({
      objects: [{
        name: "automation_source_provider_usage",
        type: "table",
        sql: "CREATE TABLE automation_source_provider_usage (id integer, transport_error_name text)",
      }],
    }),
    /transport_phase is missing/,
  );
});

test("DISCOVERY-2C-E production verifier pins immutable Tavily config but allows operator lifecycle and schedule state", () => {
  const stableConfig = {
    root_key: "tavily-sk-dog-events",
    discovery_type: "SEARCH_PROVIDER",
    entity_type: "EVENT",
    cadence_minutes: 2880,
    next_check_at: null,
    provider: "tavily",
    country: "SK",
    locale: "sk-SK",
    max_results: 5,
    max_candidates: 15,
    queries_per_run: 3,
    provider_requests_per_run: 3,
    root_daily_requests: 3,
    query_cooldown_minutes: 2880,
    query_0: "kynologický kalendár podujatí Slovensko",
    query_1: "agility preteky kalendár Slovensko",
    query_2: "mushing preteky kalendár Slovensko",
  };

  assert.equal(assertTavilyEventCadenceState({
    ...stableConfig,
    enabled: 0,
    review_status: "PENDING",
  }), true);

  assert.equal(assertTavilyEventCadenceState({
    ...stableConfig,
    enabled: 1,
    review_status: "APPROVED",
  }), true);

  assert.equal(assertTavilyEventCadenceState({
    ...stableConfig,
    enabled: 1,
    review_status: "APPROVED",
    cadence_minutes: 1440,
  }), true);

  assert.throws(() => assertTavilyEventCadenceState({
    ...stableConfig,
    enabled: 1,
    review_status: "APPROVED",
    query_cooldown_minutes: 1440,
  }), /query cooldown must be 2880 minutes/);
});

test("production D1 target allowlist tracks every canonical migration from 0062 onward", async () => {
  const canonicalTargets = (await readdir(path.join(repoRoot, "drizzle")))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name) && Number(name.slice(0, 4)) >= 62)
    .sort();
  assert.deepEqual(SUPPORTED_PRODUCTION_TARGETS, canonicalTargets);
});

test("post-0064 rollout scopes every supported target independently and excludes future migrations", () => {
  const files = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...SUPPORTED_PRODUCTION_TARGETS,
    "0115_future_migration.sql",
  ];
  for (const targetMigration of SUPPORTED_PRODUCTION_TARGETS.slice(3)) {
    const result = selectMigrationsThrough(files, targetMigration);
    assert.equal(result.selected.at(-1), targetMigration);
    assert.equal(result.selected.some((name) => Number(name.slice(0, 4)) > result.targetIndex), false);
    assert.equal(result.excludedFuture.every((name) => Number(name.slice(0, 4)) > result.targetIndex), true);
  }
});

test("PARTNER-H1 production rollout scopes exactly through 0069 and excludes later targets", () => {
  const files = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...SUPPORTED_PRODUCTION_TARGETS,
  ];
  const result = selectMigrationsThrough(files, "0069_partner_auth_onboarding_hardening.sql");
  assert.equal(result.targetIndex, 69);
  assert.equal(result.selected.at(-1), "0069_partner_auth_onboarding_hardening.sql");
  assert.deepEqual(
    result.excludedFuture,
    SUPPORTED_PRODUCTION_TARGETS.filter((name) => Number(name.slice(0, 4)) > 69),
  );
});

test("PARTNER-H3 production rollout scopes exactly through 0070 and excludes future migrations", () => {
  const files = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...SUPPORTED_PRODUCTION_TARGETS,
    "0114_future_migration.sql",
  ];
  const result = selectMigrationsThrough(files, "0070_partner_multimethod_auth.sql");
  assert.equal(result.targetIndex, 70);
  assert.equal(result.selected.at(-1), "0070_partner_multimethod_auth.sql");
  assert.deepEqual(result.excludedFuture, [
    ...SUPPORTED_PRODUCTION_TARGETS.filter((name) => Number(name.slice(0, 4)) > 70),
    "0114_future_migration.sql",
  ]);
});

test("PARTNER-H3 history guard accepts 0069 applied with 0070 pending", () => {
  const expected = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...supportedTargetsThrough(70),
  ];
  const history = expected.slice(0, -1);
  const state = validateProductionTargetHistory(history, expected, "0070_partner_multimethod_auth.sql");
  assert.deepEqual(state, { latestIndex: 69, targetApplied: false });
});

test("PARTNER-H3 history guard rejects missing 0069", () => {
  const expected = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...supportedTargetsThrough(70),
  ];
  assert.throws(
    () => validateProductionTargetHistory(expected.slice(0, -2), expected, "0070_partner_multimethod_auth.sql"),
    /expected exactly 0069/,
  );
});

test("PARTNER-H3 history guard accepts already-applied 0070 as safe no-op state", () => {
  const expected = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...supportedTargetsThrough(70),
  ];
  const state = validateProductionTargetHistory(expected, expected, "0070_partner_multimethod_auth.sql");
  assert.deepEqual(state, { latestIndex: 70, targetApplied: true });
});

test("PARTNER-H3 history guard rejects future applied migration", () => {
  const expected = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...supportedTargetsThrough(70),
  ];
  assert.throws(
    () => validateProductionTargetHistory([...expected, "0071_future_migration.sql"], expected, "0070_partner_multimethod_auth.sql"),
    /continues through 0071/,
  );
});

test("PARTNER-H3 history guard rejects a migration-history gap", () => {
  const expected = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...supportedTargetsThrough(70),
  ];
  const history = expected.slice(0, -1).filter((name) => !name.startsWith("0068_"));
  assert.throws(
    () => validateProductionTargetHistory(history, expected, "0070_partner_multimethod_auth.sql"),
    /does not exactly match/,
  );
});

test("0071 and 0072 history guards enforce strictly sequential rollout and safe no-op detection", () => {
  const prefix = Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`);
  const through71 = [...prefix, ...supportedTargetsThrough(71)];
  const through72 = [...prefix, ...supportedTargetsThrough(72)];

  assert.deepEqual(
    validateProductionTargetHistory(through71.slice(0, -1), through71, "0071_admin_universal_notifications.sql"),
    { latestIndex: 70, targetApplied: false },
  );
  assert.deepEqual(
    validateProductionTargetHistory(through71, through71, "0071_admin_universal_notifications.sql"),
    { latestIndex: 71, targetApplied: true },
  );
  assert.deepEqual(
    validateProductionTargetHistory(through72.slice(0, -1), through72, "0072_partner_media_uploads.sql"),
    { latestIndex: 71, targetApplied: false },
  );
  assert.deepEqual(
    validateProductionTargetHistory(through72, through72, "0072_partner_media_uploads.sql"),
    { latestIndex: 72, targetApplied: true },
  );
});

test("0071/0072 canonical SQL and production tooling cover notification and Partner Media schema", async () => {
  const migration71 = await readFile(path.join(repoRoot, "drizzle/0071_admin_universal_notifications.sql"), "utf8");
  const migration72 = await readFile(path.join(repoRoot, "drizzle/0072_partner_media_uploads.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");

  for (const name of ["admin_notification_runtime", "admin_notification_events", "admin_push_event_deliveries"]) {
    assert.match(migration71, new RegExp("CREATE TABLE `" + name + "`"));
  }
  assert.match(migration71, /rollout_started_at/);
  assert.match(migration71, /admin_notification_events_dedupe_unique/);
  assert.match(migration71, /admin_push_event_deliveries_event_subscription_unique/);

  assert.match(migration72, /ALTER TABLE `moderation_submissions` ADD COLUMN `media_asset_id`/);
  assert.match(migration72, /REFERENCES `media_assets`\(`id`\) ON DELETE RESTRICT/);
  assert.match(migration72, /moderation_submissions_media_asset_unique/);
  assert.match(migration72, /moderation_partner_media_submitter_guard/);
  assert.match(migration72, /moderation_partner_media_attach_guard/);
  assert.match(migration72, /moderation_partner_media_attach_state/);
  assert.doesNotMatch(migration72, /SELECT\s+CASE|owner_type`\s*=\s*CASE/i);

  assert.match(script, /assertAdminNotificationPrerequisites/);
  assert.match(script, /assertAdminUniversalNotificationsSchema/);
  assert.match(script, /assertPartnerMediaSchema/);
  assert.match(script, /assertPartnerMediaPrerequisites/);
});

test("0073 automation entity-resolution migration is append-only and production tooling verifies its schema", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0073_automation_multisource_entity_resolution.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.doesNotMatch(migration, /DROP TABLE|ALTER TABLE|DELETE FROM|UPDATE automation_/i);
  for (const table of [
    "automation_entity_clusters",
    "automation_cluster_observations",
    "automation_cluster_match_candidates",
    "automation_cluster_source_records",
    "automation_field_evidence",
    "automation_field_conflicts",
    "automation_cluster_findings",
    "automation_cluster_canonical_claims",
  ]) assert.equal(migration.includes("CREATE TABLE `" + table + "`"), true);
  assert.match(script, /assertAutomationEntityResolutionPrerequisites/);
  assert.match(script, /assertAutomationEntityResolutionSchema/);
  assert.match(script, /0073_automation_multisource_entity_resolution\.sql/);
});

test("0074 directory service-address migration is additive and production tooling verifies its schema", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0074_directory_service_address.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(migration, /ADD `postal_code`/);
  assert.match(migration, /ADD `street`/);
  assert.match(migration, /ADD `house_number`/);
  assert.match(migration, /ADD `address_format`/);
  assert.match(migration, /ADD `service_address_confirmation`/);
  assert.doesNotMatch(migration, /UPDATE\s+directory_profiles|DELETE\s+FROM\s+directory_profiles|DROP\s+TABLE/i);
  assert.match(script, /assertDirectoryServiceAddressSchema/);
  assert.match(script, /0074_directory_service_address\.sql/);
});

test("PARTNER-H3 schema precondition rejects partial/manual 0070 objects", () => {
  assert.doesNotThrow(() =>
    assertPendingTargetSchemaClean("0070_partner_multimethod_auth.sql", { partial: false }),
  );
  assert.throws(
    () => assertPendingTargetSchemaClean("0070_partner_multimethod_auth.sql", { partial: true }),
    /target schema objects already exist; possible partial\/manual drift/,
  );
});

test("PARTNER-H3 history guard rejects unknown target", () => {
  const expected = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...SUPPORTED_PRODUCTION_TARGETS,
  ];
  assert.throws(
    () => validateProductionTargetHistory(expected, expected, "0071_unknown.sql"),
    /Unsupported production migration target/,
  );
});

test("PARTNER-H3 data preservation mismatch fails closed", () => {
  const before = {
    partnerAccounts: { count: 2, digest: "accounts" },
    partnerSessions: { count: 1, digest: "sessions" },
  };
  assert.doesNotThrow(() => assertPartnerAuthPreserved(before, structuredClone(before)));
  assert.throws(
    () => assertPartnerAuthPreserved(before, {
      partnerAccounts: { count: 2, digest: "changed" },
      partnerSessions: { count: 1, digest: "sessions" },
    }),
    /partnerAccounts data changed unexpectedly/,
  );
});

test("PARTNER-H3 exact auth snapshot is limited to the first 0070 rollout", () => {
  assert.equal(requiresExactPartnerAuthPreservation("0070_partner_multimethod_auth.sql", false), true);
  assert.equal(requiresExactPartnerAuthPreservation("0070_partner_multimethod_auth.sql", true), false);
  assert.equal(requiresExactPartnerAuthPreservation("0071_admin_universal_notifications.sql", false), false);
  assert.equal(requiresExactPartnerAuthPreservation("0100_eshop_ratings.sql", false), false);
  assert.equal(requiresExactPartnerAuthPreservation("0100_eshop_ratings.sql", true), false);
  assert.equal(requiresExactPartnerAuthPreservation("0101_eshop_profile_presentation.sql", false), false);
  assert.equal(requiresExactPartnerAuthPreservation("0102_eshop_notion_sync.sql", false), false);
  assert.equal(requiresExactPartnerAuthPreservation("0103_admin_entity_reviews.sql", false), false);
});

test("post-0070 production verification keeps auth integrity checks without freezing live sessions", async () => {
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(script, /requiresExactPartnerAuthPreservation\(targetMigration, state\.targetApplied\)/);
  assert.match(script, /requiresExactPartnerAuthPreservation\(targetMigration, internal\.targetApplied\)/);
  assert.match(script, /partnerH3IntegritySnapshot/);
  assert.match(script, /assertPartnerH3Integrity/);
});

test("scoped Wrangler config keeps exact canonical production D1 identity", () => {
  const resources = {
    account_id: "account-a",
    d1: {
      binding: "DB",
      database_name: "psipedia-sk-db",
      database_id: "db-id",
      migrations_dir: "./drizzle",
    },
  };
  const generated = {
    name: "psipedia-sk",
    d1_databases: [{
      binding: "DB",
      database_name: "psipedia-sk-db",
      database_id: "db-id",
      migrations_dir: "../../drizzle",
    }],
  };
  const result = buildScopedWranglerConfig(generated, resources);
  assert.equal(result.d1_databases[0].database_name, "psipedia-sk-db");
  assert.equal(result.d1_databases[0].database_id, "db-id");
  assert.equal(result.d1_databases[0].migrations_dir, "./migrations");
});

test("scoped Wrangler config rejects a different production database id", () => {
  const resources = {
    d1: {
      binding: "DB",
      database_name: "psipedia-sk-db",
      database_id: "canonical-db-id",
    },
  };
  const generated = {
    d1_databases: [{
      binding: "DB",
      database_name: "psipedia-sk-db",
      database_id: "wrong-db-id",
    }],
  };
  assert.throws(
    () => buildScopedWranglerConfig(generated, resources),
    /database_id does not match canonical config/,
  );
});

test("production D1 workflow is manual-only, protected and deploy-free", async () => {
  const workflow = await readFile(path.join(repoRoot, ".github/workflows/production-d1-migrate.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /secrets\.CLOUDFLARE_D1_API_TOKEN/);
  for (const migration of SUPPORTED_PRODUCTION_TARGETS) {
    assert.equal(workflow.includes(`- ${migration}`), true, `workflow target missing: ${migration}`);
    const index = migration.slice(0, 4);
    assert.equal(workflow.includes(`APPLY-${index}-psipedia-sk-db`), true, `confirmation missing for ${migration}`);
  }
  assert.match(workflow, /inputs\.target_migration == '0064_geo_foundation\.sql'/);
  assert.match(workflow, /0072_partner_media_uploads\.sql/);
  assert.match(workflow, /APPLY-0072-psipedia-sk-db/);
  assert.match(workflow, /0073_automation_multisource_entity_resolution\.sql/);
  assert.match(workflow, /APPLY-0073-psipedia-sk-db/);
  assert.match(workflow, /0074_directory_service_address\.sql/);
  assert.match(workflow, /APPLY-0074-psipedia-sk-db/);
  assert.match(workflow, /0075_automation_zsk_event_source\.sql/);
  assert.match(workflow, /APPLY-0075-psipedia-sk-db/);
  assert.match(workflow, /0076_automation_non_event_entity_resolution_foundation\.sql/);
  assert.match(workflow, /APPLY-0076-psipedia-sk-db/);
  assert.match(workflow, /0077_directory_geo_provider_result_id\.sql/);
  assert.match(workflow, /APPLY-0077-psipedia-sk-db/);
  assert.match(workflow, /0078_automation_possible_match_reviews\.sql/);
  assert.match(workflow, /APPLY-0078-psipedia-sk-db/);
  assert.match(workflow, /0079_automation_agility_event_source\.sql/);
  assert.match(workflow, /APPLY-0079-psipedia-sk-db/);
  assert.match(workflow, /0080_automation_canonical_apply\.sql/);
  assert.match(workflow, /APPLY-0080-psipedia-sk-db/);
  assert.match(workflow, /0081_automation_mushing_event_source\.sql/);
  assert.match(workflow, /APPLY-0081-psipedia-sk-db/);
  assert.match(workflow, /git fetch --no-tags origin main/);
  assert.match(workflow, /partner\/prihlasenie/);
  assert.match(workflow, /partner\/registracia/);
  assert.match(workflow, /partner\/zabudnute-heslo/);
  assert.match(workflow, /node scripts\/production-d1-migrate\.mjs geo-readiness/);
  assert.match(workflow, /\/api\/map\?north=50&south=47&east=23&west=16&zoom=12/);
  assert.doesNotMatch(workflow, /wrangler\s+deploy|deploy:cloudflare/);
});


test("partner rollout preserves rebuilt rows, append-only audit triggers and verifies target signatures", async () => {
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(script, /reviewCountBefore/);
  assert.match(script, /profile_reviews count changed unexpectedly/);
  assert.match(script, /partnerRebuildSnapshot/);
  assert.match(script, /partner_notification_outbox data changed unexpectedly/);
  assert.match(script, /partner_audit_events data changed unexpectedly/);
  assert.match(script, /outboxDigest/);
  assert.match(script, /auditDigest/);
  assert.match(script, /partner_audit_events_no_update/);
  assert.match(script, /partner_audit_events_no_delete/);
  assert.match(script, /partner_profile_change_metadata/);
  assert.match(script, /partner_new_profile_metadata/);
  assert.match(script, /partner_event_submission_metadata/);
  assert.match(script, /inbound_locked_at/);
  assert.match(script, /inbound_lock_reason/);
  assert.match(script, /partner_commercial_agreements/);
  assert.match(script, /partner_entitlements/);
  assert.match(script, /partner_commercial_promotion_provenance_unique/);
  assert.match(script, /partner_account_profiles/);
  assert.match(script, /partner_account_profiles_updated_idx/);
  assert.match(script, /CONTACT_PROFILE_COMPLETED/);
  assert.match(script, /CONTACT_PROFILE_UPDATED/);
  assert.match(script, /0069 is schema\/onboarding foundation only/);
  assert.match(script, /assertExactMigrationHistory/);
  assert.match(script, /partnerAuthPreservationSnapshot/);
  assert.match(script, /\$\{name\} data changed unexpectedly/);
  assert.match(script, /partnerSessions/);
  assert.match(script, /partnerAccessTokens/);
  assert.match(script, /partnerAccountProfiles/);
  assert.match(script, /partnerClaims/);
  assert.match(script, /partnerMultimethodAuth/);
  assert.match(script, /PASSWORD_RESET/);
  assert.match(script, /GOOGLE_IDENTITY_LINKED/);
  assert.match(script, /targetMigrationSha256/);
});

test("PARTNER-H3 0070 migration and rollout verification cover exact auth contracts", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0070_partner_multimethod_auth.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.deepEqual(PARTNER_MULTIMETHOD_AUTH_TABLES, [
    "partner_password_credentials",
    "partner_auth_identities",
  ]);
  assert.deepEqual(PARTNER_MULTIMETHOD_AUTH_INDEXES, [
    "partner_auth_identities_provider_subject_unique",
    "partner_auth_identities_account_provider_unique",
  ]);
  assert.match(migration, /CHECK \(`hash_version` = 1\)/);
  assert.match(migration, /CHECK \(`provider` IN \('GOOGLE'\)\)/);
  assert.match(migration, /REFERENCES `partner_accounts`\(`id`\) ON DELETE RESTRICT/);
  assert.match(migration, /PASSWORD_RESET/);
  assert.match(migration, /PASSWORD_SET/);
  assert.match(migration, /PASSWORD_CHANGED/);
  assert.match(migration, /PASSWORD_RESET_COMPLETED/);
  assert.match(migration, /GOOGLE_IDENTITY_LINKED/);
  assert.match(script, /partnerPasswordCredentialForeignKeys/);
  assert.match(script, /partnerAuthIdentityForeignKeys/);
  assert.match(script, /resource_access_tokens_hash_unique/);
  assert.match(script, /resource_access_tokens_subject_purpose_idx/);
  assert.match(script, /PARTNER_PASSWORD_RESET/);
  assert.match(script, /duplicateProviderSubjects/);
  assert.match(script, /duplicateAccountProviders/);
  assert.match(script, /assertPartnerH3Integrity/);
});

test("post-0064 production rollouts preserve populated geo_points instead of requiring emptiness", async () => {
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(script, /const geoCountBefore = targetIndex > 64/);
  assert.match(script, /targetIndex === 64 && !internal\.targetApplied/);
  assert.match(script, /targetIndex > 64/);
  assert.match(script, /geo_points count changed unexpectedly/);
  assert.match(script, /preservedFromPreflight/);
  assert.doesNotMatch(
    script,
    /if \(!internal\.targetApplied\) invariant\(geoCount === 0, "0064 is schema-only;/,
  );
});

test("MAP-1E geo readiness is read-only and fail-closes P1 privacy exposures", async () => {
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(script, /publicResolvedCurrent/);
  assert.match(script, /publicMapEligible/);
  assert.match(script, /PUBLIC_CANONICAL_MAP_ROWS_AVAILABLE/);
  assert.match(script, /NO_PUBLIC_CANONICAL_MAP_ROWS/);
  assert.match(script, /sensitiveExactPublic/);
  assert.match(script, /legalSeatExactPublic/);
  assert.match(script, /hiddenWithCoordinates/);
  assert.match(script, /unclassifiedWithCoordinates/);
  assert.match(script, /P1 privacy blocker/);
  assert.doesNotMatch(
    script.slice(script.indexOf("async function geoReadiness"), script.indexOf("async function runCli")),
    /UPDATE\s+geo_points|INSERT\s+INTO\s+geo_points|DELETE\s+FROM\s+geo_points/i,
  );
});

test("MAP-1E production readiness workflow is manual-only and read-only", async () => {
  const workflow = await readFile(path.join(repoRoot, ".github/workflows/map-production-readiness.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /production-d1-migrate\.mjs geo-readiness/);
  assert.match(workflow, /MAP_LAUNCH_READY/);
  assert.match(workflow, /Google Maps nie je nakonfigurovaný/);
  assert.match(workflow, /real_google_smoke_confirmed/);
  assert.match(workflow, /attribution_review_confirmed/);
  assert.match(workflow, /consent_privacy_review_confirmed/);
  assert.match(workflow, /realGoogleSmokeConfirmed/);
  assert.match(workflow, /attributionReviewConfirmed/);
  assert.match(workflow, /consentPrivacyReviewConfirmed/);
  assert.match(workflow, /mapApiHasData/);
  assert.match(workflow, /mapApiPrivateFieldsAbsent/);
  assert.doesNotMatch(workflow, /d1\s+migrations\s+apply|wrangler\s+deploy|deploy:cloudflare/i);
  assert.doesNotMatch(workflow, /POST\s+.*geo|INITIALIZE|CANARY/);
});

test("ordinary Cloudflare deploy path never applies remote D1 migrations", async () => {
  const deploy = await readFile(path.join(repoRoot, "scripts/deploy-cloudflare-safe.mjs"), "utf8");
  assert.doesNotMatch(deploy, /remoteMigration/);
  assert.doesNotMatch(deploy, /apply-remote-d1-migrations/);
  assert.match(deploy, /separate manual production migration workflow/);
});


test("0076 non-event entity-resolution foundation is additive and guarded", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0076_automation_non_event_entity_resolution_foundation.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(migration, /ADD COLUMN \`semantic_kind\`/);
  assert.match(migration, /CREATE TABLE \`automation_entity_candidate_keys\`/);
  assert.match(migration, /automation_entity_clusters_type_semantic_updated_idx/);
  assert.match(migration, /automation_entity_candidate_keys_lookup_idx/);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+(directory_profiles|help_organizations|automation_entity_clusters)/i);
  assert.match(script, /0076_automation_non_event_entity_resolution_foundation\.sql/);
  assert.match(script, /assertAutomationNonEventFoundationSchema/);
});


test("0077 directory geo provider result identity is additive and guarded", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0077_directory_geo_provider_result_id.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(migration, /ALTER TABLE geo_points ADD COLUMN provider_result_id TEXT/);
  assert.doesNotMatch(migration, /UPDATE\s+geo_points|DELETE\s+FROM\s+geo_points|DROP\s+TABLE/i);
  assert.match(script, /0077_directory_geo_provider_result_id\.sql/);
  assert.match(script, /assertDirectoryGeoProviderResultIdSchema/);
  assert.match(script, /PRAGMA table_info\('geo_points'\)/);
});


test("0078 POSSIBLE review decisions migration is additive and guarded", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0078_automation_possible_match_reviews.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(migration, /CREATE TABLE automation_entity_match_decisions/);
  assert.match(migration, /SAME_ENTITY/);
  assert.match(migration, /DIFFERENT_ENTITY/);
  assert.match(migration, /RELATIONSHIP_ONLY/);
  assert.match(migration, /DEFER/);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+(directory_profiles|help_organizations)/i);
  assert.match(script, /0078_automation_possible_match_reviews\.sql/);
  assert.match(script, /assertAutomationPossibleMatchReviewsSchema/);
});


test("0080 G5 canonical apply migration is additive, auditable and guarded", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0080_automation_canonical_apply.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(migration, /CREATE TABLE automation_canonical_apply_operations/);
  assert.match(migration, /apply_fingerprint/);
  assert.match(migration, /review_decision_id/);
  assert.match(migration, /evidence_fingerprint/);
  assert.match(migration, /before_json/);
  assert.match(migration, /after_json/);
  assert.match(migration, /provenance_json/);
  assert.match(migration, /SUCCESS/);
  assert.match(migration, /FAILED/);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+(directory_profiles|help_organizations|automation_)/i);
  assert.match(script, /0080_automation_canonical_apply\.sql/);
  assert.match(script, /assertAutomationCanonicalApplySchema/);
});


test("0081 Mushing source migration is data-only, disabled and governance-gated", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0081_automation_mushing_event_source.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  assert.match(migration, /INSERT OR IGNORE INTO automation_sources/);
  assert.match(migration, /INSERT OR IGNORE INTO automation_source_authority/);
  assert.match(migration, /'szpz-mushing-events'/);
  assert.match(migration, /0,360,1500,10000,2,1500,40/);
  assert.match(migration, /'PENDING'/);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE|DROP TABLE|DELETE FROM|UPDATE\s+automation_sources/i);
  assert.match(script, /0081_automation_mushing_event_source\.sql/);
});

test("0084 governance registry migration is additive, auditable and production-guarded", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0084_automation_governance_registry.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  const workflow = await readFile(path.join(repoRoot, ".github/workflows/production-d1-migrate.yml"), "utf8");
  assert.match(migration, /CREATE TABLE `automation_governance_reviews`/);
  assert.match(migration, /CREATE TABLE `automation_governance_review_history`/);
  assert.match(migration, /automation_governance_reviews_history_insert/);
  assert.match(migration, /automation_governance_reviews_history_update/);
  assert.match(migration, /automation_governance_review_history_no_update/);
  assert.match(migration, /automation_governance_review_history_no_delete/);
  assert.doesNotMatch(migration, /UPDATE\s+automation_|DELETE\s+FROM|DROP\s+TABLE/i);
  assert.match(script, /0084_automation_governance_registry\.sql/);
  assert.match(script, /assertAutomationGovernanceSchema/);
  assert.match(workflow, /0084_automation_governance_registry\.sql/);
  assert.match(workflow, /APPLY-0084-psipedia-sk-db/);
});

test("0085 Tavily discovery root migration is data-only, disabled and pending", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0085_automation_tavily_discovery_root.sql"), "utf8");
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-migrate.mjs"), "utf8");
  const workflow = await readFile(path.join(repoRoot, ".github/workflows/production-d1-migrate.yml"), "utf8");
  assert.match(migration, /INSERT OR IGNORE INTO automation_discovery_roots/);
  assert.match(migration, /'tavily-sk-dog-events'/);
  assert.match(migration, /'SEARCH_PROVIDER'/);
  assert.match(migration, /'EVENT'/);
  assert.match(migration, /\n  0,\n  'PENDING',\n  1440,/);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE|DROP TABLE|DELETE FROM|UPDATE\s+/i);
  assert.match(script, /0085_automation_tavily_discovery_root\.sql/);
  assert.match(workflow, /0085_automation_tavily_discovery_root\.sql/);
  assert.match(workflow, /APPLY-0085-psipedia-sk-db/);
});


test("0084/0085 production preflight target schema detection is deterministic and fail-closed", async () => {
  const cleanSchema = { objects: [] };
  assert.deepEqual(
    targetSchemaObjects(cleanSchema, "0084_automation_governance_registry.sql"),
    { partial: false },
  );

  for (const object of [
    { name: "automation_governance_reviews", type: "table" },
    { name: "automation_governance_review_history", type: "table" },
    { name: "automation_governance_reviews_subject_unique", type: "index" },
    { name: "automation_governance_reviews_review_due_idx", type: "index" },
    { name: "automation_governance_review_history_subject_idx", type: "index" },
    { name: "automation_governance_reviews_history_insert", type: "trigger" },
    { name: "automation_governance_reviews_history_update", type: "trigger" },
    { name: "automation_governance_review_history_no_update", type: "trigger" },
    { name: "automation_governance_review_history_no_delete", type: "trigger" },
  ]) {
    const detected = targetSchemaObjects({ objects: [object] }, "0084_automation_governance_registry.sql");
    assert.equal(detected.partial, true, `0084 partial detection missed ${object.name}`);
    assert.throws(
      () => assertPendingTargetSchemaClean("0084_automation_governance_registry.sql", detected),
      /target schema objects already exist; possible partial\/manual drift/,
    );
  }

  assert.deepEqual(
    targetSchemaObjects(cleanSchema, "0085_automation_tavily_discovery_root.sql"),
    { partial: false },
  );

  assert.deepEqual(
    targetSchemaObjects(cleanSchema, "0083_automation_search_budgets.sql"),
    { partial: false },
  );
  assert.equal(
    targetSchemaObjects(
      { objects: [{ name: "automation_search_usage", type: "table" }] },
      "0083_automation_search_budgets.sql",
    ).partial,
    true,
  );

  const migration84 = await readFile(
    path.join(repoRoot, "drizzle/0084_automation_governance_registry.sql"),
    "utf8",
  );
  const applied84Schema = {
    objects: [
      { name: "automation_governance_reviews", type: "table", sql: migration84 },
      { name: "automation_governance_review_history", type: "table", sql: migration84 },
      { name: "automation_governance_reviews_subject_unique", type: "index", sql: migration84 },
      { name: "automation_governance_reviews_review_due_idx", type: "index", sql: migration84 },
      { name: "automation_governance_review_history_subject_idx", type: "index", sql: migration84 },
      { name: "automation_governance_reviews_history_insert", type: "trigger", sql: migration84 },
      { name: "automation_governance_reviews_history_update", type: "trigger", sql: migration84 },
      { name: "automation_governance_review_history_no_update", type: "trigger", sql: migration84 },
      { name: "automation_governance_review_history_no_delete", type: "trigger", sql: migration84 },
    ],
  };
  assert.doesNotThrow(() => assertAutomationGovernanceSchema(applied84Schema));
});

test("0085 production history guard requires 0084 before Tavily root provisioning", () => {
  const prefix = Array.from(
    { length: 62 },
    (_, index) => `${String(index).padStart(4, "0")}_migration.sql`,
  );
  const expected = [...prefix, ...supportedTargetsThrough(85)];
  const through84 = expected.slice(0, -1);
  assert.deepEqual(
    validateProductionTargetHistory(
      through84,
      expected,
      "0085_automation_tavily_discovery_root.sql",
    ),
    { latestIndex: 84, targetApplied: false },
  );

  const through83 = through84.slice(0, -1);
  assert.throws(
    () => validateProductionTargetHistory(
      through83,
      expected,
      "0085_automation_tavily_discovery_root.sql",
    ),
    /expected exactly 0084/,
  );
});


test("GEMINI-DEDUPE-1 0114 refuses partial rejection memory drift", () => {
  assert.deepEqual(targetSchemaObjects({ objects: [] }, "0114_gemini_dedupe.sql"), { partial: false });
  for (const name of ["gemini_automation_rejections", "idx_gemini_rejections_scope_recent"]) {
    assert.deepEqual(targetSchemaObjects({ objects: [{ name, type: "table", sql: "" }] }, "0114_gemini_dedupe.sql"), { partial: true });
  }
});

test("GEMINI-DEDUPE-1 0114 verifies expected production table, index and unique hash guard", () => {
  const sql = `CREATE TABLE gemini_automation_rejections (
    stable_key TEXT NOT NULL, identity_kind TEXT NOT NULL, identity_hash TEXT NOT NULL CHECK(length(identity_hash) = 64),
    candidate_name TEXT NOT NULL, reason_code TEXT, rejected_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(stable_key, identity_kind, identity_hash)
  )`;
  const objects = [
    { name: "gemini_automation_rejections", type: "table", sql },
    { name: "idx_gemini_rejections_scope_recent", type: "index", sql: "" },
  ];
  assert.doesNotThrow(() => assertGeminiRejectionSchema({ objects }));
  assert.throws(() => assertGeminiRejectionSchema({ objects: objects.slice(0, 1) }), /index/);
  assert.throws(() => assertGeminiRejectionSchema({ objects: [
    { ...objects[0], sql: sql.replace("UNIQUE(stable_key, identity_kind, identity_hash)", "") }, objects[1],
  ] }), /uniqueness/);
});
