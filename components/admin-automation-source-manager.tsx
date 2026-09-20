"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutomationSourceAdminRow, AutomationSourceCandidateRow } from "@/lib/data-automation-source-store";
import { automationConnectorTypes, automationEntityTypes } from "@/lib/data-automation";

const defaultConfig = "{}";

async function jsonMutation(url: string, method: "POST" | "PUT", body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Operácia zlyhala.");
  return payload;
}

export function AdminAutomationSourceManager({
  sources,
  candidates,
}: {
  sources: AutomationSourceAdminRow[];
  candidates: AutomationSourceCandidateRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    sourceKey: "",
    label: "",
    entityType: "EVENT",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "",
    cadenceMinutes: "1440",
    throttleMs: "1000",
    timeoutMs: "8000",
    retryMaxAttempts: "2",
    retryBackoffMs: "1000",
    maxRecordsPerRun: "100",
    config: defaultConfig,
  });

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function createSource(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await jsonMutation("/api/admin/automation-sources", "POST", form);
      setMessage("Zdroj bol vytvorený ako vypnutý a čaká na explicitné review.");
      setForm((current) => ({ ...current, sourceKey: "", label: "", sourceUrl: "", config: defaultConfig }));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Zdroj sa nepodarilo vytvoriť.");
    } finally {
      setBusy(false);
    }
  }

  async function candidateAction(id: number, action: "approve" | "reject" | "suppress") {
    setBusy(true);
    setMessage("");
    try {
      await jsonMutation(`/api/admin/automation-source-candidates/${id}`, "PUT", { action, suppressedDays: 30 });
      setMessage(action === "approve"
        ? "Kandidát bol schválený ako nový vypnutý source. Pred aktiváciou ešte vyžaduje source review."
        : "Candidate review bolo uložené.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kandidáta sa nepodarilo spracovať.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}

      <section className="admin-panel">
        <h2>Pridať zdroj</h2>
        <p>Nový zdroj sa nikdy neaktivuje automaticky. Najprv ho ulož, otestuj a explicitne schváľ.</p>
        <form onSubmit={createSource} className="admin-form" aria-label="Pridať automation source">
          <div className="admin-form-grid">
            <label className="admin-field"><span>Source key</span><input required value={form.sourceKey} onChange={(e) => field("sourceKey", e.target.value)} placeholder="napr. klub-events" /></label>
            <label className="admin-field"><span>Názov</span><input required value={form.label} onChange={(e) => field("label", e.target.value)} /></label>
            <label className="admin-field"><span>Entity type</span><select value={form.entityType} onChange={(e) => field("entityType", e.target.value)}>{automationEntityTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="admin-field"><span>Connector</span><select value={form.connectorType} onChange={(e) => field("connectorType", e.target.value)}>{automationConnectorTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="admin-field admin-field-wide"><span>Source URL</span><input type="url" value={form.sourceUrl} onChange={(e) => field("sourceUrl", e.target.value)} placeholder="https://…" /></label>
            <label className="admin-field"><span>Cadence (min)</span><input type="number" min={60} max={43200} value={form.cadenceMinutes} onChange={(e) => field("cadenceMinutes", e.target.value)} /></label>
            <label className="admin-field"><span>Timeout (ms)</span><input type="number" min={1000} max={30000} value={form.timeoutMs} onChange={(e) => field("timeoutMs", e.target.value)} /></label>
            <label className="admin-field"><span>Throttle (ms)</span><input type="number" min={0} max={60000} value={form.throttleMs} onChange={(e) => field("throttleMs", e.target.value)} /></label>
            <label className="admin-field"><span>Max records/run</span><input type="number" min={1} max={500} value={form.maxRecordsPerRun} onChange={(e) => field("maxRecordsPerRun", e.target.value)} /></label>
            <label className="admin-field"><span>Retry pokusy</span><input type="number" min={0} max={4} value={form.retryMaxAttempts} onChange={(e) => field("retryMaxAttempts", e.target.value)} /></label>
            <label className="admin-field"><span>Retry backoff (ms)</span><input type="number" min={100} max={30000} value={form.retryBackoffMs} onChange={(e) => field("retryBackoffMs", e.target.value)} /></label>
          </div>
          <label className="admin-field"><span>Mapping / config JSON</span><textarea rows={8} value={form.config} onChange={(e) => field("config", e.target.value)} spellCheck={false} /></label>
          <div className="admin-form-actions"><button type="submit" disabled={busy}>Vytvoriť vypnutý zdroj</button></div>
        </form>
      </section>

      <section className="admin-panel">
        <h2>Zdroje</h2>
        {sources.length ? (
          <div className="admin-change-table">
            <div className="is-heading"><strong>Zdroj</strong><strong>Stav</strong><strong>Health / next run</strong></div>
            {sources.map((source) => (
              <div key={source.id}>
                <strong><Link href={`/admin/operations/automation/sources/${source.id}`}>{source.label}</Link><small> · {source.entityType} / {source.connectorType}</small></strong>
                <span>{source.enabled ? "ENABLED" : "DISABLED"} · review {source.reviewStatus}</span>
                <span>{source.lastRunStatus ?? "bez runu"} · errors {source.errorCount} · next {source.nextCheckAt ?? "—"}</span>
              </div>
            ))}
          </div>
        ) : <div className="admin-empty"><h3>Žiadne sources</h3><p>Po migrácii sa tu zobrazia nakonfigurované produkčné zdroje.</p></div>}
      </section>

      <section className="admin-panel">
        <h2>Source candidates</h2>
        <p>Discovery vytvára iba <code>SOURCE_CANDIDATE</code>. Kandidát sa nestáva aktívnym zdrojom bez review.</p>
        {candidates.length ? (
          <div className="admin-change-table">
            <div className="is-heading"><strong>Kandidát</strong><strong>Dôvod / match</strong><strong>Review</strong></div>
            {candidates.map((candidate) => (
              <div key={candidate.id}>
                <strong>{candidate.label}<small> · {candidate.discoveryType} · {candidate.entityType}</small><br /><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Otvoriť URL ↗</a></strong>
                <span>{candidate.reason}<br /><small>{candidate.duplicateSourceId ? `Duplicitný source #${candidate.duplicateSourceId}` : "Bez priameho source matchu"}</small></span>
                <span>
                  <strong>{candidate.reviewStatus}</strong>
                  {candidate.reviewStatus === "NEW" && (
                    <span className="admin-form-actions">
                      <button type="button" disabled={busy} onClick={() => void candidateAction(candidate.id, "approve")}>Schváliť ako zdroj</button>
                      <button type="button" disabled={busy} onClick={() => void candidateAction(candidate.id, "reject")}>Zamietnuť</button>
                      <button type="button" disabled={busy} onClick={() => void candidateAction(candidate.id, "suppress")}>Potlačiť 30 dní</button>
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : <p>Zatiaľ neboli nájdené žiadne nové source candidates.</p>}
      </section>
    </>
  );
}
