import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("desktop Prehľad header navigates with a fresh document, not just disclosure", () => {
  const source = read("components/admin-navigation.tsx");
  assert.match(source, /const navigatesToOverview = !mobile && pathname !== "\/admin" &&\s*group\.items\.some\(\(item\) => item\.href === "\/admin"\)/);
  assert.match(source, /\) : navigatesToOverview \? \(/);
  assert.match(source, /<Link href="\/admin" prefetch=\{false\} className=\{styles\.groupButton\}/);
  assert.match(source, /aria-label="Prejsť na pracovný prehľad" onClick=\{handleAdminOverviewLink\}/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /aria-controls=\{`admin-group-\$\{groupIndex\}`\}/);
  assert.match(source, /dispatchAdminOverviewNavigation\(\(\) => window\.location\.assign\("\/admin"\)\)/);
  assert.match(source, /setExpandedDesktopGroup\(\{ pathname, group: expanded \? "" : group\.label \}\)/);
});

test("accepted programmatic transitions are watched by the existing Admin navigation recovery", () => {
  const client = read("instrumentation-client.ts");
  const recovery = read("components/admin-navigation-recovery.tsx");
  assert.match(client, /export function onRouterTransitionStart\(href: string, navigationType: "push" \| "replace" \| "traverse"\)/);
  assert.match(client, /window\.dispatchEvent\(new CustomEvent<AdminNavigationStartDetail>\(ADMIN_NAVIGATION_START_EVENT/);
  assert.match(recovery, /window\.addEventListener\(ADMIN_NAVIGATION_START_EVENT, onStart\)/);
  assert.match(recovery, /setStalled\(true\)/);
});

test("programmatic header navigation honors the dirty-editor confirmation", () => {
  const nav = read("components/admin-navigation.tsx");
  const intent = read("lib/admin-overview-navigation.ts");
  const guard = read("components/admin-editor-navigation-guard.tsx");
  assert.match(nav, /dispatchAdminOverviewNavigation\(\(\) => window\.location\.assign\("\/admin"\)\)/);
  assert.match(intent, /new CustomEvent<AdminNavigationIntent>\(ADMIN_NAVIGATION_INTENT_EVENT, \{/);
  assert.match(intent, /cancelable: true,\s*detail: \{ href: "\/admin", navigate \}/);
  assert.match(intent, /if \(dispatch\(intent\)\) navigate\(\)/);
  assert.match(guard, /window\.addEventListener\(ADMIN_NAVIGATION_INTENT_EVENT, onIntent\)/);
  assert.match(guard, /event\.preventDefault\(\);\s*requestNavigation\(detail\.navigate\)/);
});

test("stalled navigation retry uses the shared dirty-editor intent guard", () => {
  const recovery = read("components/admin-navigation-recovery.tsx");
  assert.match(recovery, /new CustomEvent<AdminNavigationIntent>\(ADMIN_NAVIGATION_INTENT_EVENT, \{/);
  assert.match(recovery, /cancelable: true,\s*detail: \{ href: pending\.href, navigate \}/);
  assert.match(recovery, /if \(window\.dispatchEvent\(intent\)\) navigate\(\)/);
  assert.match(recovery, /const navigate = \(\) => \{[\s\S]*?router\.push\(pending\.href\)/);
});

test("authenticated streamed dashboard uses native guarded navigation without prefetch", () => {
  const nav = read("components/admin-navigation.tsx");
  assert.match(nav, /if \(href === "\/admin"\) return;/);
  assert.ok(nav.indexOf('if (href === "/admin") return;') < nav.indexOf("router.prefetch(href)"));
  assert.match(nav, /prefetch=\{false\}/);
  assert.match(nav, /onClick=\{item\.href === "\/admin" \? handleAdminOverviewLink : undefined\}/);
  assert.match(nav, /dispatchAdminOverviewNavigation\(\(\) => window\.location\.assign\("\/admin"\)\)/);
  assert.doesNotMatch(nav, /router\.push\("\/admin"\)/);
});

test("slow attention, quality and activity reads remain isolated from workspace shell", () => {
  const page = read("app/admin/page.tsx");
  const shell = read("components/admin-shell.tsx");
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  assert.match(page, /const attentionPromise = loadRequestAdminAttentionSummary\(\)/);
  assert.match(page, /const qualityPromise = loadWorkspaceQuality\(\)/);
  assert.match(page, /const workspaceFeedPromise = loadAdminWorkspaceOverview\(\)/);
  assert.match(page, /attentionSummaryPromise=\{boundedAttentionPromise\}/);
  assert.match(page, /attentionPromise=\{boundedAttentionPromise\}/);
  assert.match(page, /qualityPromise=\{boundedQualityPromise\}/);
  assert.match(page, /activityPromise=\{boundedWorkspaceFeedPromise\}/);
  assert.match(page, /const boundedAttentionPromise = settleAdminOverviewRead\(attentionPromise, unavailableAttention\)/);
  assert.match(page, /availability: "UNAVAILABLE"/);
  assert.match(page, /bySource: Object\.fromEntries\(adminAttentionQueueSourceTypes\.map/);
  assert.match(shell, /<Suspense fallback=\{<AdminNotificationBellPending \/>\}>/);
  assert.match(dashboard, /<Suspense fallback=\{<PendingMetric label="Aktívne upozornenia" \/>\}>/);
  assert.match(dashboard, /<Suspense fallback=\{<PendingMetric label="Kvalita údajov" \/>\}>/);
  assert.match(dashboard, /<Suspense fallback=\{<WorkspaceCommunityPending \/>\}>/);
  assert.match(dashboard, /<Suspense fallback=\{<p role="status">Načítava sa pracovný feed…<\/p>\}>/);
  assert.doesNotMatch(page, /await (?:loadRequestAdminAttentionSummary|loadWorkspaceQuality|loadAdminWorkspaceOverview)\(/);
});
