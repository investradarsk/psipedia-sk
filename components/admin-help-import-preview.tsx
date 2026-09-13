"use client";

import { useState } from "react";
import type { HelpPreview } from "@/lib/help-import-preview";

const labels = {
  NEW: "Nový",
  EXISTING_SAME: "Už existuje",
  POSSIBLE_DUPLICATE: "Možná duplicita",
  CONFLICT: "Konflikt",
  BLOCKED: "Blokovaný",
} as const;

export function AdminHelpImportPreview() {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<HelpPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    if (!file) return;
    setBusy(true); setError(""); setPreview(undefined);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Súbor je príliš veľký.");
      const source: unknown = JSON.parse(await file.text());
      const items = Array.isArray(source) ? source : source && typeof source === "object" ? (source as { items?: unknown }).items : undefined;
      if (!Array.isArray(items)) throw new Error("Vyber JSON s poľom items (alebo pole záznamov). CSV/XLSX zatiaľ nie je podporované.");
      const response = await fetch("/api/admin/help/preview", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }), cache: "no-store",
      });
      const data = await response.json() as { preview?: HelpPreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || "Produkčné porovnanie sa nepodarilo.");
      setPreview(data.preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview sa nepodarilo.");
    } finally { setBusy(false); }
  }

  return <section className="admin-panel admin-import-panel admin-help-import-check">
    <div className="admin-card-heading"><div><span>PREVIEW</span><div><h2>Pomoc psom – overiť bez importu</h2><p>Porovnanie s celou produkčnou tabuľkou vrátane konceptov. Toto tlačidlo nikdy nezapisuje do D1.</p></div></div></div>
    <label><span>JSON s poľom items (106 READY; HOLD neprikladať)</span><input type="file" accept="application/json,.json" onChange={(event) => { setFile(event.target.files?.[0]); setPreview(undefined); setError(""); }} /></label>
    <div className="admin-editor-actions"><button type="button" disabled={busy || !file} onClick={() => void check()}>{busy ? "Overujem…" : "Preview / Overiť bez importu"}</button></div>
    {error && <p className="admin-editor-message is-error" role="alert">{error}</p>}
    {preview && <>
      <div className="admin-import-preview admin-help-import-counts" aria-live="polite">
        {(["total", "NEW", "EXISTING_SAME", "POSSIBLE_DUPLICATE", "CONFLICT", "BLOCKED", "SAFE_FOR_IMPORT"] as const).map((key) => <div key={key}><span>{key}</span><strong>{preview[key]}</strong></div>)}
      </div>
      <p className="admin-field-help">Preview nie je súhlas s importom. Výsledky sa neukladajú a pri zmene produkčných údajov je potrebné overenie zopakovať. Pôvodný import nižšie nie je na tieto profily bezpečný.</p>
      <div className="admin-help-import-table-wrap"><table className="admin-help-import-table"><thead><tr><th>Riadok</th><th>Názov</th><th>Slug</th><th>Stav</th><th>Produkčný názov</th><th>ID</th><th>Produkčný slug</th><th>Dôvod</th><th>SAFE FOR IMPORT</th></tr></thead>
        <tbody>{preview.rows.map((row) => <tr key={row.index}><td>{row.index}</td><td>{row.title || "—"}</td><td>{row.slug || "—"}</td><td><span className={`admin-help-import-status admin-help-import-status--${row.status}`}>{labels[row.status]}</span></td><td>{row.matchedProductionTitle ?? "—"}</td><td>{row.matchedProductionId ?? "—"}</td><td>{row.matchedProductionSlug ?? "—"}</td><td>{row.reason}</td><td>{row.safeForImport ? "Áno" : "Nie"}</td></tr>)}</tbody>
      </table></div>
    </>}
  </section>;
}
