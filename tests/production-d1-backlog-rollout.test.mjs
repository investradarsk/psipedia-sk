import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BACKLOG_BASE_MIGRATION,
  BACKLOG_MIGRATIONS,
  repoMigrationsThrough,
  validateBacklogHistory,
} from "../scripts/production-d1-backlog-rollout.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("backlog rollout is exactly 0058 through 0061", () => {
  assert.equal(BACKLOG_BASE_MIGRATION, "0057_automation_background_run_lock.sql");
  assert.deepEqual(BACKLOG_MIGRATIONS, [
    "0058_public_integrity_cleanup.sql",
    "0059_partner_auth_foundation.sql",
    "0060_partner_memberships_admin.sql",
    "0061_partner_commercial_interests.sql",
  ]);
});

test("scoped backlog migration set excludes 0062 and later", () => {
  const files = [];
  for (let index = 0; index <= 64; index += 1) {
    if (index === 57) files.push(BACKLOG_BASE_MIGRATION);
    else if (index >= 58 && index <= 61) files.push(BACKLOG_MIGRATIONS[index - 58]);
    else if (index === 62) files.push("0062_profile_reviews_foundation.sql");
    else if (index === 63) files.push("0063_partner_claims_verification.sql");
    else if (index === 64) files.push("0064_geo_foundation.sql");
    else files.push(String(index).padStart(4, "0") + "_migration.sql");
  }
  const selected = repoMigrationsThrough(files, "0061_partner_commercial_interests.sql");
  assert.equal(selected.at(-1), "0061_partner_commercial_interests.sql");
  assert.equal(selected.some((name) => name.startsWith("0062_")), false);
});

test("backlog history requires exact repository history through 0057", () => {
  const files = [];
  for (let index = 0; index <= 57; index += 1) {
    files.push(index === 57 ? BACKLOG_BASE_MIGRATION : String(index).padStart(4, "0") + "_migration.sql");
  }
  assert.equal(validateBacklogHistory([...files], files).latest, BACKLOG_BASE_MIGRATION);
  assert.throws(() => validateBacklogHistory(files.slice(0, -1), files), /must match repository exactly/);
});

test("workflow is manual-only, production-scoped, sequential and deploy-free", async () => {
  const workflow = await readFile(path.join(repoRoot, ".github/workflows/production-d1-backlog.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /group:\s*production-d1-migration/);
  assert.match(workflow, /APPLY-0058-0061-psipedia-sk-db/);
  for (const migration of BACKLOG_MIGRATIONS) {
    assert.equal(workflow.includes("apply-step " + migration), true);
    assert.equal(workflow.includes("verify-step " + migration), true);
  }
  assert.doesNotMatch(workflow, /wrangler\s+deploy|deploy:cloudflare/);
});

test("runner never auto-restores production", async () => {
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-backlog-rollout.mjs"), "utf8");
  assert.equal(script.includes('"time-travel", "restore"'), false);
});
