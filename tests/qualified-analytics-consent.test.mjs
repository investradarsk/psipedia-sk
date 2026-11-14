import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  QUALIFIED_ANALYTICS_CONSENT_KEY,
  QUALIFIED_ANALYTICS_CONSENT_EVENT,
  hasQualifiedAnalyticsConsent,
  clearQualifiedAnalyticsStorage,
} from "../lib/qualified-analytics-consent.ts";

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    key(i) { return [...data.keys()][i] ?? null; },
    get length() { return data.size; },
  };
}

test("only explicit analytics or advertising choices allow qualified views", () => {
  for (const choice of [null, "necessary", "invalid", ""]) {
    const browser = storage(choice === null ? {} : { [QUALIFIED_ANALYTICS_CONSENT_KEY]: choice });
    assert.equal(hasQualifiedAnalyticsConsent(browser), false, String(choice));
  }
  for (const choice of ["analytics", "advertising"]) {
    const browser = storage({ [QUALIFIED_ANALYTICS_CONSENT_KEY]: choice });
    assert.equal(hasQualifiedAnalyticsConsent(browser), true, choice);
  }
  assert.equal(hasQualifiedAnalyticsConsent({ getItem() { throw new Error("privacy mode"); } }), false);
});

test("withdrawal deletes only qualified-read browser state and preserves unrelated storage", () => {
  const browser = storage({
    "psipedia-article-read:v1:old-article": "123456789",
    "psipedia-profile-view:v1:7": '{"at":1,"token":"x"}',
    "psipedia-cookie-consent": "necessary",
    "psipedia-favorites": '["hello"]',
    "psipedia-internal-traffic": "1",
  });
  clearQualifiedAnalyticsStorage(browser);
  assert.equal(browser.getItem("psipedia-article-read:v1:old-article"), null);
  assert.equal(browser.getItem("psipedia-profile-view:v1:7"), null);
  assert.equal(browser.getItem("psipedia-cookie-consent"), "necessary");
  assert.equal(browser.getItem("psipedia-favorites"), '["hello"]');
  assert.equal(browser.getItem("psipedia-internal-traffic"), "1");
});

test("article and profile trackers never send without prior consent and react to late opt-in", async () => {
  for (const file of [
    "../components/article-read-tracker.tsx",
    "../components/directory-profile-view-tracker.tsx",
  ]) {
    const code = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(code, /hasQualifiedAnalyticsConsent\(window\.localStorage\)/);
    assert.match(code, /QUALIFIED_ANALYTICS_CONSENT_EVENT/);
    assert.match(code, /window\.addEventListener\(QUALIFIED_ANALYTICS_CONSENT_EVENT, qualify\)/);
    assert.match(code, /window\.removeEventListener\(QUALIFIED_ANALYTICS_CONSENT_EVENT, qualify\)/);
    assert.ok(code.indexOf("hasQualifiedAnalyticsConsent(window.localStorage)")
      < code.indexOf("finished = true"), "a denied event must never be reserved");
  }

  const banner = await readFile(new URL("../components/cookie-consent.tsx", import.meta.url), "utf8");
  assert.match(banner, /clearQualifiedAnalyticsStorage\(window\.localStorage\)/);
  assert.match(banner, /window\.dispatchEvent\(new Event\(CONSENT_EVENT\)\)/);
  assert.equal(QUALIFIED_ANALYTICS_CONSENT_EVENT, "psipedia:consent-changed");
});

test("first party analytics storage and withdrawal are explained on public legal pages", async () => {
  const cookies = await readFile(new URL("../app/cookies/page.tsx", import.meta.url), "utf8");
  const privacy = await readFile(new URL("../app/sukromie/page.tsx", import.meta.url), "utf8");
  assert.match(cookies, /Prečítania článkov a návštevy profilov/);
  assert.match(cookies, /Po odvolaní súhlasu/);
  assert.match(privacy, /Vlastné meranie prečítaní a návštev profilov/);
  assert.match(privacy, /Po udelení súhlasu s analytikou/);
});
