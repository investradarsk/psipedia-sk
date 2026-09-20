"use client";

import { useEffect } from "react";
import type { AdPlacementId } from "@/lib/monetization";

function eventKey(storageKey: string) {
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, key);
  return key;
}

async function send(eventType: "impression" | "click", campaignId: string, placementId: AdPlacementId, key: string) {
  await fetch("/api/monetization/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ eventType, campaignId, placementId, eventKey: key }),
  }).catch(() => undefined);
}

export function AdExposureTracker({ campaignId, placementId }: { campaignId: string; placementId: AdPlacementId }) {
  useEffect(() => {
    const key = eventKey(`psipedia:ad:impression:${campaignId}:${placementId}`);
    void send("impression", campaignId, placementId, key);
  }, [campaignId, placementId]);
  return null;
}

export function trackedAdClick(campaignId: string, placementId: AdPlacementId) {
  const key = eventKey(`psipedia:ad:click:${campaignId}:${placementId}:${Date.now()}`);
  void send("click", campaignId, placementId, key);
}
