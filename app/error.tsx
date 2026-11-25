"use client";

import { useState, useTransition } from "react";

/** Explicit recovery of a failed route, never an automatic document reload. */
export default function RouteError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <main id="obsah" className="not-found" data-public-route-recovery>
      <div role="alert">
        <h1>Stránku sa nepodarilo načítať</h1>
        <p>Skús načítanie znova. Ak si práve ukladal formulár, najprv over výsledok uloženia.</p>
        <p>Obnova môže odstrániť neuložené zmeny.</p>
        {confirm ? (
          <div className="navigation-recovery-actions">
            <button type="button" disabled={pending} onClick={() => {
              setConfirm(false);
              startTransition(() => reset());
            }}>Potvrdiť obnovu</button>
            <button type="button" onClick={() => setConfirm(false)}>Zrušiť</button>
          </div>
        ) : (
          <div className="navigation-recovery-actions">
            <button type="button" disabled={pending} onClick={() => setConfirm(true)}>
              {pending ? "Načítavam…" : "Skúsiť znova"}
            </button>
            <a href="/" target="_blank" rel="noopener noreferrer">Otvoriť Psipediu v novej karte</a>
          </div>
        )}
      </div>
    </main>
  );
}
