"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  total: number; active: number; shadow: number;
  receiptPrefixes: number; activeErrors: number;
  oldSyncEnabled: boolean; workCopySyncEnabled: boolean;
  activationEnabled: boolean; activeCohortReady: boolean;
  singleNewEngine: boolean;
  readyForManualRoundtrip: boolean;
  blockers: string[];
};

async function fetchBreedWorkcopyStatus(signal?: AbortSignal): Promise<Status> {
  const response = await fetch("/api/admin/notion-breeds-workcopy-status", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("STATUS_UNAVAILABLE");
  return response.json() as Promise<Status>;
}

/** The counters are read from production D1, never assumed from a prior screenshot. */
export function AdminBreedWorkcopyLiveStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await fetchBreedWorkcopyStatus());
    } catch {
      setError("Nepodarilo sa overiť živý stav D1.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // React effects may start asynchronous I/O, but must not synchronously
    // cause a cascade of render-time state updates.
    const controller = new AbortController();
    void fetchBreedWorkcopyStatus(controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setStatus(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Nepodarilo sa overiť živý stav D1.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="admin-card" aria-label="Živý stav synchronizácie plemien">
      <h2>Plemená – krok 7: živá synchronizácia Notion ↔ Admin</h2>
      {status ? (
        <p role="status">
          D1: {status.active}/{status.total} ACTIVE, {status.shadow} SHADOW,
          {status.receiptPrefixes} s uloženým poľovým záznamom.
          {" "}Pôvodná synchronizácia: {status.oldSyncEnabled ? "zapnutá" : "vypnutá"}.
          {" "}Nová synchronizácia: {status.workCopySyncEnabled ? "zapnutá" : "vypnutá"}.
          {" "}Aktivácia: {status.activationEnabled ? "povolená" : "uzavretá"}.
          {" "}Chybové záznamy: {status.activeErrors}.
        </p>
      ) : (
        <p role="status">{busy ? "Overujem živý stav D1…" : "Stav zatiaľ nie je načítaný."}</p>
      )}
      {status && !status.readyForManualRoundtrip && (
        <div role="alert">
          <p>Synchronizácia ešte nie je pripravená na test. Najprv treba vyriešiť blokátory:</p>
          <ul>
            {(status.blockers ?? []).map((code) => (
              <li key={code}>{({
                BREED_LINK_COUNT_MISMATCH: "Počet prepojených plemien nie je 344.",
                BREED_ACTIVE_COHORT_INCOMPLETE: "Nie všetkých 344 väzieb má stav ACTIVE.",
                BREED_FIELD_RECEIPTS_INCOMPLETE: "Chýbajú potvrdené záznamy synchronizácie polí.",
                BREED_SYNC_FLAGS_MISMATCH: "Nesprávne nastavenie pôvodného alebo nového synchronizátora.",
                BREED_ACTIVE_FIELD_ERRORS: "Niektoré aktívne profily majú nevyriešenú chybu prenosu.",
              } as Record<string, string>)[code] ?? code}</li>
            ))}
          </ul>
        </div>
      )}
      {status?.readyForManualRoundtrip && (
        <p>Základné D1 prepojenie je pripravené na skúšku jedného plemena.
          Funkčnosť overíme až po zmene textu v Notione, prenose do Adminu
          a následnej zmene iného textu opačným smerom.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void refresh()} disabled={busy}>
        {busy ? "Overujem…" : "Obnoviť živý stav D1"}
      </button>
    </section>
  );
}
