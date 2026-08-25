"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const CONSENT_KEY = "psipedia-cookie-consent";
const SETTINGS_EVENT = "psipedia:open-cookie-settings";
const MEASUREMENT_ID = "G-Z6KV64S2CK";

type ConsentChoice = "necessary" | "analytics";

type AnalyticsWindow = typeof window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  psipediaGa4Configured?: boolean;
  psipediaGa4LastPageView?: string;
  psipediaGa4LoadPromise?: Promise<void>;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

function loadAnalytics() {
  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow[`ga-disable-${MEASUREMENT_ID}`] = false;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
  analyticsWindow.gtag ||= function gtag(..._args: unknown[]) {
    analyticsWindow.dataLayer?.push(arguments);
  };

  if (!analyticsWindow.psipediaGa4Configured) {
    analyticsWindow.gtag("js", new Date());
    analyticsWindow.gtag("consent", "update", { analytics_storage: "granted" });
    analyticsWindow.gtag("config", MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      send_page_view: false,
    });
    analyticsWindow.psipediaGa4Configured = true;
  }

  if (!analyticsWindow.psipediaGa4LoadPromise) {
    analyticsWindow.psipediaGa4LoadPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(`script[data-psipedia-ga4="${MEASUREMENT_ID}"]`);
      if (existingScript?.dataset.loaded === "true") {
        resolve();
        return;
      }

      const script = existingScript ?? document.createElement("script");
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("Google Analytics sa nepodarilo načítať.")), { once: true });
      if (existingScript) return;

      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      script.dataset.psipediaGa4 = MEASUREMENT_ID;
      document.head.appendChild(script);
    });
  }

  return analyticsWindow.psipediaGa4LoadPromise;
}

async function sendPageView(pagePath: string) {
  const analyticsWindow = window as AnalyticsWindow;
  const pageKey = `${pagePath}${window.location.search}`;
  if (analyticsWindow.psipediaGa4LastPageView === pageKey) return;

  try {
    await loadAnalytics();
    analyticsWindow.gtag?.("event", "page_view", {
      send_to: MEASUREMENT_ID,
      page_location: window.location.href,
      page_path: pageKey,
      page_title: document.title,
    });
    analyticsWindow.psipediaGa4LastPageView = pageKey;
  } catch (error) {
    analyticsWindow.psipediaGa4LoadPromise = undefined;
    console.error(error);
  }
}

function disableAnalytics() {
  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow[`ga-disable-${MEASUREMENT_ID}`] = true;
  analyticsWindow.psipediaGa4LastPageView = undefined;
  analyticsWindow.gtag?.("consent", "update", { analytics_storage: "denied" });

  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name || (name !== "_ga" && !name.startsWith("_ga_"))) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.psipedia.sk; SameSite=Lax`;
  }
}

export function CookieConsent() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [savedChoice, setSavedChoice] = useState<ConsentChoice | null>(null);

  const openSettings = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    const choice: ConsentChoice | null = stored === "analytics" || stored === "necessary" ? stored : null;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      setSavedChoice(choice);
      setIsOpen(choice === null);
      setReady(true);
    });
    window.addEventListener(SETTINGS_EVENT, openSettings);
    return () => {
      mounted = false;
      window.removeEventListener(SETTINGS_EVENT, openSettings);
    };
  }, [openSettings]);

  useEffect(() => {
    if (savedChoice === "analytics" && !pathname.startsWith("/admin")) {
      void sendPageView(pathname);
    }
  }, [pathname, savedChoice]);

  function saveChoice(choice: ConsentChoice) {
    window.localStorage.setItem(CONSENT_KEY, choice);
    setSavedChoice(choice);
    setIsOpen(false);
    if (choice === "necessary") disableAnalytics();
  }

  if (!ready || !isOpen) return null;

  return (
    <section className="cookie-consent" role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title">
      <div>
        <strong id="cookie-consent-title">Tvoje súkromie na Psipedii</strong>
        <p>
          Nevyhnutné údaje používame na fungovanie a bezpečnosť webu. Google Analytics zapneme iba s tvojím súhlasom, aby sme vedeli, ktoré témy sú pre návštevníkov užitočné. <Link href="/cookies">Viac informácií</Link>
        </p>
        {savedChoice && <small>Aktuálna voľba: {savedChoice === "analytics" ? "povolená analytika" : "iba nevyhnutné údaje"}.</small>}
      </div>
      <div className="cookie-consent__actions">
        <button type="button" className="button button--light" onClick={() => saveChoice("necessary")}>Odmietnuť analytiku</button>
        <button type="button" className="button button--dark" onClick={() => saveChoice("analytics")}>Prijať analytiku</button>
      </div>
    </section>
  );
}

export function CookieSettingsButton() {
  return (
    <button type="button" className="footer-cookie-button" onClick={() => window.dispatchEvent(new Event(SETTINGS_EVENT))}>
      Nastavenia cookies
    </button>
  );
}
