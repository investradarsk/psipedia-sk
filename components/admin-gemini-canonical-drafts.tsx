"use client";

import { useEffect, useState } from "react";
import { geminiCanonicalEditorUrl, geminiValidNotionDraftId, geminiConceptDate } from "@/lib/gemini-concept-manager";
import { geminiReviewLabels, type GeminiReviewState } from "@/lib/gemini-notion-review-state";
import styles from "./admin-gemini-notion-drafts.module.css";

type Row = {
  id: string; name: string; city?: string; reviewState: GeminiReviewState;
  psipediaId: string; canonicalVerified?: boolean; agenda?: "events" | "organizations" |
    "adoptions" | "help-cases" | "lost-found"; lastEditedAt: string; syncError?: string;
};

/** The category dashboard never renders a second Gemini content editor.
 * It links only to verified canonical D1 identities. Unimported Notion records
 * remain visible with a truthful pending status, without write side effects. */
export function AdminGeminiCanonicalDrafts({ stableKey, deepLinkDraftId }: {
  stableKey: string; deepLinkDraftId?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
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
              setDetail("Koncept je uložený v Notione a čaká na automatický prenos do administrácie. Skontroluj Sync chybu a obnov zoznam.");
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
  }, [stableKey, deepLinkDraftId, revision]);

  return <div className={styles.manager}>
    <div className={styles.header}>
      <strong>Koncepty kategórie</strong>
      <button className={styles.refresh} type="button" onClick={() => setRevision(n => n + 1)}
        disabled={loading}>Obnoviť</button>
    </div>
    {loading && <p className={styles.note} role="status">Načítavam koncepty…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {detail && <p className={styles.note} role="status">{detail}</p>}
    {!loading && !error && rows.length === 0 && <p className={styles.note}>Žiadne koncepty v tejto kategórii.</p>}
    <ul className={styles.list}>
      {rows.map(row => {
        const nativeUrl = geminiCanonicalEditorUrl(row);
        return <li className={styles.item} key={row.id}>
          <div className={styles.summary}>
            <strong className={styles.name}>{row.name || "Nepomenovaný koncept"}</strong>
            <span className={styles.meta}>{row.city ? row.city + " · " : ""}
              Upravené {geminiConceptDate(row.lastEditedAt)}</span>
            <span className={styles.status + " " + (styles["status_" + row.reviewState.toLowerCase()] ?? "")}>
              {geminiReviewLabels[row.reviewState]}</span>
            {row.syncError && <span className={styles.error}>Synchronizácia: {row.syncError}</span>}
          </div>
          <div className={styles.actions}>
            {nativeUrl ? <a className={styles.primary} href={nativeUrl}>Otvoriť editor →</a>
              : <span className={styles.availability}>Čaká na automatický prenos do D1</span>}
          </div>
        </li>;
      })}
    </ul>
  </div>;
}
