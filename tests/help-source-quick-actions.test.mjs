import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const route = file("app/api/admin/help-source-checks/[type]/[id]/route.ts");
const service = file("lib/admin-help-source-decision.ts");
const queue = file("components/admin-attention-queue.tsx");
const review = file("components/admin-help-source-review.tsx");
const controls = file("components/admin-help-source-quick-actions.tsx");
const map = file("lib/admin-attention-queue.ts");
const query = file("lib/admin-attention-queue-store.ts");

test("both admin surfaces offer one shared lifecycle control with manual confirmation", () => {
  assert.match(queue, /AdminHelpSourceQuickActions/);
  assert.match(review, /AdminHelpSourceQuickActions/);
  assert.match(controls, /CONFIRM_ACTIVE/);
  assert.match(controls, /MARK_ENDED/);
  assert.match(controls, /window\.confirm/);
  assert.match(controls, /router\.refresh\(\)/);
  assert.match(controls, /expectedCheckedAt: checkedAt/);
  assert.match(controls, /Adoptované/);
  assert.match(controls, /Pátranie ukončené/);
  assert.match(map, /sourceCheckedAt/);
  assert.match(query, /'sourceCheckedAt',c\.last_checked_at/);
});

test("new route requires authenticated human action and preserves targeted Notion writeback", () => {
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /MARK_ENDED/);
  assert.match(route, /expectedCheckedAt/);
  assert.match(route, /endHelpSourceCase/);
  assert.match(route, /syncSavedNotionRecord/);
  assert.match(route, /CONFIRM_ACTIVE/);
});

test("manual end uses canonical domain lifecycles, CAS, and never touches sources in cron", () => {
  assert.match(service, /status='ADOPTED'/);
  assert.match(service, /transitionAdminDogReportStatus\(entityId, "RESOLVED"/);
  assert.match(service, /status IN \('ACTIVE','RESERVED'\)/);
  assert.match(service, /updated_at=\?/);
  assert.match(service, /last_checked_at=\?/);
  assert.match(service, /syncLostFoundModerationBeforeAdminStatus/);
  assert.doesNotMatch(file("lib/help-source-daily-check.ts").slice(0,
    file("lib/help-source-daily-check.ts").indexOf("export async function confirmHelpSourceManually")),
    /UPDATE adoption_dogs SET status|UPDATE lost_found_dog_reports SET status/);
});
