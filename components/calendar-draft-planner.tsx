"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ManagedArticle, ManagedArticleSummary } from "@/lib/article-store";
import { parseArticleLocalDateTime } from "@/lib/article-schedule-time";
import { ArticleBlocks } from "@/components/article-blocks";
import { EditorialRichText } from "@/components/editorial-rich-text";
import styles from "./admin-editorial-calendar.module.css";

type DraftListResponse = {
  articles?: ManagedArticleSummary[];
  pagination?: { totalPages: number };
  error?: string;
};
type DraftDetailResponse = { article?: ManagedArticle; error?: string };
type Props = {
  day: string;
  initialDraftId?: number;
  initialTime?: string;
  onClose: () => void;
  onScheduled: (title: string) => void;
};

export function CalendarDraftPlanner({ day, initialDraftId, initialTime = "09:00", onClose, onScheduled }: Props) {
  const [step, setStep] = useState<"pick" | "review">(initialDraftId ? "review" : "pick");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<ManagedArticleSummary[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initialDraftId ?? null);
  const [selectedArticle, setSelectedArticle] = useState<ManagedArticle | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState(day);
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const dialog = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const searchField = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step !== "pick") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingList(true);
      setListError("");
      setDrafts([]);
      try {
        const url = "/api/admin/articles?status=draft&limit=20&page=" + page + "&query=" + encodeURIComponent(search.trim());
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const result = await response.json() as DraftListResponse;
        if (!response.ok || !Array.isArray(result.articles)) throw new Error(result.error || "Koncepty sa nepodarilo načítať.");
        if (controller.signal.aborted) return;
        setDrafts(result.articles.filter((item) => item.status === "draft"));
        setTotalPages(Math.max(1, result.pagination?.totalPages ?? 1));
      } catch (error) {
        if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : "Koncepty sa nepodarilo načítať.");
      } finally {
        if (!controller.signal.aborted) setLoadingList(false);
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [step, page, search, reloadKey]);

  useEffect(() => {
    if (step !== "review" || selectedId === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSelectedArticle(null);
      setDetailError("");
      setLoadingArticle(true);
      void (async () => {
      try {
        const response = await fetch("/api/admin/articles/" + selectedId, { signal: controller.signal, cache: "no-store" });
        const result = await response.json() as DraftDetailResponse;
        if (!response.ok || !result.article) throw new Error(result.error || "Koncept sa nepodarilo načítať.");
        if (!controller.signal.aborted) setSelectedArticle(result.article);
      } catch (error) {
        if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "Koncept sa nepodarilo načítať.");
      } finally {
        if (!controller.signal.aborted) setLoadingArticle(false);
      }
      })();
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [step, selectedId, reloadKey]);

  function backToPicker() {
    if (saving) return;
    setStep("pick");
    setSelectedId(null);
    setSelectedArticle(null);
    setDetailError("");
    setPage(1);
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    heading.current?.focus();

    const focusables = () => Array.from(element.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter((item) => item.getClientRects().length > 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (step === "review") backToPicker();
        else onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusables();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); }
      else if (!elements.includes(document.activeElement as HTMLElement)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) heading.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [step, onClose, saving]);

  // Ensure keyboard users land on the heading after switching dialogs.
  useEffect(() => { heading.current?.focus(); }, [step]);

  async function confirmSchedule() {
    if (saveLock.current || saving || !selectedArticle || selectedArticle.status !== "draft") return;
    setDetailError("");
    const publishedAt = parseArticleLocalDateTime(selectedDate, selectedTime);
    if (!publishedAt || Date.parse(publishedAt) <= Date.now()) {
      setDetailError("Vyber platný budúci dátum a čas. Termín v minulosti alebo neexistujúci čas nie je možné naplánovať.");
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/articles/" + selectedArticle.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publishedAt, expectedUpdatedAt: selectedArticle.updatedAt }),
      });
      const result = await response.json() as DraftDetailResponse;
      if (!response.ok || !result.article) throw new Error(result.error || "Naplánovanie sa nepodarilo.");
      if (result.article.status !== "scheduled") throw new Error("Server nepotvrdil naplánovanie článku.");
      onScheduled(result.article.title);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Naplánovanie sa nepodarilo.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function selectDraft(id: number) {
    setSelectedId(id);
    setStep("review");
  }

  const editHref = selectedArticle
    ? "/admin/clanky/" + selectedArticle.id + "?calendarDay=" + encodeURIComponent(selectedDate) + "&calendarTime=" + encodeURIComponent(selectedTime)
    : "";
  const formattedDate = new Intl.DateTimeFormat("sk-SK", { dateStyle: "full" }).format(new Date(day + "T12:00:00"));

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.modalBackdrop}>
      <section ref={dialog} className={styles.articleDetail} role="dialog" aria-modal="true"
        aria-labelledby="calendar-draft-planner-title" data-testid="calendar-draft-planner">
        <div className={styles.detailHeading}>
          <h3 ref={heading} tabIndex={-1} id="calendar-draft-planner-title">
            {step === "pick" ? "Pridať koncept – " + formattedDate : "Skontrolovať koncept"}
          </h3>
          <button type="button" onClick={onClose} disabled={saving}>Zavrieť</button>
        </div>

        {step === "pick" && <>
          <label className={styles.draftSearch}>Hľadať medzi konceptmi
            <input ref={searchField} type="search" value={search} autoComplete="off"
              placeholder="Názov alebo kľúčové slovo"
              onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          </label>
          {loadingList && <p role="status">Načítavam koncepty…</p>}
          {listError && <p role="alert" className={styles.error}>{listError} <button type="button" onClick={() => setReloadKey((n) => n + 1)}>Skúsiť znova</button></p>}
          {!loadingList && !listError && drafts.length === 0 && <p>Žiadne dostupné koncepty. Môžeš vytvoriť nový článok v redakcii.</p>}
          <div className={styles.draftList}>
            {!loadingList && drafts.map((draft) => (
              <button className={styles.draftOption} key={draft.id} type="button" onClick={() => selectDraft(draft.id)}>
                <strong>{draft.title}</strong><span>{draft.portalSection} · {draft.category}</span>
              </button>
            ))}
          </div>
          {totalPages > 1 && <nav className={styles.draftPagination} aria-label="Stránky konceptov">
            <button type="button" disabled={loadingList || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Predchádzajúce</button>
            <span>Strana {page} / {totalPages}</span>
            <button type="button" disabled={loadingList || page >= totalPages} onClick={() => setPage((p) => p + 1)}>Ďalšie</button>
          </nav>}
        </>}

        {step === "review" && <>
          <div className={styles.draftActions}>
            <button type="button" onClick={backToPicker} disabled={saving}>← Späť ku konceptom</button>
          </div>
          {loadingArticle && <p role="status">Načítavam celý článok…</p>}
          {detailError && <p role="alert" className={styles.error}>{detailError}{" "}
            <button type="button" onClick={() => setReloadKey((n) => n + 1)} disabled={saving}>Obnoviť náhľad</button>
          </p>}
          {selectedArticle && <>
            <div className={styles.draftPreview}>
              <h3>{selectedArticle.title}</h3>
              <p><strong>Stav:</strong> {selectedArticle.status === "draft" ? "Koncept" : "Článok už nie je koncept – plánovanie nie je dostupné."}</p>
              <p><strong>Sekcia:</strong> {selectedArticle.portalSection} · {selectedArticle.category}</p>
              <p><strong>Autor:</strong> {selectedArticle.author}</p>
              <p><strong>Perex:</strong> {selectedArticle.excerpt}</p>
              {selectedArticle.image && <img src={selectedArticle.image} alt={selectedArticle.imageAlt || selectedArticle.title} />}
              <h4>Úvod článku</h4>
              <EditorialRichText document={selectedArticle.introRichText} />
              <h4>Obsah článku</h4>
              <ArticleBlocks blocks={selectedArticle.blocks} />
              <h4>Záver článku</h4>
              <EditorialRichText document={selectedArticle.takeawayRichText} />
              <h4>SEO údaje</h4>
              <dl>
                <dt>SEO titulok</dt><dd>{selectedArticle.seo?.title || "Nevyplnené"}</dd>
                <dt>Meta popis</dt><dd>{selectedArticle.seo?.description || "Nevyplnené"}</dd>
                <dt>Hlavné kľúčové slovo</dt><dd>{selectedArticle.seo?.focusKeyword || "Nevyplnené"}</dd>
              </dl>
            </div>
            {selectedArticle.status === "draft" && <>
              <form className={styles.scheduleForm} onSubmit={(event) => { event.preventDefault(); void confirmSchedule(); }}>
                <div className={styles.scheduleFields}>
                  <label>Dátum publikovania
                    <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} required disabled={saving} />
                  </label>
                  <label>Čas publikovania
                    <input type="time" value={selectedTime} onChange={(event) => setSelectedTime(event.target.value)} required disabled={saving} />
                  </label>
                </div>
                <p className={styles.timezoneHint}>Čas sa zadáva v miestnom časovom pásme prehliadača. Publikovanie sa vykoná až po potvrdení.</p>
                <div className={styles.draftActions}>
                  <Link href={editHref}>Upraviť koncept</Link>
                  <button className={styles.save} type="submit" disabled={saving}>
                    {saving ? "Plánujem…" : "Potvrdiť plánovanie"}
                  </button>
                </div>
              </form>
            </>}
          </>}
        </>}
      </section>
    </div>,
    document.body,
  );
}
