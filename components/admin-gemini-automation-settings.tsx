"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GeminiSectionKey } from "@/lib/gemini-automation-catalog";
import { geminiSchedulerOptions, geminiWeekdays, recommendedGeminiCadence } from "@/lib/gemini-automation-schedule";
import type { GeminiSettingView } from "@/lib/gemini-automation-admin-settings";
import type { GeminiQueuedJob } from "@/lib/gemini-automation-background-queue";
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

function GeminiSettingsCard({ initial, available, externalEnabled, latestJob }: {
  initial: GeminiSettingView; available: boolean; externalEnabled: boolean;
  latestJob: GeminiQueuedJob | null;
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
      {externalEnabled && (
        <AdminGeminiNotionDrafts stableKey={setting.stableKey} />
      )}
      {(canManuallyRun || setting.section === "help") && (
        <div className={styles.pilot}>
          <strong>{externalEnabled ? "Spustiť externého Gemini pracovníka" : "Manuálne spustenie Gemini"}</strong>
          <p>{externalEnabled ? "GitHub Actions · úlohy sa radia do poradovníka a spúšťajú po jednej · najviac 5 konceptov na beh · zápis iba do Notionu · platený režim musí byť povolený na GitHube." : "Reálne Gemini API volanie · max. 5 kandidátov · môže vytvoriť koncepty · nič automaticky nepublikuje."}</p>
          {!setting.saved && <p>Pred spustením najprv ulož nastavenia tejto karty.</p>}
          {!canManuallyRun && <p>Pre túto kategóriu musí byť povolený externý Gemini pracovník.</p>}
          {unsavedChanges && setting.saved && <p>Najprv ulož zmenené nastavenia.</p>}
          {confirming && <p role="alert">{externalEnabled ? "Potvrď zaradenie do poradovníka. Ak je platený režim na GitHube povolený, po uvoľnení pracovníka sa automaticky vykonajú platené Gemini volania a môžu vzniknúť koncepty v Notione." : "Potvrď spustenie: vykoná sa jedno platené API volanie a môžu vzniknúť nepublikované koncepty."}</p>}
          <div className={styles.pilotActions}>
            <button type="button" className="admin-primary-action"
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

export function AdminGeminiAutomationSettings({ sections, settings, available, externalEnabled }: {
  sections: readonly { key: GeminiSectionKey; label: string }[];
  settings: readonly GeminiSettingView[];
  available: boolean;
  externalEnabled: boolean;
}) {
  const [liveSettings, setLiveSettings] = useState(settings);
  const [jobs, setJobs] = useState<GeminiQueuedJob[]>([]);
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
          if (Array.isArray(data.settings)) setLiveSettings(data.settings);
          if (Array.isArray(data.jobs)) setJobs(data.jobs);
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
  }, [available, externalEnabled]);

  return (
    <div className={styles.sections}>
      {sections.map((section) => (
        <section key={section.key} aria-labelledby={"gemini-section-" + section.key}>
          <div className={styles.sectionHeader}>
            <h2 id={"gemini-section-" + section.key}>{section.label}</h2>
            <span>{liveSettings.filter((setting) => setting.section === section.key).length} podkategórií</span>
          </div>
          <div className={styles.grid}>
            {liveSettings.filter((item) => item.section === section.key).map((setting) =>
              <GeminiSettingsCard key={setting.stableKey} initial={setting}
                available={available} externalEnabled={externalEnabled}
                latestJob={jobs.find(job => job.stable_key === setting.stableKey) ?? null} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
