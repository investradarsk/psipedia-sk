import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deferPublicThirdParty,
  THIRD_PARTY_IDLE_TIMEOUT_MS,
} from "../lib/defer-public-third-party.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("third-party idle task runs once under deadline and cancels when consent/route changes", () => {
  let callback = null;
  let timeout = null;
  let cancelled = null;
  const scheduler = {
    requestIdleCallback(next, options) {
      callback = next;
      timeout = options.timeout;
      return 71;
    },
    cancelIdleCallback(id) { cancelled = id; },
    setTimeout() { throw new Error("Should prefer idle scheduling"); },
    clearTimeout() { throw new Error("No fallback timeout in idle mode"); },
  };
  let calls = 0;
  const cancel = deferPublicThirdParty(() => calls++, scheduler);
  assert.equal(timeout, THIRD_PARTY_IDLE_TIMEOUT_MS);
  assert.equal(timeout, 900);
  assert.equal(calls, 0);
  callback();
  callback();
  assert.equal(calls, 1);
  cancel();
  assert.equal(cancelled, 71);
});

test("cancellation prevents pending advertising script callback after consent revocation", () => {
  let callback;
  let cancelled = null;
  const scheduler = {
    requestIdleCallback(next) { callback = next; return 11; },
    cancelIdleCallback(id) { cancelled = id; },
    setTimeout() { throw new Error("Unexpected setTimeout"); },
    clearTimeout() {},
  };
  let calls = 0;
  const cancel = deferPublicThirdParty(() => calls++, scheduler);
  cancel();
  callback();
  assert.equal(calls, 0);
  assert.equal(cancelled, 11);
});

test("Safari/older browsers use one cancellable timeout without busy polling", () => {
  let handler;
  let timeout;
  let cleared;
  const scheduler = {
    setTimeout(next, ms) {
      handler = next;
      timeout = ms;
      return 22;
    },
    clearTimeout(id) { cleared = id; },
  };
  let calls = 0;
  const cancel = deferPublicThirdParty(() => calls++, scheduler);
  assert.equal(timeout, THIRD_PARTY_IDLE_TIMEOUT_MS);
  handler();
  handler();
  assert.equal(calls, 1);
  cancel();
  assert.equal(cleared, 22);
});

test("fallback cancellation never runs the deferred task", () => {
  let handler;
  const scheduler = {
    setTimeout(next) { handler = next; return 23; },
    clearTimeout() {},
  };
  let called = false;
  const cancel = deferPublicThirdParty(() => { called = true; }, scheduler);
  cancel();
  handler();
  assert.equal(called, false);
});

test("AdSense remains advertising-consent-only, ignores internal/private traffic, and rechecks before injection", () => {
  const loader = read("components/programmatic-ad-loader.tsx");
  assert.match(loader, /canLoadProgrammaticAds\(\{ enabled, clientId \}, consent\)/);
  assert.match(loader, /isPartnerRoute \|\| isReviewAuthRoute \|\| isInternalTraffic\(\)/);
  assert.match(loader, /const consent: ConsentChoice \| null/);
  assert.match(loader, /function injectIfEligible\(\)/);
  assert.match(loader, /if \(!eligible\(\) \|\| document\.querySelector\("script\[data-psipedia-programmatic-ads\]"\)\) return/);
  assert.match(loader, /const onConsentChanged = \(\) => maybeLoad\(true\)/);
  assert.match(loader, /const onInternalTrafficChanged = \(\) => maybeLoad\(true\)/);
  assert.match(loader, /cancelPending\(\)/);
  assert.match(loader, /deferPublicThirdParty\(\(\) =>/);
  assert.match(loader, /window\.removeEventListener\(CONSENT_EVENT, onConsentChanged\)/);
  assert.match(loader, /window\.removeEventListener\(INTERNAL_TRAFFIC_EVENT, onInternalTrafficChanged\)/);
  assert.equal((loader.match(/document\.head\.appendChild\(script\)/g) ?? []).length, 1);
  assert.match(loader, /script\.async = true/);
  assert.match(loader, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
});

test("GA4 and AI referral measurement retain existing consent and dedupe contracts", () => {
  const consent = read("components/cookie-consent.tsx");
  const tracker = read("components/ad-exposure-tracker.tsx");
  assert.match(consent, /void sendPageView\(pathname\)/);
  assert.match(consent, /await loadAnalytics\(\)/);
  assert.match(consent, /send_page_view: false/);
  assert.match(consent, /const currentConsent = window\.localStorage\.getItem\(CONSENT_KEY\)/);
  assert.match(consent, /"analytics" && currentConsent !== "advertising"/);
  assert.match(consent, /isStoredInternalTraffic\(/);
  assert.match(consent, /"ai_referral_visit"/);
  assert.match(consent, /analyticsWindow\.psipediaGa4LastPageView = pageKey/);
  assert.match(consent, /if \(choice === "necessary"\) \{\s*disableAnalytics\(\);\s*clearQualifiedAnalyticsStorage\(window\.localStorage\);\s*\}/);
  assert.match(consent, /if \(revokingAdvertising\) window\.location\.reload\(\)/);
  assert.match(tracker, /analyticsConsentGranted\(\)/);
  assert.match(tracker, /eventKeys = new Map/);
  assert.match(tracker, /window\.addEventListener\(CONSENT_EVENT, record\)/);
});

test("back-to-top is passive, frame-coalesced and rerenders only on visibility threshold changes", () => {
  const component = read("components/back-to-top.tsx");
  assert.match(component, /const SHOW_AFTER_PX = 480/);
  assert.match(component, /visibleRef = useRef\(false\)/);
  assert.match(component, /frameRef = useRef<number \| null>\(null\)/);
  assert.match(component, /window\.requestAnimationFrame\(update\)/);
  assert.match(component, /if \(visibleRef\.current === next\) return/);
  assert.match(component, /window\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/);
  assert.match(component, /window\.removeEventListener\("scroll", onScroll\)/);
  assert.match(component, /window\.cancelAnimationFrame\(frameRef\.current\)/);
  assert.match(component, /window\.scrollTo\(\{ top: 0, behavior \}\)/);
});
