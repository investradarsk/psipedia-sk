"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const CONSENT_KEY = "psipedia-cookie-consent";
const SETTINGS_EVENT = "psipedia:open-cookie-settings";
const MEASUREMENT_ID = "G-Z6KV64S2CK";

type ConsentChoice = "necessary" | "analytics";

function enableAnalytics() {
  if (document.querySelector(`script[data-psipedia-ga4="${MEASUREMENT_ID}"]`)) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  script.dataset.psipediaGa4 = MEASUREMENT_ID;
  document.head.appendChild(script);

  const analyticsWindow = window as typeof window & {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  };
  analyticsWindow[`ga-disable-${MEASUREMENT_ID}`] = false;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
  analyticsWindow.gtag = (...args: unknown[]) => analyticsWindow.dataLayer?.push(args);
  analyticsWindow.gtag("js", new Date());
  analyticsWindow.gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
}

function disableAnalytics() {
  const analyticsWindow = window as typeof window & { [key: `ga-disable-${string}`]: boolean | undefined };
  analyticsWindow[`ga-disable-${MEASUREMENT_ID}`] = true;

  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name || (name !== "_ga" && !name.startsWith("_ga_"))) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.psipedia.sk; SameSite=Lax`;
  }
}

export function CookieConsent() {
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
    if (choice === "analytics") enableAnalytics();
    window.addEventListener(SETTINGS_EVENT, openSettings);
    return () => {
      mounted = false;
      window.removeEventListener(SETTINGS_EVENT, openSettings);
    };
  }, [openSettings]);

  function saveChoice(choice: ConsentChoice) {
    window.localStorage.setItem(CONSENT_KEY, choice);
    setSavedChoice(choice);
    setIsOpen(false);
    if (choice === "analytics") enableAnalytics();
    else disableAnalytics();
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
