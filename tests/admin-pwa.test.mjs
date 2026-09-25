import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { normalizeAdminNotificationPath } from "../lib/admin-web-push.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("manifest declares standalone admin identity and required icon sizes", () => {
  const manifest = read("../app/manifest.ts");
  assert.match(manifest, /start_url:\s*"\/admin"/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /scope:\s*"\/admin\/"/);
  assert.match(manifest, /192x192/);
  assert.match(manifest, /512x512/);
  assert.match(manifest, /purpose:\s*"maskable"/);
  for (const path of [
    "../public/pwa/icon-192.png",
    "../public/pwa/icon-512.png",
    "../public/pwa/icon-maskable-512.png",
    "../public/pwa/apple-touch-icon.png",
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), true, path);
  }
});


test("admin metadata exposes manifest and Apple Home Screen identity", () => {
  const layout = read("../app/admin/layout.tsx");
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(layout, /appleWebApp/);
  assert.match(layout, /capable:\s*true/);
});

test("service worker never intercepts application requests or queues offline mutations", () => {
  const sw = read("../public/sw.js");
  assert.doesNotMatch(sw, /addEventListener\(["\']fetch["\']/i);
  assert.doesNotMatch(sw, /caches\.open|cache\.put|backgroundsync|addEventListener\(["\']sync["\']/i);
  assert.doesNotMatch(sw, /indexedDB|queue.*(?:publish|mutation)/i);
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /addEventListener\("notificationclick"/);
});

test("service worker registration is admin-only and admin remains usable without support", () => {
  const adminLayout = read("../app/admin/layout.tsx");
  const registration = read("../components/admin-pwa-registration.tsx");
  assert.match(adminLayout, /AdminPwaRegistration/);
  assert.match(registration, /"serviceWorker" in navigator/);
  assert.match(registration, /navigator\.serviceWorker\.register\("\/sw\.js", \{ scope: "\/admin\/" \}\)/);
  assert.match(registration, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(registration, /item\.unregister\(\)/);
  assert.match(registration, /catch\(\(error\)/);
  assert.match(registration, /Si offline/);
  assert.match(registration, /neukladajú do fronty/);
});

test("push permission is requested only from explicit enable action", () => {
  const settings = read("../components/admin-pwa-settings.tsx");
  const permissionIndex = settings.indexOf("Notification.requestPermission()");
  const enableIndex = settings.indexOf("async function enableNotifications()");
  const effectIndex = settings.indexOf("useEffect(() =>");
  assert.ok(permissionIndex > enableIndex);
  assert.ok(enableIndex > effectIndex);
  assert.match(settings, /onClick=\{enableNotifications\}/);
  assert.match(settings, /Zapnúť upozornenia na tomto zariadení/);
  assert.doesNotMatch(settings.slice(effectIndex, enableIndex), /requestPermission/);
});

test("push routes require authenticated admin and same-origin JSON for mutations", () => {
  const config = read("../app/api/admin/push/config/route.ts");
  const subscription = read("../app/api/admin/push/subscription/route.ts");
  assert.match(config, /getAdminApiUser/);
  assert.match(subscription, /getAdminApiUser/);
  assert.match(subscription, /request\.headers\.get\("origin"\) === new URL\(request\.url\)\.origin/);
  assert.match(subscription, /application\/json/);
  assert.match(subscription, /disableAdminPushSubscription\(user\.email/);
  assert.match(subscription, /registerAdminPushSubscription\(user\.email/);
});

test("subscription ownership, idempotency, multiple devices and cleanup are explicit", () => {
  const push = read("../lib/admin-push.ts");
  const migration = read("../drizzle/0054_admin_pwa_push_foundation.sql");
  assert.match(push, /Push subscription patrí inému admin účtu/);
  assert.match(push, /MAX_DEVICES_PER_ADMIN = 10/);
  assert.match(push, /ON CONFLICT\(endpoint\) DO UPDATE/);
  assert.match(push, /SELECT id, admin_email, created_at/);
  assert.match(push, /e\.created_at >= \?/);
  assert.doesNotMatch(push, /e\.created_at >= subscription\.last_seen_at/);
  assert.match(push, /WHERE admin_push_subscriptions\.admin_email = excluded\.admin_email/);
  assert.match(push, /result\.expired/);
  assert.match(push, /enabled = 0/);
  assert.match(push, /MAX_ATTEMPTS = 3/);
  assert.match(push, /MAX_DELIVERIES_PER_SWEEP = 50/);
  assert.match(push, /DELETE FROM admin_push_subscriptions WHERE enabled = 0/);
  assert.match(migration, /UNIQUE INDEX `admin_push_subscriptions_endpoint_unique`/);
  assert.doesNotMatch(migration, /UNIQUE[^\n]*admin_email/i);
});

test("notification click URLs are constrained to admin routes", () => {
  assert.equal(normalizeAdminNotificationPath("/admin"), "/admin");
  assert.equal(normalizeAdminNotificationPath("/admin/operations/automation/7?x=1#detail"), "/admin/operations/automation/7?x=1#detail");
  assert.equal(normalizeAdminNotificationPath("/adresar"), "/admin/operations");
  assert.equal(normalizeAdminNotificationPath("//evil.example/admin"), "/admin/operations");
  assert.equal(normalizeAdminNotificationPath("https://evil.example/admin"), "/admin/operations");

  const sw = read("../public/sw.js");
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /clients\.matchAll/);
  assert.match(sw, /existing\.navigate\(target\)/);
  assert.match(sw, /clients\.openWindow\(target\)/);
});

test("push is optional and isolated from canonical operations", () => {
  const push = read("../lib/admin-push.ts");
  const worker = read("../worker/index.ts");
  const envExample = read("../.env.example");
  assert.match(push, /WEB_PUSH_ENABLED !== "true"/);
  assert.match(worker, /runAdminPushSweep/);
  assert.match(worker, /admin_push_sweep/);
  assert.match(worker, /\.catch\(\(error\) =>/);
  assert.match(envExample, /WEB_PUSH_ENABLED=false/);
  assert.match(envExample, /VAPID_PRIVATE_KEY=/);
  assert.doesNotMatch(read("../public/sw.js"), /VAPID_PRIVATE_KEY|privateKey/);
});

test("worker keeps admin and API responses private/no-store", () => {
  const worker = read("../worker/index.ts");
  assert.match(worker, /isAdminAuthPath\(url\.pathname\) \|\| url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /"Cache-Control", "private, no-store"/);
});
