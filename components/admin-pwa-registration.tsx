"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminNavigationTarget } from "@/lib/admin-navigation-recovery";
import styles from "./admin-pwa.module.css";

export function AdminPwaRegistration() {
  const [online, setOnline] = useState(true);
  const [pushTarget, setPushTarget] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    // Reading the live connection immediately matters on initial mount, but
    // React's effect lint forbids synchronous state writes in setup. Schedule
    // this once outside the effect phase; cleanup prevents post-unmount writes.
    let mounted = true;
    queueMicrotask(() => { if (mounted) setOnline(navigator.onLine); });
    // iOS may suspend a standalone PWA without emitting an online event.
    const handleResume = () => setOnline(navigator.onLine);
    const handleForeground = () => {
      if (document.visibilityState === "visible") handleResume();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pageshow", handleResume);
    document.addEventListener("visibilitychange", handleForeground);

    let removePushListener = () => {};
    if ("serviceWorker" in navigator) {
      const onPushIntent = (event: MessageEvent) => {
        const payload = event.data as { type?: unknown; url?: unknown } | null;
        if (payload?.type !== "psipedia-admin-push-intent" || typeof payload.url !== "string") return;
        const href = adminNavigationTarget(payload.url, window.location.href);
        if (href) setPushTarget(href);
      };
      navigator.serviceWorker.addEventListener("message", onPushIntent);
      removePushListener = () => navigator.serviceWorker.removeEventListener("message", onPushIntent);
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const legacy = registrations.filter((item) => {
          const scopePath = new URL(item.scope).pathname;
          const worker = item.active ?? item.waiting ?? item.installing;
          return scopePath === "/" && worker && new URL(worker.scriptURL).pathname === "/sw.js";
        });
        if (legacy.length > 0) {
          await Promise.all(legacy.map((item) => item.unregister()));
          // The old root-scope controller can remain attached until the next
          // natural document navigation. It has no fetch handler, so forcing a
          // reload here only risks losing an unsaved editor on iOS/PWA resume.
        }

        await navigator.serviceWorker.register("/sw.js", { scope: "/admin/" });
      })().catch((error) => {
        console.warn("Admin PWA service worker registration failed.", error);
      });
    }

    return () => {
      mounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pageshow", handleResume);
      document.removeEventListener("visibilitychange", handleForeground);
      removePushListener();
    };
  }, []);

  if (online && !pushTarget) return null;
  return (
    <div className={styles.statusStack}>
      {!online && (
        <div className={styles.offlineBanner} role="status" aria-live="polite">
          Si offline. Redakčné dáta môžeš prezerať iba tam, kde ich načíta sieť; úpravy ani publikovanie sa neukladajú do fronty.
        </div>
      )}
      {pushTarget && (
        <section className={styles.pushNotice} role="status" aria-live="polite" data-admin-push-notice>
          <strong>Nové upozornenie Psipedia</strong>
          <p>Odkaz otvoríš až po kliknutí. Prípadné neuložené zmeny zostávajú chránené.</p>
          <div className={styles.pushActions}>
            <Link href={pushTarget} prefetch={false} onClick={() => setPushTarget(null)}>Otvoriť upozornenie</Link>
            <button type="button" onClick={() => setPushTarget(null)}>Zavrieť</button>
          </div>
        </section>
      )}
    </div>
  );
}
