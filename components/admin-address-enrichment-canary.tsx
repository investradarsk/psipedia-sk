"use client";

import { useMemo, useState } from "react";

type Item = {
  target: { id: number; name: string; city: string; street: string; houseNumber: string; postalCode: string; updatedAt: string };
  assessment: { decision: "AUTO_APPLY" | "REVIEW" | "NO_MATCH"; reason: string } | null;
  candidate: { rawAddressText: string; entityMatchConfidence: string; providerVerification: string } | null;
  sourceUrl: string | null;
  extractionMethod: string | null;
  candidateFingerprint: string | null;
  reason: string;
};
type Preview = {
  scanned: number;
  candidatesFound: number;
  autoApplyCandidates: number;
  reviewCandidates: number;
  noMatch: number;
  searchCalls: number;
  providerCalls: number;
  pageFetches: number;
  productionWrites: 0;
  stoppedByRateLimit: string | null;
  items: Item[];
};

export function AdminAddressEnrichmentCanary() {
  const [limit, setLimit] = useState(3);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [applyReport, setApplyReport] = useState<unknown>(null);

  const eligible = useMemo(
    () => preview?.items.filter((item) => item.assessment?.decision === "AUTO_APPLY" && item.candidateFingerprint) ?? [],
    [preview],
  );

  async function runPreview(clearApplyReport = true) {
    setBusy(true); setError(""); setMessage(""); setSelected(new Set());
    if (clearApplyReport) setApplyReport(null);
    try {
      const response = await fetch("/api/admin/address-enrichment/live-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      const body = await response.json() as { error?: string; preview?: Preview };
      if (!response.ok || !body.preview) throw new Error(body.error || "Canary preview zlyhal.");
      setPreview(body.preview);
      setMessage("Preview dokončený. Canonical writes: 0 · GEO writes: 0.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Canary preview zlyhal.");
    } finally {
      setBusy(false);
    }
  }

  async function applySelected() {
    if (!preview) return;
    const selections = eligible
      .filter((item) => selected.has(item.target.id))
      .map((item) => ({
        targetId: item.target.id,
        updatedAt: item.target.updatedAt,
        candidateFingerprint: item.candidateFingerprint!,
      }));
    if (!selections.length) {
      setError("Vyber aspoň jeden AUTO_APPLY kandidát.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/address-enrichment/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm, selections }),
      });
      const body = await response.json() as { error?: string; report?: unknown };
      if (!response.ok) throw new Error(body.error || "Canary apply zlyhal.");
      setApplyReport(body.report ?? null);
      setMessage("Explicitný canary apply dokončený. Server pred zápisom znovu overil discovery, provider a stale guardy.");
      await runPreview(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Canary apply zlyhal.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-event-editor" data-address-enrichment-canary>
    <section className="admin-form-card">
      <h2>Doplnenie adries — canary</h2>
      <p className="admin-help">
        Live preview je bounded na <strong>max 5 profilov</strong>. Môže volať first-party web, Tavily a Geoapify,
        ale samotný preview nemení canonical adresu ani GEO.
      </p>
      <label>
        Limit
        <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} disabled={busy}>
          {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <div className="admin-editor-actions">
        <button type="button" onClick={() => void runPreview()} disabled={busy}>Spustiť preview</button>
      </div>
      {preview && <p className="admin-help">
        Scanned <strong>{preview.scanned}</strong>
        {" · "}candidates <strong>{preview.candidatesFound}</strong>
        {" · "}AUTO_APPLY <strong>{preview.autoApplyCandidates}</strong>
        {" · "}REVIEW <strong>{preview.reviewCandidates}</strong>
        {" · "}NO_MATCH <strong>{preview.noMatch}</strong>
        {" · "}search <strong>{preview.searchCalls}</strong>
        {" · "}provider <strong>{preview.providerCalls}</strong>
        {" · "}fetch <strong>{preview.pageFetches}</strong>
        {" · "}writes <strong>{preview.productionWrites}</strong>
      </p>}
      {preview?.stoppedByRateLimit && <p className="admin-message admin-message--error">
        Run bol zastavený po rate limite: {preview.stoppedByRateLimit}.
      </p>}
    </section>

    {preview && <section className="admin-form-card">
      <h2>Výsledky preview</h2>
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead><tr>
            <th>Apply</th><th>Profil</th><th>Teraz</th><th>Nájdené</th><th>Zdroj</th><th>Identity</th><th>Provider</th><th>Výsledok</th>
          </tr></thead>
          <tbody>{preview.items.map((item) => {
            const auto = item.assessment?.decision === "AUTO_APPLY" && Boolean(item.candidateFingerprint);
            return <tr key={item.target.id}>
              <td><input
                type="checkbox"
                disabled={!auto || busy}
                checked={selected.has(item.target.id)}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(item.target.id); else next.delete(item.target.id);
                  return next;
                })}
                aria-label={"Vybrať " + item.target.name}
              /></td>
              <td><strong>{item.target.name}</strong><br />#{item.target.id}</td>
              <td>{[item.target.street, item.target.houseNumber, item.target.postalCode, item.target.city].filter(Boolean).join(" ") || "—"}</td>
              <td>{item.candidate?.rawAddressText || "—"}</td>
              <td style={{ maxWidth: 280, overflowWrap: "anywhere" }}>
                {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceUrl}</a> : "—"}
                {item.extractionMethod && <><br /><small>{item.extractionMethod}</small></>}
              </td>
              <td>{item.candidate?.entityMatchConfidence ?? "—"}</td>
              <td>{item.candidate?.providerVerification ?? "NOT_RUN"}</td>
              <td><strong>{item.assessment?.decision ?? "NO_MATCH"}</strong><br /><small>{item.reason}</small></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>}

    {preview && <section className="admin-form-card">
      <h2>Explicitný apply</h2>
      <p className="admin-help">
        Apply je dostupný iba pre vybrané AUTO_APPLY kandidáty. Server pred zápisom znovu vykoná discovery/verification
        a blokuje zmenu <code>updated_at</code>, zmenu candidate fingerprintu aj protected canonical konflikt.
      </p>
      <label>
        Potvrdenie
        <input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="ADDRESS-ENRICH-CANARY" />
      </label>
      <div className="admin-editor-actions">
        <button type="button" onClick={() => void applySelected()} disabled={busy || selected.size < 1 || confirm !== "ADDRESS-ENRICH-CANARY"}>
          Aplikovať vybrané ({selected.size})
        </button>
      </div>
    </section>}

    {message && <p className="admin-message admin-message--success">{message}</p>}
    {error && <p className="admin-message admin-message--error">{error}</p>}
    {applyReport && <section className="admin-form-card"><h2>Apply report</h2><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(applyReport, null, 2)}</pre></section>}
  </div>;
}
