"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isSafeSiteAnalyticsPath } from "@/lib/site-analytics-public";

/**
 * The entire first-party sitewide payload is one public pathname.
 * No visitor IDs, cookies, local/session storage, referrers or device metadata.
 * Consent choice does not affect this anonymous page counter.
 */
export function SiteAnalyticsTracker({ enabled = false }: { enabled?: boolean }) {
  const pathname = usePathname();
  const lastRecordedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !isSafeSiteAnalyticsPath(pathname)) return;

    const countVisiblePage = () => {
      if (document.visibilityState !== "visible" || lastRecordedPath.current === pathname) {
        return;
      }
      lastRecordedPath.current = pathname;
      void fetch("/api/analytics/pageview", {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathname }),
      }).catch(() => {
        // Statistics must never interrupt normal browsing.
      });
    };

    countVisiblePage();
    document.addEventListener("visibilitychange", countVisiblePage);
    return () => {
      document.removeEventListener("visibilitychange", countVisiblePage);
    };
  }, [enabled, pathname]);

  return null;
}
