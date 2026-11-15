import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertDirectoryAuditSelect, unwrapD1Results, summarizeDirectoryLegacyAudit,
} from "../scripts/production-directory-legacy-readonly.mjs";
import { buildDirectoryLegacyCutoverReadinessSql } from "../scripts/directory-legacy-cutover-readiness.mjs";
import { buildDirectoryLegacyCutoverCandidatesSql } from "../scripts/directory-legacy-cutover-candidates.mjs";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("only the two static reports are accepted as read-only SELECT", () => {
  for (const sql of [buildDirectoryLegacyCutoverReadinessSql(),
    buildDirectoryLegacyCutoverCandidatesSql()]) {
    assert.equal(assertDirectoryAuditSelect(sql), sql);
    assert.ok(sql.trim().startsWith("SELECT"));
  }
  for (const sql of [
    "DELETE FROM directory_profiles;",
    "SELECT 1; DELETE FROM directory_profiles;",
    "UPDATE directory_profiles SET status='archived';",
    "WITH cte AS (DELETE FROM directory_profiles RETURNING *) SELECT * FROM cte;",
    "SELECT 1; SELECT 2;",
    "SELECT 1 /* hidden */;",
    "SELECT 1 -- hidden\n;",
    "PRAGMA table_info(directory_profiles);",
    "SELECT 1",
  ]) assert.throws(() => assertDirectoryAuditSelect(sql), /NOT_READONLY_SELECT/, sql);
});

test("Wrangler results are accepted only for successful complete queries", () => {
  assert.deepEqual(unwrapD1Results(JSON.stringify([{ success: true, results: [{ id: 7 }] }]), "S"),
    [{ id: 7 }]);
  assert.throws(() => unwrapD1Results("{}", "S"), /UNSUCCESSFUL_QUERY/);
  assert.throws(() => unwrapD1Results("not JSON", "S"), /INVALID_JSON/);
  assert.throws(() => unwrapD1Results('[{"success":false,"results":[]}]', "S"), /UNSUCCESSFUL_QUERY/);
});

test("summary includes all aggregate fields and rejects a malformed candidate record", () => {
  const fields = ["category", "status", "total_profiles", "invalid_json",
    "district_legacy_only", "district_conflict", "organization_legacy_only",
    "organization_conflict_or_cleared", "breed_legacy_only", "breed_conflict_or_cleared",
    "fci_legacy_only", "fci_conflict_or_cleared", "hours_legacy_only",
    "coverage_legacy_only", "profiles_with_technical_json_dependencies"];
  const row = Object.fromEntries(fields.map(key => [key, 0]));
  row.category = "kynologicke-kluby";
  row.status = "published";
  row.total_profiles = 9;
  row.organization_legacy_only = 2;
  const candidate = {
    psipedia_id: 82, category: "kynologicke-kluby", status: "published",
    field: "organization", canonical_key: "Organizácia", issue: "legacy_only",
  };
  const result = summarizeDirectoryLegacyAudit([row], [candidate]);
  assert.equal(result.totals.total_profiles, 9);
  assert.equal(result.totals.organization_legacy_only, 2);
  assert.equal(result.candidatesByIssue.legacy_only, 1);
  assert.equal(result.candidateListMayBeTruncated, false);
  assert.throws(() => summarizeDirectoryLegacyAudit([row], [{ ...candidate,
    field: "phone", issue: "legacy_only" }]), /UNEXPECTED_REPORT_SCHEMA/);
  assert.throws(() => summarizeDirectoryLegacyAudit([{}], []), /UNEXPECTED_REPORT_SCHEMA/);
});

test("manual workflow is isolated from write-capable migration and protected by main+confirmation", () => {
  const flow = read(".github/workflows/production-directory-legacy-readonly.yml");
  const runner = read("scripts/production-directory-legacy-readonly.mjs");
  assert.match(flow, /workflow_dispatch:/);
  assert.match(flow, /environment: production/);
  assert.match(flow, /permissions:\s*\n  contents: read/);
  assert.match(flow, /group: production-d1-migration/);
  assert.match(flow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(flow, /AUDIT-DIRECTORY-LEGACY-psipedia-sk-db/);
  assert.match(flow, /secrets\.CLOUDFLARE_D1_API_TOKEN/);
  assert.match(flow, /production-directory-legacy-readonly\.mjs/);
  assert.doesNotMatch(flow, /wrangler deploy|migrations apply|npm run deploy|production-d1-migrate\.mjs/);
  assert.match(runner, /"--remote", "--config", configPath, "--json", "--command", sql/);
  assert.match(runner, /EXPECTED_DATABASE_ID/);
  assert.match(runner, /assertDirectoryAuditSelect\(sql\)/);
  assert.doesNotMatch(runner, /--file|migrations apply|wrangler deploy/);
});
