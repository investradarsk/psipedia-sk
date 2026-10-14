"use client";

import { geminiReviewLabels, geminiReviewCounts, type GeminiReviewState } from "@/lib/gemini-notion-review-state";
import type { ManagedDirectoryProfile } from "@/lib/directory";
import { useState } from "react";
import { AdminDirectoryEditor } from "@/components/admin-directory-editor";
import { AdminModalDialog } from "@/components/admin-interaction-system";
import type { GeminiDirectoryDraft } from "@/lib/gemini-notion-directory-review";
import type { GeminiAgendaDraft } from "@/lib/gemini-notion-agenda-review";
import { AdminGeminiAgendaDraftEditor } from "@/components/admin-gemini-agenda-draft-editor";
type ReviewDraft = GeminiDirectoryDraft | GeminiAgendaDraft;
import styles from "./admin-gemini-automation.module.css";

export function AdminGeminiNotionDrafts({ stableKey }: { stableKey: string }) {
  const [filter, setFilter] = useState<GeminiReviewState | "ACTIVE" | "ALL">("ACTIVE");
  const [canonicalProfile, setCanonicalProfile] = useState<ManagedDirectoryProfile | null>(null);
  const [opening, setOpening] = useState(false);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDraft, setSelectedDraft] = useState<ReviewDraft | null>(null);

  async function load() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/gemini-automation/notion-drafts?stable_key=" + encodeURIComponent(stableKey),
        { credentials: "same-origin", cache: "no-store" },
      );
      const json = await response.json() as { drafts?: ReviewDraft[]; error?: string };
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

  const counts = geminiReviewCounts(drafts);
  const visible = drafts.filter(draft => filter === "ALL" || (filter === "ACTIVE"
    ? ["NEW", "IN_PROGRESS", "APPROVED"].includes(draft.reviewState) : draft.reviewState === filter));
  async function openDraft(draft: ReviewDraft) {
    if (opening) return;
    setOpening(true); setError("");
    try {
      const response = await fetch("/api/admin/gemini-automation/notion-drafts/" + encodeURIComponent(draft.id) + "?stable_key=" + encodeURIComponent(stableKey), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.draft) throw new Error(data.error || "Koncept sa nepodarilo otvoriť.");
      if (data.draft.psipediaId && !("agenda" in data.draft)) {
        const canonical = await fetch("/api/admin/directory/" + encodeURIComponent(data.draft.psipediaId), { cache: "no-store" });
        const profile = await canonical.json();
        if (!canonical.ok || !profile.profile) throw new Error(profile.error || "Profil sa nepodarilo načítať.");
        setCanonicalProfile(profile.profile);
      } else setCanonicalProfile(null);
      setSelectedDraft(data.draft);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Načítanie zlyhalo."); }
    finally { setOpening(false); }
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
              <p>{Object.entries(geminiReviewLabels).map(([key, label]) => `${label}: ${counts[key as GeminiReviewState]}`).join(" · ")}</p>
              <label>Stav konceptu <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
                <option value="ACTIVE">Aktívne koncepty</option><option value="ALL">Všetky</option>
                {Object.entries(geminiReviewLabels).map(([key, label]) => <option key={key} value={key}>{label} ({counts[key as GeminiReviewState]})</option>)}
              </select></label>
              {!visible.length && <p>Tomuto filtru nezodpovedá žiadny koncept.</p>}
              <ul className={styles.notionDraftList}>
                {visible.map((draft) => (
                  <li key={draft.id}>
                    <div>
                      <strong>{draft.name}</strong>
                      <span>{[draft.city, geminiReviewLabels[draft.reviewState], draft.reviewState === "APPROVED" ? "Čaká na synchronizáciu" : ""].filter(Boolean).join(" · ")}</span>
                      {draft.reviewState === "APPROVED" && draft.syncError && <span role="status">Synchronizácia: {draft.syncError}</span>}
                      {draft.reviewState === "REJECTED" && <span>Dôvod: {draft.rejectionReason || "Bez uvedenia dôvodu"}</span>}
                    </div>
                    <button type="button" className={styles.notionOpenDraft} disabled={opening} onClick={() => void openDraft(draft)}>
                      Otvoriť editor →
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <AdminModalDialog
        open={Boolean(selectedDraft)}
        title={selectedDraft ? "Skontrolovať koncept · " + selectedDraft.name : "Koncept Gemini"}
        description="Úpravy sa zapisujú iba do pôvodnej Notion stránky. Publikovanie vyžaduje samostatné potvrdenie."
        onClose={() => setSelectedDraft(null)}
        className={styles.notionEditorDialog}
      >
        {selectedDraft && ("agenda" in selectedDraft ? (
          <AdminGeminiAgendaDraftEditor
            key={selectedDraft.id}
            draft={selectedDraft}
            onSaved={() => { setSelectedDraft(null); void load(); }}
          />
        ) : (
          <AdminDirectoryEditor
            key={selectedDraft.id}
            profile={canonicalProfile ?? undefined}
            notionDraft={canonicalProfile ? undefined : selectedDraft}
            onNotionSaved={() => { setSelectedDraft(null); void load(); }}
          />
        ))}
      </AdminModalDialog>
    </section>
  );
}
