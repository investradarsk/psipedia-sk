"use client";

import { useMemo, useState } from "react";
import styles from "./admin-notion-data-quality-audit.module.css";

const categories = [
  { value: "directory", label: "Adresár · služby" },
  { value: "events", label: "Podujatia" },
  { value: "organizations", label: "Organizácie" },
  { value: "adoptions", label: "Adopcie" },
  { value: "help-cases", label: "Pomoc psom · prípady" },
  { value: "lost-found", label: "Stratené a nájdené" },
] as const;

type Category = (typeof categories)[number]["value"];
type ReviewItem = {
  notionPageId: string;
  psipediaId: string;
  kind: string;
  nextStep: "REVIEW_FIELDS" | "VALIDATE_SOURCE" | "INVESTIGATE_RUNTIME";
};
type AuditBatch = {
  agenda: Category;
  mode: "dry-run";
  readOnly: true;
  batchSize: number;
  examined: number;
  linked: number;
  syncErrors: number;
  conflictErrors: number;
  addressPresent: number;
  publicCoordinates: number;
  googlePlaceCurrent: number;
  googleNotRequired: number;
  errorTypes: Record<string, number>;
  reviewItems: ReviewItem[];
  hasMore: boolean;
  nextCursor: string | null;
  truncated: boolean;
};
type AuditError = { error?: string };

const errorLabels: Record<string, string> = {
  MISSING_HOUSE_NUMBER: "Chýba číslo domu",
  INVALID_LOCALITY: "Neúplná alebo neplatná lokalita",
  ILLEGAL_INVOCATION: "Technická chyba (Illegal invocation)",
  INVALID_PHONE: "Neplatný telefón",
  INVALID_EMAIL: "Neplatný e-mail",
  INVALID_WEBSITE: "Neplatný web",
  REMOTE_IMAGE_BLOCKED: "Externý obrázok sa nepodarilo načítať",
  BIDIRECTIONAL_CONFLICT: "Konflikt medzi Notionom a Psipediou",
  OTHER: "Ostatné chyby",
};
const reviewLabels: Record<ReviewItem["nextStep"], string> = {
  REVIEW_FIELDS: "Porovnať obidve verzie",
  VALIDATE_SOURCE: "Overiť zdrojové údaje",
  INVESTIGATE_RUNTIME: "Skontrolovať technickú chybu",
};
const metricKeys = [
  "examined", "linked", "syncErrors", "conflictErrors", "addressPresent",
  "publicCoordinates", "googlePlaceCurrent", "googleNotRequired",
] as const;

export function AdminNotionDataQualityAudit() {
  const [category, setCategory] = useState<Category>("directory");
  const [batches, setBatches] = useState<AuditBatch[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const lastBatch = batches.at(-1);
  const hasMore = lastBatch?.hasMore ?? false;
  const nextCursor = lastBatch?.nextCursor ?? null;
  const categoryLabel = categories.find((item) => item.value === category)?.label ?? category;

  const totals = useMemo(() => {
    const counts = Object.fromEntries(metricKeys.map((key) => [
      key, batches.reduce((sum, batch) => sum + batch[key], 0),
    ])) as Record<(typeof metricKeys)[number], number>;
    const errorTypes: Record<string, number> = {};
    for (const batch of batches) {
      for (const [kind, count] of Object.entries(batch.errorTypes)) {
        errorTypes[kind] = (errorTypes[kind] ?? 0) + count;
      }
    }
    return { ...counts, errorTypes, reviewItems: batches.flatMap((batch) => batch.reviewItems) };
  }, [batches]);

  const report = useMemo(() => ({
    category,
    label: categoryLabel,
    readOnly: true,
    batchSize: 100,
    batchesChecked: batches.length,
    examined: totals.examined,
    linked: totals.linked,
    errors: totals.syncErrors,
    conflicts: totals.conflictErrors,
    addressOrPlacePresent: totals.addressPresent,
    publicCoordinates: totals.publicCoordinates,
    currentGooglePlace: totals.googlePlaceCurrent,
    googleNotRequired: totals.googleNotRequired,
    errorTypes: totals.errorTypes,
    remainingBatches: hasMore ? "unknown" : 0,
    complete: batches.length > 0 && !hasMore && !lastBatch?.truncated,
    reviewItems: totals.reviewItems,
  }), [batches.length, category, categoryLabel, hasMore, lastBatch?.truncated, totals]);

  function reset(nextCategory: Category) {
    if (running) return;
    setCategory(nextCategory);
    setBatches([]);
    setError("");
    setCopyStatus("");
  }

  async function checkNextBatch() {
    if (running || (batches.length > 0 && !hasMore)) return;
    if (batches.length > 0 && !nextCursor) {
      setError("Notion nevrátil ďalší kurzor. Pokračovanie nie je možné bezpečne overiť.");
      return;
    }

    setRunning(true);
    setError("");
    setCopyStatus("");
    try {
      const response = await fetch("/api/admin/notion-data-quality-audit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agenda: category,
          mode: "dry-run",
          ...(batches.length > 0 ? { cursor: nextCursor } : {}),
        }),
      });
      const data = await response.json() as Partial<AuditBatch> & AuditError;
      if (!response.ok || data.error) throw new Error(data.error || `Kontrola zlyhala (HTTP ${response.status}).`);
      if (
        data.agenda !== category || data.mode !== "dry-run" || data.readOnly !== true
        || data.batchSize !== 100 || !Array.isArray(data.reviewItems)
        || typeof data.examined !== "number" || typeof data.hasMore !== "boolean"
      ) throw new Error("Server vrátil neočakávaný formát auditu.");
      setBatches((current) => [...current, data as AuditBatch]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Kontrola sa nepodarila.");
    } finally {
      setRunning(false);
    }
  }

  async function copyReport() {
    if (!batches.length) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopyStatus("Výsledok skopírovaný. Môžeš ho vložiť do riadiaceho chatu.");
    } catch {
      setCopyStatus("Automatické kopírovanie nie je dostupné. Výsledok môžeš skopírovať z technického prehľadu nižšie.");
    }
  }

  return (
    <div className={styles.stack}>
      <section className={styles.panel} aria-labelledby="notion-audit-heading">
        <div className={styles.heading}>
          <div>
            <h2 id="notion-audit-heading">Bezpečná kontrola synchronizácie</h2>
            <p>Vyber kategóriu a načítaj vždy maximálne 100 záznamov. Počas kontroly sa nič nemení.</p>
          </div>
          <strong className={styles.readOnly}>Len na čítanie</strong>
        </div>
        <div className={styles.controls}>
          <label className={styles.field}>
            <span>Kategória</span>
            <select value={category} disabled={running} onChange={(event) => reset(event.target.value as Category)}>
              {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button type="button" className="admin-primary-action" disabled={running || (batches.length > 0 && !hasMore) || (hasMore && !nextCursor)} onClick={checkNextBatch}>
            {running ? "Kontrolujem…" : batches.length ? "Skontrolovať ďalších 100" : "Spustiť kontrolu prvých 100"}
          </button>
          {batches.length > 0 ? (
            <button type="button" className={styles.secondary} disabled={running} onClick={() => reset(category)}>Začať odznova</button>
          ) : null}
        </div>
        {error ? <p className="admin-message admin-message--error" role="alert">{error}</p> : null}
        {batches.length > 0 ? (
          <p className={styles.progress} role="status">
            Skontrolované: <strong>{totals.examined}</strong> záznamov v {batches.length} {batches.length === 1 ? "dávke" : "dávkach"}.
            {hasMore ? " V Notione sú ďalšie záznamy." : " Dosiahnutý koniec kategórie."}
            {lastBatch?.truncated ? " Notion nepotvrdil kurzor; prehľad nemusí byť úplný." : ""}
          </p>
        ) : null}
      </section>

      {batches.length > 0 ? (
        <>
          <section className={styles.panel} aria-labelledby="notion-audit-results">
            <h2 id="notion-audit-results">Výsledky — {categoryLabel}</h2>
            <div className={styles.metrics}>
              <div><strong>{totals.examined}</strong><span>Skontrolovaných</span></div>
              <div><strong>{totals.linked}</strong><span>S Psipedia ID</span></div>
              <div><strong>{totals.syncErrors}</strong><span>Hlásených chýb</span></div>
              <div><strong>{totals.conflictErrors}</strong><span>Konfliktov</span></div>
              <div><strong>{totals.addressPresent}</strong><span>Adresa / miesto</span></div>
              <div><strong>{totals.publicCoordinates}</strong><span>Súradnice</span></div>
              <div><strong>{totals.googlePlaceCurrent}</strong><span>Aktuálne Google miesto</span></div>
              <div><strong>{totals.googleNotRequired}</strong><span>Google Maps netreba</span></div>
            </div>
            <h3>Typy zistených chýb</h3>
            {Object.keys(totals.errorTypes).length ? (
              <ul className={styles.errors}>
                {Object.entries(totals.errorTypes).sort((a, b) => b[1] - a[1]).map(([kind, count]) =>
                  <li key={kind}><span>{errorLabels[kind] || kind}</span><strong>{count}</strong></li>
                )}
              </ul>
            ) : <p>V doteraz skontrolovaných záznamoch nie je vyplnená žiadna chyba synchronizácie.</p>}
          </section>

          {totals.reviewItems.length > 0 ? (
            <section className={styles.panel} aria-labelledby="notion-audit-review">
              <h2 id="notion-audit-review">Záznamy na preverenie</h2>
              <p>Ide o existujúce označenia chýb, nie o automatické návrhy na prepis. Súkromné adresy a kontakty sa nezobrazujú.</p>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th>Psipedia ID</th><th>Typ problému</th><th>Ďalší krok</th></tr></thead>
                  <tbody>
                    {totals.reviewItems.map((item) => (
                      <tr key={item.notionPageId}>
                        <td>{item.psipediaId || "—"}</td>
                        <td>{errorLabels[item.kind] || item.kind}</td>
                        <td>{reviewLabels[item.nextStep]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className={styles.panel} aria-labelledby="notion-audit-export">
            <h2 id="notion-audit-export">Výsledok pre ďalšie opravy</h2>
            <p>Skopíruj prehľad do chatu. Obsahuje počty, typy chýb a ID záznamov, nie ich súkromné kontaktné údaje.</p>
            <button className={styles.secondary} type="button" onClick={copyReport}>Skopírovať výsledok</button>
            {copyStatus ? <p role="status">{copyStatus}</p> : null}
            <details className={styles.details}>
              <summary>Zobraziť technický prehľad</summary>
              <pre>{JSON.stringify(report, null, 2)}</pre>
            </details>
          </section>
        </>
      ) : null}
    </div>
  );
}
