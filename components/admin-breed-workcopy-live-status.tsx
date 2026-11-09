"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  total: number; active: number; shadow: number;
  receiptPrefixes: number; activeErrors: number;
  oldSyncEnabled: boolean; workCopySyncEnabled: boolean;
  activationEnabled: boolean; activeCohortReady: boolean;
  singleNewEngine: boolean;
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
      {status && !(status.activeCohortReady && status.singleNewEngine) && (
        <p role="alert">
          Pozor: nebolo potvrdených 344 ACTIVE väzieb s jediným novým synchronizátorom.
          Údaje plemien zatiaľ neupravuj.
        </p>
      )}
      {status?.activeCohortReady && status?.singleNewEngine && (
        <p>Kontrolované prepnutie je pripravené. Ďalej otestujeme jeden zmenený
          text v Notione a jeden samostatný text v Admine.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void refresh()} disabled={busy}>
        {busy ? "Overujem…" : "Obnoviť živý stav D1"}
      </button>
    </section>
  );
}
