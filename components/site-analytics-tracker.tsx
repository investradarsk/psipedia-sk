"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isInternalArticleReadBrowser } from "@/lib/article-read-tracking";
import {
  hasQualifiedAnalyticsConsent,
  QUALIFIED_ANALYTICS_CONSENT_EVENT,
} from "@/lib/qualified-analytics-consent";
import { isSafeSiteAnalyticsPath } from "@/lib/site-analytics-public";
import { reserveSiteAnalyticsVisit, sendSiteAnalyticsPageview } from "@/lib/site-analytics-client";

/**
 * One invisible sitewide tracker; never place it on an individual public card.
 * Counts route changes (not every render), requires saved analytics consent,
 * excludes internal/admin pages and sends no query strings or full referrers.
 */
export function SiteAnalyticsTracker() {
  const pathname = usePathname();
  const lastSentPath = useRef<string | null>(null);

  useEffect(() => {
    const track = () => {
      if (!isSafeSiteAnalyticsPath(pathname) || lastSentPath.current === pathname) return;
      if (!hasQualifiedAnalyticsConsent(window.localStorage)) return;
      try {
        if (isInternalArticleReadBrowser(window.localStorage, window.location.search)) return;
        const payload = reserveSiteAnalyticsVisit({
          localStorage: window.localStorage,
          sessionStorage: window.sessionStorage,
          path: pathname,
          referrer: document.referrer,
          origin: window.location.origin,
        });
        if (!payload) return;
        lastSentPath.current = pathname;
        void sendSiteAnalyticsPageview(payload);
      } catch {
        // Privacy-hardened browsers must still be able to navigate.
      }
    };

    track();
    window.addEventListener(QUALIFIED_ANALYTICS_CONSENT_EVENT, track);
    return () => window.removeEventListener(QUALIFIED_ANALYTICS_CONSENT_EVENT, track);
  }, [pathname]);

  return null;
}
