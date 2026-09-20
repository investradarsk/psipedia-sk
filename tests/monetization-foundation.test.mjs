import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AD_LABEL,
  AD_PLACEMENTS,
  SPONSORED_LABEL,
  canLoadProgrammaticAds,
  isCampaignActive,
  isPromotionVisible,
  isSafeCreativeAsset,
  isSafeDestinationUrl,
  validateMonetizationEventInput,
} from "../lib/monetization.ts";

const now = new Date("2026-09-20T16:00:00.000Z");

test("inactive, future and expired campaigns are not active", () => {
  assert.equal(isCampaignActive({ status: "paused" }, now), false);
  assert.equal(isCampaignActive({ status: "active", startAt: "2026-09-21T00:00:00.000Z" }, now), false);
  assert.equal(isCampaignActive({ status: "active", endAt: "2026-09-20T15:59:59.000Z" }, now), false);
});

test("active eligible campaign window is active and empty placement can remain empty", () => {
  assert.equal(isCampaignActive({ status: "active", startAt: "2026-09-20T10:00:00.000Z", endAt: "2026-09-21T10:00:00.000Z" }, now), true);
  assert.equal(AD_PLACEMENTS.HOME_BOTTOM.public, true);
  assert.equal(AD_PLACEMENTS.GLOBAL_BOTTOM.public, false);
});

test("promoted unpublished entity does not render and sponsor label is fixed", () => {
  assert.equal(isPromotionVisible({ status: "active", entityPublic: false, label: SPONSORED_LABEL }, now), false);
  assert.equal(isPromotionVisible({ status: "active", entityPublic: true, label: SPONSORED_LABEL }, now), true);
  assert.equal(SPONSORED_LABEL, "Sponzorované");
  assert.equal(AD_LABEL, "Reklama");
});

test("unsafe destination URLs are rejected", () => {
  assert.equal(isSafeDestinationUrl("javascript:alert(1)"), false);
  assert.equal(isSafeDestinationUrl("data:text/html,hello"), false);
  assert.equal(isSafeDestinationUrl("https://example.com/path"), true);
  assert.equal(isSafeCreativeAsset("/images/ad.webp"), true);
  assert.equal(isSafeCreativeAsset("/media/campaign/ad.webp"), true);
  assert.equal(isSafeCreativeAsset("/images/../secret.webp"), false);
  assert.equal(isSafeCreativeAsset("https://example.com/ad.webp"), false);
});

test("impression and click event payloads are strictly validated", () => {
  for (const eventType of ["impression", "click"]) {
    const value = validateMonetizationEventInput({
      eventType,
      campaignId: "campaign-123",
      placementId: AD_PLACEMENTS.ARTICLE_END.id,
      eventKey: "1234567890abcdef",
    });
    assert.equal(value.eventType, eventType);
  }
  assert.throws(() => validateMonetizationEventInput({ eventType: "click", campaignId: "x", placementId: "unknown", eventKey: "1234567890abcdef" }));
});

test("third-party programmatic loading requires explicit advertising consent and a real-looking publisher client id", () => {
  const config = { enabled: true, clientId: "ca-pub-1234567890123456" };
  assert.equal(canLoadProgrammaticAds(config, "necessary"), false);
  assert.equal(canLoadProgrammaticAds(config, "analytics"), false);
  assert.equal(canLoadProgrammaticAds(config, "advertising"), true);
  assert.equal(canLoadProgrammaticAds({ enabled: true, clientId: "" }, "advertising"), false);
});

test("public ad slot is labeled, responsive and does not reserve an empty placeholder", async () => {
  const [slot, link, tracker, css] = await Promise.all([
    readFile(new URL("../components/ad-slot.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/tracked-ad-link.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ad-exposure-tracker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ad-slot.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(slot, /if \(!campaign\) return null/);
  assert.match(slot, /aria-label=\{AD_LABEL\}/);
  assert.match(link, /noopener noreferrer sponsored/);
  assert.match(tracker, /analyticsConsentGranted/);
  assert.match(tracker, /psipedia:consent-changed/);
  assert.doesNotMatch(tracker, /sessionStorage/);
  assert.match(css, /max-width: 560px/);
  assert.match(css, /minmax\(0, 1fr\)/);
  assert.match(css, /overflow: clip/);
});

test("migration separates campaigns, placements, promotions and privacy-conscious events", async () => {
  const sql = await readFile(new URL("../drizzle/0050_monetization_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE monetization_campaigns/);
  assert.match(sql, /CREATE TABLE monetization_campaign_placements/);
  assert.match(sql, /CREATE TABLE monetization_promotions/);
  assert.match(sql, /CHECK \(label = 'Sponzorované'\)/);
  assert.match(sql, /CREATE TABLE monetization_events/);
  assert.match(sql, /CREATE UNIQUE INDEX monetization_event_dedupe_idx/);
  assert.doesNotMatch(sql, /ip_address|user_agent|email/i);
});
