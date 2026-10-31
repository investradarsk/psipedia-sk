"use client";

import { useEffect, useMemo, useState } from "react";
import {
  geminiCanonicalEditorUrl, geminiValidNotionDraftId,
  geminiConceptDate, geminiConceptMatchesSearch,
} from "@/lib/gemini-concept-manager";
import {
  geminiReviewLabels, geminiActiveReviewState, type GeminiReviewState,
} from "@/lib/gemini-notion-review-state";
import styles from "./admin-gemini-notion-drafts.module.css";

type Row = {
  id: string; name: string; city?: string; reviewState: GeminiReviewState;
  psipediaId: string; canonicalVerified?: boolean; agenda?: "events" | "organizations" |
    "adoptions" | "help-cases" | "lost-found"; lastEditedAt: string; syncError?: string;
};

/** Read-only Gemini concept list: native editor only when the existing
 * Notion→D1 mapping is confirmed. No duplicate editor, no mutations. */
export function AdminGeminiCanonicalDrafts({ stableKey, deepLinkDraftId }: {
  stableKey: string; deepLinkDraftId?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [expanded, setExpanded] = useState(Boolean(deepLinkDraftId));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<GeminiReviewState | "ACTIVE" | "ALL">("ACTIVE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!expanded && !deepLinkDraftId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setDetail("");
      try {
        const response = await fetch(
          "/api/admin/gemini-automation/notion-drafts?stable_key=" + encodeURIComponent(stableKey),
          { credentials: "same-origin", cache: "no-store", signal: controller.signal },
        );
        const json = await response.json() as { drafts?: Row[]; error?: string };
        if (!response.ok || !Array.isArray(json.drafts))
          throw Error(json.error || "Koncepty sa nepodarilo načítať.");
        if (controller.signal.aborted) return;
        setRows(json.drafts);
        if (deepLinkDraftId) {
          if (!geminiValidNotionDraftId(deepLinkDraftId)) {
            setError("Neplatná identita konceptu.");
          } else {
            const normalize = (id: string) => id.replaceAll("-", "").toLowerCase();
            const draft = json.drafts.find(row => normalize(row.id) === normalize(deepLinkDraftId));
            if (!draft) setError("Požadovaný koncept sa v tejto kategórii nenašiel.");
            else {
              const editor = geminiCanonicalEditorUrl(draft);
              if (editor) { window.location.assign(editor); return; }
              setDetail("Koncept čaká na automatický prenos do administrácie. Nie je potrebné ručne schvaľovať import.");
            }
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Načítanie zlyhalo.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [stableKey, deepLinkDraftId, expanded, revision]);

  const visible = useMemo(() => rows.filter(row =>
    (filter === "ALL" || (filter === "ACTIVE"
      ? geminiActiveReviewState(row.reviewState) : row.reviewState === filter)) &&
    geminiConceptMatchesSearch(row, search)
  ), [rows, filter, search]);

  return <section className={styles.manager} aria-label="Koncepty vytvorené automatizáciou">
    <div className={styles.header}>
      <button type="button" className={styles.headerToggle}
        aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span> Koncepty z automatizácie
      </button>
      {expanded && <button className={styles.refresh} type="button"
        onClick={() => setRevision(n => n + 1)} disabled={loading}>Obnoviť</button>}
    </div>
    {expanded && <div className={styles.body}>
      <div className={styles.filterBar}>
        <label className={styles.search}>Hľadať koncept v načítaných záznamoch
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <label className={styles.filter}>Stav konceptu
          <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
            <option value="ACTIVE">Aktívne koncepty</option>
            <option value="ALL">Všetky stavy</option>
            {Object.entries(geminiReviewLabels).map(([value, label]) =>
              <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <p className={styles.stats}>Zobrazené {visible.length} z {rows.length} konceptov.</p>
      {loading && <p className={styles.note} role="status">Načítavam koncepty…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {detail && <p className={styles.note} role="status">{detail}</p>}
      {!loading && !error && visible.length === 0 && <p className={styles.note}>
        {search.trim() ? "Žiadny načítaný koncept nezodpovedá hľadanému názvu alebo lokalite a zvolenému stavu."
          : "Tomuto filtru stavu nezodpovedá žiadny načítaný koncept."}
      </p>}
      <ul className={styles.list}>
        {visible.map(row => {
          const nativeUrl = geminiCanonicalEditorUrl(row);
          return <li className={styles.item} key={row.id}>
            <div className={styles.summary}>
              <strong className={styles.name}>{row.name || "Nepomenovaný koncept"}</strong>
              <span className={styles.meta}>{row.city ? row.city + " · " : ""}
                Upravené {geminiConceptDate(row.lastEditedAt)}</span>
              <span className={styles.status + " " + (styles["status_" + row.reviewState.toLowerCase()] ?? "")}>
                {geminiReviewLabels[row.reviewState]}</span>
              {row.syncError && <span className={styles.error}>
                {nativeUrl ? "Upozornenie k synchronizácii (neblokuje úpravu): " : "Prenos ešte nie je dokončený: "}
                {row.syncError}
              </span>}
            </div>
            <div className={styles.actions}>
              {nativeUrl ? <a className={styles.primary} href={nativeUrl}>Otvoriť editor →</a>
                : <span className={styles.availability}>Čaká na automatický prenos do D1</span>}
            </div>
          </li>;
        })}
      </ul>
    </div>}
  </section>;
}
