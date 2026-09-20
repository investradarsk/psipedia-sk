"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutomationSourceAdminRow } from "@/lib/data-automation-source-store";
import { automationConnectorTypes, automationEntityTypes } from "@/lib/data-automation";

type Preview = {
  ok: boolean;
  sourceStatus: string;
  httpStatus: number | null;
  recordsFound: number;
  recordsNormalized: number;
  possibleMatches: number;
  newCandidates: number;
  possibleUpdates: number;
  errors: string[];
  writes: { observations: number; findings: number; canonical: number; publications: number };
};

type RunSummary = {
  status: string;
  checked: number;
  newFindings: number;
  updatedFindings: number;
  errors: number;
  nextCheckAt: string | null;
};

async function mutate(url: string, method: "POST" | "PUT", body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Operácia zlyhala.");
  return payload;
}

export function AdminAutomationSourceDetail({ source }: { source: AutomationSourceAdminRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [notes, setNotes] = useState(source.reviewNotes ?? "");
  const [form, setForm] = useState<{\n    sourceKey: string; label: string; entityType: string; connectorType: string; sourceUrl: string;\n    cadenceMinutes: string; throttleMs: string; timeoutMs: string; retryMaxAttempts: string; retryBackoffMs: string;\n    maxRecordsPerRun: string; config: string;\n  }>({
    sourceKey: source.sourceKey,
    label: source.label,
    entityType: source.entityType,
    connectorType: source.connectorType,
    sourceUrl: source.sourceUrl ?? "",
    cadenceMinutes: String(source.cadenceMinutes),
    throttleMs: String(source.throttleMs),
    timeoutMs: String(source.timeoutMs),
    retryMaxAttempts: String(source.retryMaxAttempts),
    retryBackoffMs: String(source.retryBackoffMs),
    maxRecordsPerRun: String(source.maxRecordsPerRun),
    config: JSON.stringify(source.config, null, 2),
  });

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await mutate(`/api/admin/automation-sources/${source.id}`, "PUT", body);
      setMessage("Zmena bola uložená.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operácia zlyhala.");
    } finally {
      setBusy(false);
    }
  }

  async function testSource() {
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const payload = await mutate(`/api/admin/automation-sources/${source.id}/test`, "POST", {});
      setPreview(payload.preview as Preview);
      setMessage("Test skončil. Preview nevytvoril observation, finding ani canonical write.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test zdroja zlyhal.");
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setMessage("");
    setRun(null);
    try {
      const payload = await mutate(`/api/admin/automation-sources/${source.id}/run`, "POST", {});
      setRun(payload.run as RunSummary);
      setMessage("Kontrola skončila. Findings ostávajú v human-review workflow; nič sa automaticky nepublikovalo.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kontrolu sa nepodarilo spustiť.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}
      <section className="admin-stats" aria-label="Source observability">
        <div><span>Review</span><strong>{source.reviewStatus}</strong></div>
        <div><span>Stav</span><strong>{source.enabled ? "ENABLED" : "DISABLED"}</strong></div>
        <div><span>Last run</span><strong>{source.lastRunStatus ?? "—"}</strong></div>
        <div><span>Next run</span><strong>{source.nextCheckAt ?? "—"}</strong></div>
        <div><span>Checked</span><strong>{source.checkedCount}</strong></div>
        <div><span>New findings</span><strong>{source.newFindingCount}</strong></div>
        <div><span>Updated findings</span><strong>{source.updatedFindingCount}</strong></div>
        <div><span>Errors</span><strong>{source.errorCount}</strong></div>
        <div><span>Duration</span><strong>{source.durationMs === null ? "—" : `${source.durationMs} ms`}</strong></div>
        <div><span>Health error</span><strong>{source.lastErrorCode ?? "—"}</strong></div>
      </section>

      <section className="admin-panel">
        <h2>Konfigurácia zdroja</h2>
        <p>Zmena URL, entity type, connectora alebo mappingu automaticky zdroj vypne a vráti review na PENDING.</p>
        <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void action({ action: "save", source: form }); }}>
          <div className="admin-form-grid">
            <label className="admin-field"><span>Source key</span><input required value={form.sourceKey} onChange={(e) => field("sourceKey", e.target.value)} /></label>
            <label className="admin-field"><span>Názov</span><input required value={form.label} onChange={(e) => field("label", e.target.value)} /></label>
            <label className="admin-field"><span>Entity type</span><select value={form.entityType} onChange={(e) => field("entityType", e.target.value)}>{automationEntityTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="admin-field"><span>Connector</span><select value={form.connectorType} onChange={(e) => field("connectorType", e.target.value)}>{automationConnectorTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="admin-field admin-field-wide"><span>Source URL</span><input type="url" value={form.sourceUrl} onChange={(e) => field("sourceUrl", e.target.value)} /></label>
            <label className="admin-field"><span>Cadence (min)</span><input type="number" min={60} max={43200} value={form.cadenceMinutes} onChange={(e) => field("cadenceMinutes", e.target.value)} /></label>
            <label className="admin-field"><span>Timeout (ms)</span><input type="number" min={1000} max={30000} value={form.timeoutMs} onChange={(e) => field("timeoutMs", e.target.value)} /></label>
            <label className="admin-field"><span>Throttle (ms)</span><input type="number" min={0} max={60000} value={form.throttleMs} onChange={(e) => field("throttleMs", e.target.value)} /></label>
            <label className="admin-field"><span>Max records/run</span><input type="number" min={1} max={500} value={form.maxRecordsPerRun} onChange={(e) => field("maxRecordsPerRun", e.target.value)} /></label>
            <label className="admin-field"><span>Retry pokusy</span><input type="number" min={0} max={4} value={form.retryMaxAttempts} onChange={(e) => field("retryMaxAttempts", e.target.value)} /></label>
            <label className="admin-field"><span>Retry backoff (ms)</span><input type="number" min={100} max={30000} value={form.retryBackoffMs} onChange={(e) => field("retryBackoffMs", e.target.value)} /></label>
          </div>
          <label className="admin-field"><span>Mapping / config JSON</span><textarea rows={10} value={form.config} onChange={(e) => field("config", e.target.value)} spellCheck={false} /></label>
          <div className="admin-form-actions"><button type="submit" disabled={busy}>Uložiť konfiguráciu</button></div>
        </form>
      </section>

      <section className="admin-panel">
        <h2>Bezpečné review a spustenie</h2>
        <label className="admin-field"><span>Poznámka reviewera</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="admin-form-actions">
          <button type="button" disabled={busy} onClick={() => void testSource()}>Otestovať zdroj</button>
          {source.reviewStatus !== "APPROVED" && <button type="button" disabled={busy} onClick={() => void action({ action: "approve", notes })}>Schváliť zdroj</button>}
          {source.reviewStatus !== "REJECTED" && <button type="button" disabled={busy} onClick={() => void action({ action: "reject", notes })}>Zamietnuť zdroj</button>}
          {source.enabled
            ? <button type="button" disabled={busy} onClick={() => void action({ action: "disable" })}>Vypnúť</button>
            : <button type="button" disabled={busy || source.reviewStatus !== "APPROVED"} onClick={() => void action({ action: "enable" })}>Zapnúť</button>}
          <button type="button" disabled={busy || !source.enabled} onClick={() => void runNow()}>Spustiť kontrolu teraz</button>
        </div>
        <p><strong>NO AUTO-PUBLISH:</strong> Test je read-only. Run now môže vytvoriť iba observations/findings pre human review.</p>
      </section>

      {preview && (
        <section className="admin-panel" aria-live="polite">
          <h2>Výsledok testu zdroja</h2>
          <div className="admin-stats">
            <div><span>Source / HTTP</span><strong>{preview.sourceStatus} / {preview.httpStatus ?? "—"}</strong></div>
            <div><span>Records found</span><strong>{preview.recordsFound}</strong></div>
            <div><span>Normalized</span><strong>{preview.recordsNormalized}</strong></div>
            <div><span>Possible matches</span><strong>{preview.possibleMatches}</strong></div>
            <div><span>New candidates</span><strong>{preview.newCandidates}</strong></div>
            <div><span>Possible updates</span><strong>{preview.possibleUpdates}</strong></div>
          </div>
          {preview.errors.length > 0 && <pre>{preview.errors.join("\n")}</pre>}
          <p>Writes: observations {preview.writes.observations}, findings {preview.writes.findings}, canonical {preview.writes.canonical}, publications {preview.writes.publications}.</p>
        </section>
      )}

      {run && (
        <section className="admin-panel" aria-live="polite">
          <h2>Run now summary</h2>
          <p><strong>{run.status}</strong> · checked {run.checked} · new findings {run.newFindings} · updated findings {run.updatedFindings} · errors {run.errors} · next {run.nextCheckAt ?? "—"}</p>
        </section>
      )}
    </>
  );
}
