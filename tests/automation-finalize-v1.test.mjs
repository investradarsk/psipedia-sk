import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const workflow = await fs.readFile(new URL("../.github/workflows/automation-finalize-v1.yml", import.meta.url), "utf8");
const runner = await fs.readFile(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
const apply = await fs.readFile(new URL("../lib/data-automation-apply.ts", import.meta.url), "utf8");
const detach = await fs.readFile(new URL("../scripts/automation-detach-drafts.mjs", import.meta.url), "utf8");
const cleanup = await fs.readFile(new URL("../scripts/automation-cleanup-legacy.mjs", import.meta.url), "utf8");
const legacyApplyApi = await fs.readFile(new URL("../app/api/admin/automation-match-reviews/[observationId]/[candidateClusterId]/apply/route.ts", import.meta.url), "utf8");
const possibleMatchPage = await fs.readFile(new URL("../app/admin/operations/possible-matches/[observationId]/[candidateClusterId]/page.tsx", import.meta.url), "utf8");

test("exact existing canonical match is receipt-only", () => {
  assert.match(runner, /match\.entityId && match\.quality !== "UNCERTAIN" && match\.quality !== "NONE"/);
  assert.match(runner, /result: "SKIPPED_DUPLICATE"/);
  assert.doesNotMatch(runner, /linkAutomationClusterCanonical/);
});

test("automation runtime cannot update an existing canonical row", () => {
  assert.doesNotMatch(apply, /function updateExistingStatement/);
  assert.doesNotMatch(apply, /INSERT INTO automation_applications[\s\S]*UPDATE_EXISTING/);
  assert.match(apply, /Automation canonical update je zakázaný/);
});

test("possible duplicate remains an independent draft with canonical-local warning", () => {
  assert.match(apply, /finding\.findingType === "DUPLICATE_CANDIDATE"/);
  assert.match(apply, /upsertCanonicalPossibleDuplicateFlag/);
  assert.match(apply, /result: "DRAFT_CREATED"/);
});

test("legacy canonical apply endpoint is hard-disabled", () => {
  assert.match(legacyApplyApi, /status:410/);
  assert.doesNotMatch(legacyApplyApi, /applyAutomationCanonicalReview/);
  assert.doesNotMatch(possibleMatchPage, /AdminCanonicalApplyReview/);
});

test("historical CREATE_DRAFT and UPDATE_EXISTING provenance detaches without canonical mutation", () => {
  assert.match(detach, /row\.application_type === "UPDATE_EXISTING" \? "SKIPPED_DUPLICATE" : "DRAFT_CREATED"/);
  assert.match(detach, /canonicalApplicationRowsSnapshot/);
  assert.match(detach, /canonical application rows changed during detach/);
  assert.match(detach, /DELETE FROM automation_applications WHERE id=/);
  assert.doesNotMatch(detach, /UPDATE help_organizations SET|UPDATE managed_events SET|UPDATE directory_profiles SET|UPDATE adoption_dogs SET|UPDATE help_cases SET|UPDATE lost_found_dog_reports SET/);
});

test("stale run recovery keeps established 20-minute FAILED semantics", () => {
  assert.match(detach, /STALE_RUN_MS = 20 \* 60_000/);
  assert.match(detach, /status='FAILED'/);
  assert.match(detach, /error_count=CASE WHEN error_count < 1 THEN 1 ELSE error_count END/);
  assert.match(detach, /stale_run_recovered/);
});

test("cleanup preserves sources roots governance usage receipts and canonical lifecycle", () => {
  for (const name of [
    "automation_sources",
    "automation_discovery_roots",
    "automation_search_usage",
    "automation_governance_reviews",
    "automation_governance_review_history",
    "automation_ingestion_receipts",
  ]) assert.match(cleanup, new RegExp(name));
  assert.match(cleanup, /canonicalLifecycleSnapshot/);
  assert.match(cleanup, /canonical publication\/lifecycle state changed/);
});

test("final workflow is exact-confirmation, main-only, current-revision and fail-closed", () => {
  assert.match(workflow, /name: Automation V1 Finalize/);
  assert.match(workflow, /FINALIZE-AUTOMATION-V1-psipedia-sk-db/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /DETACH preview/);
  assert.match(workflow, /DETACH apply/);
  assert.match(workflow, /LEGACY CLEANUP preview/);
  assert.match(workflow, /LEGACY CLEANUP apply/);
  assert.ok(workflow.indexOf("DETACH preview") < workflow.indexOf("DETACH apply"));
  assert.ok(workflow.indexOf("DETACH apply") < workflow.indexOf("LEGACY CLEANUP preview"));
  assert.ok(workflow.indexOf("LEGACY CLEANUP preview") < workflow.indexOf("LEGACY CLEANUP apply"));
  assert.match(workflow, /applyAllowed!==true/);
  assert.match(workflow, /automation applications remain/);
  assert.match(workflow, /canonical-linked clusters remain/);
  assert.match(workflow, /automation_sources/);
  assert.match(workflow, /automation_discovery_roots/);
  assert.match(workflow, /automation_search_usage/);
  assert.match(workflow, /automation_governance_reviews/);
});
