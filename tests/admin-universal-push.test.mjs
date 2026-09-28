import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("0071 is additive and creates the universal event plus delivery model",()=>{
  const migration=read("drizzle/0071_admin_universal_notifications.sql");
  assert.match(migration,/CREATE TABLE `admin_notification_runtime`/);
  assert.match(migration,/rollout_started_at/);
  assert.match(migration,/CREATE TABLE `admin_notification_events`/);
  assert.match(migration,/admin_notification_events_dedupe_unique/);
  assert.match(migration,/CREATE TABLE `admin_push_event_deliveries`/);
  assert.match(migration,/admin_push_event_deliveries_event_subscription_unique/);
  assert.doesNotMatch(migration,/DROP TABLE|ALTER TABLE/);
});

test("universal delivery preserves subscription boundary, per-device dedupe and deterministic admin self-suppression",()=>{
  const push=read("lib/admin-push.ts");
  assert.match(push,/e\.created_at >= \?/);
  assert.match(push,/d\.event_id = e\.id AND d\.subscription_id = \?/);
  assert.match(push,/e\.actor_type = 'ADMIN' AND e\.actor_ref = \?/);
  assert.match(push,/e\.actor_type <> 'ADMIN'/);
  assert.match(push,/hashPii\(normalizeEmail\(email\), key\)/);
  assert.match(push,/ON CONFLICT\(event_id, subscription_id\) DO NOTHING/);
  assert.match(push,/LIMIT 50/);
  assert.match(push,/MAX_ATTEMPTS = 3/);
  assert.match(push,/result\.expired/);
  assert.match(push,/admin_push_event_deliveries[\s\S]+status = 'dead'/);
  assert.match(push,/DELETE FROM admin_notification_events/);
});

test("payloads stay short, admin-only and free of raw submission PII",()=>{
  const events=read("lib/admin-notifications.ts");
  assert.match(events,/normalizeAdminNotificationPath\(input\.targetUrl\)/);
  assert.match(events,/title: clean\(input\.title, 60/);
  assert.match(events,/body: clean\(input\.body, 160/);
  assert.match(events,/tag: clean\(input\.tag, 80/);
  assert.doesNotMatch(events,/request_message|request_note|reviewer.*email|contact_phone|contact_email/);
});

test("Partner registration alerts cover magic-link, password and Google creation without ordinary login alerts",()=>{
  const notifications=read("lib/admin-notifications.ts");
  assert.match(notifications,/enqueuePartnerAccountRegistrationAdminNotification/);
  assert.match(notifications,/partner_account_registered/);
  assert.match(notifications,/\/admin\/partners\/accounts\//);

  const auth=read("lib/partner-auth.ts");
  const created=auth.slice(auth.indexOf("if (created.created)"),auth.indexOf("// Public response remains identical"));
  assert.match(created,/enqueuePartnerAccountRegistrationAdminNotification/);
  const login=auth.slice(auth.indexOf('if (!existing && mode === "LOGIN")'),auth.indexOf("let account = existing"));
  assert.doesNotMatch(login,/enqueuePartnerAccountRegistrationAdminNotification/);

  const password=read("lib/partner-password-auth.ts");
  const passwordRegister=password.slice(password.indexOf("export async function registerPartnerWithPassword"),password.indexOf("export async function loginPartnerWithPassword"));
  assert.match(passwordRegister,/if\(created\)[\s\S]+enqueuePartnerAccountRegistrationAdminNotification/);

  const google=read("lib/partner-google-auth.ts");
  const googleCreate=google.slice(google.indexOf("const accountId=crypto.randomUUID()"),google.indexOf("export async function getPendingGoogleLink"));
  assert.match(googleCreate,/createActiveGooglePartnerAccount[\s\S]+enqueuePartnerAccountRegistrationAdminNotification/);
});

test("Partner actionable creation events have universal admin push coverage",()=>{
  const claims=read("lib/partner-claims.ts");
  assert.match(claims,/partner_claim_submitted/);
  assert.match(claims,/partner_verification_requested/);
  assert.match(claims,/\/admin\/partners\/claims\//);
  assert.match(claims,/\/admin\/partners\/verifications\//);

  const changes=read("lib/partner-profile-changes.ts");
  assert.match(changes,/partner_profile_change_submitted/);
  assert.match(changes,/\/admin\/partners\/changes\//);

  const profiles=read("lib/partner-new-profile.ts");
  assert.match(profiles,/partner_new_profile_submitted/);
  assert.match(profiles,/\/admin\/partners\/submissions\//);

  const events=read("lib/partner-events.ts");
  assert.match(events,/partner_event_submitted/);
  assert.match(events,/partner_event_change_submitted/);
  assert.match(events,/\/admin\/partners\/events\//);

  const commercial=read("lib/partner-commercial.ts");
  assert.match(commercial,/partner_commercial_lead_created/);
  assert.match(commercial,/\/admin\/partners\/commercial\//);
});

test("Partner commercial agreement lifecycle has universal push coverage with admin self-suppression identity",()=>{
  const source=read("lib/partner-commercial-agreements.ts");
  assert.match(source,/adminNotificationAdminActorRef/);
  assert.match(source,/partner_commercial_agreement_created/);
  assert.match(source,/partner_commercial_agreement_updated/);
  assert.match(source,/partner_commercial_payment_paid/);
  assert.match(source,/partner_commercial_payment_waived/);
  assert.match(source,/partner_commercial_agreement_activated/);
  assert.match(source,/partner_commercial_entitlement_paused/);
  assert.match(source,/partner_commercial_agreement_cancelled/);
  assert.match(source,/partner_commercial_agreement_expired/);
  assert.match(source,/actorType:"SYSTEM"/);
  assert.match(source,/\/admin\/partners\/commercial\/agreements\//);
  assert.match(source,/partner_commercial_admin_push_enqueue/);
});

test("public, review, automation and geo actionable events have push coverage",()=>{
  const inquiry=read("lib/directory-inquiry-notifications.ts");
  assert.match(inquiry,/directory_inquiry_submitted/);
  assert.match(inquiry,/notificationType === "new"/);

  const editorial=read("lib/admin-notifications.ts");
  assert.match(editorial,/directory_profile_change_submitted/);
  assert.match(editorial,/news_tip_submitted/);
  assert.match(editorial,/negative_article_feedback_submitted/);
  assert.match(editorial,/Boolean\(row\.helpful\)/);

  const reviews=read("lib/profile-review-submission.ts");
  assert.match(reviews,/profile_review_submitted/);
  assert.match(reviews,/PENDING_REVIEW/);

  const automation=read("lib/data-automation-runner.ts");
  assert.match(automation,/if \(!createdOrReopened\) return/);
  assert.match(automation,/enqueueAutomationFindingAdminNotification/);
  assert.match(automation,/automationFindingPriority\(type\) !== "HIGH"/);

  const geo=read("lib/geo-store.ts");
  assert.match(geo,/\["NEEDS_REVIEW", "STALE", "FAILED"\]/);
  assert.match(geo,/adminNotificationAdminActorRef\(input\.actorRef\)/);
  assert.match(geo,/current\.geocodeStatus !== point\.geocodeStatus \|\| current\.lastErrorCode !== point\.lastErrorCode/);
  assert.match(geo,/point\.lastErrorAt \?\? now/);
  assert.match(geo,/dedupeKey: `geo\/\$\{input\.point\.id\}\/\$\{input\.activationKey\}/);
});

test("remaining Attention sources use the rollout watermark instead of replaying historical backlog",()=>{
  const events=read("lib/admin-notifications.ts");
  const push=read("lib/admin-push.ts");
  assert.match(events,/admin_notification_runtime/);
  assert.match(events,/created_at >= \?/);
  assert.match(events,/activationIso < rolloutStartedAt/);
  assert.match(events,/ADOPTION_STALE_DAYS/);
  assert.match(events,/partner_commercial_agreements/);
  assert.match(events,/status='ACTIVE' AND end_at>\? AND end_at<=\?/);
  assert.match(events,/partner_commercial_agreement_expiring/);
  assert.match(events,/submitterType === "ADMIN"/);
  assert.match(events,/candidate\.startsWith\("admin:"\) && candidate\.includes\("@"\)/);
  assert.match(events,/adminNotificationAdminActorRef\(candidate\.slice\("admin:"\.length\)\)/);
  assert.match(events,/adminNotificationAdminActorRef\(candidate\)/);
  assert.match(push,/enqueueUncoveredAttentionAdminNotifications/);
});

test("live intake mirrors push while retry and reminder sweeps cannot replay historical submissions",()=>{
  const editorial=read("lib/editorial-notifications.ts");
  const inquiry=read("lib/directory-inquiry-notifications.ts");
  assert.match(editorial,/if \(options\.mirrorAdminPush\) await mirrorAdminPushEvent/);
  assert.match(inquiry,/notificationType === "new" && options\.mirrorAdminPush/);

  for(const path of [
    "app/api/article-feedback/route.ts",
    "app/api/directory/profile-change-requests/route.ts",
    "app/api/news-tips/route.ts",
  ]){
    assert.match(read(path),/mirrorAdminPush: true/);
  }
  assert.match(read("app/api/directory/inquiries/route.ts"),/mirrorAdminPush: saved\.created/);

  const worker=read("worker/index.ts");
  assert.doesNotMatch(worker,/mirrorAdminPush/);
  assert.doesNotMatch(editorial.slice(editorial.indexOf("export async function runEditorialNotificationSweep")),/mirrorAdminPush:\s*true/);
  assert.doesNotMatch(inquiry.slice(inquiry.indexOf("export async function runDirectoryInquiryReminderSweep")),/mirrorAdminPush:\s*true/);
});

test("canonical submissions remain independent from the optional push schema",()=>{
  for(const path of [
    "lib/profile-review-submission.ts",
    "lib/partner-profile-changes.ts",
    "lib/partner-new-profile.ts",
    "lib/partner-events.ts",
  ]){
    const source=read(path);
    assert.doesNotMatch(source,/adminNotificationEventStatement/);
    assert.match(source,/enqueueAdminNotificationEvent/);
    assert.match(source,/catch \(error\)/);
  }
});

test("legacy push remains drain-only and universal push does not create a parallel email channel",()=>{
  const push=read("lib/admin-push.ts");
  const events=read("lib/admin-notifications.ts");
  const migration=read("drizzle/0071_admin_universal_notifications.sql");
  assert.match(push,/const remaining = Math\.max\(0, MAX_DELIVERIES_PER_SWEEP - eventRows\.results\.length\)/);
  assert.match(push,/FROM admin_push_deliveries d/);
  assert.doesNotMatch(events,/sendEmail|Resend|notify.*Email|editorial_email/i);
  assert.doesNotMatch(migration,/email_outbox|recipient_email/);
});

test("one five-minute cron preserves hourly full work without consuming a second trigger",()=>{
  const wrangler=read("wrangler.jsonc");
  const worker=read("worker/index.ts");
  const pushCron="*/5 * * * *";
  assert.ok(wrangler.includes(`"crons": ["${pushCron}"]`));
  assert.ok(worker.includes(`ADMIN_PUSH_CRON = "${pushCron}"`));
  assert.match(worker,/scheduledTime/);
  assert.match(worker,/getUTCMinutes\(\) === 0/);
  const fastBranch=worker.slice(worker.indexOf("if (!isFullHourlyScheduledSweep(controller))"),worker.indexOf("const [summary, editorial"));
  assert.match(fastBranch,/runScheduledAdminPush\(env\)/);
  assert.match(fastBranch,/return;/);
  assert.doesNotMatch(fastBranch,/runDataAutomationSweep|runNotion|runEditorialNotificationSweep|runPartnerNotificationSweep/);
  assert.match(worker,/const adminPush = await runScheduledAdminPush\(env\)/);
});

test("settings explain broad alert coverage without per-category preferences",()=>{
  const settings=read("components/admin-pwa-settings.tsx");
  assert.match(settings,/nových podaniach, Partner aktivitách a automatických nálezoch/);
  assert.doesNotMatch(settings,/notificationCategories|per-category|kategóri.*upozornen/i);
});
