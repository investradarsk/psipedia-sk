"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GeminiSectionKey } from "@/lib/gemini-automation-catalog";
import { geminiSchedulerOptions, geminiWeekdays, recommendedGeminiCadence } from "@/lib/gemini-automation-schedule";
import type { GeminiSettingView } from "@/lib/gemini-automation-admin-settings";
import type { GeminiQueuedJob } from "@/lib/gemini-automation-background-queue";
import type { GeminiRecentRun } from "@/lib/gemini-automation-admin-store";
import styles from "./admin-gemini-automation.module.css";
import { AdminGeminiNotionDrafts } from "./admin-gemini-notion-drafts";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava",
  }).format(date);
}

type PilotResult = {
  runId: number; status: "SUCCESS"; candidateCount: number; duplicateCount: number;
  possibleDuplicateCount: number; rejectedBeforeCount: number; conceptCount: number;
  groundedSearchQueryCount: number; model: string;
};

const outcomeLabels: Record<string, string> = {
  NO_RESULT_NO_RELEVANT_CANDIDATE: "Nenašiel sa vhodný nový subjekt",
  NO_RESULT_DUPLICATE_ONLY: "Gemini označilo kandidátov za duplicity; nový koncept nevznikol",
  NO_RESULT_INSUFFICIENT_EVIDENCE: "Nedostatok overiteľných údajov",
  NO_RESULT_EXHAUSTED: "Vyhľadávanie vyčerpalo dostupných kandidátov",
};

function jobStatus(job: GeminiQueuedJob) {
  if (job.status === "QUEUED") return "V poradovníku — čaká na spustenie";
  if (job.status === "RUNNING") return "Vyhľadáva / spracúva výsledok";
  if (job.status === "FAILED") return "Zlyhalo: " + (job.error_code ?? "neznáma chyba");
  if (job.run_id == null) return "Neúplný zápis výsledku — vyžaduje kontrolu";
  return outcomeLabels[job.error_code ?? ""] ??
    (job.error_code ? "Dokončené: " + job.error_code : "Dokončené");
}

function GeminiSettingsCard({ initial, available, externalEnabled, latestJob, onSaved, onDirtyChange }: {
  initial: GeminiSettingView; available: boolean; externalEnabled: boolean;
  latestJob: GeminiQueuedJob | null;
  onSaved: (setting: GeminiSettingView) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [setting, setSetting] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [cadence, setCadence] = useState(
    geminiSchedulerOptions.some((option) => option.minutes === initial.cadenceMinutes)
      ? String(initial.cadenceMinutes) : "custom"
  );
  const [customMinutes, setCustomMinutes] = useState(String(initial.cadenceMinutes));
  const [weekday, setWeekday] = useState(initial.weeklyDay == null ? "" : String(initial.weeklyDay));
  const cadenceMinutes = cadence === "custom" ? Number(customMinutes) : Number(cadence);
  const weeklyDay = cadenceMinutes === 10080 && weekday !== "" ? Number(weekday) : null;
  const [maximum, setMaximum] = useState(String(initial.maxNewConcepts));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [pilotError, setPilotError] = useState("");
  const [queuedMessage,setQueuedMessage] = useState("");
  const [pilotResult, setPilotResult] = useState<PilotResult | null>(null);
  const requestLocked = useRef(false);
  const router = useRouter();
  const canManuallyRun = externalEnabled || setting.section === "directory" || setting.section === "events";
  const unsavedChanges = setting.enabled !== enabled ||
    setting.cadenceMinutes !== cadenceMinutes || setting.weeklyDay !== weeklyDay ||
    setting.maxNewConcepts !== Number(maximum);
  useEffect(() => onDirtyChange(unsavedChanges), [onDirtyChange, unsavedChanges]);
  const canPilot = canManuallyRun && available && setting.saved && !unsavedChanges &&
    Number(maximum) > 0 && !saving && !running;
  const id = "gemini-" + setting.stableKey.replaceAll(".", "-");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || saving || running) return;
    const maxNewConcepts = Number(maximum);
    if (!Number.isSafeInteger(cadenceMinutes) || cadenceMinutes < 5 || cadenceMinutes > 43200 ||
      (weeklyDay !== null && (!Number.isSafeInteger(weeklyDay) || weeklyDay < 1 || weeklyDay > 7)) ||
      !Number.isSafeInteger(maxNewConcepts) || maximum.trim() === ""
      || maxNewConcepts < 0 || maxNewConcepts > 100) {
      setMessage("Vyber platnú frekvenciu a počet konceptov od 0 do 100.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/gemini-automation", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          stable_key: setting.stableKey,
          enabled, cadence_minutes: cadenceMinutes, weekly_day: weeklyDay, max_new_concepts: maxNewConcepts,
        }),
      });
      const data = await response.json() as { error?: string; setting?: GeminiSettingView };
      if (!response.ok || !data.setting) {
        setMessage(data.error ?? "Nastavenia sa nepodarilo uložiť.");
      } else {
        setSetting(data.setting);
        onSaved(data.setting);
        setConfirming(false);
        setMessage(externalEnabled ? "Nastavenia uložené. Plánovač Psipedie ich použije pri ďalšom termíne." : "Nastavenia uložené. Automatizácia sa zatiaľ nespúšťa.");
      }
    } catch {
      setMessage("Ukladanie zlyhalo. Skús to znova.");
    } finally {
      setSaving(false);
    }
  }

  async function onPilotClick() {
    if (!canPilot || requestLocked.current) return;
    if (!confirming) {
      setConfirming(true);
      setPilotError("");
      setPilotResult(null);
      setQueuedMessage("");
      return;
    }
    requestLocked.current = true;
    setRunning(true);
    setQueuedMessage("");
    setConfirming(false);
    setPilotError("");
    try {
      const response = await fetch("/api/admin/gemini-automation/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ stable_key: setting.stableKey }),
      });
      const data = await response.json() as { error?: string; runId?: number; status?: string;jobId?:number; started?:boolean; alreadyQueued?:boolean } & Partial<PilotResult>;
      if (response.ok && data.status === "QUEUED" && Number.isInteger(data.jobId)) {
        const label = "Gemini úloha #" + data.jobId;
        setQueuedMessage(externalEnabled
          ? data.alreadyQueued
            ? label + " už čaká v poradovníku alebo beží. Nová platená úloha nevznikla."
            : data.started
              ? label + " sa odoslala na GitHub a začína pracovať. Stav uvidíš v histórii."
              : label + " bola zaradená do poradovníka. Po dokončení predchádzajúcej úlohy sa automaticky spustí (kontrola každých 5 minút)."
          : label + " bola zaradená na spracovanie na pozadí. Stav uvidíš v histórii.");
      } else if (!response.ok || data.status !== "SUCCESS") {
        setPilotError(data.error ?? "Gemini beh zlyhal. Skontroluj históriu behov.");
      } else {
        setPilotResult(data as PilotResult);
      }
      // Re-render server-side run history, without starting any other request.
      router.refresh();
      const settingResponse = await fetch("/api/admin/gemini-automation?stable_key=" + encodeURIComponent(setting.stableKey), {
        credentials: "same-origin", cache: "no-store",
      });
      if (settingResponse.ok) {
        const latest = await settingResponse.json() as { setting?: GeminiSettingView };
        if (latest.setting) setSetting(latest.setting);
      }
    } catch {
      setPilotError("Gemini beh sa nepodarilo dokončiť. Pred opakovaním skontroluj históriu behov.");
    } finally {
      requestLocked.current = false;
      setRunning(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={styles.card}>
      <div className={styles.cardTitle}>
        <h3>{setting.label}</h3>
        <span className={styles.state}>{enabled ? "Zapnuté" : "Vypnuté"}</span>
      </div>
      <label className={styles.toggle} htmlFor={id + "-enabled"}>
        <input
          id={id + "-enabled"} type="checkbox"
          checked={enabled} disabled={!available || saving || running}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {externalEnabled ? "Automatické spúšťanie cez GitHub" : "Zapnuté pre budúci plánovač"}
      </label>
      <div className={styles.fields}>
        <label htmlFor={id + "-cadence"}>
          Frekvencia <small>(odporúčané: {geminiSchedulerOptions.find((option) =>
            option.minutes === recommendedGeminiCadence(setting.stableKey))?.label.toLowerCase() ?? "vlastná"})</small>
          <select id={id + "-cadence"} value={cadence} disabled={!available || saving}
            onChange={(event) => setCadence(event.target.value)}>
            {geminiSchedulerOptions.map((option) =>
              <option value={option.minutes} key={option.minutes}>{option.label}</option>)}
            <option value="custom">Vlastný interval</option>
          </select>
        </label>
        {cadence === "custom" && <label htmlFor={id + "-custom"}>
          Vlastný interval (minúty)
          <input id={id + "-custom"} type="number" min={5} max={43200} step={1}
            value={customMinutes} required disabled={!available || saving}
            onChange={(event) => setCustomMinutes(event.target.value)} />
        </label>}
        {cadenceMinutes === 10080 && <label htmlFor={id + "-weekday"}>
          Deň v týždni
          <select id={id + "-weekday"} value={weekday} disabled={!available || saving}
            onChange={(event) => setWeekday(event.target.value)}>
            <option value="">Bez určeného dňa</option>
            {geminiWeekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </select>
        </label>}
        <label htmlFor={id + "-maximum"}>
          Max. nových konceptov
          <input id={id + "-maximum"} type="number" min={0} max={100} step={1} required
            value={maximum} disabled={!available || saving}
            onChange={(event) => setMaximum(event.target.value)} />
        </label>
      </div>
      <dl className={styles.timestamps}>
        <div><dt>Posledné spustenie</dt><dd>{formatDate(latestJob?.created_at ?? initial.lastRunAt)}</dd></div>
        <div><dt>Ďalšie plánované</dt><dd>{formatDate(setting.nextRunAt)}</dd></div>
      </dl>
      <GeminiPromptPreview stableKey={setting.stableKey} />
      {latestJob && <p role="status" aria-live="polite"
        className={latestJob.status === "FAILED" || (latestJob.status === "SUCCESS" && !latestJob.run_id)
          ? styles.pilotError : styles.feedback}>
        Úloha #{latestJob.id}: {jobStatus(latestJob)}
        {latestJob.completed_at ? " · Dokončené " + formatDate(latestJob.completed_at) : ""}
        {latestJob.run_id ? " · Beh #" + latestJob.run_id : ""}
      </p>}
      <div className={styles.cardBottom}>
        <Link href={"/admin/automatizacie-gemini/prompty?stable_key=" + encodeURIComponent(setting.stableKey)}>
          Upraviť prompt
        </Link>
        <button type="submit" className="admin-primary-action" disabled={!available || saving}>
          {saving ? "Ukladám…" : "Uložiť"}
        </button>
        <span role="status" aria-live="polite" className={styles.feedback}>{message}</span>
      </div>
      {(canManuallyRun || setting.section === "help") && (
        <div className={styles.pilot}>
          <strong>{externalEnabled ? "Spustiť externého Gemini pracovníka" : "Manuálne spustenie Gemini"}</strong>
          <p>{externalEnabled ? "GitHub Actions · úlohy sa radia do poradovníka a spúšťajú po jednej · najviac 5 konceptov na beh · zápis iba do Notionu · platený režim musí byť povolený na GitHube." : "Reálne Gemini API volanie · max. 5 kandidátov · môže vytvoriť koncepty · nič automaticky nepublikuje."}</p>
          {!setting.saved && <p>Pred spustením najprv ulož nastavenia tejto karty.</p>}
          {!canManuallyRun && <p>Pre túto kategóriu musí byť povolený externý Gemini pracovník.</p>}
          {unsavedChanges && setting.saved && <p>Najprv ulož zmenené nastavenia.</p>}
          {confirming && <p role="alert">{externalEnabled ? "Potvrď zaradenie do poradovníka. Ak je platený režim na GitHube povolený, po uvoľnení pracovníka sa automaticky vykonajú platené Gemini volania a môžu vzniknúť koncepty v Notione." : "Potvrď spustenie: vykoná sa jedno platené API volanie a môžu vzniknúť nepublikované koncepty."}</p>}
          <div className={styles.pilotActions}>
            <button type="button" className={styles.runButton}
              disabled={!canPilot} onClick={onPilotClick}>
              {running ? "Zaraďujem úlohu…" : confirming ? (externalEnabled ? "Potvrdiť a zaradiť" : "Potvrdiť a spustiť") : (externalEnabled ? "Zaradiť vyhľadávanie" : "Spustiť vyhľadávanie teraz")}
            </button>
            {confirming && (
              <button type="button" disabled={running} onClick={() => setConfirming(false)}>
                Zrušiť
              </button>
            )}
          </div>
          {pilotError && <p role="alert" className={styles.pilotError}>{pilotError}</p>}
          {queuedMessage && <p role="status" className={styles.pilotResult}>{queuedMessage}</p>}
          {pilotResult && <div role="status" className={styles.pilotResult}>
            <strong>Gemini beh dokončený · run #{pilotResult.runId}</strong>
            <dl className={styles.pilotMetrics}>
              <div><dt>Kandidáti</dt><dd>{pilotResult.candidateCount}</dd></div>
              <div><dt>Duplicity</dt><dd>{pilotResult.duplicateCount}</dd></div>
              <div><dt>Možné duplicity</dt><dd>{pilotResult.possibleDuplicateCount}</dd></div>
              <div><dt>Predtým odmietnuté</dt><dd>{pilotResult.rejectedBeforeCount}</dd></div>
              <div><dt>Nové koncepty</dt><dd>{pilotResult.conceptCount}</dd></div>
              <div><dt>Google Search dotazy</dt><dd>{pilotResult.groundedSearchQueryCount}</dd></div>
              <div><dt>Model</dt><dd>{pilotResult.model}</dd></div>
            </dl>
          </div>}
        </div>
      )}
    </form>
  );
}


function GeminiPromptPreview({ stableKey }: { stableKey: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/gemini-automation/prompts?stable_key=" + encodeURIComponent(stableKey),
        { credentials: "same-origin", cache: "no-store" },
      );
      const data = await response.json() as { prompt?: { effectivePrompt?: string }; error?: string };
      if (!response.ok || !data.prompt) throw new Error(data.error ?? "Prompt nie je dostupný.");
      const content = (data.prompt.effectivePrompt ?? "").replace(/\s+/g, " ").trim();
      setPreview(content ? (content.length > 260 ? content.slice(0, 260) + "…" : content)
        : "Pre túto kategóriu nie je dostupný text promptu.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Načítanie promptu zlyhalo.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <details className={styles.promptPreview}>
      <summary>Krátky náhľad promptu</summary>
      {preview === null && <button type="button" disabled={loading} onClick={() => void load()}>
        {loading ? "Načítavam…" : "Načítať náhľad"}
      </button>}
      {preview !== null && <p>{preview}</p>}
      {error && <p role="alert" className={styles.pilotError}>{error}</p>}
    </details>
  );
}

const runOutcomeLabels: Record<string, string> = {
  NO_RESULT_NO_RELEVANT_CANDIDATE: "Nenašiel sa vhodný nový subjekt.",
  NO_RESULT_DUPLICATE_ONLY: "Len možné duplicity; nový koncept nevznikol.",
  NO_RESULT_INSUFFICIENT_EVIDENCE: "Nedostatok overiteľných informácií.",
  NO_RESULT_EXHAUSTED: "Možnosti vyhľadávania boli vyčerpané.",
};

function runLabel(status: string) {
  if (status === "SUCCESS") return "Dokončené";
  if (status === "FAILED") return "Chyba";
  if (status === "RUNNING") return "Prebieha";
  return status;
}

function GeminiHistory({ runs, selectedKey, settings }: {
  runs: readonly GeminiRecentRun[];
  selectedKey: string;
  settings: readonly GeminiSettingView[];
}) {
  const selectedRuns = runs.filter((run) => run.stableKey === selectedKey);
  const byKey = new Map(settings.map((setting) => [setting.stableKey, setting.label]));
  const label = (run: GeminiRecentRun) => byKey.get(run.stableKey) ?? run.subcategory;
  const renderRun = (run: GeminiRecentRun) => (
    <li key={run.id} className={styles.runItem}>
      <div className={styles.runSummary}>
        <div>
          <strong>{label(run)}</strong>
          <small>{formatDate(run.startedAt)} · Beh #{run.id}</small>
        </div>
        <span className={run.status === "FAILED" ? styles.statusError : styles.statusPlain}>
          {runLabel(run.status)} · {run.conceptCount} konceptov
        </span>
      </div>
      {(run.errorCode || run.errorCount > 0) && (
        <p className={styles.runError}>Kód: {run.errorCode ?? "Nezaznamenaný"} · Chyby: {run.errorCount}</p>
      )}
      {run.status === "SUCCESS" && run.conceptCount === 0 && (
        <p className={styles.runNote}>
          {runOutcomeLabels[run.errorCode ?? ""] ?? "Bez nového konceptu (dôvod nezaznamenaný)."}
        </p>
      )}
      <details className={styles.runDetails}>
        <summary>Technické podrobnosti</summary>
        <dl className={styles.runMetadata}>
          <div><dt>Spustenie</dt><dd>{run.trigger}</dd></div>
          <div><dt>Stav</dt><dd>{run.status}</dd></div>
          <div><dt>Model</dt><dd>{run.model}</dd></div>
          <div><dt>API volania</dt><dd>{run.requestCount}</dd></div>
          <div><dt>Google dotazy</dt><dd>{run.groundedSearchQueryCount}</dd></div>
          <div><dt>Kandidáti</dt><dd>{run.candidateCount}</dd></div>
          <div><dt>Duplicity</dt><dd>{run.duplicateCount}</dd></div>
          <div><dt>Koncepty</dt><dd>{run.conceptCount}</dd></div>
          <div><dt>Chyby</dt><dd>{run.errorCount}</dd></div>
          <div><dt>Dokončenie</dt><dd>{formatDate(run.completedAt)}</dd></div>
          <div><dt>Kód / výsledok</dt><dd>{run.errorCode ?? "—"}</dd></div>
        </dl>
      </details>
    </li>
  );
  return (
    <section className={styles.panel} aria-labelledby="gemini-history-title">
      <div className={styles.panelHeader}>
        <h2 id="gemini-history-title">História behov</h2>
        <span>Posledných {runs.length} záznamov</span>
      </div>
      {selectedRuns.length
        ? <ul className={styles.runList}>{selectedRuns.slice(0, 4).map(renderRun)}</ul>
        : <p className={styles.emptyCompact}>Pre zvolenú kategóriu zatiaľ nie je zaznamenaný beh.</p>}
      <details className={styles.fold}>
        <summary>Všetky dostupné behy ({runs.length})</summary>
        {runs.length
          ? <ul className={styles.runList}>{runs.map(renderRun)}</ul>
          : <p className={styles.emptyCompact}>Zatiaľ nie sú zaznamenané žiadne behy.</p>}
      </details>
    </section>
  );
}

function GeminiQueue({ jobs }: { jobs: readonly GeminiQueuedJob[] }) {
  const waiting = jobs.filter((job) => job.status === "QUEUED").map((job) => job.id).sort((a, b) => a - b);
  return (
    <section className={styles.panel} aria-labelledby="gemini-queue-title">
      <div className={styles.panelHeader}>
        <h2 id="gemini-queue-title">FIFO fronta</h2>
        <a href="https://github.com/investradarsk/psipedia-sk/actions/workflows/gemini-notion-agent.yml"
          target="_blank" rel="noreferrer">GitHub Actions ↗</a>
      </div>
      {jobs.filter((job) => job.status === "RUNNING" || job.status === "QUEUED").length === 0
        ? <p className={styles.emptyCompact}>Žiadna úloha nečaká ani nebeží.</p>
        : <ul className={styles.queueList}>
          {jobs.filter((job) => job.status === "RUNNING" || job.status === "QUEUED").map((job) => (
            <li key={job.id}><strong>Úloha #{job.id}</strong> · {job.stable_key}
              <span>{job.status === "QUEUED"
                ? "Čaká · " + (waiting.indexOf(job.id) + 1) + ". v poradí" : "Prebieha"}</span>
            </li>
          ))}
        </ul>}
      <details className={styles.fold}>
        <summary>Celá história fronty ({jobs.length})</summary>
        <ul className={styles.queueList}>{jobs.map((job) => (
          <li key={job.id}>
            <strong>Úloha #{job.id} · {job.stable_key}</strong>
            <span>{job.status === "QUEUED" ? "V poradovníku · " + (waiting.indexOf(job.id) + 1) + ". v poradí"
              : job.status === "RUNNING" ? "Pracuje"
                : job.status === "SUCCESS" && !job.run_id ? "NEÚPLNÝ ZÁPIS" : job.status}</span>
            <small>Vytvorené: {formatDate(job.created_at)} · Beh: {job.run_id ?? "—"}</small>
            {(job.error_code || (job.status === "SUCCESS" && !job.run_id)) && (
              <small className={styles.runError}>
                Kód: {job.error_code ?? "Chýba potvrdený záznam behu"}</small>
            )}
          </li>
        ))}</ul>
      </details>
      <p className={styles.microcopy}>Číslo D1 úlohy nie je číslo GitHub behu. Úlohy sa spracúvajú postupne;
        nejasný platený beh sa automaticky neopakuje. Kontrola fronty prebieha každých 5 minút.</p>
    </section>
  );
}

export function AdminGeminiAutomationSettings({
  sections, settings, available, externalEnabled, queueEnabled, initialJobs, recentRuns,
}: {
  sections: readonly { key: GeminiSectionKey; label: string }[];
  settings: readonly GeminiSettingView[];
  available: boolean;
  externalEnabled: boolean;
  queueEnabled: boolean;
  initialJobs: readonly GeminiQueuedJob[];
  recentRuns: readonly GeminiRecentRun[];
}) {
  const [remote, setRemote] = useState<{ settings: readonly GeminiSettingView[]; jobs: GeminiQueuedJob[] } | null>(null);
  const liveSettings = remote?.settings ?? settings;
  const jobs = remote?.jobs ?? initialJobs;
  const [selectedKey, setSelectedKey] = useState(settings[0]?.stableKey ?? "");
  const [dirty, setDirty] = useState(false);
  const onDirtyChange = useCallback((value: boolean) => setDirty(value), []);
  const onSaved = useCallback((next: GeminiSettingView) => {
    setRemote((previous) => ({
      settings: (previous?.settings ?? settings).map((item) =>
        item.stableKey === next.stableKey ? next : item),
      jobs: previous?.jobs ?? [...initialJobs],
    }));
  }, [settings, initialJobs]);

  useEffect(() => {
    if (!available || !externalEnabled) return;
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (cancelled || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const response = await fetch("/api/admin/gemini-automation", {
          credentials: "same-origin", cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json() as {
          settings?: GeminiSettingView[]; jobs?: GeminiQueuedJob[];
        };
        if (!cancelled) {
          if (Array.isArray(data.settings) || Array.isArray(data.jobs)) {
            setRemote((previous) => ({
              settings: Array.isArray(data.settings) ? data.settings : previous?.settings ?? settings,
              jobs: Array.isArray(data.jobs) ? data.jobs : previous?.jobs ?? [...initialJobs],
            }));
          }
        }
      } catch {
        // A temporary network failure does not start or repeat any paid work.
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const id = window.setInterval(() => void refresh(), 10000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [available, externalEnabled, settings, initialJobs]);

  const selected = liveSettings.find((item) => item.stableKey === selectedKey) ?? liveSettings[0];
  const waiting = jobs.filter((job) => job.status === "QUEUED").length;
  const running = jobs.filter((job) => job.status === "RUNNING").length;
  const enabled = liveSettings.filter((item) => item.enabled).length;
  const latestRun = recentRuns[0];

  function chooseCategory(key: string) {
    if (selected?.stableKey === key) return;
    if (dirty && !window.confirm("Máš neuložené nastavenia. Opustiť kategóriu bez uloženia?")) return;
    // PR #868's canonical draft manager marks edited content via data-dirty.
    // Never unmount that editor silently when changing categories.
    if (document.querySelector('[data-dirty="true"]') &&
      !window.confirm("V otvorenom editore máš neuložené zmeny konceptu. Opustiť kategóriu?")) return;
    setDirty(false);
    setSelectedKey(key);
  }

  return (
    <div className={styles.dashboard}>
      <div className={styles.metrics} aria-label="Súhrn Gemini automatizácií">
        <div className={styles.metric}>
          <small>Plánovač Gemini</small>
          <strong>{externalEnabled ? "Externý pracovník zapnutý" : "Externý pracovník vypnutý"}</strong>
          <span>{enabled} z {liveSettings.length} kategórií má zapnutý plán</span>
        </div>
        <div className={styles.metric}>
          <small>Čakajúce a bežiace úlohy</small>
          <strong>{!available ? "Údaje nedostupné" : queueEnabled ? waiting + " čaká · " + running + " beží" : "Fronta nie je aktivovaná"}</strong>
          <span>{queueEnabled ? "Podľa evidencie úloh na pozadí" : "Bez aktívneho pracovného režimu"}</span>
        </div>
        <div className={styles.metric}>
          <small>Koncepty na kontrolu</small>
          <strong>Načítať podľa kategórie</strong>
          <span>Počet sa zistí až po otvorení konceptov z Notionu</span>
        </div>
        <div className={styles.metric}>
          <small>Posledný zaznamenaný beh</small>
          <strong>{!available ? "Údaje nedostupné" : latestRun ? runLabel(latestRun.status) : "Zatiaľ bez behu"}</strong>
          <span>{latestRun ? formatDate(latestRun.startedAt) : "—"}
            {latestRun?.errorCode ? " · " + latestRun.errorCode : ""}</span>
        </div>
      </div>

      <div className={styles.workGrid}>
        <div className={styles.column}>
          <section className={styles.panel} aria-labelledby="gemini-category-title">
            <div className={styles.panelHeader}>
              <h2 id="gemini-category-title">Nastavenie kategórie</h2>
              <span>{liveSettings.length} kategórií</span>
            </div>
            <label className={styles.categorySelect} htmlFor="gemini-selected-category">
              Kategória
              <select id="gemini-selected-category" value={selected?.stableKey ?? ""}
                onChange={(event) => chooseCategory(event.target.value)}>
                {sections.map((section) => (
                  <optgroup key={section.key} label={section.label}>
                    {liveSettings.filter((item) => item.section === section.key).map((item) => (
                      <option key={item.stableKey} value={item.stableKey}>{item.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {selected && <GeminiSettingsCard key={selected.stableKey} initial={selected}
              available={available} externalEnabled={externalEnabled}
              latestJob={jobs.find((job) => job.stable_key === selected.stableKey) ?? null}
              onSaved={onSaved} onDirtyChange={onDirtyChange} />}
            {selected && <p className={styles.microcopy}>
              Upravené nastavenia sa používajú len pre kategóriu {selected.label}.
              {selected.section === "help" && !externalEnabled
                ? " Manuálne platené spustenie vyžaduje externého pracovníka." : ""}
            </p>}
          </section>
        </div>

        <div className={styles.column}>
          <GeminiHistory runs={recentRuns} selectedKey={selected?.stableKey ?? ""} settings={liveSettings} />
          {queueEnabled && <GeminiQueue jobs={jobs} />}
          <section className={styles.panel} aria-labelledby="gemini-drafts-title">
            <div className={styles.panelHeader}>
              <h2 id="gemini-drafts-title">Koncepty z automatizácie</h2>
              <Link href="/admin/automatizacie-gemini/koncepty">Všetky koncepty →</Link>
            </div>
            {externalEnabled && selected ? (
              <>
                <p className={styles.microcopy}>Koncepty kategórie {selected.label}. Zoznam a filtrovanie otvor na požiadanie; úpravy zostávajú v existujúcom kanonickom editore.</p>
                <AdminGeminiNotionDrafts key={selected.stableKey} stableKey={selected.stableKey} />
              </>
            ) : <p className={styles.emptyCompact}>
              {externalEnabled ? "Vyber kategóriu pre prístup ku konceptom." :
                "Externý pracovník nie je aktivovaný. Koncepty otvor cez samostatnú stránku."}
            </p>}
          </section>
        </div>
      </div>
      {running > 0 && <p role="status" className={styles.warning}>
        Práve beží platená úloha. Ak zostane v stave RUNNING viac než dve hodiny,
        ďalšie spustenia ostanú blokované do manuálnej diagnostiky v GitHub Actions.
      </p>}
      <details className={styles.rules}>
        <summary>Prevádzkové pravidlá a obmedzenia</summary>
        <p>{externalEnabled
          ? "Externý GitHub pracovník je zapnutý. Plánovanie kategórií a ich zapnutie nie je potvrdením práve prebiehajúceho plateného behu. Platený režim má samostatný vypínač na GitHube."
          : "Externý GitHub pracovník nie je aktivovaný. Uloženie nastavení samo nespúšťa platené vyhľadávanie."}</p>
        <p>Mesačný počet úloh Psipedia neobmedzuje. Platené volania však podliehajú kvótam,
          limitom jednotlivého behu a rozpočtu u poskytovateľa Gemini. Rozpočet 5 € nie je zárukou zo strany Psipedie.
          Úlohy s neistým výsledkom sa automaticky neopakujú.</p>
      </details>
    </div>
  );
}
