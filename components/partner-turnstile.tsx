"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      ready(callback: () => void): void;
      render(container: HTMLElement, options: Record<string, unknown>): string;
      remove(widgetId: string): void;
    };
  }
}

type Props = {
  siteKey: string;
  action: string;
  onToken(token: string): void;
  onExpired?(): void;
};

const SCRIPT_ID = "psipedia-turnstile-script";

export function PartnerTurnstile({ siteKey, action, onToken, onExpired }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    let widgetId: string | null = null;

    const render = () => {
      window.turnstile?.ready(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          callback: (token: string) => onToken(token),
          "expired-callback": () => {
            onToken("");
            onExpired?.();
          },
          "error-callback": () => {
            onToken("");
          },
        });
      });
    };

    if (window.turnstile) {
      render();
    } else {
      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render, { once: true });
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, action, onToken, onExpired]);

  if (!siteKey) {
    return <p className="partner-form-message is-error" role="status">Bezpečnostné overenie momentálne nie je dostupné.</p>;
  }

  return <div className="partner-turnstile" ref={containerRef} role="group" aria-label="Bezpečnostné overenie" />;
}
