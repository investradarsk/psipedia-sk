"use client";

import { useSyncExternalStore } from "react";
import { navigationRecovery } from "@/lib/navigation-recovery";

/** A native link deliberately opens a new document, preserving the old tab. */
export function NavigationRecovery() {
  const href = useSyncExternalStore(
    navigationRecovery.subscribe,
    navigationRecovery.snapshot,
    () => null,
  );
  if (!href) return null;

  return (
    <section className="navigation-recovery" role="status" aria-live="polite"
      aria-label="Obnova navigácie" data-navigation-recovery>
      <strong>Prechod sa ešte nedokončil</strong>
      <p>Ak načítanie trvá príliš dlho, otvor cieľ v novej karte. Otvorením novej karty sa táto karta neobnoví.</p>
      <div className="navigation-recovery-actions">
        <a href={href} target="_blank" rel="noopener noreferrer">Otvoriť v novej karte</a>
        <button type="button" onClick={navigationRecovery.clear}>Zavrieť upozornenie</button>
      </div>
    </section>
  );
}
