"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { canLoadProgrammaticAds, type ConsentChoice } from "@/lib/monetization";
import { deferPublicThirdParty } from "@/lib/defer-public-third-party";
import {
  INTERNAL_TRAFFIC_EVENT,
  INTERNAL_TRAFFIC_QUERY_PARAM,
  INTERNAL_TRAFFIC_STORAGE_KEY,
  isStoredInternalTraffic,
  parseInternalTrafficOverride,
} from "@/lib/internal-traffic";

const CONSENT_KEY = "psipedia-cookie-consent";
const CONSENT_EVENT = "psipedia:consent-changed";

export function ProgrammaticAdLoader({ enabled, clientId }: { enabled: boolean; clientId: string }) {
  const pathname = usePathname();
  const isPartnerRoute = pathname.startsWith("/partner");
  const isReviewAuthRoute = pathname.startsWith("/recenzia");

  useEffect(() => {
    let cancelDeferred: (() => void) | null = null;

    function cancelPending() {
      cancelDeferred?.();
      cancelDeferred = null;
    }

    function isInternalTraffic() {
      const override = parseInternalTrafficOverride(
        new URLSearchParams(window.location.search).get(INTERNAL_TRAFFIC_QUERY_PARAM),
      );
      if (override !== null) return override;
      return isStoredInternalTraffic(window.localStorage.getItem(INTERNAL_TRAFFIC_STORAGE_KEY));
    }

    function eligible() {
      if (isPartnerRoute || isReviewAuthRoute || isInternalTraffic()) return false;
      const stored = window.localStorage.getItem(CONSENT_KEY);
      const consent: ConsentChoice | null = stored === "necessary" || stored === "analytics" || stored === "advertising" ? stored : null;
      return canLoadProgrammaticAds({ enabled, clientId }, consent);
    }

    function injectIfEligible() {
      // Always re-check consent, route and internal-traffic status at execution
      // time: the user may have revoked permission while work was queued.
      if (!eligible() || document.querySelector("script[data-psipedia-programmatic-ads]")) return;
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
      script.dataset.psipediaProgrammaticAds = "1";
      document.head.appendChild(script);
    }

    function maybeLoad(immediate = false) {
      if (!eligible() || document.querySelector("script[data-psipedia-programmatic-ads]")) {
        cancelPending();
        return;
      }
      if (immediate) {
        cancelPending();
        injectIfEligible();
        return;
      }
      if (cancelDeferred) return;
      // Stored advertising consent on initial hydration is not an urgent
      // interaction. Let content and controls become responsive first.
      cancelDeferred = deferPublicThirdParty(() => {
        cancelDeferred = null;
        injectIfEligible();
      }, window);
    }

    // Existing consent is deferred. An explicit choice (or internal-traffic
    // override) is applied immediately and always cancels a stale idle task.
    maybeLoad();
    const onConsentChanged = () => maybeLoad(true);
    const onInternalTrafficChanged = () => maybeLoad(true);
    window.addEventListener(CONSENT_EVENT, onConsentChanged);
    window.addEventListener(INTERNAL_TRAFFIC_EVENT, onInternalTrafficChanged);
    return () => {
      cancelPending();
      window.removeEventListener(CONSENT_EVENT, onConsentChanged);
      window.removeEventListener(INTERNAL_TRAFFIC_EVENT, onInternalTrafficChanged);
    };
  }, [clientId, enabled, isPartnerRoute, isReviewAuthRoute]);
  return null;
}
