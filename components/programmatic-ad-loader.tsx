"use client";

import { useEffect } from "react";
import { canLoadProgrammaticAds, type ConsentChoice } from "@/lib/monetization";

const CONSENT_KEY = "psipedia-cookie-consent";
const CONSENT_EVENT = "psipedia:consent-changed";

export function ProgrammaticAdLoader({ enabled, clientId }: { enabled: boolean; clientId: string }) {
  useEffect(() => {
    function maybeLoad() {
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
    return () => window.removeEventListener(CONSENT_EVENT, maybeLoad);
  }, [clientId, enabled]);
  return null;
}
