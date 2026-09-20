"use client";

import { useEffect } from "react";
import type { AdPlacementId, ConsentChoice } from "@/lib/monetization";

const CONSENT_KEY = "psipedia-cookie-consent";
const eventKeys = new Map<string, { key: string; expiresAt: number }>();

function eventKey(scope: string, ttlMs = 30 * 60 * 1000) {
  const now = Date.now();
  const existing = eventKeys.get(scope);
  if (existing && existing.expiresAt > now) return existing.key;
  const key = crypto.randomUUID();
  eventKeys.set(scope, { key, expiresAt: now + ttlMs });
  return key;
}

function analyticsConsentGranted() {
  const stored = window.localStorage.getItem(CONSENT_KEY);
  const consent: ConsentChoice | null =
    stored === "necessary" || stored === "analytics" || stored === "advertising" ? stored : null;
  return consent === "analytics" || consent === "advertising";
}

async function send(eventType: "impression" | "click", campaignId: string, placementId: AdPlacementId, key: string) {
  if (!analyticsConsentGranted()) return;
  await fetch("/api/monetization/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ eventType, campaignId, placementId, eventKey: key }),
  }).catch(() => undefined);
}

export function AdExposureTracker({ campaignId, placementId }: { campaignId: string; placementId: AdPlacementId }) {
  useEffect(() => {
    const key = eventKey(`impression:${campaignId}:${placementId}`);
    void send("impression", campaignId, placementId, key);
  }, [campaignId, placementId]);
  return null;
}

export function trackedAdClick(campaignId: string, placementId: AdPlacementId) {
  const bucket = Math.floor(Date.now() / 30_000);
  const key = eventKey(`click:${campaignId}:${placementId}:${bucket}`, 31_000);
  void send("click", campaignId, placementId, key);
}
