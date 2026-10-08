"use client";

import { useState, type FormEvent } from "react";
import type { GeminiSectionKey } from "@/lib/gemini-automation-catalog";
import { geminiCadenceOptions } from "@/lib/gemini-automation-catalog";
import type { GeminiSettingView } from "@/lib/gemini-automation-admin-settings";
import styles from "./admin-gemini-automation.module.css";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava",
  }).format(date);
}

function GeminiSettingsCard({ initial, available }: { initial: GeminiSettingView; available: boolean }) {
  const [setting, setSetting] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [cadence, setCadence] = useState(String(initial.cadenceMinutes));
  const [maximum, setMaximum] = useState(String(initial.maxNewConcepts));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const id = "gemini-" + setting.stableKey.replaceAll(".", "-");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || saving) return;
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
        setMessage("Nastavenia uložené. Automatizácia sa zatiaľ nespúšťa.");
      }
    } catch {
      setMessage("Ukladanie zlyhalo. Skús to znova.");
    } finally {
      setSaving(false);
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
          checked={enabled} disabled={!available || saving}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Zapnuté pre budúci plánovač
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
    </form>
  );
}

export function AdminGeminiAutomationSettings({ sections, settings, available }: {
  sections: readonly { key: GeminiSectionKey; label: string }[];
  settings: readonly GeminiSettingView[];
  available: boolean;
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
              <GeminiSettingsCard key={setting.stableKey} initial={setting} available={available} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
