"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AutomationSourceAdminRow } from "@/lib/data-automation-source-store";
import { automationConnectorTypes, automationEntityTypes } from "@/lib/data-automation";
import styles from "./admin-operations-ux.module.css";

type Preview = {
  ok: boolean;
  sourceStatus: string;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  finalUrl: string | null;
  redirectCount: number;
  timingMs: number;
  recordsFound: number;
  recordsNormalized: number;
  possibleMatches: number;
  newCandidates: number;
  possibleUpdates: number;
  errors: string[];
  parserErrors: string[];
  errorDetails: Array<{ code: string; detail: string }>;
  writes: { observations: number; findings: number; canonical: number; publications: number };
};

type RunSummary = {
  sourceId?: number;
  status: string | null;
  checked: number;
  newFindings: number;
  updatedFindings: number;
  newDataFindings?: number;
  sourceErrors?: number;
  errors: number;
  durationMs?: number | null;
  nextCheckAt: string | null;
  lastCheckedAt?: string | null;
  lastErrorCode?: string | null;
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

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function statusCopy(source: AutomationSourceAdminRow) {
  if (source.lastRunStatus === "FAILED" || source.lastErrorCode) {
    return { title: "Zdroj hlási problém", text: "Najprv ho otestuj. Ak test zlyhá, technické detaily nájdeš nižšie.", warning: true };
  }
  if (source.reviewStatus === "PENDING") {
    return { title: "Zdroj čaká na tvoje schválenie", text: "Najprv ho otestuj. Ak výsledok vyzerá správne, schváľ ho a potom zapni.", warning: true };
  }
  if (source.reviewStatus === "REJECTED") {
    return { title: "Zdroj je zamietnutý", text: "Nebude sa automaticky kontrolovať, kým ho znovu neschváliš.", warning: true };
  }
  if (!source.enabled) {
    return { title: "Zdroj je schválený, ale vypnutý", text: "Ak ho chceš pravidelne sledovať, stačí ho zapnúť.", warning: true };
  }
  return { title: "Zdroj je aktívny", text: "Beží podľa svojho harmonogramu. Manuálny run potrebuješ iba pri kontrole alebo teste.", warning: false };
}

export function AdminAutomationSourceDetail({ source }: { source: AutomationSourceAdminRow }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"action" | "test" | "run" | null>(source.lastRunStatus === "RUNNING" ? "run" : null);
  const busy = busyAction !== null;
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [notes, setNotes] = useState(source.reviewNotes ?? "");
  const [form, setForm] = useState<{
    sourceKey: string; label: string; entityType: string; connectorType: string; sourceUrl: string;
    cadenceMinutes: string; throttleMs: string; timeoutMs: string; retryMaxAttempts: string; retryBackoffMs: string;
    maxRecordsPerRun: string; config: string;
  }>({
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

  const status = statusCopy(source);

  async function pollRunStatus() {
    let networkFailures = 0;
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const response = await fetch("/api/admin/automation-sources/" + source.id + "/run", {
          method: "GET",
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as { run?: RunSummary; error?: string };
        if (!response.ok || !payload.run) throw new Error(payload.error || "Stav kontroly sa nepodarilo načítať.");
        networkFailures = 0;
        setRun(payload.run);
        if (payload.run.status && payload.run.status !== "RUNNING") {
          setMessage(
            payload.run.status === "SUCCESS"
              ? "Kontrola skončila úspešne. Nové zistenia čakajú na manuálne posúdenie."
              : "Kontrola skončila so stavom " + payload.run.status + ". Pozri výsledok nižšie.",
          );
          setBusyAction(null);
          router.refresh();
          return;
        }
      } catch {
        networkFailures += 1;
        if (networkFailures >= 5) {
          setMessage("Kontrola beží na pozadí. Spojenie na chvíľu vypadlo, stav môžeš overiť obnovením stránky.");
          setBusyAction(null);
          return;
        }
      }
    }
    setMessage("Kontrola stále beží na pozadí. Môžeš túto stránku opustiť a vrátiť sa neskôr.");
    setBusyAction(null);
  }

  useEffect(() => {
    if (source.lastRunStatus !== "RUNNING") return;
    const timer = window.setTimeout(() => {
      void pollRunStatus();
    }, 0);
    return () => window.clearTimeout(timer);
    // Polling is intentionally tied to the source/run state received from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, source.lastRunStatus]);

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function action(body: Record<string, unknown>) {
    setBusyAction("action");
    setMessage("");
    try {
      await mutate("/api/admin/automation-sources/" + source.id, "PUT", body);
      setMessage("Zmena bola uložená.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operácia zlyhala.");
    } finally {
      setBusyAction(null);
    }
  }

  async function testSource() {
    setBusyAction("test");
    setMessage("");
    setPreview(null);
    try {
      const payload = await mutate("/api/admin/automation-sources/" + source.id + "/test", "POST", {});
      setPreview(payload.preview as Preview);
      setMessage("Test skončil. Nič sa nezapísalo ani nezverejnilo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test zdroja zlyhal.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runNow() {
    setBusyAction("run");
    setMessage("");
    setRun({ status: "RUNNING", checked: 0, newFindings: 0, updatedFindings: 0, errors: 0, nextCheckAt: source.nextCheckAt });
    try {
      const response = await fetch("/api/admin/automation-sources/" + source.id + "/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({})) as { accepted?: boolean; run?: RunSummary; error?: string };
      if (!response.ok || !payload.accepted) throw new Error(payload.error || "Kontrolu sa nepodarilo spustiť.");
      if (payload.run) setRun(payload.run);
      setMessage("Kontrola beží na pozadí. Túto stránku môžeš pokojne opustiť.");
      void pollRunStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kontrolu sa nepodarilo spustiť.");
      setBusyAction(null);
    }
  }

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}

      {(busyAction === "test" || busyAction === "run") && (
        <div className={styles.progressPanel} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <strong>{busyAction === "test" ? "Testujem zdroj…" : "Kontrolujem zdroj…"}</strong>
            <p>{busyAction === "test"
              ? "Overujem dostupnosť a spracovanie dát. Tento test nič nezapisuje."
              : "Kontrola beží na pozadí. Načítavam zdroj, porovnávam záznamy a pripravujem nové zistenia na review. Túto stránku môžeš pokojne opustiť."}</p>
          </div>
        </div>
      )}

      <section className={[styles.statusHero, status.warning ? styles.statusHeroWarning : styles.statusHeroGood].join(" ")}>
        <div>
          <strong>{status.title}</strong>
          <p>{status.text}</p>
        </div>
        <div className={styles.badges}>
          <span className={[styles.badge, source.reviewStatus === "APPROVED" ? styles.badgeGood : styles.badgeWarning].join(" ")}>{source.reviewStatus}</span>
          <span className={[styles.badge, source.enabled ? styles.badgeGood : styles.badgeWarning].join(" ")}>{source.enabled ? "ENABLED" : "DISABLED"}</span>
          {source.lastRunStatus && <span className={[styles.badge, source.lastRunStatus === "FAILED" ? styles.badgeDanger : styles.badgeGood].join(" ")}>{source.lastRunStatus}</span>}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Čo chceš spraviť?</h2>
            <p>Bezpečný postup je otestovať zdroj, schváliť ho a až potom ho zapnúť. Manuálny run môže vytvoriť iba položky na review; nič sa automaticky nezverejní.</p>
          </div>
        </div>

        {(source.reviewStatus !== "APPROVED" || source.reviewNotes) && (
          <label className="admin-field">
            <span>Poznámka k schváleniu</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Voliteľná interná poznámka…" />
          </label>
        )}

        <div className="admin-form-actions">
          <button type="button" disabled={busy} onClick={() => void testSource()}>{busyAction === "test" ? "Testujem zdroj…" : "Otestovať zdroj"}</button>
          {source.reviewStatus !== "APPROVED" && <button className="is-primary" type="button" disabled={busy} onClick={() => void action({ action: "approve", notes })}>Schváliť zdroj</button>}
          {source.reviewStatus === "APPROVED" && !source.enabled && <button className="is-primary" type="button" disabled={busy} onClick={() => void action({ action: "enable" })}>Zapnúť monitoring</button>}
          {source.enabled && <button className="is-primary" type="button" disabled={busy} onClick={() => void runNow()}>{busyAction === "run" ? "Kontrolujem zdroj…" : "Spustiť kontrolu teraz"}</button>}
          {source.enabled && <button className="is-danger" type="button" disabled={busy} onClick={() => void action({ action: "disable" })}>Vypnúť monitoring</button>}
          {source.reviewStatus !== "REJECTED" && <button className="is-danger" type="button" disabled={busy} onClick={() => void action({ action: "reject", notes })}>Zamietnuť zdroj</button>}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Základný stav</h2>
            <p>Údaje, ktoré potrebuješ pri bežnej kontrole zdroja.</p>
          </div>
        </div>
        <div className="admin-stats" aria-label="Source observability">
          <div><span>Posledný run</span><strong>{source.lastRunStatus ?? "—"}</strong></div>
          <div><span>Nové položky</span><strong>{source.newFindingCount}</strong></div>
          <div><span>Chyby</span><strong>{source.errorCount}</strong></div>
          <div><span>Ďalšia kontrola</span><strong style={{ fontSize: "1rem", lineHeight: 1.3 }}>{formatDate(source.nextCheckAt)}</strong></div>
        </div>
        <p><strong>Posledná kontrola:</strong> {formatDate(source.lastCheckedAt)} · <strong>posledný úspech:</strong> {formatDate(source.lastSuccessAt)}</p>
        {source.lastErrorCode && <p><strong>Posledná chyba:</strong> {source.lastErrorCode}</p>}
      </section>

      {preview && (
        <section className={styles.section} aria-live="polite">
          <div className={styles.sectionHeader}>
            <div><h2>Výsledok testu</h2><p>Test je read-only a nič nemení v canonical dátach.</p></div>
          </div>
          <div className="admin-stats">
            <div><span>HTTP</span><strong>{preview.httpStatus ?? "—"}</strong></div>
            <div><span>Nájdené záznamy</span><strong>{preview.recordsFound}</strong></div>
            <div><span>Nové kandidáty</span><strong>{preview.newCandidates}</strong></div>
            <div><span>Možné zmeny</span><strong>{preview.possibleUpdates}</strong></div>
          </div>
          {preview.errorDetails.length > 0 && (
            <div className="admin-stack">
              {preview.errorDetails.map((error) => <p key={error.code}><strong>{error.code}</strong>: {error.detail}</p>)}
            </div>
          )}
          <details className={styles.advanced}>
            <summary>Technický výsledok testu</summary>
            <div className={styles.advancedBody}>
              <p><strong>Source status:</strong> {preview.sourceStatus} · redirects {preview.redirectCount} · timing {preview.timingMs} ms</p>
              <p><strong>Content:</strong> {preview.contentType ?? "—"} · {preview.contentLength ?? "—"} bytes</p>
              <p><strong>Final URL:</strong> {preview.finalUrl ?? "—"}</p>
              <p>Writes: observations {preview.writes.observations}, findings {preview.writes.findings}, canonical {preview.writes.canonical}, publications {preview.writes.publications}.</p>
            </div>
          </details>
        </section>
      )}

      {run && (
        <section className={styles.section} aria-live="polite">
          <div className={styles.sectionHeader}><div><h2>Výsledok manuálnej kontroly</h2></div></div>
          <p><strong>{run.status ?? "RUNNING"}</strong> · skontrolované {run.checked} · nové zistenia {run.newDataFindings ?? run.newFindings} · chyby {run.sourceErrors ?? run.errors} · ďalšia kontrola {formatDate(run.nextCheckAt)}</p>
        </section>
      )}

      <details className={styles.advanced}>
        <summary>Pokročilé nastavenia zdroja</summary>
        <div className={styles.advancedBody}>
          <p>Zmena URL, typu, connectora alebo mappingu zdroj automaticky vypne a vráti na nové schválenie.</p>
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
            <div className="admin-form-actions"><button className="is-primary" type="submit" disabled={busy}>Uložiť pokročilé nastavenia</button></div>
          </form>
        </div>
      </details>
    </>
  );
}
