"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "psipedia:events:last-listing";
const MAX_AGE_MS = 60 * 60 * 1000;

function validListingPath(href: unknown): href is string {
  return typeof href === "string"
    && /^\/podujatia(?:\/[a-z0-9-]+)?(?:[?#]|$)/.test(href)
    && !href.startsWith("//");
}

// Preserve the exact public listing URL, including filters, calendar month and selected day.
// A small client-only enhancement; URLs, canonical metadata and server rendering are unchanged.
export function RememberEventsListing() {
  useEffect(() => {
    const href = window.location.pathname + window.location.search + window.location.hash;
    if (!validListingPath(href)) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ href, savedAt: Date.now() }));
    } catch {
      // Storage may be unavailable in private modes; ordinary category navigation remains usable.
    }
  }, []);

  return null;
}

export function EventsBackLink({ fallbackHref }: { fallbackHref: string }) {
  const [href, setHref] = useState(fallbackHref);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
      if (stored && validListingPath(stored.href)
        && Number.isFinite(stored.savedAt)
        && Date.now() - stored.savedAt >= 0
        && Date.now() - stored.savedAt < MAX_AGE_MS) {
        setHref(stored.href);
      }
    } catch {
      // The server-rendered fallback link is always available.
    }
  }, []);

  return <Link href={href}>← Späť na výsledky podujatí</Link>;
}
