"use client";

import { useEffect, useState } from "react";
import styles from "./admin-pwa.module.css";

export function AdminPwaRegistration() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

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
          if (navigator.serviceWorker.controller && sessionStorage.getItem("psipedia-admin-pwa-scope-migrated") !== "1") {
            sessionStorage.setItem("psipedia-admin-pwa-scope-migrated", "1");
            window.location.reload();
            return;
          }
        }

        await navigator.serviceWorker.register("/sw.js", { scope: "/admin/" });
        sessionStorage.removeItem("psipedia-admin-pwa-scope-migrated");
      })().catch((error) => {
        console.warn("Admin PWA service worker registration failed.", error);
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div className={styles.offlineBanner} role="status" aria-live="polite">
      Si offline. Redakčné dáta môžeš prezerať iba tam, kde ich načíta sieť; úpravy ani publikovanie sa neukladajú do fronty.
    </div>
  );
}
