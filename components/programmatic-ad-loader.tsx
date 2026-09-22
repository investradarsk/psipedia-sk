"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { canLoadProgrammaticAds, type ConsentChoice } from "@/lib/monetization";
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

  useEffect(() => {
    function isInternalTraffic() {
      const override = parseInternalTrafficOverride(
        new URLSearchParams(window.location.search).get(INTERNAL_TRAFFIC_QUERY_PARAM),
      );
      if (override !== null) return override;
      return isStoredInternalTraffic(window.localStorage.getItem(INTERNAL_TRAFFIC_STORAGE_KEY));
    }

    function maybeLoad() {
      if (isPartnerRoute) return;
      if (isInternalTraffic()) return;
      const stored = window.localStorage.getItem(CONSENT_KEY);
      const consent: ConsentChoice | null = stored === "necessary" || stored === "analytics" || stored === "advertising" ? stored : null;
      if (!canLoadProgrammaticAds({ enabled, clientId }, consent)) return;
      if (document.querySelector("script[data-psipedia-programmatic-ads]")) return;
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
      script.dataset.psipediaProgrammaticAds = "1";
      document.head.appendChild(script);
    }
    maybeLoad();
    window.addEventListener(CONSENT_EVENT, maybeLoad);
    window.addEventListener(INTERNAL_TRAFFIC_EVENT, maybeLoad);
    return () => {
      window.removeEventListener(CONSENT_EVENT, maybeLoad);
      window.removeEventListener(INTERNAL_TRAFFIC_EVENT, maybeLoad);
    };
  }, [clientId, enabled, isPartnerRoute]);
  return null;
}
