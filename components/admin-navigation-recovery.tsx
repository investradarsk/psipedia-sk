"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ADMIN_NAVIGATION_START_EVENT,
  ADMIN_NAVIGATION_STALL_MS,
  adminNavigationTarget,
  type AdminNavigationStartDetail,
} from "@/lib/admin-navigation-recovery";
import styles from "./admin-navigation-recovery.module.css";

/**
 * This guard watches *accepted* router transitions; it does not intercept
 * clicks, mutate history, or reload a page containing unsaved form data.
 */
export function AdminNavigationRecovery() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [pending, setPending] = useState<AdminNavigationStartDetail | null>(null);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<AdminNavigationStartDetail>).detail;
      if (!detail || typeof detail.href !== "string" ||
        !["push", "replace", "traverse"].includes(detail.navigationType)) return;
      const href = adminNavigationTarget(detail.href, window.location.href);
      if (!href) return;
      setPending({ href, navigationType: detail.navigationType });
      setStalled(false);
    };
    const clear = () => {
      setPending(null);
      setStalled(false);
    };
    window.addEventListener(ADMIN_NAVIGATION_START_EVENT, onStart);
    window.addEventListener("psipedia:route-committed", clear);
    window.addEventListener("psipedia:admin-route-committed", clear);
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", clear);
    const clearOnBackground = () => {
      if (document.visibilityState === "hidden") clear();
    };
    document.addEventListener("visibilitychange", clearOnBackground);
    return () => {
      window.removeEventListener(ADMIN_NAVIGATION_START_EVENT, onStart);
      window.removeEventListener("psipedia:route-committed", clear);
      window.removeEventListener("psipedia:admin-route-committed", clear);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", clear);
      document.removeEventListener("visibilitychange", clearOnBackground);
    };
  }, []);

  // Also clear on an actual route/search change, independently of the shared
  // site's progress indicator, which may be removed from Admin in a later step.
  useEffect(() => {
    window.dispatchEvent(new Event("psipedia:admin-route-committed"));
  }, [pathname, query]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setStalled(true), ADMIN_NAVIGATION_STALL_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (!pending || !stalled) return null;

  return (
    <section className={styles.notice} role="status" aria-live="polite"
      aria-label="Obnova navigácie" data-admin-navigation-recovery>
      <strong>Prechod sa ešte nedokončil</strong>
      <p>Stránku sme neobnovili, aby sa nestratili prípadné neuložené zmeny.
        Môžeš skúsiť prechod znova alebo otvoriť cieľ v novej karte.</p>
      <div className={styles.actions}>
        {pending.navigationType !== "traverse" && (
          <button type="button" onClick={() => {
            // A new pending generation restarts the watchdog even if the
            // router refuses to restart the original in-flight request.
            setPending({ ...pending });
            setStalled(false);
            router.push(pending.href);
          }}>Skúsiť znova</button>
        )}
        <a href={pending.href} target="_blank" rel="noopener noreferrer">
          Otvoriť v novej karte
        </a>
        <button type="button" className={styles.dismiss}
          onClick={() => { setPending(null); setStalled(false); }}>
          Zavrieť upozornenie
        </button>
      </div>
    </section>
  );
}
