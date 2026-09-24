import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DEFAULT_TARGET_MIGRATION,
  SUPPORTED_PRODUCTION_TARGETS,
  buildScopedWranglerConfig,
  selectMigrationsThrough,
} from "../scripts/production-d1-migrate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

test("production D1 supported targets are explicit through Partner H1 onboarding hardening", () => {
  assert.deepEqual(SUPPORTED_PRODUCTION_TARGETS, [
    "0062_profile_reviews_foundation.sql",
    "0063_partner_claims_verification.sql",
    "0064_geo_foundation.sql",
    "0065_partner_profile_changes.sql",
    "0066_partner_new_profile_submissions.sql",
    "0067_partner_events.sql",
    "0068_partner_commercial_activation.sql",
    "0069_partner_auth_onboarding_hardening.sql",
  ]);
});

test("partner rollout scopes 0065 through 0069 independently and excludes every future migration", () => {
  const files = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...SUPPORTED_PRODUCTION_TARGETS,
    "0070_future_migration.sql",
  ];
  for (const targetMigration of SUPPORTED_PRODUCTION_TARGETS.slice(3)) {
    const result = selectMigrationsThrough(files, targetMigration);
    assert.equal(result.selected.at(-1), targetMigration);
    assert.equal(result.selected.some((name) => Number(name.slice(0, 4)) > result.targetIndex), false);
    assert.equal(result.excludedFuture.every((name) => Number(name.slice(0, 4)) > result.targetIndex), true);
  }
});

test("PARTNER-H1 production rollout scopes exactly through 0069 and excludes 0070", () => {
  const files = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    ...SUPPORTED_PRODUCTION_TARGETS,
    "0070_future_migration.sql",
  ];
  const result = selectMigrationsThrough(files, "0069_partner_auth_onboarding_hardening.sql");
  assert.equal(result.targetIndex, 69);
  assert.equal(result.selected.at(-1), "0069_partner_auth_onboarding_hardening.sql");
  assert.deepEqual(result.excludedFuture, ["0070_future_migration.sql"]);
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
