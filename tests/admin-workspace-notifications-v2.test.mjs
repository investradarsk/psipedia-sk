import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("workspace uses lightweight actionable overview while canonical event history remains in the API",()=>{
 const page=read("app/admin/page.tsx");
 const feed=read("lib/admin-workspace-feed.ts");
 const ui=read("components/admin-workspace-activity.tsx");
 assert.match(page,/loadAdminWorkspaceOverview\(\)/);
 assert.match(page,/loadAdminQualityPendingSummary/);
 assert.doesNotMatch(page,/loadMissingQualityDashboard/);
 assert.match(feed,/FROM admin_notification_events e/);
 assert.match(feed,/admin_notification_read_receipts/);
 assert.match(feed,/FROM gemini_automation_settings/);
 assert.match(feed,/enabled=1 AND next_run_at IS NOT NULL/);
 assert.match(feed,/quality_missing_proposals WHERE status='OPEN'/);
 assert.match(feed,/export async function loadAdminWorkspaceOverview/);
 assert.match(ui,/href="\\/admin\\/operations"/);
 assert.match(ui,/href="\\/admin\\/mapy"/);
 assert.match(ui,/href="\\/admin\\/kvalita"/);
 assert.doesNotMatch(ui,/shown\\.map|data\\.items\\.map/);
 assert.doesNotMatch(ui,/Math\.random\(\)/);
});
test("work feed write is authenticated and only marks read, not canonical approval",()=>{
 const route=read("app/api/admin/workspace/feed/route.ts");
 assert.match(route,/requireAdminMutation\(request\)/);
 assert.match(route,/markAdminWorkspaceEventRead/);
 assert.match(route,/Cache-Control":"private, no-store"/);
 const feed=read("lib/admin-workspace-feed.ts");
 assert.match(feed,/INSERT INTO admin_notification_read_receipts/);
 assert.doesNotMatch(feed,/UPDATE profile_reviews|UPDATE moderation_submissions/);
});
test("Gemini and Facebook notifications happen after persisted successes; failures stay in feed",()=>{
 const gemini=read("lib/gemini-automation-pilot.ts");
 const events=read("lib/gemini-automation-event-runner.ts");
 const facebook=read("lib/facebook-image-publisher.ts");
 const sync=read("lib/notion-facebook-images-sync.ts");
 const quality=read("lib/data-quality-missing-hourly.ts");
 assert.ok(gemini.indexOf("finishGeminiRun(input.database")<gemini.indexOf("enqueueGeminiCreatedProfileNotification"));
 assert.ok(events.indexOf("finishGeminiRun(input.database")<events.indexOf("enqueueGeminiCreatedProfileNotification"));
 assert.match(gemini,/gemini_run_failed/);
 assert.match(events,/gemini_run_failed/);
 assert.ok(facebook.lastIndexOf("state='PUBLISHED'")<facebook.lastIndexOf("facebook_image_published"));
 assert.match(sync,/facebook_image_imported/);
 assert.match(quality,/quality_missing_found/);
});
test("push switch stored with version marker; both queue and retry obey it",()=>{
 const push=read("lib/admin-push.ts");
 const ui=read("components/admin-pwa-settings.tsx");
 const policy=read("lib/admin-automation-push-policy.ts");
 assert.match(policy,/EVENTS_CONFIGURED/);
 assert.match(ui,/ADMIN_PUSH_EVENT_SETTINGS/);
 assert.match(ui,/EVENTS_CONFIGURED/);
 assert.ok((push.match(/isAdminPushEventAllowed/g)||[]).length>=3);
 assert.match(push,/category_disabled/);
});

test("admin home streams attention, quality and activity in independent suspense sections", () => {
  const page = read("app/admin/page.tsx");
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  const shell = read("components/admin-shell.tsx");
  const home = page.slice(page.indexOf("export default async function AdminPage"));
  assert.match(home, /const attentionPromise = loadExactAdminAttentionSummary\(\)/);
  assert.match(home, /attentionSummaryPromise=\{attentionPromise\}/);
  assert.match(home, /<AdminWorkspaceDashboard[\s\S]*?attentionPromise=\{attentionPromise\}/);
  assert.match(home, /qualityPromise=\{qualityPromise\}/);
  assert.match(home, /activityPromise=\{workspaceFeedPromise\}/);
  assert.match(dashboard, /async function WorkspaceActivityPanel/);
  assert.match(dashboard, /async function WorkspaceAttentionMetrics/);
  assert.match(dashboard, /async function WorkspaceQualityMetric/);
  assert.match(dashboard, /async function WorkspaceCommunity/);
  assert.match(dashboard, /<Suspense fallback=\{<PendingMetric label="Kvalita údajov" \/>\}>/);
  assert.match(dashboard, /<WorkspaceCommunity promise=\{attentionPromise\} \/>/);
  assert.match(shell, /summaryPromise \?\? loadExactAdminAttentionSummary\(\)/);
  assert.doesNotMatch(home, /await Promise\.all\(/);
  assert.doesNotMatch(home, /attentionCount=\{attention\.active\}/);
});

test("workspace inbox excludes read receipts and canonically completed work before applying limit", () => {
  const feed = read("lib/admin-workspace-feed.ts");
  assert.match(feed, /WHERE r\.read_at IS NULL/);
  assert.match(feed, /WHEN e\.source_type='PROFILE_REVIEW_MODERATION'[\s\S]*?p\.status='PENDING_REVIEW'/);
  assert.match(feed, /WHEN e\.source_type='PARTNER_CLAIM_REVIEW'[\s\S]*?p\.status='PENDING'/);
  assert.match(feed, /WHEN e\.source_type='NEWS_TIP'[\s\S]*?n\.status IN \('new','reviewing'\)/);
  assert.match(feed, /WHEN e\.source_type='DIRECTORY_CHANGE_REQUEST'[\s\S]*?d\.status='new'/);
  assert.match(feed, /WHEN e\.source_type='ARTICLE_FEEDBACK'[\s\S]*?a\.status IN \('new','reviewing'\)/);
  assert.match(feed, /WHEN e\.source_type='QUALITY_MISSING'[\s\S]*?q\.status='OPEN'/);
  assert.match(feed, /WHEN e\.source_type='FACEBOOK_IMAGE'[\s\S]*?f\.status<>'published'/);
  assert.match(feed, /WHEN e\.source_type='GEMINI_CREATED'[\s\S]*?d\.status='draft'/);
  assert.ok(feed.indexOf("WHERE r.read_at IS NULL") < feed.indexOf("LIMIT 30"));
  assert.doesNotMatch(feed, /UPDATE (profile_reviews|news_tips|moderation_submissions)/);
});

test("dashboard prioritizes real queues and quick agendas over the activity feed", () => {
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  const activity = read("components/admin-workspace-activity.tsx");
  const attention = dashboard.indexOf('id="admin-priority-title"');
  const community = dashboard.indexOf("<WorkspaceCommunity promise={attentionPromise} />");
  const quick = dashboard.indexOf('aria-label="Automatizácie a rýchla správa"');
  const feed = dashboard.indexOf("<WorkspaceActivityPanel promise={activityPromise} />");
  assert.ok(attention !== -1 && attention < community && community < quick && quick < feed);
  assert.match(activity, /Otvoriť pracovnú sekciu/);
  assert.match(activity, /href="\\/admin\\/operations"/);
  assert.match(activity, /href="\\/admin\\/mapy"/);
  assert.doesNotMatch(activity, /Prečítané|shown\\.map|hiddenIds/);
});
