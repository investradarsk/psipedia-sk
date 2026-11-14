"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isInternalArticleReadBrowser } from "@/lib/article-read-tracking";
import {
  hasQualifiedAnalyticsConsent,
  QUALIFIED_ANALYTICS_CONSENT_EVENT,
} from "@/lib/qualified-analytics-consent";
import { isSafeSiteAnalyticsPath } from "@/lib/site-analytics-public";
import { anonymousSitePageview, reserveSiteAnalyticsVisit, sendSiteAnalyticsPageview } from "@/lib/site-analytics-client";

/**
 * One invisible sitewide tracker; never place it on an individual public card.
 * Counts route changes (not every render), even without analytics consent.
 * Anonymous pageviews carry no visitor token and write no browser identity.
 * Only explicitly consented views attach short-lived session/visitor IDs.
 * Excludes internal/admin pages and sends no query strings or raw referrers.
 */
export function SiteAnalyticsTracker({ enabled = false }: { enabled?: boolean }) {
  const pathname = usePathname();
  const lastSentPath = useRef<string | null>(null);

  useEffect(() => {
    const track = () => {
      if (!enabled || !isSafeSiteAnalyticsPath(pathname) || lastSentPath.current === pathname) return;
      try {
        if (isInternalArticleReadBrowser(window.localStorage, window.location.search)) return;
      } catch {
        // Anonymous aggregate tracking must not require localStorage access.
        // The endpoint independently excludes the internal-traffic cookie.
      }

      // The aggregate-only fallback is never linked to a browser identifier.
      // A visitor who opted into analytics receives optional session counts.
      const aggregate = anonymousSitePageview(pathname, document.referrer, window.location.origin);
      const consent = hasQualifiedAnalyticsConsent(window.localStorage);
      const identified = consent ? reserveSiteAnalyticsVisit({
        localStorage: window.localStorage,
        sessionStorage: window.sessionStorage,
        path: pathname,
        referrer: document.referrer,
        origin: window.location.origin,
      }) : null;
      lastSentPath.current = pathname;
      void sendSiteAnalyticsPageview(identified ?? aggregate);
    };

    track();
    window.addEventListener(QUALIFIED_ANALYTICS_CONSENT_EVENT, track);
    return () => window.removeEventListener(QUALIFIED_ANALYTICS_CONSENT_EVENT, track);
  }, [enabled, pathname]);

  return null;
}
