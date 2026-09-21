import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const applySource = readFileSync(new URL("../lib/data-automation-apply.ts", import.meta.url), "utf8");
const reviewUi = readFileSync(new URL("../components/admin-automation-finding-review.tsx", import.meta.url), "utf8");
const reviewApi = readFileSync(new URL("../app/api/admin/automation-findings/[id]/route.ts", import.meta.url), "utf8");
const findingStore = readFileSync(new URL("../lib/data-automation-store.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0055_data_automation_apply.sql", import.meta.url), "utf8");

test("AUTOMATION-3 requires explicit authenticated approve-apply", () => {
  assert.match(reviewApi, /getAdminApiUser\(\)/);
  assert.match(reviewApi, /if \(!user\) return unauthorizedAdminResponse\(\)/);
  assert.match(reviewApi, /body\.action === "approve-apply"/);
  assert.match(reviewApi, /applyAutomationFinding/);
  assert.match(reviewUi, /Schváliť a aplikovať/);
  assert.match(reviewUi, /window\.confirm/);
});

test("new automation entities are created as drafts and never auto-published", () => {
  assert.ok((applySource.match(/status: "DRAFT"/g) ?? []).length >= 3);
  assert.ok((applySource.match(/status: "draft"/g) ?? []).length >= 3);
  assert.doesNotMatch(applySource, /status:\s*["'](?:published|PUBLISHED|ACTIVE)["']/);
  assert.ok((applySource.match(/published_at: null/g) ?? []).length >= 6);
  assert.match(reviewUi, /Nový záznam sa vždy vytvorí ako koncept/);
});

test("existing canonical updates cannot change lifecycle status through generic field mapping", () => {
  assert.doesNotMatch(applySource, /status:\s*field\(/);
  assert.match(applySource, /POSSIBLE_INACTIVE/);
  assert.match(applySource, /automatické odpublikovanie alebo archivácia nie sú súčasťou bezpečného apply/);
});

test("apply is concurrency guarded and auditable", () => {
  assert.match(applySource, /assertNoConcurrentChanges/);
  assert.match(applySource, /stableJson\(currentValue\)/);
  assert.match(applySource, /AutomationApplyConflictError/);
  assert.match(migration, /CREATE TABLE `automation_applications`/);
  assert.match(migration, /CREATE UNIQUE INDEX `automation_applications_finding_unique`/);
  assert.match(applySource, /INSERT INTO automation_applications/);
  assert.match(applySource, /reviewer_decision='APPROVE_APPLY'/);
});

test("current SVPS source metadata survives apply and future diff comparison", () => {
  assert.match(findingStore, /importKey: row\.import_key/);
  assert.match(findingStore, /operatorName: sourceData\.operatorName/);
  assert.match(findingStore, /sourceApprovalNumber: sourceData\.sourceApprovalNumber/);
  assert.match(findingStore, /sourceActivity: sourceData\.sourceActivity/);
  assert.match(applySource, /metadataFields: \["operatorName", "sourceApprovalNumber", "sourceActivity"\]/);
  assert.match(applySource, /source_data_json=\?/);
});

test("stale NEW organization findings are safely reclassified before any canonical update", () => {
  assert.match(applySource, /findNewOrganizationCollision/);
  assert.match(applySource, /WHERE slug=\? LIMIT 1/);
  assert.match(applySource, /buildAutomationDiff\(before, finding\.proposed\)/);
  assert.match(applySource, /finding_type='POSSIBLE_UPDATE'/);
  assert.match(applySource, /review_status='IN_REVIEW'/);
  assert.match(applySource, /reclassified: "EXISTING_ORGANIZATION"/);
  assert.match(reviewUi, /Nález som prepojil s existujúcim profilom/);
});

test("apply is idempotent per finding and keeps an application audit record", () => {
  assert.match(applySource, /existingApplication\(finding\.id/);
  assert.match(migration, /finding_id.*NOT NULL REFERENCES `automation_findings`/);
  assert.match(migration, /application_type.*CREATE_DRAFT.*UPDATE_EXISTING/);
  assert.match(migration, /before_json/);
  assert.match(migration, /after_json/);
  assert.match(migration, /applied_by/);
});
