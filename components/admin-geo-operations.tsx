"use client";

import { useState } from "react";
import type { GeoDryRunItem } from "@/lib/geo-operations";

export function AdminGeoOperations({ initialItems, providerConfigured }: {
  initialItems: GeoDryRunItem[];
  providerConfigured: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canary, setCanary] = useState<unknown>(null);

  async function action(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/geo/operations", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string; report?: unknown };
      if (!response.ok) throw new Error(body.error || "Geo operácia zlyhala.");
      return body.report;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Geo operácia zlyhala.");
      return null;
    } finally { setBusy(false); }
  }

  async function refresh() {
    const response = await fetch("/api/admin/geo/operations?limit=50", { cache: "no-store" });
    const body = await response.json() as { preview?: { items: GeoDryRunItem[] }; error?: string };
    if (!response.ok || !body.preview) throw new Error(body.error || "Dry-run sa nepodarilo obnoviť.");
    setItems(body.preview.items);
  }

  return <div className="admin-event-editor" data-admin-geo-operations>
    <section className="admin-form-card">
      <h2>Production safety gates</h2>
      <p className="admin-help"><strong>Gate A:</strong> read-only production inventory ešte nebol vykonaný z tohto prostredia.</p>
      <p className="admin-help"><strong>Gate B:</strong> Slovak quality canary nie je automaticky spustený.</p>
      <p className="admin-help"><strong>Gate C:</strong> Geoapify provider {providerConfigured ? "má dostupný server-side secret." : "nemá dostupný server-side secret."}</p>
      <p className="admin-message admin-message--error"><strong>Full production backfill je hard-disabled.</strong> Táto stránka nemá akciu „geocode všetko“.</p>
    </section>

    <section className="admin-form-card">
      <h2>Dry-run classifier</h2>
      <p className="admin-help">Provider sa nevolá pri dry-rune. Canary prehľadá bounded vzorku a provider zavolá iba pre kandidátov bez povinného privacy review.</p>
      <div className="admin-editor-actions">
        <button type="button" disabled={busy} onClick={async () => {
          if (!window.confirm("Vytvoriť najviac 20 geo_points riadkov bez provider callov? Ide iba o explicitnú inicializáciu operations state.")) return;
          const report = await action({ action: "initialize", limit: 20, confirm: "INITIALIZE" });
          if (report) { setMessage("Inicializácia geo riadkov skončila."); await refresh(); }
        }}>Inicializovať max. 20 riadkov</button>
        <button type="button" disabled={busy || !providerConfigured} onClick={async () => {
          if (!window.confirm("Spustiť najviac 5 Geoapify canary requestov iba pre kandidátov bez povinného privacy review? Výsledky sa NEUKLADAJÚ do geo_points.")) return;
          const report = await action({ action: "canary", limit: 5, confirm: "CANARY" });
          if (report) { setCanary(report); setMessage("Canary skončil; nič sa nepublikovalo ani nepersistovalo."); }
        }}>Spustiť max. 5 canary requestov</button>
      </div>
      {message && <p className="admin-message" role="status">{message}</p>}
      {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
    </section>

    <section className="admin-form-card">
      <h2>Prvých {items.length} dry-run kandidátov</h2>
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead><tr><th>Target</th><th>Názov</th><th>Návrh</th><th>Precision</th><th>Review</th><th>Query</th></tr></thead>
          <tbody>{items.map((item) => <tr key={`${item.targetType}:${item.targetId}`}>
            <td>{item.targetType} #{item.targetId}</td><td>{item.label}</td>
            <td>{item.proposedVisibility ?? "UNCLASSIFIED"}</td><td>{item.proposedPrecision ?? "—"}</td>
            <td>{item.requiresReview ? (item.reasonCode ?? "áno") : "nie"}</td>
            <td>{item.normalizedQuery ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    {canary ? <section className="admin-form-card"><h2>Canary report</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(canary, null, 2)}</pre></section> : null}
  </div>;
}
