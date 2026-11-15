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
  IMPORT_LOCK_BUSY: "Iný prenos má aktívny zámok (alebo je ešte príliš čerstvý na kontrolu).",
  POSSIBLE_ORPHAN: "Zistený neprepojený D1 profil; je potrebná bezpečná kontrola duplicity.",
  IMPORT_LOCK_CHECK: "Nepodarilo sa bezpečne overiť zámok a existujúce D1 profily.",
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
  const [sortBy, setSortBy] = useState<"date" | "name" | "category">("date");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id: string; key: string; name: string; city: string } | null>(null);
  const [rowBusy, setRowBusy] = useState("");
  const [rowError, setRowError] = useState("");
  const [trashTarget, setTrashTarget] = useState<Entry | null>(null);
  const PAGE_SIZE = 25;

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
      sortBy === "name" ? left.draft.name.localeCompare(right.draft.name, "sk") :
      sortBy === "category" ? left.item.label.localeCompare(right.item.label, "sk") :
      (Date.parse(right.draft.lastEditedAt) || 0) -
      (Date.parse(left.draft.lastEditedAt) || 0)
    );
  }, [all, category, status, search, sortBy]);
  const maxPage = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const displayed = visible.slice((Math.min(page, maxPage) - 1) * PAGE_SIZE, Math.min(page, maxPage) * PAGE_SIZE);

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

  function startEdit({ item, draft }: Entry) {
    setRowError("");
    setEditing({ id: draft.id, key: item.stableKey, name: draft.name, city: draft.city });
  }

  async function saveInline({ item, draft }: Entry) {
    if (!editing || rowBusy || !("fields" in draft) || editing.id !== draft.id) return;
    const titleField = draft.agenda === "adoptions" ? "Meno" : "Názov";
    const fieldNames = draft.fields.filter(field => field.editable).map(field => field.name);
    const changed: Record<string, string> = {};
    if (editing.name.trim() !== draft.name && fieldNames.includes(titleField))
      changed[titleField] = editing.name.trim();
    if (editing.city.trim() !== draft.city && fieldNames.includes("Mesto"))
      changed["Mesto"] = editing.city.trim();
    if (!editing.name.trim()) { setRowError("Názov nesmie byť prázdny."); return; }
    if (!Object.keys(changed).length) { setEditing(null); return; }
    setRowBusy(draft.id);
    setRowError("");
    try {
      const response = await fetch("/api/admin/gemini-automation/notion-drafts/" + encodeURIComponent(draft.id)
        + "?stable_key=" + encodeURIComponent(item.stableKey), {
        method: "PUT", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", lastEditedAt: draft.lastEditedAt, fields: changed }),
      });
      const result = await response.json() as { draft?: Draft; error?: string };
      if (!response.ok || !result.draft)
        throw new Error(result.error || "Úprava sa nepotvrdila.");
      setEditing(null);
      reload();
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "Úprava zlyhala.");
    } finally { setRowBusy(""); }
  }

  async function trashConcept() {
    if (!trashTarget || rowBusy) return;
    const { item, draft } = trashTarget;
    setRowBusy(draft.id);
    setRowError("");
    try {
      const response = await fetch("/api/admin/gemini-automation/trash-concept", {
        method: "DELETE", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stableKey: item.stableKey, pageId: draft.id,
          revision: draft.lastEditedAt, confirm: "TRASH_NOTION_ONLY_GEMINI_CONCEPT" }),
      });
      const result = await response.json() as { trashed?: boolean; error?: string };
      if (!response.ok || !result.trashed)
        throw new Error(result.error || "Odstránenie nebolo potvrdené.");
      setTrashTarget(null);
      setImportSummary("Koncept bol presunutý do koša v Notione. D1 profily zostali nezmenené.");
      reload();
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "Odstránenie zlyhalo.");
    } finally { setRowBusy(""); }
  }

  function renderTableRow({ item, draft }: Entry) {
    const canonicalUrl = geminiCanonicalEditorUrl(draft);
    const categoryUrl = geminiDraftDeepLink(item.stableKey, draft.id);
    const canDelete = !draft.canonicalVerified && !draft.psipediaId &&
      draft.reviewState !== "PUBLISHED";
    const titleField = "fields" in draft ? (draft.agenda === "adoptions" ? "Meno" : "Názov") : "";
    const canEdit = !canonicalUrl && "fields" in draft &&
      (draft.reviewState === "NEW" || draft.reviewState === "IN_PROGRESS") &&
      draft.fields.some(field => field.name === titleField && field.editable);
    const activeEdit = editing?.id === draft.id && editing.key === item.stableKey;
    return <tr key={item.stableKey + ":" + draft.id}>
      <td>
        {activeEdit ? <div className={styles.inlineEditor}>
          <label> Názov <input value={editing.name} maxLength={200}
            onChange={event => setEditing(previous => previous ? { ...previous, name: event.target.value } : null)} /></label>
          <label> Mesto <input value={editing.city} maxLength={150}
            onChange={event => setEditing(previous => previous ? { ...previous, city: event.target.value } : null)} /></label>
          <button type="button" disabled={!!rowBusy} onClick={() => void saveInline({ item, draft })}>Uložiť</button>
          <button type="button" disabled={!!rowBusy} onClick={() => setEditing(null)}>Zrušiť</button>
        </div> : <strong className={styles.name}>{draft.name || "Nepomenovaný koncept"}</strong>}
      </td>
      <td>{item.label}</td>
      <td>{draft.city || "—"}</td>
      <td><span className={styles.status + " " + (styles["status_" + draft.reviewState.toLowerCase()] ?? "")}>
        {geminiReviewLabels[draft.reviewState]}</span></td>
      <td><time dateTime={draft.lastEditedAt}>{geminiConceptDate(draft.lastEditedAt)}</time></td>
      <td>{draft.syncError ? <details className={styles.syncWarning}>
        <summary>{canonicalUrl ? "Upozornenie" : "Chyba prenosu"}</summary>
        <span>{draft.syncError}</span></details> : <span className={styles.ok}>—</span>}</td>
      <td><div className={styles.actions}>
        {canonicalUrl || categoryUrl
          ? <Link className={styles.open} href={canonicalUrl ?? categoryUrl!}>Editor</Link>
          : <span>—</span>}
        {canEdit && <button type="button" className={styles.smallButton} onClick={() => startEdit({ item, draft })}>Rýchla úprava</button>}
        {canDelete && <button type="button" className={styles.danger} disabled={!!rowBusy}
          onClick={() => { setRowError(""); setTrashTarget({ item, draft }); }}>Vymazať</button>}
      </div></td>
    </tr>;
  }

  return (
    <div className={styles.workspace} data-admin-content-module="gemini-concepts">
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

      <div className={styles.toolbar} role="search" aria-label="Filtre Gemini konceptov" data-admin-list-filters>
        <label>
          Hľadať koncept
          <input type="search" autoComplete="off" placeholder="Názov, lokalita alebo kategória"
            value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <label>
          Kategória
          <select value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}>
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
          <select value={status} onChange={event => { setStatus(event.target.value as typeof status); setPage(1); }}>
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

      <div className={styles.tableToolbar}>
        <strong>Koncepty</strong>
        <label>Zoradiť podľa <select value={sortBy} onChange={event => {setSortBy(event.target.value as typeof sortBy);setPage(1);}}>
          <option value="date">Posledná úprava</option>
          <option value="name">Názov A–Z</option>
          <option value="category">Kategória A–Z</option>
        </select></label>
        <span>{visible.length} výsledkov · Strana {Math.min(page, maxPage)} z {maxPage}</span>
      </div>
      <div className={styles.tableScroll} role="region" aria-label="Tabuľka Gemini konceptov" tabIndex={0} data-admin-list-table>
        <table className={styles.table}>
          <thead><tr><th>Názov</th><th>Kategória</th><th>Mesto</th><th>Stav</th><th>Upravené</th><th>Synchronizácia</th><th>Akcie</th></tr></thead>
          <tbody>{displayed.map(renderTableRow)}</tbody>
        </table>
        {!displayed.length && <p className={styles.empty}>Žiadne koncepty nezodpovedajú filtrom.</p>}
      </div>
      <div className={styles.pager} data-admin-list-pagination>
        <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Predchádzajúca</button>
        <span>Strana {Math.min(page, maxPage)} / {maxPage}</span>
        <button type="button" disabled={page >= maxPage} onClick={() => setPage(p => Math.min(maxPage, p + 1))}>Ďalšia</button>
      </div>
      {rowError && <p className={styles.warning} role="alert">{rowError}</p>}
      {trashTarget && <div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-labelledby="gemini-trash-heading">
        <div className={styles.confirmCard}>
          <h3 id="gemini-trash-heading">Presunúť Gemini koncept do koša Notionu?</h3>
          <p><strong>{trashTarget.draft.name}</strong> · {trashTarget.item.label}</p>
          <p>Toto je iba pre koncept, ktorý ešte nemá D1 profil. V Notione bude v koši a možno ho obnoviť.
            Už importované profily musíš spravovať v ich natívnom editore.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.smallButton} onClick={() => setTrashTarget(null)} disabled={!!rowBusy}>Zrušiť</button>
            <button type="button" className={styles.danger} onClick={() => void trashConcept()} disabled={!!rowBusy}>Potvrdzujem presun do koša</button>
          </div>
        </div>
      </div>}
      <p className={styles.footnote}>Import len vytvorí neverejné koncepty. Staršie záznamy sa po tvojom kliknutí overia v Notione a D1; pri neistote zostanú v zozname na kontrolu. Nič sa automaticky nepublikuje.</p>
    </div>
  );
}
