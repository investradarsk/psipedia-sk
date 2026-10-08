import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ADMIN_PUSH_CATEGORIES, adminPushCategoryForEvent, parsePushCategories,
  parseStoredPushCategories, isAutomaticPushActor, completedAutomationRunStatus,
} from "../lib/admin-automation-push-policy.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("manual admin run does not qualify for automation push", () => {
  assert.equal(isAutomaticPushActor("ADMIN", false), false);
  assert.equal(isAutomaticPushActor("ADMIN", true), false);
  assert.equal(isAutomaticPushActor("AUTOMATION", false), false);
});
test("system writes are not assumed to be automation", () => {
  for (const actor of ["SYSTEM", "PUBLIC", "PARTNER"]) {
    assert.equal(isAutomaticPushActor(actor, true), false);
  }
  assert.equal(isAutomaticPushActor("AUTOMATION", true), true);
});
test("successful zero-difference run yields NO_CHANGE, not a fake failure or success", () => {
  assert.equal(completedAutomationRunStatus({ status: "SUCCESS", created: 0, updated: 0 }), "NO_CHANGE");
  assert.equal(completedAutomationRunStatus({ status: "SUCCESS", created: 0, updated: 0, draftCreated: 0 }), "NO_CHANGE");
});
test("undocumented result counts never imply NO_CHANGE", () => {
  assert.equal(completedAutomationRunStatus({ status: "SUCCESS" }), "SUCCESS");
  assert.equal(completedAutomationRunStatus({ status: "SUCCESS", created: 1, updated: 0 }), "SUCCESS");
});
test("partial and failed runs retain their failure semantics", () => {
  assert.equal(completedAutomationRunStatus({ status: "PARTIAL", created: 0 }), "PARTIAL_SUCCESS");
  assert.equal(completedAutomationRunStatus({ status: "FAILED", created: 0, updated: 0 }), "FAILED");
});
test("explicit categories affect the actual server delivery policy", () => {
  assert.equal(adminPushCategoryForEvent("automation_run_started", "data"), "RUN_STARTED");
  assert.equal(adminPushCategoryForEvent("automation_run_success", "data"), "RUN_RESULTS");
  assert.equal(adminPushCategoryForEvent("automation_run_no_change", "data"), "RUN_RESULTS");
  assert.equal(adminPushCategoryForEvent("automation_run_failed", "data"), "ERRORS");
  assert.equal(adminPushCategoryForEvent("automation_run_partial_success", "data"), "ERRORS");
  assert.equal(adminPushCategoryForEvent("automation_run_no_change", "notion"), "IMPORT_SYNC");
  assert.equal(adminPushCategoryForEvent("automation_article_published", "editorial"), "PUBLISH");
  assert.equal(adminPushCategoryForEvent("public_article_feedback", "public"), null);
});
test("category preferences reject unknown fields and dedupe duplicates", () => {
  assert.deepEqual(parsePushCategories(["RUN_STARTED", "RUN_STARTED"]), ["RUN_STARTED"]);
  assert.deepEqual(parsePushCategories([]), []);
  assert.throws(() => parsePushCategories(["NOPE"]));
  assert.throws(() => parsePushCategories({ RUN_STARTED: true }));
});
test("stored category defaults are safe", () => {
  assert.deepEqual(parseStoredPushCategories("broken"), ADMIN_PUSH_CATEGORIES);
  assert.deepEqual(parseStoredPushCategories("[]"), []);
});
test("actual event emission is conditional on trusted actor provenance", () => {
  const events = read("lib/admin-automation-events.ts");
  assert.match(events, /isAutomaticPushActor\(input.actor, input.scheduled\)/);
  assert.match(events, /sourceType: "AUTOMATION_RUN"/);
  assert.match(events, /dedupeKey: `automation-run\/\$\{input.system\}/);
  assert.match(events, /safelyRecordAdminAutomationRunEvent/);
});
test("data runner emits STARTED and persisted final status, manual run passes ADMIN", () => {
  const src = read("lib/data-automation-runner.ts");
  assert.match(src, /await beginAutomationRun[\s\S]+status: "STARTED"/);
  assert.match(src, /await finishAutomationRun[\s\S]+completedAutomationRunStatus/);
  assert.match(src, /runSource\(source, options, "ADMIN"\)/);
});
test("scheduled discovery emits only for claimed advanced schedule", () => {
  const src = read("lib/data-automation-discovery-runner.ts");
  assert.match(src, /schedulePolicy === "ADVANCE_SCHEDULE"/);
  assert.match(src, /status: "STARTED"/);
  assert.match(src, /completedAutomationRunStatus/);
  assert.match(src, /PRESERVE_SCHEDULE/);
});
test("Gemini scheduled, not manual or test, emits run events", () => {
  const src = read("lib/gemini-automation-runner.ts");
  assert.match(src, /if \(input.triggerType === "SCHEDULED"\)/);
  assert.match(src, /status: "FAILED"/);
  assert.match(src, /status: "SUCCESS"/);
});
test("Notion observer uses deterministic scheduledTime, no blind NO_CHANGE", () => {
  const src = read("lib/admin-scheduled-observer.ts");
  assert.match(src, /Number.isSafeInteger\(input.scheduledTime\)/);
  assert.match(src, /status: "STARTED"/);
  assert.match(src, /status: "FAILED"/);
  assert.match(src, /counts.created === undefined && counts.updated === undefined/);
  const worker = read("worker/index.ts");
  assert.match(worker, /observeScheduledAutomation/);
  assert.match(worker, /notionEventsHelpEnabled/);
});
test("push queue is bounded and category suppression persists as terminal delivery", () => {
  const src = read("lib/admin-push.ts");
  assert.match(src, /MAX_DELIVERIES_PER_SWEEP = 50/);
  assert.match(src, /ON CONFLICT\(event_id, subscription_id\) DO NOTHING/);
  assert.match(src, /muted \? "dead" : "pending"/);
  assert.match(src, /category_disabled/);
});
test("test push is user-requested, subscription-scoped and rate-limited", () => {
  const src = read("lib/admin-push.ts");
  assert.match(src, /export async function enqueueAdminPushTest/);
  assert.match(src, /event_type = 'admin_push_test'/);
  assert.match(src, /60_000/);
  assert.match(src, /e.event_type <> 'admin_push_test' OR e.resource_ref = \?/);
});
test("subscription endpoints require admin and same-origin JSON", () => {
  const src = read("app/api/admin/push/subscription/route.ts");
  assert.match(src, /getAdminApiUser/);
  assert.match(src, /validJsonRequest/);
  assert.match(src, /action === "test"/);
  assert.match(src, /action === "categories"/);
  assert.match(src, /getAdminPushDeviceReport/);
});
test("history is admin-only, bounded and supports read receipts", () => {
  const page = read("app/admin/operations/automaticke-udalosti/page.tsx");
  const route = read("app/api/admin/push/history/route.ts");
  assert.match(page, /requireAdminPageUser/);
  assert.match(page, /LIMIT 41/);
  assert.match(page, /e.id < \?/);
  assert.match(page, /admin_notification_read_receipts/);
  assert.match(route, /getAdminApiUser/);
  assert.match(route, /source_type = 'AUTOMATION_RUN'/);
});
test("schema changes are narrowly additive and do not auto-migrate prod", () => {
  const sql = read("drizzle/0116_admin_automation_push.sql");
  assert.match(sql, /ADD COLUMN categories_json/);
  assert.match(sql, /CREATE TABLE admin_notification_read_receipts/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});
test("iPhone permission and notificationclick continue to use gated admin scope", () => {
  const settings = read("components/admin-pwa-settings.tsx");
  const sw = read("public/sw.js");
  assert.match(settings, /isIos\(\) && !isStandalone\(\)/);
  assert.match(settings, /await Notification.requestPermission\(\)/);
  assert.match(settings, /onClick=\{enableNotifications\}/);
  assert.match(sw, /safeAdminPath/);
  assert.match(sw, /self.clients.openWindow\(target\)/);
});
