import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("workspace is bound to real canonical event feed, real next Gemini run and new quality proposals",()=>{
 const page=read("app/admin/page.tsx");
 const feed=read("lib/admin-workspace-feed.ts");
 const ui=read("components/admin-workspace-activity.tsx");
 assert.match(page,/loadAdminWorkspaceFeed\(user\.email\)/);
 assert.match(page,/loadMissingQualityDashboard/);
 assert.match(feed,/FROM admin_notification_events e/);
 assert.match(feed,/admin_notification_read_receipts/);
 assert.match(feed,/FROM gemini_automation_settings/);
 assert.match(feed,/enabled=1 AND next_run_at IS NOT NULL/);
 assert.match(feed,/quality_missing_proposals WHERE status='OPEN'/);
 assert.match(ui,/Na kontrolu/);
 assert.match(ui,/Prečítané/);
 assert.match(ui,/setInterval/);
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

test("admin home streams shell and shares the exact attention read across dashboard/bell", () => {
  const page = read("app/admin/page.tsx");
  const shell = read("components/admin-shell.tsx");
  const start = page.indexOf("export default async function AdminPage");
  const home = page.slice(start);
  assert.match(page, /async function AdminDashboardContent/);
  assert.match(home, /const attentionPromise = loadExactAdminAttentionSummary\(\)/);
  assert.match(home, /attentionSummaryPromise=\{attentionPromise\}/);
  assert.match(home, /<Suspense fallback=\{<p role="status"/);
  assert.match(home, /<AdminDashboardContent[\s\S]*?attentionPromise=\{attentionPromise\}/);
  assert.match(shell, /summaryPromise \?\? loadExactAdminAttentionSummary\(\)/);
  assert.doesNotMatch(home, /await Promise\.all\(/);
  assert.doesNotMatch(home, /attentionCount=\{attention\.active\}/);
});
