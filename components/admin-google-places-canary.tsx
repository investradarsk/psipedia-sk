"use client";

import { useMemo, useState } from "react";
import type { GooglePlaceCanaryPreviewItem } from "@/lib/google-place-canary";

type PreviewReport = {
  requested: number;
  matchedTargets: number;
  items: GooglePlaceCanaryPreviewItem[];
};

export function AdminGooglePlacesCanary({ configured }: { configured: boolean }) {
  const [limit, setLimit] = useState(3);
  const [idsText, setIdsText] = useState("");
  const [preview, setPreview] = useState<PreviewReport | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyReport, setApplyReport] = useState<unknown>(null);

  const matchItems = useMemo(() => preview?.items.filter((item) => item.decision === "MATCH") ?? [], [preview]);

  function parseIds() {
    const raw = idsText.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    if (!raw.length) return undefined;
    if (raw.length > 5) throw new Error("Maximum je 5 explicitných target ID.");
    const ids = raw.map(Number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
      throw new Error("Target ID musia byť unique kladné celé čísla.");
    }
    return ids;
  }

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/google-places", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json() as { error?: string; report?: unknown };
    if (!response.ok) throw new Error(body.error || "Google Places operácia zlyhala.");
    return body.report;
  }

  async function runPreview() {
    setBusy(true); setError(""); setMessage(""); setApplyReport(null); setSelected([]); setConfirmation("");
    try {
      const targetIds = parseIds();
      const report = await post({ action: "preview", limit, targetIds }) as PreviewReport;
      setPreview(report);
      setMessage("Preview hotový. Nič sa nezapísalo do databázy.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview zlyhal.");
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    if (!preview) return;
    const selections = matchItems.filter((item) => selected.includes(item.targetId)).map((item) => ({
      targetId: item.targetId,
      sourceFingerprint: item.sourceFingerprint,
      googlePlaceId: item.candidate?.id,
      previewFingerprint: item.previewFingerprint,
    }));
    if (!selections.length) {
      setError("Vyber aspoň jeden MATCH.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const report = await post({ action: "apply", confirmation, selections });
      setApplyReport(report);
      setMessage("Apply dokončený. Zapísané boli iba explicitne vybrané MATCH položky.");
      setConfirmation("");
      setSelected([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Apply zlyhal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-event-editor">
      <section className="admin-form-card">
        <h2>Google Place ID canary</h2>
        <p className="admin-help">
          Google Places slúži iba na identifikáciu existujúceho Google Place. Canonical adresa a Geoapify GEO zostávajú source of truth.
        </p>
        <p className={configured ? "admin-message" : "admin-message admin-message--error"}>
          Server-side secret <strong>GOOGLE_PLACES_API_KEY</strong>: {configured ? "nakonfigurovaný" : "chýba"}.
        </p>
        <div className="admin-field-grid">
          <div className="admin-field">
            <label htmlFor="google-place-limit">Automatic canary size</label>
            <select id="google-place-limit" value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="google-place-ids">Voliteľné explicitné DIRECTORY_PROFILE ID</label>
            <input
              id="google-place-ids"
              value={idsText}
              onChange={(event) => { setIdsText(event.target.value); setPreview(null); setSelected([]); }}
              placeholder="napr. 12, 18, 27"
            />
          </div>
        </div>
        <div className="admin-editor-actions">
          <button type="button" disabled={busy || !configured} onClick={runPreview}>Spustiť preview</button>
        </div>
        <p className="admin-help"><strong>Preview volá Google Places, ale zapisuje 0 DB polí.</strong> Max. 5 targetov/run.</p>
      </section>

      {preview ? (
        <section className="admin-form-card">
          <h2>Match diagnostics</h2>
          <p className="admin-help">Targets: {preview.matchedTargets} · MATCH: {matchItems.length}</p>
          <div style={{ display: "grid", gap: 12 }}>
            {preview.items.map((item) => (
              <article key={item.targetId} className="admin-form-card" style={{ margin: 0 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  {item.decision === "MATCH" ? (
                    <input
                      aria-label={"Vybrať MATCH " + item.targetId}
                      type="checkbox"
                      checked={selected.includes(item.targetId)}
                      onChange={(event) => setSelected((current) => event.target.checked
                        ? [...current, item.targetId]
                        : current.filter((id) => id !== item.targetId))}
                    />
                  ) : null}
                  <div style={{ minWidth: 0, flex: "1 1 520px" }}>
                    <h3 style={{ marginTop: 0 }}>#{item.targetId} · {item.name} · {item.decision}</h3>
                    <p><strong>Canonical:</strong> {item.canonicalAddress.replace(/\n/g, ", ")}</p>
                    <p><strong>Current GEO:</strong> {item.latitude}, {item.longitude}</p>
                    <p><strong>Query:</strong> {item.query}</p>
                    <p><strong>Reason:</strong> {item.reason}</p>
                    <p><strong>Candidates:</strong> {item.candidateCount}</p>
                    {item.candidate ? (
                      <div style={{ overflowWrap: "anywhere" }}>
                        <p><strong>Place ID:</strong> {item.candidate.id}</p>
                        <p><strong>Google name:</strong> {item.candidate.displayName || "—"}</p>
                        <p><strong>Google address:</strong> {item.candidate.formattedAddress || "—"}</p>
                        <p><strong>Google coords:</strong> {item.candidate.latitude}, {item.candidate.longitude}</p>
                        <p><strong>Distance:</strong> {item.candidate.distanceMeters} m</p>
                        <p><strong>Name match:</strong> {item.candidate.nameScore.toFixed(3)}</p>
                        <p><strong>City/address/postal:</strong> {String(item.candidate.cityMatch)} / {String(item.candidate.addressMatch)} / {String(item.candidate.postalCodeMatch)}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {preview && matchItems.length ? (
        <section className="admin-form-card">
          <h2>Explicit apply</h2>
          <p className="admin-help">
            Apply znovu načíta target, zopakuje Google match a blokuje stale canonical/GEO/candidate stav. REVIEW a NO_MATCH sa nedajú vybrať.
          </p>
          <div className="admin-field">
            <label htmlFor="google-place-confirmation">Confirmation token</label>
            <input
              id="google-place-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="GOOGLE-PLACE-CANARY"
            />
          </div>
          <div className="admin-editor-actions">
            <button
              type="button"
              disabled={busy || confirmation !== "GOOGLE-PLACE-CANARY" || selected.length < 1}
              onClick={runApply}
            >
              Apply selected MATCH
            </button>
          </div>
        </section>
      ) : null}

      {message ? <p className="admin-message">{message}</p> : null}
      {error ? <p className="admin-message admin-message--error">{error}</p> : null}
      {applyReport ? <section className="admin-form-card"><h2>Apply report</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(applyReport, null, 2)}</pre></section> : null}
    </div>
  );
}
