"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { GeminiSectionKey } from "@/lib/gemini-automation-catalog";
import { geminiCadenceOptions } from "@/lib/gemini-automation-catalog";
import type { GeminiSettingView } from "@/lib/gemini-automation-admin-settings";
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

function GeminiSettingsCard({ initial, available, externalEnabled }: { initial: GeminiSettingView; available: boolean; externalEnabled: boolean }) {
  const [setting, setSetting] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [cadence, setCadence] = useState(String(initial.cadenceMinutes));
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
    setting.cadenceMinutes !== Number(cadence) || setting.maxNewConcepts !== Number(maximum);
  const canPilot = canManuallyRun && available && setting.saved && !unsavedChanges &&
    Number(maximum) > 0 && !saving && !running;
  const id = "gemini-" + setting.stableKey.replaceAll(".", "-");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || saving || running) return;
    const cadenceMinutes = Number(cadence);
    const maxNewConcepts = Number(maximum);
    if (!geminiCadenceOptions.some((option) => option.minutes === cadenceMinutes)
      || !Number.isSafeInteger(maxNewConcepts) || maximum.trim() === ""
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
          enabled, cadence_minutes: cadenceMinutes, max_new_concepts: maxNewConcepts,
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
      const data = await response.json() as { error?: string; runId?: number; status?: string;jobId?:number } & Partial<PilotResult>;
      if (response.ok && data.status === "QUEUED" && Number.isInteger(data.jobId)) {
        setQueuedMessage("Gemini úloha #"+data.jobId+" bola odoslaná " + (externalEnabled ? "na GitHub" : "na pozadie") + ". Stav uvidíš v histórii úloh.");
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
          Frekvencia
          <select id={id + "-cadence"} value={cadence} disabled={!available || saving}
            onChange={(event) => setCadence(event.target.value)}>
            {geminiCadenceOptions.map((option) =>
              <option value={option.minutes} key={option.minutes}>{option.label}</option>)}
          </select>
        </label>
        <label htmlFor={id + "-maximum"}>
          Max. nových konceptov
          <input id={id + "-maximum"} type="number" min={0} max={100} step={1} required
            value={maximum} disabled={!available || saving}
            onChange={(event) => setMaximum(event.target.value)} />
        </label>
      </div>
      <dl className={styles.timestamps}>
        <div><dt>Posledné spustenie</dt><dd>{formatDate(setting.lastRunAt)}</dd></div>
        <div><dt>Ďalšie plánované</dt><dd>{formatDate(setting.nextRunAt)}</dd></div>
      </dl>
      <div className={styles.cardBottom}>
        <button type="submit" className="admin-primary-action" disabled={!available || saving}>
          {saving ? "Ukladám…" : "Uložiť"}
        </button>
        <span role="status" aria-live="polite" className={styles.feedback}>{message}</span>
      </div>
      {externalEnabled && (
        <AdminGeminiNotionDrafts stableKey={setting.stableKey} />
      )}
      {canManuallyRun && (
        <div className={styles.pilot}>
          <strong>{externalEnabled ? "Spustiť externého Gemini pracovníka" : "Manuálne spustenie Gemini"}</strong>
          <p>{externalEnabled ? "GitHub Actions · maximálne 5 konceptov · zápis iba do Notionu · vyžaduje zvlášť povolené platené volania na GitHube." : "Reálne Gemini API volanie · max. 5 kandidátov · môže vytvoriť koncepty · nič automaticky nepublikuje."}</p>
          {!setting.saved && <p>Pred spustením najprv ulož nastavenia tejto karty.</p>}
          {unsavedChanges && setting.saved && <p>Najprv ulož zmenené nastavenia.</p>}
          {confirming && <p role="alert">{externalEnabled ? "Potvrď odoslanie do GitHub Actions. Ak je platený režim na GitHube povolený, Gemini môže vykonať viacero platených API volaní a vytvoriť koncepty priamo v Notione." : "Potvrď spustenie: vykoná sa jedno platené API volanie a môžu vzniknúť nepublikované koncepty."}</p>}
          <div className={styles.pilotActions}>
            <button type="button" className="admin-primary-action"
              disabled={!canPilot} onClick={onPilotClick}>
              {running ? "Spúšťam Gemini…" : confirming ? "Potvrdiť a spustiť" : "Spustiť Gemini"}
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
  return (
    <div className={styles.sections}>
      {sections.map((section) => (
        <section key={section.key} aria-labelledby={"gemini-section-" + section.key}>
          <div className={styles.sectionHeader}>
            <h2 id={"gemini-section-" + section.key}>{section.label}</h2>
            <span>{settings.filter((setting) => setting.section === section.key).length} podkategórií</span>
          </div>
          <div className={styles.grid}>
            {settings.filter((item) => item.section === section.key).map((setting) =>
              <GeminiSettingsCard key={setting.stableKey} initial={setting} available={available} externalEnabled={externalEnabled} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
