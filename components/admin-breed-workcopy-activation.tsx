"use client";

import { useState } from "react";

type ActivationResult = {
  activated?: boolean;
  activeLinks?: number;
  oldSyncEnabled?: boolean;
  workCopySyncEnabled?: boolean;
  code?: string;
  failures?: string[];
  count?: number;
};

/**
 * Explicit one-shot, owner-confirmed cutover. Does NOT enable the new sync.
 * The server independently verifies the complete cohort, source identity,
 * both paused engines, 344 independent receipts and atomic D1 CAS.
 */
export function AdminBreedWorkcopyActivation() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ActivationResult | null>(null);
  const [message, setMessage] = useState("");

  async function activate() {
    if (running) return;
    if (!window.confirm(
      "Aktivovať naraz všetkých 344 prepojení novej Notion databázy? " +
      "Pôvodná aj nová synchronizácia ostávajú vypnuté. " +
      "Údaje plemien a Notion sa neprepíšu. Pokračuj iba vtedy, " +
      "ak obe automatizácie plemien A–K a L–Ž zostávajú pozastavené.",
    )) return;
    setRunning(true);
    setResult(null);
    setMessage("Kontrolujem obe Notion databázy a 344 väzieb…");
    try {
      const response = await fetch("/api/admin/notion-breeds-workcopy-activate", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "x-psipedia-confirm-action": "ACTIVATE_344_BREEDS",
          "x-psipedia-editorial-automations": "BOTH_PAUSED",
        },
      });
      const data = await response.json() as ActivationResult;
      setResult(data);
      if (!response.ok) {
        setMessage(
          "Aktivácia sa neuskutočnila: " + (data.code ?? "NEZNÁMA_CHYBA") +
          (data.failures?.length ? " (" + data.failures.slice(0, 4).join(", ") + ")" : "") +
          ". Starý ani nový synchronizátor nezapínaj.",
        );
      } else if (data.activated && data.activeLinks === 344 &&
          data.oldSyncEnabled === false && data.workCopySyncEnabled === false) {
        setMessage("AKTIVOVANÉ 344/344. Oba synchronizátory zostávajú vypnuté. " +
          "Pred povolením novej synchronizácie treba overiť 344 ACTIVE záznamov.");
      } else {
        setMessage("Výsledok nemožno potvrdiť. Nový synchronizátor zatiaľ nezapínaj.");
      }
    } catch (error) {
      setMessage("Kontrola/aktivácia zlyhala: " +
        (error instanceof Error ? error.message : "Neznáma chyba") +
        ". Over stav v D1 pred akýmkoľvek opakovaním.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="admin-card" aria-label="Kontrolované prepnutie Notion plemien">
      <h2>Plemená – krok 6: aktivácia novej databázy</h2>
      <p>
        Produkčný postflight potvrdil 344 nezávislých väzieb.
        Obe synchronizácie sú v tomto kroku pozastavené.
        Aktivácia zmení len 344 väzieb SHADOW na ACTIVE; prenos údajov
        a redakčné automatizácie zostanú vypnuté.
      </p>
      <button type="button" className="admin-primary-action"
        disabled={running || result?.activated === true}
        onClick={() => void activate()}>
        {running ? "Overujem 344 väzieb…" : "Aktivovať 344 väzieb (bez zapnutia synchronizácie)"}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
