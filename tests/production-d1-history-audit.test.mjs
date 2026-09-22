import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { classifyHistoryAudit } from "../scripts/production-d1-history-audit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const full = { state: "FULL" };
const none = { state: "NONE" };
const partial = { state: "PARTIAL" };

test("classifies absent 0059-0061 schema as migration backlog", () => {
  const result = classifyHistoryAudit({
    historyNames: ["0057_automation_background_run_lock.sql"],
    migration0058LegacyRows: 0,
    signature0059: none,
    signature0060: none,
    signature0061: none,
    migration0061AuditActionsPresent: false,
    laterPhysicalObjects: [],
  });
  assert.equal(result.classification, "MIGRATION_BACKLOG");
  assert.equal(result.safeToRun0062Preflight, false);
});

test("classifies fully present 0059-0061 schema without history as history/schema drift", () => {
  const result = classifyHistoryAudit({
    historyNames: ["0057_automation_background_run_lock.sql"],
    migration0058LegacyRows: 0,
    signature0059: full,
    signature0060: full,
    signature0061: full,
    migration0061AuditActionsPresent: true,
    laterPhysicalObjects: [],
  });
  assert.equal(result.classification, "HISTORY_SCHEMA_DRIFT");
  assert.equal(result.safeToRun0062Preflight, false);
});

test("classifies mixed physical state as drift", () => {
  const result = classifyHistoryAudit({
    historyNames: ["0057_automation_background_run_lock.sql"],
    migration0058LegacyRows: 0,
    signature0059: full,
    signature0060: partial,
    signature0061: none,
    migration0061AuditActionsPresent: false,
    laterPhysicalObjects: [],
  });
  assert.equal(result.classification, "PARTIAL_SCHEMA_DRIFT");
});

test("later physical schema objects force partial schema drift", () => {
  const result = classifyHistoryAudit({
    historyNames: ["0057_automation_background_run_lock.sql"],
    migration0058LegacyRows: 0,
    signature0059: none,
    signature0060: none,
    signature0061: none,
    migration0061AuditActionsPresent: false,
    laterPhysicalObjects: ["table:profile_reviews"],
  });
  assert.equal(result.classification, "PARTIAL_SCHEMA_DRIFT");
});

test("complete history through 0061 is the only safe state for 0062 preflight", () => {
  const result = classifyHistoryAudit({
    historyNames: [
      "0058_public_integrity_cleanup.sql",
      "0059_partner_auth_foundation.sql",
      "0060_partner_memberships_admin.sql",
      "0061_partner_commercial_interests.sql",
    ],
    migration0058LegacyRows: 0,
    signature0059: full,
    signature0060: full,
    signature0061: full,
    migration0061AuditActionsPresent: true,
    laterPhysicalObjects: [],
  });
  assert.equal(result.classification, "HISTORY_COMPLETE_THROUGH_0061");
  assert.equal(result.safeToRun0062Preflight, true);
});

test("history audit workflow is manual-only, production-scoped and contains no migration apply or deploy", async () => {
  const workflow = await readFile(path.join(repoRoot, ".github/workflows/production-d1-history-audit.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /secrets\.CLOUDFLARE_D1_API_TOKEN/);
  assert.match(workflow, /AUDIT-0058-0061-psipedia-sk-db/);
  assert.doesNotMatch(workflow, /migrations\s+apply|wrangler\s+deploy|deploy:cloudflare/);
});

test("history audit runner has no D1 mutation commands", async () => {
  const script = await readFile(path.join(repoRoot, "scripts/production-d1-history-audit.mjs"), "utf8");
  assert.doesNotMatch(script, /"migrations",\s*"apply"/);
  assert.doesNotMatch(script, /wrangler deploy/);
  assert.doesNotMatch(script, /\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b/i);
});
