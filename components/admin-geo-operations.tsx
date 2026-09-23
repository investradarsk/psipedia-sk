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
  const [initializeReport, setInitializeReport] = useState<unknown>(null);
  const [backfillReport, setBackfillReport] = useState<unknown>(null);
  const [targetType, setTargetType] = useState("");
  const [directoryCategory, setDirectoryCategory] = useState("");

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
    const params = new URLSearchParams({ limit: "50" });
    if (targetType) params.set("target", targetType);
    if (targetType === "DIRECTORY_PROFILE" && directoryCategory.trim()) params.set("category", directoryCategory.trim());
    const response = await fetch(`/api/admin/geo/operations?${params.toString()}`, { cache: "no-store" });
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
      <h2>Dry-run classifier & bounded rollout</h2>
      <p className="admin-help">Provider sa nevolá pri dry-rune ani inicializácii. Safe-only inicializácia preskočí review-blocked, HIDDEN a negeocodable kandidátov.</p>
      <div className="admin-field-grid">
        <div className="admin-field">
          <label htmlFor="geo-ops-target">Target type</label>
          <select id="geo-ops-target" value={targetType} onChange={(event) => {
            setTargetType(event.target.value);
            if (event.target.value !== "DIRECTORY_PROFILE") setDirectoryCategory("");
          }}>
            <option value="">Vyber target</option>
            <option value="MANAGED_EVENT">MANAGED_EVENT</option>
            <option value="DIRECTORY_PROFILE">DIRECTORY_PROFILE</option>
            <option value="ORGANIZATION_LOCATION">ORGANIZATION_LOCATION</option>
          </select>
        </div>
        {targetType === "DIRECTORY_PROFILE" && <div className="admin-field">
          <label htmlFor="geo-ops-category">Directory category</label>
          <input id="geo-ops-category" value={directoryCategory} onChange={(event) => setDirectoryCategory(event.target.value)} placeholder="napr. veterinari" />
        </div>}
      </div>
      <div className="admin-editor-actions">
        <button type="button" disabled={busy || !targetType || (targetType === "DIRECTORY_PROFILE" && !directoryCategory.trim())} onClick={async () => {
          if (!window.confirm(`Inicializovať najviac 20 SAFE kandidátov pre ${targetType}${directoryCategory ? ` / ${directoryCategory}` : ""}? Bez provider callov; review-blocked a HIDDEN sa preskočia.`)) return;
          const report = await action({
            action: "initialize",
            limit: 20,
            confirm: "INITIALIZE",
            safeOnly: true,
            targetType,
            directoryCategory: targetType === "DIRECTORY_PROFILE" ? directoryCategory.trim() : null,
          });
          if (report) {
            setInitializeReport(report);
            setMessage("Safe-only inicializácia geo riadkov skončila.");
            await refresh();
          }
        }}>Inicializovať SAFE max. 20</button>

        <button type="button" disabled={busy || !providerConfigured || !targetType || (targetType === "DIRECTORY_PROFILE" && !directoryCategory.trim())} onClick={async () => {
          if (!window.confirm(`Spustiť bounded backfill max. 5 pre ${targetType}${directoryCategory ? ` / ${directoryCategory}` : ""}? Operácia zapisuje iba výsledky už inicializovaných PENDING kandidátov.`)) return;
          const report = await action({
            action: "backfill",
            limit: 5,
            confirm: "BACKFILL-CHUNK",
            targetType,
            directoryCategory: targetType === "DIRECTORY_PROFILE" ? directoryCategory.trim() : null,
          });
          if (report) {
            setBackfillReport(report);
            setMessage("Bounded backfill chunk skončil.");
            await refresh();
          }
        }}>Backfill max. 5</button>

        <button type="button" disabled={busy || !providerConfigured || !targetType || (targetType === "DIRECTORY_PROFILE" && !directoryCategory.trim())} onClick={async () => {
          if (!window.confirm("Spustiť najviac 5 Geoapify canary requestov iba pre kandidátov bez povinného privacy review? Výsledky sa NEUKLADAJÚ do geo_points.")) return;
          const report = await action({
            action: "canary",
            limit: 5,
            confirm: "CANARY",
            targetType,
            directoryCategory: targetType === "DIRECTORY_PROFILE" ? directoryCategory.trim() : null,
          });
          if (report) { setCanary(report); setMessage("Canary skončil; nič sa nepublikovalo ani nepersistovalo."); }
        }}>Canary max. 5</button>

        <button type="button" disabled={busy} onClick={() => void refresh()}>Obnoviť dry-run</button>
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

    {initializeReport ? <section className="admin-form-card"><h2>Initialization report</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(initializeReport, null, 2)}</pre></section> : null}
    {backfillReport ? <section className="admin-form-card"><h2>Backfill report</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(backfillReport, null, 2)}</pre></section> : null}
    {canary ? <section className="admin-form-card"><h2>Canary report</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(canary, null, 2)}</pre></section> : null}
  </div>;
}
