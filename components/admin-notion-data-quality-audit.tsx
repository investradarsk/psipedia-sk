"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
type QualityVerdict = "CONFIRMED" | "STALE_OR_RESOLVED" | "NEEDS_REVIEW" | "UNKNOWN";
type QualityItem = {
  notionPageId: string;
  psipediaId: string;
  verdict: QualityVerdict;
  issue: "IDENTITY" | "SYNC_CONFLICT" | "PROTECTION" | "CONTENT" | "RUNTIME" | "SYNC_ERROR";
  basis: string;
  reason: string | null;
  historicKind: string | null;
  editorHref: string | null;
  fieldNames: string[] | null;
};
type AuditBatch = {
  agenda: Category;
  mode: "dry-run";
  readOnly: true;
  batchSize: number;
  pass: 1 | 2;
  sourceId: string;
  nextPass: 2 | null;
  passesComplete: boolean;
  resume: { agenda: Category; pass: 1 | 2; sourceId: string; cursor: string | null };
  checkedAgainstD1: boolean;
  independent: { totals: Record<"UPDATE" | "UNCHANGED" | "CONFLICT" | "REVIEW" | "SKIPPED", number>; reasons: Record<string, number>; unknown: string[] };
  triage: { readOnly: true; scope: "ONE_AUDIT_BATCH"; counts: Record<QualityVerdict, number>; items: QualityItem[]; unknown: string[] };
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
  REMOTE_IMAGE_HTTP_403: "Externý obrázok — HTTP 403",
  REMOTE_IMAGE_HTTP_522: "Externý obrázok — HTTP 522",
  INVALID_IMAGE_FORMAT: "Neplatný formát obrázka",
  DUPLICATE_IDENTITY: "Duplicitná identita",
  GOOGLE_PLACE_MISMATCH: "Rozdielne Google miesto",
  CONFIRMED_SITE_REVIEW_REQUIRED: "Ochrana potvrdenej prevádzky",
  PRIVACY_REVIEW_REQUIRED: "Súkromná lokalita vyžaduje kontrolu",
  LEGACY_BASELINE_MISMATCH: "Zastaraný baseline",
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
    const qualityCounts: Record<QualityVerdict, number> = { CONFIRMED: 0, STALE_OR_RESOLVED: 0, NEEDS_REVIEW: 0, UNKNOWN: 0 };
    const qualityItems = batches.flatMap((batch) => batch.triage.items.map((item) => ({ ...item, pass: batch.pass })));
    for (const batch of batches) for (const key of Object.keys(qualityCounts) as QualityVerdict[]) qualityCounts[key] += batch.triage.counts[key];
    return { ...counts, errorTypes, qualityCounts, qualityItems };
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
    remainingBatches: hasMore || lastBatch?.nextPass === 2 ? "unknown" : 0,
    complete: batches.length > 0 && lastBatch?.passesComplete === true && !lastBatch.truncated,
    passes: [...new Set(batches.map((batch) => batch.pass))],
    countsByPass: [1, 2].map((pass) => ({
      pass,
      batches: batches.filter((batch) => batch.pass === pass).length,
      reviewed: batches.filter((batch) => batch.pass === pass).reduce((sum, batch) => sum + batch.examined, 0),
    })),
    d1Evidence: batches.map((batch) => ({ pass: batch.pass, verified: batch.checkedAgainstD1, totals: batch.independent?.totals, reasons: batch.independent?.reasons })),
    unresolvedEvidence: [...new Set(batches.flatMap((batch) => batch.independent?.unknown ?? []))],
    checkpointVerified: Boolean(lastBatch?.passesComplete && !lastBatch.truncated),
    qualityCounts: totals.qualityCounts,
    qualityUnknown: [...new Set(batches.flatMap((batch) => batch.triage.unknown))],
  }), [batches, category, categoryLabel, hasMore, lastBatch, totals]);

  function reset(nextCategory: Category) {
    if (running) return;
    setCategory(nextCategory);
    setBatches([]);
    setError("");
    setCopyStatus("");
  }

  async function checkNextBatch() {
    if (running || (batches.length > 0 && !hasMore && lastBatch?.nextPass !== 2)) return;
    if (hasMore && !nextCursor) {
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
          pass: hasMore ? lastBatch?.pass ?? 1 : lastBatch?.nextPass ?? 1,
          ...(lastBatch ? { sourceId: lastBatch.sourceId } : {}),
          ...(hasMore ? { cursor: nextCursor } : {}),
        }),
      });
      const data = await response.json() as Partial<AuditBatch> & AuditError;
      if (!response.ok || data.error) throw new Error(data.error || `Kontrola zlyhala (HTTP ${response.status}).`);
      if (
        data.agenda !== category || data.mode !== "dry-run" || data.readOnly !== true
        || data.batchSize !== 100 || !Array.isArray(data.reviewItems)
        || !data.sourceId || (data.pass !== 1 && data.pass !== 2)
        || data.triage?.readOnly !== true || data.triage.scope !== "ONE_AUDIT_BATCH"
        || !Array.isArray(data.triage.items)
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
          <button type="button" className="admin-primary-action" disabled={running || (batches.length > 0 && !hasMore && lastBatch?.nextPass !== 2) || (hasMore && !nextCursor)} onClick={checkNextBatch}>
            {running ? "Kontrolujem…" : lastBatch?.nextPass === 2 ? "Začať 2. prechod" : batches.length ? "Skontrolovať ďalších 100" : "Spustiť kontrolu prvých 100"}
          </button>
          {batches.length > 0 ? (
            <button type="button" className={styles.secondary} disabled={running} onClick={() => reset(category)}>Začať odznova</button>
          ) : null}
        </div>
        {error ? <p className="admin-message admin-message--error" role="alert">{error}</p> : null}
        {batches.length > 0 ? (
          <p className={styles.progress} role="status">
            Skontrolované: <strong>{totals.examined}</strong> záznamov v {batches.length} {batches.length === 1 ? "dávke" : "dávkach"}.
            {hasMore ? " V Notione sú ďalšie záznamy." : lastBatch?.nextPass === 2 ? " Prvý prechod dokončený; druhý ešte nie." : " Druhý prechod ukončený."}
            {" D1 overenie sa vzťahuje na identity, nie na aktuálne snapshot hashe. Počty zahŕňajú oba prechody."}
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
              <div><strong>{totals.conflictErrors}</strong><span>Historické príznaky konfliktov</span></div>
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

          <section className={styles.panel} aria-labelledby="notion-audit-quality">
            <h2 id="notion-audit-quality">Synchronizačné konflikty · Kvalita údajov</h2>
            <p>Historické príznaky nie sú potvrdené aktuálne konflikty. Nižšie sú len zistenia v načítaných dávkach; prvý a druhý prechod sa sčítavajú ako pozorovania, nie jedinečné profily.</p>
            <div className={styles.metrics}>
              <div><strong>{totals.qualityCounts.CONFIRMED}</strong><span>Potvrdené dôkazmi v dávke</span></div>
              <div><strong>{totals.qualityCounts.STALE_OR_RESOLVED}</strong><span>Historické / vyriešené</span></div>
              <div><strong>{totals.qualityCounts.NEEDS_REVIEW}</strong><span>Vyžaduje kontrolu</span></div>
              <div><strong>{totals.qualityCounts.UNKNOWN}</strong><span>Nedostatok dôkazov</span></div>
            </div>
            <p>Potvrdená kolízia identity nie je dôkazom obsahového konfliktu. Bez aktuálnych porovnateľných snapshotov nie je známa správna verzia údajov ani posledný dôveryhodný editor.</p>
            <details className={styles.details}>
              <summary>Ako bezpečne vyriešiť konflikt Notion ↔ Psipedia</summary>
              <ol>
                <li>Najprv spusti read-only kontrolu konkrétnej agendy. Historická chyba sama osebe neznamená aktuálny konflikt.</li>
                <li>Pri konflikte identity over pôvodný Psipedia ID a Notion stránku; nemen ID, mapovanie ani stav publikovania automaticky.</li>
                <li>Pri obsahovom konflikte porovnaj rovnaké polia v kanonickom Admin editore a v Notione. Správnu hodnotu musí potvrdiť človek.</li>
                <li>Potvrdené Google miesto, presnú adresu, súkromné kontakty, moderáciu a publikovanie upravuj výhradne cez príslušný Admin editor.</li>
                <li>Po schválenej manuálnej úprave znovu skontroluj obidve aktuálne verzie. Automatický sync bez preukázateľného spoločného základu stále môže správne hlásiť konflikt.</li>
              </ol>
              <p>Nepoužívaj hromadné prepísanie, mazanie ani automatické vyhlásenie Notionu alebo D1 za víťaza. Táto kontrola nevykonáva žiadny zápis.</p>
            </details>
            {totals.qualityItems.length ? (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th>Agenda / ID</th><th>Typ</th><th>Vyhodnotenie</th><th>Kontrola</th></tr></thead>
                  <tbody>
                    {totals.qualityItems.map((item, index) => (
                      <tr key={`${item.pass}-${item.notionPageId}-${index}`}>
                        <td>{categoryLabel} · {item.psipediaId || "—"}</td>
                        <td>{item.issue === "IDENTITY" ? "Mapovanie identity" : item.issue === "SYNC_CONFLICT" ? "Synchronizačný konflikt" : item.issue === "PROTECTION" ? "Ochranné blokovanie" : item.issue === "CONTENT" ? "Obsahová neúplnosť" : item.issue === "RUNTIME" ? "Technická chyba" : "Chyba synchronizácie"}</td>
                        <td>{item.verdict}{item.reason ? ` · ${errorLabels[item.reason] || item.reason}` : ""}{item.fieldNames?.length ? ` · polia: ${item.fieldNames.join(", ")}` : ""}</td>
                        <td>{item.editorHref ? <Link href={item.editorHref}>Otvoriť editor</Link> : "Individuálna kontrola identity"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p>V načítanej dávke zatiaľ nie sú zistené synchronizačné prípady vyžadujúce triedenie.</p>}
          </section>

          <section className={styles.panel} aria-labelledby="notion-audit-export">
            <h2 id="notion-audit-export">Výsledok pre ďalšie opravy</h2>
            <p>Skopíruj iba sanitizované súhrnné počty a dôkazové obmedzenia. Výstup neobsahuje ID profilov, Notion zdroje, kurzory ani súkromné údaje.</p>
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
