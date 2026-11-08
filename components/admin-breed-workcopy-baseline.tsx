"use client";

import { useState } from "react";

type BatchResult = {
  scanned: number;
  nextCursor: number | null;
  initialized: number;
  failed: number;
  differentValueCount: number;
  stagedTotal: number;
  baselinesReady: number;
  baselinesMissing: number;
  rowsNeedingReview: number;
  cutoverReady: false;
  code?: string;
};

/**
 * Explicit owner-only process. 10 independent SHADOW receipts per request.
 * No scheduler, no automatic merge hook, no source switch.
 */
export function AdminBreedWorkcopyBaseline() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [totalInitialized, setTotalInitialized] = useState(0);
  const [message, setMessage] = useState("");

  async function initialize() {
    if (running || !window.confirm(
      "Vytvoriť samostatné baselines pre 344 plemien? " +
      "Pôvodný Notion sync ani verejné profily sa nemenia. " +
      "Spustí sa najviac 10 plemien na požiadavku.",
    )) return;
    setRunning(true);
    setResult(null);
    setTotalInitialized(0);
    setMessage("Prebieha kontrolovaný zápis iba do SHADOW…");
    let cursor = 0;
    let created = 0;
    try {
      for (let batch = 0; batch < 40; batch++) {
        const response = await fetch("/api/admin/notion-breeds-workcopy-baseline", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "x-psipedia-confirm-action": "BASELINE_344_BREEDS",
            "x-psipedia-breed-baseline-after": String(cursor),
          },
        });
        const data = await response.json() as BatchResult;
        if (!response.ok) throw Error(data.code || "BREED_WORKCOPY_BASELINE_REQUEST_FAILED");
        if (data.stagedTotal !== 344 || data.cutoverReady !== false)
          throw Error("BREED_WORKCOPY_BASELINE_REPORT_UNEXPECTED");
        created += data.initialized;
        setTotalInitialized(created);
        setResult(data);
        if (data.nextCursor == null || data.scanned === 0) {
          setMessage(data.baselinesMissing === 0 && data.rowsNeedingReview === 0
            ? "Všetkých 344 nezávislých záznamov je pripravených. Nový sync zostáva vypnutý."
            : "Priechod dokončený. Neúplné profily zostali oddelene na kontrolu; môžete ich skúsiť znova.");
          return;
        }
        if (!Number.isSafeInteger(data.nextCursor) || data.nextCursor <= cursor)
          throw Error("BREED_WORKCOPY_BASELINE_CURSOR_INVALID");
        cursor = data.nextCursor;
      }
      throw Error("BREED_WORKCOPY_BASELINE_BATCH_LIMIT_EXCEEDED");
    } catch (error) {
      setMessage("Zastavené: " + (error instanceof Error ? error.message : "Neznáma chyba"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section aria-label="Inicializácia novej databázy plemien" className="admin-card">
      <h2>Pracovná kópia plemien – krok 2</h2>
      <p>
        Nezávislá východisková hodnota každého poľa sa uloží len do
        pomocnej SHADOW tabuľky. Pôvodná synchronizácia zostáva aktívna.
      </p>
      <button className="admin-primary-action" type="button"
        onClick={() => void initialize()} disabled={running}>
        {running ? "Spracúvam baselines…" : "Vytvoriť 344 nezávislých baselines"}
      </button>
      {result && <p role="status">
        Hotové: {result.baselinesReady}/344,
        chýba: {result.baselinesMissing},
        na kontrolu: {result.rowsNeedingReview}.
        V tomto spustení doplnených: {totalInitialized}.
      </p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
