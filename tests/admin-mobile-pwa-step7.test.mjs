import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function client(url, calls, name = "existing") {
  return {
    url,
    async focus() { calls.push(name + ":focus"); return this; },
    async navigate() { calls.push(name + ":UNSAFE_NAVIGATE"); return this; },
  };
}

/** Execute the real service worker script with isolated notification clients. */
async function clickPushNotification({ windows, url, canOpen = true }) {
  const calls = [];
  const events = new Map();
  const origin = "https://psipedia.sk";
  const clients = windows.map((path, i) => client(origin + path, calls, "tab" + i));
  const opened = client("", calls, "opened");
  const sw = {
    location: { origin },
    clients: {
      async matchAll() { return clients; },
      async openWindow(target) {
        calls.push("openWindow:" + target);
        if (!canOpen) throw Error("Standalone PWA forbids extra window");
        opened.url = target;
        return opened;
      },
    },
    addEventListener(type, listener) { events.set(type, listener); },
    skipWaiting() {},
    registration: { showNotification() { return Promise.resolve(); } },
  };
  runInNewContext(read("public/sw.js"), { self: sw, URL, console });
  let done;
  const click = {
    notification: { data: { url }, close() { calls.push("close"); } },
    waitUntil(promise) { done = promise; },
  };
  events.get("notificationclick")(click);
  assert.ok(done, "notificationclick must extend service worker lifetime");
  await done;
  return calls;
}

test("push reuses a matching Admin client, without navigating it", async () => {
  const calls = await clickPushNotification({
    windows: ["/admin/organizacie/128", "/admin/operations"],
    url: "/admin/operations",
  });
  assert.deepEqual(calls, ["close", "tab1:focus"]);
});

test("push opens a separate target when existing editor may have an unsaved draft", async () => {
  const calls = await clickPushNotification({
    windows: ["/admin/organizacie/128"],
    url: "/admin/operations?status=pending",
  });
  assert.deepEqual(calls, [
    "close",
    "openWindow:https://psipedia.sk/admin/operations?status=pending",
    "opened:focus",
  ]);
  assert.ok(!calls.some(value => value.includes("UNSAFE_NAVIGATE")));
});

test("if installed PWA cannot open a new client, preserve draft by only focusing it", async () => {
  const calls = await clickPushNotification({
    windows: ["/admin/organizacie/128"],
    url: "/admin/clanky",
    canOpen: false,
  });
  assert.ok(calls.includes("tab0:focus"));
  assert.ok(!calls.some(value => value.includes("UNSAFE_NAVIGATE")));
});

test("unsafe notification destinations remain constrained to authenticated Admin routes", async () => {
  const calls = await clickPushNotification({
    windows: [],
    url: "https://external.example/phishing",
  });
  assert.ok(calls.includes("openWindow:https://psipedia.sk/admin/operations"));
});

test("iOS navigation respects dirty drafts and restores hard-navigation after confirmation", () => {
  const ios = read("components/admin-mobile-document-navigation.tsx");
  const dirty = read("components/admin-editor-navigation-guard.tsx");
  assert.match(ios, /const dirty = document\.documentElement\.hasAttribute\("data-admin-unsaved-editor"\)/);
  assert.match(ios, /const confirmedExit = document\.documentElement\.hasAttribute\("data-admin-exit-authorized"\)/);
  assert.match(ios, /if \(dirty && !confirmedExit\) return/);
  assert.match(ios, /window\.location\.assign\(target\.href\)/);
  assert.match(dirty, /document\.documentElement\.setAttribute\("data-admin-exit-authorized", "true"\)/);
  assert.match(dirty, /document\.documentElement\.removeAttribute\("data-admin-exit-authorized"\)/);
  assert.match(dirty, /data-admin-unsaved-editor/);
});

test("legacy service worker never automatically reloads a dirty Admin tab", () => {
  const pwa = read("components/admin-pwa-registration.tsx");
  assert.match(pwa, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(pwa, /item\.unregister\(\)/);
  assert.match(pwa, /navigator\.serviceWorker\.register\("\/sw\.js", \{ scope: "\/admin\/" \}\)/);
  assert.doesNotMatch(pwa, /window\.location\.reload\(\)/);
  assert.doesNotMatch(pwa, /sessionStorage\.setItem\("psipedia-admin-pwa-scope-migrated"/);
  assert.match(pwa, /window\.addEventListener\("pageshow", handleResume\)/);
});

test("mobile drawer and navigation watchdog release stale state on PWA freeze", () => {
  const navigation = read("components/admin-navigation.tsx");
  const recovery = read("components/admin-navigation-recovery.tsx");
  assert.match(navigation, /window\.addEventListener\("pagehide", releaseOnLifecycle\)/);
  assert.match(navigation, /window\.addEventListener\("pageshow", releaseOnLifecycle\)/);
  assert.match(navigation, /document\.addEventListener\("visibilitychange", releaseWhenHidden\)/);
  assert.match(navigation, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(navigation, /setOpenPath\(null\)/);
  assert.match(recovery, /document\.addEventListener\("visibilitychange", clearOnBackground\)/);
  assert.match(recovery, /window\.removeEventListener\("pagehide", clear\)/);
  assert.match(recovery, /window\.removeEventListener\("pageshow", clear\)/);
});
