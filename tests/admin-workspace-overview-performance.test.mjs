import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("homepage uses one quality priority metric without duplicate workspace links", () => {
  const page = read("app/admin/page.tsx");
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  const activity = read("components/admin-workspace-activity.tsx");
  const overview = read("lib/admin-workspace-feed.ts")
    .split("export async function loadAdminWorkspaceOverview(")[1]
    .split("export async function markAdminWorkspaceEventRead(")[0];

  assert.match(page, /const qualityPromise = loadWorkspaceQuality\(\)/);
  assert.match(page, /const workspaceFeedPromise = loadAdminWorkspaceOverview\(\)/);
  assert.match(dashboard, /const activity = await promise/);
  assert.match(dashboard, /<WorkspaceActivityPanel promise=\{activityPromise\} \/>/);
  assert.match(dashboard, /async function WorkspaceQualityMetric/);
  assert.doesNotMatch(dashboard, /qualityPending=\{/);
  assert.doesNotMatch(activity, /qualityPending/);
  assert.doesNotMatch(activity, /href="\/admin\/kvalita"/);

  assert.match(overview, /FROM gemini_automation_settings/);
  assert.doesNotMatch(overview, /quality_missing_proposals|admin_notification_events|SELECT COUNT\(/);
  assert.doesNotMatch(overview, /\b(?:INSERT|UPDATE|DELETE)\b/);
});

test("community links are available after exact counts, empty queues are collapsed", () => {
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  assert.match(dashboard, /function WorkspaceCommunityPending\(/);
  assert.match(dashboard, /href=\{`\/admin\/operations\?source=\$\{source\}`\}/);
  assert.match(dashboard, /<Suspense fallback=\{<WorkspaceCommunityPending \/>\}>/);
  assert.match(dashboard, /<WorkspaceCommunityCounts promise=\{promise\} \/>/);
  assert.match(dashboard, /<WorkspaceCommunity promise=\{attentionPromise\} \/>/);
  assert.match(dashboard, /const attention = await promise/);
  assert.match(dashboard, /data-admin-completed-queues/);
  assert.match(dashboard, /data-admin-actionable-queues/);
  assert.match(dashboard, /completed\.map/);
  assert.doesNotMatch(dashboard, /Načítavajú sa verejné podnety/);
});
