"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { automationCadenceOptions, automationSourceOnlyErrorMessage } from "@/lib/admin-automation-presentation";
import type { AutomationSourceAdminRow } from "@/lib/data-automation-source-store";
import styles from "./admin-operations-ux.module.css";

export function AdminAutomationSourceSettings({
  source,
  draftsHref,
  monitoringReady,
  monitoringRetryable,
}: {
  source: AutomationSourceAdminRow;
  draftsHref: string;
  monitoringReady: boolean;
  monitoringRetryable: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(source.enabled);
  const [cadenceMinutes, setCadenceMinutes] = useState(source.cadenceMinutes);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const monitoringCanEnable = monitoringReady || monitoringRetryable;

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/automation-sources/" + source.id, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "configure", enabled, cadenceMinutes }),
      });
      const payload = await response.json().catch(() => ({})) as { immediateRun?: boolean; error?: string };
      if (!response.ok) throw new Error(automationSourceOnlyErrorMessage(payload.error, "Nastavenie sa nepodarilo uložiť."));
      setMessage(payload.immediateRun
        ? "Zdroj je zapnutý a prvá kontrola sa práve spustila."
        : "Nastavenie zdroja bolo uložené.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nastavenie sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Nastavenie zdroja</h2>
            <p>Po zapnutí sa zdroj skontroluje hneď a potom podľa zvolenej frekvencie.</p>
          </div>
        </div>

        {!monitoringReady && (
          <p className="admin-flash" role="status">
            {monitoringRetryable
              ? "Pri zapnutí sa bezpečnosť zdroja znova overí."
              : "Tento zdroj zatiaľ nemožno automaticky kontrolovať."}
          </p>
        )}

        <label className="admin-field">
          <span>Kontrolovať tento zdroj</span>
          <select value={enabled ? "on" : "off"} onChange={(event) => setEnabled(event.target.value === "on")} disabled={busy}>
            <option value="off">Vypnuté</option>
            <option value="on" disabled={!monitoringCanEnable}>Zapnuté</option>
          </select>
        </label>

        <label className="admin-field">
          <span>Ako často kontrolovať zdroj</span>
          <select value={cadenceMinutes} onChange={(event) => setCadenceMinutes(Number(event.target.value))} disabled={busy}>
            {automationCadenceOptions.map((option) => (
              <option key={option.minutes} value={option.minutes}>{option.label}</option>
            ))}
          </select>
        </label>

        <div className="admin-form-actions">
          <button className="is-primary" type="button" disabled={busy || (enabled && !monitoringCanEnable)} onClick={() => void save()}>
            {busy ? "Ukladám…" : "Uložiť nastavenie"}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Nájdený obsah</h2>
        <p>Nový obsah sa vytvorí ako koncept v príslušnej admin sekcii. Automatizácie ho ďalej nevlastnia ani neupravujú.</p>
        <p><Link href={draftsHref}>Otvoriť koncepty →</Link></p>
      </section>
    </>
  );
}
