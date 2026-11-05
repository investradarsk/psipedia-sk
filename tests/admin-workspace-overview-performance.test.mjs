import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("homepage uses one quality count shared by metric and workspace links", () => {
  const page = read("app/admin/page.tsx");
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  const activity = read("components/admin-workspace-activity.tsx");
  const overview = read("lib/admin-workspace-feed.ts")
    .split("export async function loadAdminWorkspaceOverview(")[1]
    .split("export async function markAdminWorkspaceEventRead(")[0];

  assert.match(page, /const qualityPromise = loadWorkspaceQuality\(\)/);
  assert.match(page, /const workspaceFeedPromise = loadAdminWorkspaceOverview\(\)/);
  assert.match(dashboard, /const \[activity, qualityRead\] = await Promise\.all\(\[promise, qualityPromise\]\)/);
  assert.match(dashboard, /qualityPending=\{qualityRead\.status === "UNAVAILABLE" \? null : qualityRead\.data\.profilesWithCoreIssues\}/);
  assert.match(activity, /qualityPending !== null \?/);
  assert.doesNotMatch(activity, /initial\.qualityPending/);

  assert.match(overview, /FROM gemini_automation_settings/);
  assert.doesNotMatch(overview, /quality_missing_proposals|admin_notification_events|SELECT COUNT\(/);
  assert.doesNotMatch(overview, /\b(?:INSERT|UPDATE|DELETE)\b/);
});

test("community links render before exact attention counts finish", () => {
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  assert.match(dashboard, /function WorkspaceCommunityPending\(/);
  assert.match(dashboard, /href=\{`\/admin\/operations\?source=\$\{source\}`\}/);
  assert.match(dashboard, /<Suspense fallback=\{<WorkspaceCommunityPending \/>\}>/);
  assert.match(dashboard, /<WorkspaceCommunityCounts promise=\{promise\} \/>/);
  assert.match(dashboard, /<WorkspaceCommunity promise=\{attentionPromise\} \/>/);
  assert.match(dashboard, /const attention = await promise/);
  assert.doesNotMatch(dashboard, /Načítavajú sa verejné podnety/);
});
