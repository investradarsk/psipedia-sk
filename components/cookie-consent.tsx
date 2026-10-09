"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ConsentChoice } from "@/lib/monetization";
import { classifyAiReferralReferrer } from "@/lib/ai-referral";
import {
  INTERNAL_TRAFFIC_EVENT,
  INTERNAL_TRAFFIC_QUERY_PARAM,
  INTERNAL_TRAFFIC_STORAGE_KEY,
  isStoredInternalTraffic,
  parseInternalTrafficOverride,
} from "@/lib/internal-traffic";

const CONSENT_KEY = "psipedia-cookie-consent";
const SETTINGS_EVENT = "psipedia:open-cookie-settings";
const CONSENT_EVENT = "psipedia:consent-changed";
const MEASUREMENT_ID = "G-Z6KV64S2CK";

type AnalyticsWindow = typeof window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  psipediaGa4Configured?: boolean;
  psipediaGa4LastPageView?: string;
  psipediaGa4AiReferralTracked?: boolean;
  psipediaGa4LoadPromise?: Promise<void>;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

function loadAnalytics() {
  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow[`ga-disable-${MEASUREMENT_ID}`] = false;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
  // Google gtag.js expects each command to be queued as the function Arguments object.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  analyticsWindow.gtag ||= function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
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

  const aiReferralSource = analyticsWindow.psipediaGa4AiReferralTracked
    ? null
    : classifyAiReferralReferrer(document.referrer);
  const shouldTrackAiReferral = aiReferralSource !== null;
  if (shouldTrackAiReferral) analyticsWindow.psipediaGa4AiReferralTracked = true;

  try {
    await loadAnalytics();
    analyticsWindow.gtag?.("event", "page_view", {
      send_to: MEASUREMENT_ID,
      page_location: window.location.href,
      page_path: pageKey,
      page_title: document.title,
    });
    if (aiReferralSource) {
      analyticsWindow.gtag?.("event", "ai_referral_visit", {
        send_to: MEASUREMENT_ID,
        ai_referral_source: aiReferralSource,
        landing_page_path: pageKey,
      });
    }
    analyticsWindow.psipediaGa4LastPageView = pageKey;
  } catch (error) {
    if (shouldTrackAiReferral) analyticsWindow.psipediaGa4AiReferralTracked = false;
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

export function CookieConsent({ advertisingEnabled = false }: { advertisingEnabled?: boolean }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const isPartnerRoute = pathname.startsWith("/partner");
  const isReviewAuthRoute = pathname.startsWith("/recenzia");
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [savedChoice, setSavedChoice] = useState<ConsentChoice | null>(null);
  const [isInternalTraffic, setIsInternalTraffic] = useState(false);
  const consentDialogRef = useRef<HTMLDialogElement>(null);

  const openSettings = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const override = parseInternalTrafficOverride(currentUrl.searchParams.get(INTERNAL_TRAFFIC_QUERY_PARAM));
    let internalTraffic = isStoredInternalTraffic(window.localStorage.getItem(INTERNAL_TRAFFIC_STORAGE_KEY));

    if (override !== null) {
      internalTraffic = override;
      if (override) {
        window.localStorage.setItem(INTERNAL_TRAFFIC_STORAGE_KEY, "1");
      } else {
        window.localStorage.removeItem(INTERNAL_TRAFFIC_STORAGE_KEY);
      }

      currentUrl.searchParams.delete(INTERNAL_TRAFFIC_QUERY_PARAM);
      window.history.replaceState(
        window.history.state,
        "",
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
      window.dispatchEvent(new Event(INTERNAL_TRAFFIC_EVENT));
    }

    if (internalTraffic) disableAnalytics();

    const stored = window.localStorage.getItem(CONSENT_KEY);
    const choice: ConsentChoice | null = stored === "analytics" || stored === "necessary" || stored === "advertising" ? stored : null;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      setSavedChoice(choice);
      setIsInternalTraffic(internalTraffic);
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
    if (ready && !isInternalTraffic && (savedChoice === "analytics" || savedChoice === "advertising") && !isAdminRoute && !isPartnerRoute && !isReviewAuthRoute) {
      void sendPageView(pathname);
    }
  }, [isAdminRoute, isInternalTraffic, isPartnerRoute, isReviewAuthRoute, pathname, ready, savedChoice]);

  // A genuine native modal owns the top layer and makes other public dialogs
  // (notably mobile map filters) inert until the visitor decides.
  useEffect(() => {
    if (!ready || !isOpen || isAdminRoute || isPartnerRoute || isReviewAuthRoute) return;
    const dialog = consentDialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Browsers may initially focus the privacy-details link, which precedes
    // the actions in DOM order. Always start on the explicit reject choice.
    dialog.querySelector<HTMLButtonElement>(".cookie-consent__actions button")?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [ready, isOpen, isAdminRoute, isPartnerRoute, isReviewAuthRoute]);

  function saveChoice(choice: ConsentChoice) {
    const revokingAdvertising = savedChoice === "advertising" && choice !== "advertising";
    window.localStorage.setItem(CONSENT_KEY, choice);
    window.dispatchEvent(new Event(CONSENT_EVENT));
    setSavedChoice(choice);
    setIsOpen(false);
    if (choice === "necessary") disableAnalytics();
    if (revokingAdvertising) window.location.reload();
  }

  if (isPartnerRoute) return null;
  if (isReviewAuthRoute) return null;
  if (isAdminRoute || !ready || !isOpen) return null;

  return (
    <dialog
      ref={consentDialogRef}
      className="cookie-consent"
      aria-modal="true"
      aria-labelledby="cookie-consent-title"
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        // Chromium can briefly focus <body> after the final control in a
        // native modal. Keep a deterministic keyboard loop within consent.
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        )).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div>
        <strong id="cookie-consent-title">Tvoje súkromie na Psipedii</strong>
        <p>
          Nevyhnutné údaje používame na fungovanie a bezpečnosť webu. Google Analytics zapneme iba s tvojím súhlasom, aby sme vedeli, ktoré témy sú pre návštevníkov užitočné.{advertisingEnabled ? " Reklamné technológie tretích strán zapneme iba po samostatnej voľbe nižšie." : ""} <Link href="/cookies">Viac informácií</Link>
        </p>
        {savedChoice && <small>Aktuálna voľba: {savedChoice === "advertising" ? "analytika a reklamné cookies" : savedChoice === "analytics" ? "povolená analytika" : "iba nevyhnutné údaje"}.</small>}
      </div>
      <div className="cookie-consent__actions">
        <button type="button" className="button button--light" autoFocus onClick={() => saveChoice("necessary")}>Odmietnuť analytiku</button>
        <button type="button" className="button button--dark" onClick={() => saveChoice("analytics")}>Prijať analytiku</button>
        {advertisingEnabled ? <button type="button" className="button button--dark" onClick={() => saveChoice("advertising")}>Prijať analytiku a reklamné cookies</button> : null}
      </div>
    </dialog>
  );
}

export function CookieSettingsButton() {
  return (
    <button type="button" className="footer-cookie-button" onClick={() => window.dispatchEvent(new Event(SETTINGS_EVENT))}>
      Nastavenia cookies
    </button>
  );
}
