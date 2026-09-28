import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { automationSuppressionIdentity } from "../lib/automation-record-suppressions.ts";

const migration = readFileSync(new URL("../drizzle/0093_canonical_draft_delete.sql", import.meta.url), "utf8");
const deleteService = readFileSync(new URL("../lib/canonical-draft-delete.ts", import.meta.url), "utf8");
const suppressionStore = readFileSync(new URL("../lib/automation-record-suppressions.ts", import.meta.url), "utf8");
const directEntity = readFileSync(new URL("../lib/data-automation-direct-entity.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
const apply = readFileSync(new URL("../lib/data-automation-apply.ts", import.meta.url), "utf8");
const receipts = readFileSync(new URL("../lib/data-automation-ingestion-receipts.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/admin/canonical-drafts/[entityType]/[id]/route.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/admin-canonical-draft-delete.tsx", import.meta.url), "utf8");

test("suppression migration stores exact external identity without canonical ownership", () => {
  assert.match(migration, /CREATE TABLE `automation_record_suppressions`/);
  assert.match(migration, /entity_type/);
  assert.match(migration, /external_source_url/);
  assert.match(migration, /external_record_id/);
  assert.match(migration, /suppression_reason/);
  assert.match(migration, /created_by/);
  assert.match(migration, /created_at/);
  assert.match(migration, /automation_record_suppressions_identity_unique/);
  const table = migration.match(/CREATE TABLE `automation_record_suppressions` \(([\s\S]*?)\n\);/);
  assert.ok(table);
  assert.doesNotMatch(table[1], /canonical_entity_id|canonical_id|draft_id/);
});

test("suppression identity reuses canonical URL normalization and remains record-exact", () => {
  const bratislava = automationSuppressionIdentity({
    entityType: "DIRECTORY",
    externalSourceUrl: "https://www.example.sk/bratislava/",
    externalRecordId: "record-1",
  });
  const bratislavaEquivalent = automationSuppressionIdentity({
    entityType: "DIRECTORY",
    externalSourceUrl: "https://example.sk/bratislava",
    externalRecordId: "record-1",
  });
  const kosice = automationSuppressionIdentity({
    entityType: "DIRECTORY",
    externalSourceUrl: "https://example.sk/kosice",
    externalRecordId: "record-2",
  });
  assert.deepEqual(bratislava, bratislavaEquivalent);
  assert.notDeepEqual(bratislava, kosice);
  assert.match(suppressionStore, /canonicalizeSourceUrl/);
  assert.doesNotMatch(suppressionStore, /domain|hostname|fuzzy/i);
});

test("central hard-delete service covers every Automation V1 canonical table with actual draft casing", () => {
  for (const [entityType, table, draftStatus] of [
    ["EVENT", "managed_events", "draft"],
    ["ORGANIZATION", "help_organizations", "DRAFT"],
    ["HELP_ITEM", "help_cases", "draft"],
    ["ADOPTION", "adoption_dogs", "DRAFT"],
    ["FOSTER", "help_cases", "draft"],
    ["LOST_FOUND", "lost_found_dog_reports", "DRAFT"],
    ["DIRECTORY", "directory_profiles", "draft"],
  ]) {
    assert.match(deleteService, new RegExp(entityType));
    assert.match(deleteService, new RegExp(table));
    assert.match(deleteService, new RegExp(`draftStatus: "${draftStatus}"`));
  }
  assert.match(deleteService, /database\.batch\(statements\)/);
  assert.match(deleteService, /Úplne vymazať možno iba koncept\./);
});

test("delete captures suppressions before provenance removal and preserves receipts/history", () => {
  const suppressionIndex = deleteService.indexOf("INSERT OR IGNORE INTO automation_record_suppressions");
  const provenanceDeleteIndex = deleteService.indexOf("DELETE FROM canonical_external_provenance");
  const canonicalDeleteIndex = deleteService.indexOf("DELETE FROM \${config.table}");
  assert.ok(suppressionIndex >= 0);
  assert.ok(provenanceDeleteIndex > suppressionIndex);
  assert.ok(canonicalDeleteIndex > provenanceDeleteIndex);
  assert.doesNotMatch(deleteService, /DELETE FROM automation_ingestion_receipts/);
  assert.doesNotMatch(deleteService, /DELETE FROM automation_(?:runs|source_runs|observations|governance)/);
  assert.match(receipts, /ON CONFLICT\(source_id,entity_type,source_record_id\) DO NOTHING/);
});

test("delete cleans mutable canonical sidecars but fails closed for protected user/partner data", () => {
  assert.match(deleteService, /DELETE FROM automation_update_suggestions/);
  assert.match(deleteService, /DELETE FROM canonical_draft_flags/);
  assert.match(deleteService, /DELETE FROM geo_points/);
  assert.match(deleteService, /DELETE FROM breed_directory_relations/);
  assert.match(deleteService, /DELETE FROM partner_resources/);
  assert.match(deleteService, /partner_memberships/);
  assert.match(deleteService, /partner_claims/);
  assert.match(deleteService, /partner_resource_verifications/);
  assert.match(deleteService, /partner_commercial_agreements/);
  assert.match(deleteService, /partner_entitlements/);
  assert.match(deleteService, /profile_reviews/);
  assert.match(deleteService, /moderation_submissions/);
  assert.match(deleteService, /lost_found_dog_private_details/);
  assert.match(deleteService, /PROTECTED_DEPENDENCY/);
  assert.match(deleteService, /image_key/);
  assert.match(deleteService, /main_image_key/);
});

test("permanent delete writes an append-only admin audit without storing deleted canonical payload", () => {
  assert.match(deleteService, /INSERT INTO moderation_events/);
  assert.match(deleteService, /CANONICAL_DRAFT_DELETED/);
  assert.match(deleteService, /ADMIN_PERMANENT_DRAFT_DELETE/);
  assert.doesNotMatch(deleteService, /JSON\.stringify\(current\)/);
});

test("DIRECT_ENTITY and FEED_SOURCE block suppressed CREATE while preserving existing-match flow", () => {
  assert.match(directEntity, /getAutomationRecordSuppression/);
  assert.match(runner, /getAutomationRecordSuppression/);
  assert.match(apply, /getAutomationRecordSuppression/);
  assert.match(runner, /Suppression applies only to CREATE/);
  assert.match(runner, /result: "SKIPPED_DUPLICATE"/);
  assert.match(apply, /automation_suppression_resolution_missing/);
});

test("admin endpoint is same-origin authenticated and maps non-draft/protected deletes to conflicts", () => {
  assert.match(api, /requireAdminMutation\(request\)/);
  assert.match(api, /deleteCanonicalDraft/);
  assert.match(api, /error\.code === "NOT_FOUND"/);
  assert.match(api, /409/);
});

test("canonical delete UX requires explicit destructive confirmation", () => {
  assert.match(ui, /Vymazať koncept/);
  assert.match(ui, /Naozaj chcete tento koncept úplne vymazať\?/);
  assert.match(ui, /Táto akcia sa nedá vrátiť\./);
  assert.match(ui, /AdminDestructiveConfirmDialog/);
  assert.match(ui, /variant="destructive"/);
  assert.match(ui, /method: "DELETE"/);
  assert.match(ui, /Koncept bol úplne vymazaný\./);
});

test("canonical editor routes expose hard delete only for DRAFT lifecycle states", () => {
  const cases = [
    ["../app/admin/adresar/[id]/page.tsx", /profile\.status === "draft"/],
    ["../app/admin/organizacie/[id]/page.tsx", /organization\.status === "DRAFT"/],
    ["../app/admin/podujatia/[id]/page.tsx", /event\.status === "draft"/],
    ["../app/admin/adopcie/[id]/page.tsx", /item\.status === "DRAFT"/],
    ["../app/admin/pomoc/[id]/page.tsx", /item\.status === "draft"/],
    ["../app/admin/stratene-najdene/[id]/page.tsx", /report\.status === "DRAFT"/],
  ];
  for (const [path, guard] of cases) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, guard);
    assert.match(source, /AdminCanonicalDraftDelete/);
  }
});
