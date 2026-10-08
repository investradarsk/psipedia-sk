"use client";

import { useEffect, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  function returnToListing(event: MouseEvent<HTMLAnchorElement>) {
    // Preserve normal behavior for modified clicks, new tabs and inaccessible storage.
    if (event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    try {
      const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
      if (stored && validListingPath(stored.href)
        && Number.isFinite(stored.savedAt)
        && Date.now() - stored.savedAt >= 0
        && Date.now() - stored.savedAt < MAX_AGE_MS) {
        event.preventDefault();
        router.push(stored.href);
      }
    } catch {
      // Follow the server-rendered category link if storage is disabled.
    }
  }

  return <Link href={fallbackHref} onClick={returnToListing}>← Späť na výsledky podujatí</Link>;
}
