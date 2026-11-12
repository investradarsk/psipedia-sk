"use client";

import { useEffect, useState } from "react";
import styles from "./admin-pwa.module.css";

export function AdminPwaRegistration() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    // iOS can suspend a standalone PWA without emitting an online event.
    // Re-evaluate the connection when Safari restores the document from BFCache.
    setOnline(navigator.onLine);
    const handleResume = () => setOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pageshow", handleResume);

    if ("serviceWorker" in navigator) {
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
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pageshow", handleResume);
    };
  }, []);

  if (online) return null;
  return (
    <div className={styles.offlineBanner} role="status" aria-live="polite">
      Si offline. Redakčné dáta môžeš prezerať iba tam, kde ich načíta sieť; úpravy ani publikovanie sa neukladajú do fronty.
    </div>
  );
}
