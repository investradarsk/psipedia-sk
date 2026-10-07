import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

test("A/B manual future root bypasses only due-time while scheduled execution stays due-only", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  const manual = section(store, "export async function claimManualAutomationDiscoveryRun", "export async function claimDueAutomationDiscoveryRun");
  const scheduled = section(store, "export async function claimDueAutomationDiscoveryRun", "function discoveryGovernanceUsage");

  assert.match(manual, /requireDue:\s*false/);
  assert.match(manual, /assertDiscoveryRootGovernance/);
  assert.doesNotMatch(manual, /SET next_check_at|next_check_at<=/);

  assert.match(scheduled, /getDueAutomationDiscoveryRoot/);
  assert.match(scheduled, /requireDue:\s*true/);
  assert.match(scheduled, /SET next_check_at=\?/);
});

test("C/D/E manual finish preserves schedule on success or failure while scheduled finish advances", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  const finish = section(store, "export type AutomationDiscoveryScheduleFinishPolicy", "export type AutomationDiscoveryOutcomeInput");

  assert.match(finish, /"ADVANCE_SCHEDULE" \| "PRESERVE_SCHEDULE"/);
  assert.match(finish, /schedulePolicy === "ADVANCE_SCHEDULE"/);
  assert.match(finish, /scheduledNextCheckAt = nextAutomationDiscoveryCheckAt/);
  const preserveUpdate = finish.match(/:\s*db\.prepare\(`(UPDATE automation_discovery_roots SET[\s\S]*?)`\)\.bind\(\s*completedAt/);
  assert.ok(preserveUpdate, "manual preserve root update must exist");
  assert.doesNotMatch(preserveUpdate[1], /next_check_at/);
  assert.match(finish, /if \(schedulePolicy === "PRESERVE_SCHEDULE"\)[\s\S]*SELECT next_check_at/);

  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /runDiscoveryRoot\(claim\.root, input\.options, claim, "ADVANCE_SCHEDULE"\)/);
  assert.match(runner, /runDiscoveryRoot\(input\.claim\.root, input\.options, input\.claim, "PRESERVE_SCHEDULE"\)/);
});

test("F/G/H manual claim fails closed on governance, enabled and APPROVED gates", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  const manual = section(store, "export async function claimManualAutomationDiscoveryRun", "export async function claimDueAutomationDiscoveryRun");
  assert.match(manual, /!root\.enabled/);
  assert.match(manual, /root\.reviewStatus !== "APPROVED"/);
  assert.match(manual, /assertDiscoveryRootGovernance\(root, db, now\)/);
});

test("I manual endpoint retains existing root budget guard and provider configuration guard", () => {
  const route = read("app/api/admin/automation-categories/[category]/search/route.ts");
  assert.match(route, /remainingRootRequests > 0/);
  assert.match(route, /SEARCH_BUDGET_BLOCKED/);
  assert.match(route, /provider\.credentialConfigured/);
  assert.match(route, /SEARCH_PROVIDER_CONFIG_MISSING/);
  assert.match(route, /AUTOMATION_SEARCH_HARD_ROOT_DAILY_REQUESTS/);
});

test("J/K manual, scheduled and double-click concurrency share a database-backed active-run lock", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  const claimHelper = section(store, "async function createAutomationDiscoveryRunClaim", "export async function claimDueAutomationDiscoveryRoot");
  assert.match(claimHelper, /NOT EXISTS \([\s\S]*automation_discovery_runs active/);
  assert.match(claimHelper, /active\.completed_at IS NULL/);
  assert.match(claimHelper, /active\.started_at>\?/);
  assert.match(claimHelper, /RETURNING id/);

  const scheduled = section(store, "export async function claimDueAutomationDiscoveryRun", "function discoveryGovernanceUsage");
  assert.match(scheduled, /createAutomationDiscoveryRunClaim/);
  assert.match(scheduled, /EXISTS \([\s\S]*active\.id=\?/);

  const manual = section(store, "export async function claimManualAutomationDiscoveryRun", "export async function claimDueAutomationDiscoveryRun");
  assert.match(manual, /createAutomationDiscoveryRunClaim/);
});

test("L/M multi-root manual API counts only claimed roots and never reports started when none were claimed", () => {
  const route = read("app/api/admin/automation-categories/[category]/search/route.ts");
  assert.match(route, /for \(const root of runnable\)[\s\S]*claimAutomationDiscoveryRootManualRun/);
  assert.match(route, /if \(claim\) claims\.push\(claim\)/);
  assert.match(route, /if \(!claims\.length\)/);
  assert.match(route, /startedRootCount:\s*0/);
  assert.match(route, /startedRootCount:\s*claims\.length/);
  assert.match(route, /Promise\.allSettled\(claims\.map/);

  const ui = read("components/admin-automation-search-controls.tsx");
  assert.match(ui, /if \(started <= 0\) throw new Error/);
  assert.match(ui, /limit, governance alebo už aktívny run/);
});

test("N existing admin cooldown release remains explicit and manual-only", () => {
  const route = read("app/api/admin/automation-categories/[category]/search/route.ts");
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(route, /releaseAutomationSearchCooldownsForAdmin/);
  assert.match(route, /reason: "MANUAL_RUN"/);
  assert.doesNotMatch(runner, /releaseAutomationSearchCooldownsForAdmin/);
});

test("O production manual search remains Tavily-only and background-executed", () => {
  const route = read("app/api/admin/automation-categories/[category]/search/route.ts");
  assert.match(route, /TavilyAutomationSearchProvider/);
  assert.match(route, /internetTransport:\s*"TAVILY_ONLY"/);
  assert.match(route, /waitUntil\(task\)/);
  assert.doesNotMatch(route, /fetch\(|axios|browser|scrap/i);
});

test("manual run does not introduce a migration or fake usage path", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  const route = read("app/api/admin/automation-categories/[category]/search/route.ts");
  assert.doesNotMatch(route, /INSERT\s+INTO\s+automation_search_usage/i);
  assert.doesNotMatch(store, /INSERT\s+INTO\s+automation_search_usage[\s\S]*MANUAL_RUN/i);
  assert.match(route, /recordAutomationSearchAdminEvent/);
});
