"use client";

import { useState } from "react";
import type { GeminiSettingView } from "@/lib/gemini-automation-admin-settings";
import styles from "./admin-gemini-quick-settings.module.css";

type Draft = { enabled: boolean; cadence: string; maximum: string; weekday: string };

export function AdminGeminiQuickSettings({
  settings, available, globalRunning, scheduledEnabled, onSaved, hasUnsavedCategory,
}: {
  settings: readonly GeminiSettingView[];
  available: boolean;
  globalRunning: boolean;
  scheduledEnabled: boolean;
  onSaved: (setting: GeminiSettingView) => void;
  hasUnsavedCategory: boolean;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function begin(item: GeminiSettingView) {
    if (!available || saving || hasUnsavedCategory) return;
    setEditingKey(item.stableKey);
    setDraft({
      enabled: item.enabled,
      cadence: String(item.cadenceMinutes),
      maximum: String(item.maxNewConcepts),
      weekday: item.weeklyDay === null ? "" : String(item.weeklyDay),
    });
    setError("");
    setNotice("");
  }

  function cancel() {
    if (saving) return;
    setEditingKey(null);
    setDraft(null);
    setError("");
  }

  async function save(item: GeminiSettingView) {
    if (!draft || editingKey !== item.stableKey || !available || saving || hasUnsavedCategory) return;
    const cadence = Number(draft.cadence);
    const maximum = Number(draft.maximum);
    const weekday = cadence === 10080 && draft.weekday !== "" ? Number(draft.weekday) : null;
    if (!draft.cadence.trim() || !Number.isSafeInteger(cadence) || cadence < 5 || cadence > 43200 ||
        !draft.maximum.trim() || !Number.isSafeInteger(maximum) || maximum < 0 || maximum > 100 ||
        (weekday !== null && (!Number.isSafeInteger(weekday) || weekday < 1 || weekday > 7))) {
      setError("Interval musí byť 5–43 200 minút a limit 0–100 konceptov. Deň musí byť 1–7.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // Reuse the existing strictly validated settings API. This does not run a job,
      // override the global STOP, or modify an automation's billing controls.
      const response = await fetch("/api/admin/gemini-automation", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          stable_key: item.stableKey,
          enabled: draft.enabled,
          cadence_minutes: cadence,
          weekly_day: weekday,
          max_new_concepts: maximum,
        }),
      });
      const result = await response.json() as { setting?: GeminiSettingView; error?: string };
      if (!response.ok || !result.setting) throw new Error(result.error || "Nastavenia sa nepodarilo uložiť.");
      onSaved(result.setting);
      setEditingKey(null);
      setDraft(null);
      setNotice(globalRunning && scheduledEnabled
        ? "Nastavenia boli uložené. Spúšťanie sa riadi aj nadradenými prepínačmi."
        : "Nastavenia boli uložené. Hlavný STOP alebo plánovač naďalej blokuje spúšťanie.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Uloženie sa nepodarilo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.desktopOnly} aria-labelledby="gemini-quick-settings-title">
      <div className={styles.heading}>
        <div>
          <h2 id="gemini-quick-settings-title">Rýchle nastavenia kategórií</h2>
          <p>Úprava priamo v zozname, bez spustenia plateného behu. Naraz sa upravuje iba jeden riadok.</p>
        </div>
        <span>{settings.length} kategórií</span>
      </div>
      {!globalRunning && <p className={styles.stopNotice} role="status">
        Hlavný STOP je aktívny. Nastavenia možno uložiť, ale žiadne spustenie sa tým nepovolí.
      </p>}
      {hasUnsavedCategory && <p className={styles.stopNotice} role="status">
        Najprv ulož alebo zruš zmeny v editore vybranej kategórie.
      </p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr>
            <th scope="col">Kategória</th><th scope="col">Plán</th>
            <th scope="col">Interval (min.)</th><th scope="col">Limit</th><th scope="col">Akcia</th>
          </tr></thead>
          <tbody>
            {settings.map((item) => {
              const editing = editingKey === item.stableKey && draft !== null;
              return (
                <tr key={item.stableKey}>
                  <th scope="row">{item.label}</th>
                  <td>{editing ? (
                    <label className={styles.check}>
                      <input type="checkbox" checked={draft.enabled} disabled={saving}
                        onChange={(event) => setDraft((previous) => previous && ({ ...previous, enabled: event.target.checked }))} />
                      Zapnutý
                    </label>
                  ) : <span>{item.enabled ? (globalRunning ? "Zapnutý" : "Zapnutý · STOP") : "Vypnutý"}</span>}</td>
                  <td>{editing ? (
                    <div className={styles.inlineControls}>
                      <input type="number" min={5} max={43200} step={1} required
                        aria-label={"Interval v minútach – " + item.label} value={draft.cadence} disabled={saving}
                        onChange={(event) => setDraft((previous) => previous && ({ ...previous, cadence: event.target.value }))} />
                      {Number(draft.cadence) === 10080 && (
                        <select aria-label={"Deň v týždni – " + item.label} value={draft.weekday} disabled={saving}
                          onChange={(event) => setDraft((previous) => previous && ({ ...previous, weekday: event.target.value }))}>
                          <option value="">Bez dňa</option>
                          <option value="1">Po</option><option value="2">Ut</option><option value="3">St</option>
                          <option value="4">Št</option><option value="5">Pi</option><option value="6">So</option>
                          <option value="7">Ne</option>
                        </select>
                      )}
                    </div>
                  ) : item.cadenceMinutes}</td>
                  <td>{editing ? (
                    <input type="number" min={0} max={100} step={1} required
                      aria-label={"Limit konceptov – " + item.label} value={draft.maximum} disabled={saving}
                      onChange={(event) => setDraft((previous) => previous && ({ ...previous, maximum: event.target.value }))} />
                  ) : item.maxNewConcepts}</td>
                  <td>{editing ? (
                    <div className={styles.actions}>
                      <button type="button" className={styles.save} disabled={saving || hasUnsavedCategory}
                        onClick={() => void save(item)}>{saving ? "Ukladám…" : "Uložiť"}</button>
                      <button type="button" disabled={saving} onClick={cancel}>Zrušiť</button>
                    </div>
                  ) : (
                    <button type="button" disabled={!available || saving || hasUnsavedCategory || editingKey !== null}
                      onClick={() => begin(item)}>Upraviť v tabuľke</button>
                  )}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
