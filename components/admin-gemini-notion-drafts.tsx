"use client";

import { useState } from "react";
import Link from "next/link";
import type { GeminiDirectoryDraft } from "@/lib/gemini-notion-directory-review";
import styles from "./admin-gemini-automation.module.css";

export function AdminGeminiNotionDrafts({ stableKey }: { stableKey: string }) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<GeminiDirectoryDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/gemini-automation/notion-drafts?stable_key=" + encodeURIComponent(stableKey),
        { credentials: "same-origin", cache: "no-store" },
      );
      const json = await response.json() as { drafts?: GeminiDirectoryDraft[]; error?: string };
      if (!response.ok || !Array.isArray(json.drafts)) {
        throw new Error(json.error || "Nepodarilo sa načítať koncepty.");
      }
      setDrafts(json.drafts);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nepodarilo sa načítať koncepty.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.notionDrafts} aria-label="Koncepty vytvorené automatizáciou">
      <div className={styles.notionDraftsHeader}>
        <button type="button" aria-expanded={open} onClick={() => {
          const shouldOpen = !open;
          setOpen(shouldOpen);
          if (shouldOpen && !loaded) void load();
        }}>
          {open ? "▾" : "▸"} Koncepty z automatizácie
        </button>
        {open && <button type="button" disabled={loading} onClick={() => void load()}>
          {loading ? "Načítavam…" : "Obnoviť"}
        </button>}
      </div>
      {open && (
        <div className={styles.notionDraftsBody}>
          {loading && !loaded && <p role="status">Načítavam aktuálne koncepty z Notionu…</p>}
          {error && <p role="alert" className={styles.notionDraftsError}>{error}</p>}
          {loaded && !drafts.length && <p>V tejto kategórii zatiaľ nie sú nové koncepty Gemini na kontrolu.</p>}
          {loaded && drafts.length > 0 && (
            <>
              <p>{drafts.length} konceptov · aktuálne údaje priamo z Notionu</p>
              <ul className={styles.notionDraftList}>
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <div>
                      <strong>{draft.name}</strong>
                      <span>{[draft.city, draft.editorialState === "Publikované"
                        ? "Čaká na synchronizáciu" : "Na kontrolu"].filter(Boolean).join(" · ")}</span>
                    </div>
                    <Link href={"/admin/automatizacie-gemini/notion-koncepty/" + draft.id}>
                      Otvoriť →
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
