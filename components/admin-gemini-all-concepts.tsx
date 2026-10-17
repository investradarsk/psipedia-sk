"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { geminiAutomationCatalog, geminiAutomationSections, type GeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { geminiConceptDate, geminiConceptMatchesSearch, geminiCanonicalEditorUrl } from "@/lib/gemini-concept-manager";
import { geminiReviewLabels, type GeminiReviewState } from "@/lib/gemini-notion-review-state";
import type { GeminiDirectoryDraft } from "@/lib/gemini-notion-directory-review";
import type { GeminiAgendaDraft } from "@/lib/gemini-notion-agenda-review";
import styles from "./admin-gemini-all-concepts.module.css";

type Draft = GeminiDirectoryDraft | GeminiAgendaDraft;
type Entry = { item: GeminiCatalogItem; draft: Draft };
const keys = geminiAutomationCatalog.map((item) => item.stableKey);

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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState<GeminiReviewState | "ALL">("ALL");

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
            setLoaded(previous => ({ ...previous, [key]: data.drafts! }));
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
  const visible = useMemo(() => all.filter(({ item, draft }) =>
    (category === "ALL" || item.stableKey === category) &&
    (status === "ALL" || draft.reviewState === status) &&
    (geminiConceptMatchesSearch(draft, search) ||
      geminiConceptMatchesSearch({ name: item.label }, search))
  ).sort((left, right) =>
    (Date.parse(right.draft.lastEditedAt) || 0) -
    (Date.parse(left.draft.lastEditedAt) || 0)
  ), [all, category, status, search]);

  function reload() {
    setLoaded({});
    setErrors({});
    setRevision(current => current + 1);
  }

  function renderRow({ item, draft }: Entry) {
    // A canonical editor link is only possible after the existing D1 mapping
    // confirms the identity. Others must go through their existing Gemini
    // category manager instead of an unverified or guessed admin URL.
    const canonicalUrl = geminiCanonicalEditorUrl(draft);
    const categoryUrl = "/admin/automatizacie-gemini?stable_key=" +
      encodeURIComponent(item.stableKey) + "#gemini-drafts-title";
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
        <Link className={styles.open} href={canonicalUrl ?? categoryUrl}>
          {canonicalUrl ? "Upraviť v sekcii →" : "Otvoriť v kategórii →"}
        </Link>
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
          <strong>{all.length}</strong>
          <span>{complete && !Object.keys(errors).length ? "Načítaných konceptov" : "Zatiaľ načítaných konceptov"}</span>
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
            <option value="ALL">Všetky stavy</option>
            {Object.entries(geminiReviewLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.reload} onClick={reload}
          disabled={!complete}>↻ Obnoviť</button>
      </div>

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
      <p className={styles.footnote}>Koncepty a ich stavy sa iba čítajú. Úpravy prebiehajú v existujúcich editoroch kategórií alebo kanonických profilov; táto stránka nič nepublikuje.</p>
    </div>
  );
}
