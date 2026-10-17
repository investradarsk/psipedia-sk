"use client";

import { useEffect, useRef, useState } from "react";
import type { ManagedDirectoryProfile } from "@/lib/directory";
import type { GeminiDirectoryDraft } from "@/lib/gemini-notion-directory-review";
import type { GeminiAgendaDraft } from "@/lib/gemini-notion-agenda-review";
import { geminiReviewLabels, geminiReviewCounts, type GeminiReviewState } from "@/lib/gemini-notion-review-state";
import { geminiCanonicalEditorUrl, geminiCanRejectConcept, geminiConceptDate, geminiSupportsRejectionReason } from "@/lib/gemini-concept-manager";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { AdminDirectoryEditor } from "@/components/admin-directory-editor";
import { AdminGeminiAgendaDraftEditor } from "@/components/admin-gemini-agenda-draft-editor";
import { AdminModalDialog } from "@/components/admin-interaction-system";
import styles from "./admin-gemini-notion-drafts.module.css";

type ReviewDraft = GeminiDirectoryDraft | GeminiAgendaDraft;
const REVIEWABLE = ["NEW", "IN_PROGRESS", "APPROVED", "IMPORTED"];

function draftApi(id: string, stableKey: string) {
  const base = "/api/admin/gemini-automation/notion-drafts/" + encodeURIComponent(id);
  return stableKey.startsWith("directory.") ? base : base + "?stable_key=" + encodeURIComponent(stableKey);
}

function reviewDescription(draft: ReviewDraft) {
  if (draft.reviewState === "APPROVED") return "Čaká na synchronizáciu";
  if (draft.reviewState === "IMPORTED") return "Canonical D1 koncept";
  return geminiReviewLabels[draft.reviewState];
}

// A keyed boundary prevents a response for category A from ever mutating the
// visible concept manager for category B, without effect-driven state resets.
export function AdminGeminiNotionDrafts({ stableKey }: { stableKey: string }) {
  return <AdminGeminiNotionDraftsForKey key={stableKey} stableKey={stableKey} />;
}

function AdminGeminiNotionDraftsForKey({ stableKey }: { stableKey: string }) {
  const [filter, setFilter] = useState<GeminiReviewState | "ACTIVE" | "ALL">("ACTIVE");
  const [canonicalProfile, setCanonicalProfile] = useState<ManagedDirectoryProfile | null>(null);
  const [opening, setOpening] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDraft, setSelectedDraft] = useState<ReviewDraft | null>(null);
  const dirtyRef = useRef(false);
  const editorSurfaceRef = useRef<HTMLDivElement>(null);
  const [rejectTarget, setRejectTarget] = useState<ReviewDraft | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const loadRevision = useRef(0);
  const [loadedCategory, setLoadedCategory] = useState<string | null>(null);

  const category = getGeminiCatalogItem(stableKey)?.label ?? stableKey;
  const currentDrafts = loadedCategory === stableKey ? drafts : [];
  const counts = geminiReviewCounts(currentDrafts);
  const visible = currentDrafts.filter(draft => filter === "ALL" ||
    (filter === "ACTIVE" ? REVIEWABLE.includes(draft.reviewState) : draft.reviewState === filter));

  function markDirty() {
    // Do not rerender a mounted canonical editor on each input event:
    // its own controlled textarea values and confirmation state own the edit.
    dirtyRef.current = true;
    editorSurfaceRef.current?.setAttribute("data-dirty", "true");
  }
  function clearDirty() {
    dirtyRef.current = false;
    editorSurfaceRef.current?.removeAttribute("data-dirty");
  }
  useEffect(() => {
    if (!selectedDraft) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [selectedDraft]);

  async function load() {
    // A completed review/save must always refresh; an older response must
    // never overwrite the state returned by the newest request.
    const revision = ++loadRevision.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/gemini-automation/notion-drafts?stable_key=" + encodeURIComponent(stableKey),
        { credentials: "same-origin", cache: "no-store" },
      );
      const json = await response.json() as { drafts?: ReviewDraft[]; error?: string };
      if (!response.ok || !Array.isArray(json.drafts)) {
        throw Error(json.error || "Nepodarilo sa načítať koncepty.");
      }
      if (revision === loadRevision.current) {
        setDrafts(json.drafts);
        setLoadedCategory(stableKey);
        setLoaded(true);
      }
    } catch (cause) {
      if (revision === loadRevision.current) {
        setError(cause instanceof Error ? cause.message : "Nepodarilo sa načítať koncepty.");
      }
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  }

  async function openDraft(draft: ReviewDraft) {
    if (opening) return;
    setOpening(true);
    setError("");
    try {
      const response = await fetch(draftApi(draft.id, stableKey),
        { credentials: "same-origin", cache: "no-store" });
      const data = await response.json() as { draft?: ReviewDraft; error?: string };
      if (!response.ok || !data.draft) throw Error(data.error || "Koncept sa nepodarilo otvoriť.");
      
      // Imported agenda items must use the canonical page, not a second editor.
      // Never fall back to editable Notion-only mode when an import is known.
      if ("agenda" in data.draft && data.draft.psipediaId) {
        setError("Koncept bol importovaný do D1. Obnov zoznam a otvor overený canonical editor v príslušnej sekcii.");
        void load();
        return;
      }

      // Directory reuses its canonical editor; non-directory imports use a direct
      // link to the native editor without an unsafe nested admin shell.
      if (geminiCanonicalEditorUrl(data.draft) && !("agenda" in data.draft)) {
        const canonical = await fetch(
          "/api/admin/directory/" + encodeURIComponent(data.draft.psipediaId),
          { credentials: "same-origin", cache: "no-store" },
        );
        const profile = await canonical.json() as { profile?: ManagedDirectoryProfile; error?: string };
        if (!canonical.ok || !profile.profile) throw Error(profile.error || "Profil sa nepodarilo načítať.");
        setCanonicalProfile(profile.profile);
      } else {
        setCanonicalProfile(null);
      }
      clearDirty();
      setSelectedDraft(data.draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Načítanie zlyhalo.");
    } finally {
      setOpening(false);
    }
  }

  function closeEditor(force = false) {
    if (!force && dirtyRef.current && !window.confirm("Koncept obsahuje neuložené zmeny. Naozaj zavrieť editor bez uloženia?")) {
      return;
    }
    setSelectedDraft(null);
    setCanonicalProfile(null);
    clearDirty();
  }

  function saved() {
    closeEditor(true);
    void load();
  }

  async function reject() {
    if (!rejectTarget || rejectBusy || !geminiCanRejectConcept(rejectTarget) ||
        !geminiSupportsRejectionReason(rejectTarget) ||
        ("agenda" in rejectTarget && !rejectTarget.reviewAvailable) || !rejectReason.trim()) return;
    setRejectBusy(true);
    setError("");
    try {
      const response = await fetch(draftApi(rejectTarget.id, stableKey), {
        method: "PATCH", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reject", confirm: true, lastEditedAt: rejectTarget.lastEditedAt,
          reason: rejectReason.trim(),
        }),
      });
      const data = await response.json() as { draft?: ReviewDraft; error?: string };
      if (!response.ok || !data.draft) throw Error(data.error || "Koncept sa nepodarilo odmietnuť.");
      setRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Odmietnutie zlyhalo. Obnov stav konceptu.");
      // Keep the confirmation open so the error and typed reason aren't lost.
    } finally {
      setRejectBusy(false);
    }
  }

  const canonicalUrl = selectedDraft ? geminiCanonicalEditorUrl(selectedDraft) : null;

  return (
    <section className={styles.manager} aria-label="Koncepty vytvorené automatizáciou">
      <div className={styles.header}>
        <button type="button" className={styles.headerToggle} aria-expanded={expanded}
          onClick={() => { const next = !expanded; setExpanded(next); if (next && !loaded) void load(); }}>
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          Koncepty z automatizácie
          {loadedCategory === stableKey && <span aria-label={currentDrafts.length + " konceptov"}>({currentDrafts.length})</span>}
        </button>
        {expanded && (
          <div className={styles.headerActions}>
            <button type="button" className={styles.refresh} disabled={loading}
              onClick={() => void load()}>{loading ? "Načítavam…" : "↻ Obnoviť"}</button>
          </div>
        )}
      </div>

      {expanded && (
        <div className={styles.body}>
          {loading && !loaded && <p className={styles.note} role="status">Načítavam aktuálne koncepty z Notionu…</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {loadedCategory === stableKey && !currentDrafts.length && <p className={styles.note}>V kategórii {category} zatiaľ nie sú koncepty Gemini.</p>}
          {loadedCategory === stableKey && currentDrafts.length > 0 && (
            <>
              <p className={styles.stats}>
                {Object.entries(geminiReviewLabels).map(([key, label]) =>
                  label + ": " + counts[key as GeminiReviewState]).join(" · ")}
              </p>
              <label className={styles.filter}>
                Stav konceptu
                <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
                  <option value="ACTIVE">Aktívne koncepty</option>
                  <option value="ALL">Všetky stavy</option>
                  {Object.entries(geminiReviewLabels).map(([key, label]) =>
                    <option key={key} value={key}>{label} ({counts[key as GeminiReviewState]})</option>)}
                </select>
              </label>
              {!visible.length && <p className={styles.note}>Tomuto filtru nezodpovedá žiadny koncept.</p>}
              <ul className={styles.list}>
                {visible.map(draft => {
                  const editorUrl = geminiCanonicalEditorUrl(draft);
                  const reasonSupported = geminiSupportsRejectionReason(draft) &&
                    (!("agenda" in draft) || draft.reviewAvailable);
                  const canReject = geminiCanRejectConcept(draft);
                  const agendaImported = "agenda" in draft && Boolean(draft.psipediaId);
                  const mappingUnknown = Boolean(draft.psipediaId) && !editorUrl;
                  return (
                    <li className={styles.item} key={draft.id}>
                      <div className={styles.summary}>
                        <strong className={styles.name}>{draft.name || "Nepomenovaný koncept"}</strong>
                        <div className={styles.meta}>
                          <span>{category}</span>
                          {draft.city && <span>{draft.city}</span>}
                          <span>Upravené {geminiConceptDate(draft.lastEditedAt)}</span>
                        </div>
                        <span className={styles.status + " " + (styles["status_" + draft.reviewState.toLowerCase()] ?? "")}>
                          {reviewDescription(draft)}
                        </span>
                        {draft.reviewState === "REJECTED" &&
                          <span className={styles.availability}>Dôvod: {draft.rejectionReason || "Bez uvedenia dôvodu"}</span>}
                        {draft.reviewState === "APPROVED" && draft.syncError &&
                          <span role="status" className={styles.error}>Synchronizácia: {draft.syncError}</span>}
                        {draft.geminiNote && (
                          <aside className={styles.extra} aria-label="Gemini poznámka">
                            <strong>Gemini poznámka</strong>
                            <p>{draft.geminiNote}</p>
                          </aside>
                        )}
                        {!editorUrl && <span className={styles.availability}>{draft.psipediaId ? "D1 identita zatiaľ nepotvrdená – odkaz je pozastavený" : "Zatiaľ iba koncept v Notione"}</span>}
                        {canReject && !reasonSupported &&
                          <span className={styles.availability}>
                            Dôvod odmietnutia sa pre tento typ zatiaľ neukladá. Dostupné je existujúce odmietnutie v editore.
                          </span>}
                      </div>
                      <div className={styles.actions}>
                        {agendaImported ? (editorUrl ? (
                          <a className={styles.primary} href={editorUrl}>Upraviť v sekcii →</a>
                        ) : <span role="status" className={styles.availability}>D1 mapovanie nie je potvrdené — úprava zablokovaná</span>) : mappingUnknown ? (
                          <span role="status" className={styles.availability}>Bez overenej D1 identity nie je možné bezpečne upravovať</span>
                        ) : (
                          <button type="button" className={styles.primary} aria-label="Otvoriť editor"
                            disabled={opening} onClick={() => void openDraft(draft)}>
                            {opening ? "Otváram…" : "Upraviť"}
                          </button>
                        )}
                        {editorUrl && !agendaImported && <a className={styles.actionLink} href={editorUrl}>Otvoriť v sekcii ↗</a>}
                        {canReject && reasonSupported &&
                          <button type="button" className={styles.destructive}
                            onClick={() => { setRejectReason(""); setRejectTarget(draft); setError(""); }}>
                            Odmietnuť
                          </button>}

                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className={styles.note}>
                Kôš zatiaľ nie je aktivovaný. Existujúce trvalé mazanie D1 konceptov nie je bezpečná náhrada za obnovenie.
              </p>
            </>
          )}
        </div>
      )}

      <AdminModalDialog
        open={Boolean(selectedDraft)}
        title={selectedDraft ? "Upraviť koncept – " + selectedDraft.name : "Gemini koncept"}
        description="Uloženie a publikovanie sú samostatné akcie. Pred publikovaním vždy skontroluj stav záznamu."
        onClose={() => closeEditor()}
        className={styles.editorDialog}
      >
        <div ref={editorSurfaceRef} className={styles.editorSurface}
          onInputCapture={markDirty} onChangeCapture={markDirty}>
          {selectedDraft && <p role="status" className={styles.dirtyWarning}>Máš rozpracované úpravy. Pred zatvorením ich ulož.</p>}
          {selectedDraft && !canonicalUrl &&
            <p className={styles.dialogLead}>Notion koncept nemá overenú canonical D1 identitu. Úpravy zostávajú neverejné do výslovného schválenia.</p>}
          {selectedDraft?.geminiNote &&
            <aside className={styles.extra} aria-label="Gemini poznámka">
              <strong>Gemini poznámka</strong><p>{selectedDraft.geminiNote}</p>
            </aside>}
          {selectedDraft && "agenda" in selectedDraft ? (
            <AdminGeminiAgendaDraftEditor key={selectedDraft.id} draft={selectedDraft} onSaved={saved} />
          ) : selectedDraft ? (
            <AdminDirectoryEditor key={selectedDraft.id} profile={canonicalProfile ?? undefined}
              notionDraft={canonicalProfile ? undefined : selectedDraft} onNotionSaved={saved} />
          ) : null}
        </div>
      </AdminModalDialog>

      <AdminModalDialog open={Boolean(rejectTarget)} title="Odmietnuť Gemini koncept?"
        description="Odmietnutie nevymaže koncept a zachová evidenciu na zabránenie duplicít."
        onClose={() => { if (!rejectBusy) setRejectTarget(null); }}>
        <div className={styles.rejectForm}>
          <p><strong>{rejectTarget?.name}</strong> nebude schválený na publikovanie.
            Ak už existuje kanonický profil, tento postup nie je povolený.</p>
          <label>Dôvod odmietnutia (povinný)
            <textarea maxLength={1000} value={rejectReason} disabled={rejectBusy}
              onChange={event => setRejectReason(event.target.value)} />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.rejectActions}>
            <button type="button" className={styles.destructive} disabled={rejectBusy || !rejectReason.trim()}
              onClick={() => void reject()}>{rejectBusy ? "Spracúvam…" : "Áno, odmietnuť"}</button>
            <button type="button" className={styles.secondary} disabled={rejectBusy}
              onClick={() => setRejectTarget(null)}>Zrušiť</button>
          </div>
        </div>
      </AdminModalDialog>
    </section>
  );
}
