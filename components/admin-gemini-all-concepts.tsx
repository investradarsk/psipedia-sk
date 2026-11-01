"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { geminiAutomationCatalog, geminiAutomationSections, type GeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { geminiConceptDate, geminiCanonicalEditorUrl, geminiDraftDeepLink } from "@/lib/gemini-concept-manager";
import { geminiReviewLabels, geminiActiveReviewCount, geminiActiveReviewState, preserveGeminiPublished, type GeminiReviewState } from "@/lib/gemini-notion-review-state";
import { filterGeminiConcepts } from "@/lib/gemini-concept-fuzzy-search";
import type { GeminiDirectoryDraft } from "@/lib/gemini-notion-directory-review";
import type { GeminiAgendaDraft } from "@/lib/gemini-notion-agenda-review";
import styles from "./admin-gemini-all-concepts.module.css";

type Draft = GeminiDirectoryDraft | GeminiAgendaDraft;
type Entry = { item: GeminiCatalogItem; draft: Draft };
const keys = geminiAutomationCatalog.map((item) => item.stableKey);
/** User-facing, allowlisted reasons; no sensitive Notion/provider details. */
const importIssueText: Record<string, string> = {
  NOTION_RATE_LIMIT: "Notion obmedzil počet požiadaviek (429). Skús import neskôr.",
  NOTION_PERMISSION: "Notion alebo zdroj odmietol prístup (403).",
  NOTION_NETWORK: "Notion momentálne neodpovedá.",
  SYNC_DISABLED: "Synchronizácia tejto kategórie je vypnutá.",
  SYNC_SCHEMA: "Chýba nastavenie alebo tabuľka synchronizácie.",
  SYNC_TARGET_MISSING: "Databáza Notion pre túto kategóriu nie je pripojená.",
  SYNC_FAILED: "Synchronizácia zlyhala; D1 koncept ešte nie je potvrdený.",
  DUPLICATE: "Možný duplicitný profil. Treba overiť existujúci záznam.",
  PRIVATE_STATUS_REQUIRED: "Zdrojový záznam nemá povolený stav súkromného konceptu.",
  CATEGORY_MISMATCH: "Kategória profilu nezodpovedá zdroju.",
  NOTION_REVISION_CHANGED: "Záznam v Notione sa medzitým zmenil. Obnov zoznam.",
  REQUIRED_IDENTITY: "Chýba identita profilu potrebná na vytvorenie konceptu.",
  REQUIRED_CATEGORY: "Chýba typ alebo kategória profilu.",
  IMPORT_BUSY: "Iný import práve spracúva tento záznam.",
  INVALID_DATA: "Záznam má neplatné údaje, ktoré zatiaľ odmietol editor.",
  D1_NOT_CONFIRMED: "D1 nepotvrdila vytvorenie profilu.",
  ORIGIN_NOT_VERIFIED: "Nie je bezpečne overený pôvod Gemini záznamu.",
};


/**
 * Read only, using exactly the same authenticated source as the existing
 * "Koncepty z automatizácie" panel for each category. No global Notion scan,
 * no Gemini API call, no new D1 bridge and no import/approval side effect.
 * Limit simultaneous Notion-backed requests to avoid a 22-request burst.
 */
export function AdminGeminiAllConcepts() {
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, Draft[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Preserve D1-confirmed publications when the visible rows are cleared on
  // manual reload. A full page navigation recomputes state from canonical D1.
  const publishedByCategory = useRef<Record<string, Set<string>>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState<GeminiReviewState | "ACTIVE" | "ALL">("ACTIVE");
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let nextIndex = 0;
    async function loadNext() {
      while (!controller.signal.aborted && nextIndex < keys.length) {
        const key = keys[nextIndex++];
        try {
          const response = await fetch(
            "/api/admin/gemini-automation/notion-drafts?stable_key=" + encodeURIComponent(key),
            { credentials: "same-origin", cache: "no-store", signal: controller.signal },
          );
          const data = await response.json() as { drafts?: Draft[]; error?: string };
          if (!response.ok || !Array.isArray(data.drafts)) {
            throw new Error(data.error || "Načítanie zlyhalo");
          }
          if (!controller.signal.aborted) {
            const confirmed = publishedByCategory.current[key] ?? new Set<string>();
            for (const draft of data.drafts) {
              if (draft.reviewState === "PUBLISHED") confirmed.add(draft.id);
            }
            publishedByCategory.current[key] = confirmed;
            const protectedRows = data.drafts.map(draft =>
              confirmed.has(draft.id) ? { ...draft, reviewState: "PUBLISHED" as const } : draft
            );
            setLoaded(previous => ({
              ...previous, [key]: preserveGeminiPublished(previous[key] ?? [], protectedRows),
            }));
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setErrors(previous => ({
              ...previous,
              [key]: error instanceof Error ? error.message : "Načítanie zlyhalo",
            }));
          }
        }
      }
    }
    void Promise.all([loadNext(), loadNext()]);
    return () => controller.abort();
  }, [revision]);

  const finished = Object.keys(loaded).length + Object.keys(errors).length;
  const complete = finished === keys.length;
  const all = useMemo(() => geminiAutomationCatalog.flatMap(item =>
    (loaded[item.stableKey] ?? []).map(draft => ({ item, draft }))
  ), [loaded]);
  const visible = useMemo(() => {
    // Status and category restrictions are strict. Fuzzy search may widen
    // text matching but must never expose excluded workflow states.
    const eligible = all.filter(({ item, draft }) =>
      (category === "ALL" || item.stableKey === category) &&
      (status === "ALL" || (status === "ACTIVE" ? geminiActiveReviewState(draft.reviewState) : draft.reviewState === status))
    );
    return filterGeminiConcepts(eligible, search).sort((left, right) =>
      (Date.parse(right.draft.lastEditedAt) || 0) -
      (Date.parse(left.draft.lastEditedAt) || 0)
    );
  }, [all, category, status, search]);

  function reload() {
    setLoaded({});
    setErrors({});
    setRevision(current => current + 1);
  }

  // A single owner click confirms the import of legacy Gemini evidence rows.
  // Each request checks current Notion revision, source ownership and D1 identity.
  // One at a time protects Notion rate limits (429); nothing is ever published.
  async function importPending() {
    if (importing || !complete || Object.keys(errors).length) return;
    const pending = all.filter(({ draft }) =>
      !geminiCanonicalEditorUrl(draft) && Boolean(draft.lastEditedAt) &&
      draft.reviewState !== "REJECTED" && draft.reviewState !== "PUBLISHED");
    if (!pending.length) {
      setImportSummary("Nie sú žiadne čakajúce koncepty na prenos.");
      return;
    }
    setImporting(true);
    setImportErrors([]);
    let done = 0;
    const failed: string[] = [];
    try {
      for (const { item, draft } of pending) {
        setImportSummary(`Prenášam ${done + failed.length + 1} z ${pending.length}… (${draft.name || item.label})`);
        try {
          const response = await fetch("/api/admin/gemini-automation/import-pending", {
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              stableKey: item.stableKey, pageId: draft.id, revision: draft.lastEditedAt,
              confirm: "IMPORT_PRIVATE_GEMINI_DRAFT",
            }),
          });
          const result = await response.json() as {
            imported?: boolean; error?: string; state?: string; issue?: string;
          };
          if (!response.ok || !result.imported) {
            failed.push((draft.name || item.label) + ": " +
              (result.error || importIssueText[result.issue ?? ""] ||
                (result.state === "NOTION_ONLY"
                  ? "Chýba bezpečne overiteľný Gemini pôvod."
                  : "D1 nepotvrdila import. Skontroluj stav v kategórii.")));
          } else done += 1;
        } catch {
          failed.push((draft.name || item.label) + ": Spojenie zlyhalo. Skontroluj stav.");
        }
        // No parallel 22-category writes; retry later from refreshed D1 truth.
        if (pending.length > 1) await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } finally {
      setImporting(false);
      setImportSummary(`Hotovo: ${done} importovaných, ${failed.length} treba skontrolovať.`);
      setImportErrors(failed);
      reload();
    }
  }

  function renderRow({ item, draft }: Entry) {
    // A canonical editor link is only possible after the existing D1 mapping
    // confirms the identity. Others must go through their existing Gemini
    // category manager instead of an unverified or guessed admin URL.
    const canonicalUrl = geminiCanonicalEditorUrl(draft);
    const categoryUrl = geminiDraftDeepLink(item.stableKey, draft.id);
    return (
      <li className={styles.row} key={item.stableKey + ":" + draft.id}>
        <div className={styles.identity}>
          <strong>{draft.name || "Nepomenovaný koncept"}</strong>
          <span className={styles.metadata}>
            {item.label}{draft.city ? " · " + draft.city : ""} · Upravené {geminiConceptDate(draft.lastEditedAt)}
          </span>
        </div>
        <span className={styles.status + " " + (styles["status_" + draft.reviewState.toLowerCase()] ?? "")}>
          {geminiReviewLabels[draft.reviewState]}
        </span>
        {draft.syncError && <span role="status" className={styles.warning}>
          {canonicalUrl ? "Upozornenie k synchronizácii (neblokuje úpravu): " : "Prenos ešte nie je dokončený: "}
          {draft.syncError}
        </span>}
        {canonicalUrl || categoryUrl ? (
          <Link className={styles.open} href={canonicalUrl ?? categoryUrl!}>
            {canonicalUrl ? "Otvoriť editor →" : "Čaká na D1 · zobraziť stav →"}
          </Link>
        ) : <span className={styles.open}>Otvoriť v kategórii →</span>}
      </li>
    );
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.intro} aria-label="Súhrn konceptov">
        <div>
          <span className={styles.eyebrow}>CENTRÁLNY PREHĽAD · 22 KATEGÓRIÍ</span>
          <h2>Všetky koncepty Gemini</h2>
          <p>Jeden zoznam z rovnakých zdrojov, ktoré používaš pri každej Gemini kategórii. Ostatné koncepty Notionu sem nepatria.</p>
        </div>
        <div className={styles.counter} aria-live="polite">
          <strong>{geminiActiveReviewCount(all.map(entry => entry.draft))}</strong>
          <span>{complete && !Object.keys(errors).length ? "Čakajúcich konceptov" : "Zatiaľ načítaných čakajúcich konceptov"}</span>
        </div>
      </section>

      <div className={styles.toolbar}>
        <label>
          Hľadať koncept
          <input type="search" autoComplete="off" placeholder="Názov, lokalita alebo kategória"
            value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <label>
          Kategória
          <select value={category} onChange={event => setCategory(event.target.value)}>
            <option value="ALL">Všetkých 22 kategórií</option>
            {geminiAutomationSections.map(section => (
              <optgroup key={section.key} label={section.label}>
                {geminiAutomationCatalog.filter(item => item.section === section.key).map(item => (
                  <option key={item.stableKey} value={item.stableKey}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Stav
          <select value={status} onChange={event => setStatus(event.target.value as typeof status)}>
            <option value="ACTIVE">Aktívne koncepty</option>
            <option value="ALL">Všetky stavy</option>
            {Object.entries(geminiReviewLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.reload} onClick={() => void importPending()}
          disabled={!complete || Object.keys(errors).length > 0 || importing}>
          {importing ? "Prenášam koncepty…" : "Preniesť čakajúce do Adminu"}
        </button>
        <button type="button" className={styles.reload} onClick={reload}
          disabled={!complete || importing}>↻ Obnoviť</button>
      </div>

      {importSummary && <div className={styles.progress} role="status" aria-live="polite">
        {importSummary}
        {importErrors.length > 0 && <details><summary>Neprenesené koncepty ({importErrors.length})</summary>
          <ul>{importErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>
        </details>}
      </div>}
      <p className={styles.progress} role="status" aria-live="polite">
        {complete
          ? Object.keys(errors).length
            ? `Načítaných ${Object.keys(loaded).length} z 22 kategórií; ${Object.keys(errors).length} zlyhalo. Zoznam nie je úplný.`
            : `Načítaných všetkých 22 kategórií · Zobrazené ${visible.length} z ${all.length} konceptov.`
          : `Načítavam kategórie: ${finished} z 22 · Zatiaľ zobrazené ${visible.length} konceptov.`}
      </p>

      {Object.keys(errors).length > 0 && (
        <div className={styles.warning} role="alert">
          <strong>Niektoré kategórie sa nepodarilo načítať.</strong>
          <p>Počty sú neúplné. Môžeš skúsiť obnovenie, ktoré zopakuje len čítanie konceptov.</p>
          <ul>{geminiAutomationCatalog.filter(item => errors[item.stableKey]).map(item => (
            <li key={item.stableKey}>{item.label}: {errors[item.stableKey]}</li>
          ))}</ul>
        </div>
      )}

      {geminiAutomationSections.map(section => {
        const rows = visible.filter(entry => entry.item.section === section.key);
        return (
          <section className={styles.group} key={section.key} aria-labelledby={"gemini-all-" + section.key}>
            <div className={styles.groupTitle}>
              <h2 id={"gemini-all-" + section.key}>{section.label}</h2>
              <span>{rows.length} konceptov</span>
            </div>
            {rows.length ? <ul className={styles.rows}>{rows.map(renderRow)}</ul> :
              <p className={styles.empty}>{complete ? "Žiadne koncepty nezodpovedajú filtrom." : "Zatiaľ žiadne načítané koncepty v tejto sekcii."}</p>}
          </section>
        );
      })}
      <p className={styles.footnote}>Import len vytvorí neverejné koncepty. Staršie záznamy sa po tvojom kliknutí overia v Notione a D1; pri neistote zostanú v zozname na kontrolu. Nič sa automaticky nepublikuje.</p>
    </div>
  );
}
