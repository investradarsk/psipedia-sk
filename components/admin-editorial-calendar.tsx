"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ManagedArticle } from "@/lib/article-store";
import type { EditorialCalendarItem } from "@/lib/editorial-calendar";
import { formatArticleLocalDateTime, parseArticleLocalDateTime } from "@/lib/article-schedule-time";
import styles from "./admin-editorial-calendar.module.css";

const weekdays = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const monthFormat = new Intl.DateTimeFormat("sk-SK", { month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("sk-SK", { dateStyle: "full" });

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthUrl(year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return `/admin/clanky/kalendar?mesiac=${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function statusLabel(status: EditorialCalendarItem["status"] | ManagedArticle["status"]) {
  return status === "published" ? "Publikované" : status === "scheduled" ? "Naplánované" : "Koncept";
}

export function AdminEditorialCalendar({
  year, month, items,
}: { year: number; month: number; items: EditorialCalendarItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "published" | "scheduled">("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<ManagedArticle | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [requestedId, setRequestedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const activeRequest = useRef<AbortController | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const detailHeading = useRef<HTMLHeadingElement | null>(null);
  const saveErrorTarget = useRef<HTMLParagraphElement | null>(null);
  const dateField = useRef<HTMLInputElement | null>(null);
  const saveLock = useRef(false);

  useEffect(() => () => activeRequest.current?.abort(), []);
  const activeArticleId = selectedArticle?.id;
  useEffect(() => {
    if (loadingId !== null || activeArticleId !== undefined || loadError) detailHeading.current?.focus();
  }, [loadingId, activeArticleId, loadError]);
  useEffect(() => {
    if (saveError) saveErrorTarget.current?.focus();
  }, [saveError]);

  const first = new Date(year, month - 1, 1);
  const today = dateKey(new Date());
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;
  const grouped = useMemo(() => {
    const result = new Map<string, EditorialCalendarItem[]>();
    for (const article of items) {
      if (filter !== "all" && article.status !== filter) continue;
      const timestamp = new Date(article.publishedAt);
      if (Number.isNaN(timestamp.getTime())) continue;
      const day = dateKey(timestamp);
      if (!day.startsWith(monthPrefix)) continue;
      result.set(day, [...(result.get(day) ?? []), article]);
    }
    return result;
  }, [items, filter, monthPrefix]);

  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const dayArticles = selectedDay ? grouped.get(selectedDay) ?? [] : [];
  const total = Array.from(grouped.values()).reduce((sum, articles) => sum + articles.length, 0);

  function closeArticle() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoadingId(null);
    setRequestedId(null);
    setSelectedArticle(null);
    setLoadError("");
    setSaveError("");
    setNotice("");
    requestAnimationFrame(() => {
      if (origin.current?.isConnected) origin.current.focus();
      else document.getElementById("editorial-calendar-month-nav")?.querySelector<HTMLElement>("a")?.focus();
    });
  }

  async function openArticle(id: number) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setSelectedArticle(null);
    setLoadError("");
    setSaveError("");
    setNotice("");
    setLoadingId(id);
    setRequestedId(id);
    try {
      const response = await fetch(`/api/admin/articles/${id}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json() as { article?: ManagedArticle; error?: string };
      if (!response.ok || !result.article) throw new Error(result.error || "Detail článku sa nepodarilo načítať.");
      if (controller.signal.aborted) return;
      setSelectedArticle(result.article);
      const local = formatArticleLocalDateTime(result.article.publishedAt);
      setDate(local.slice(0, 10));
      setTime(local.slice(11, 16));
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Detail článku sa nepodarilo načítať.");
    } finally {
      if (!controller.signal.aborted) setLoadingId(null);
    }
  }

  async function saveSchedule() {
    if (saveLock.current || saving || refreshing || selectedArticle?.status !== "scheduled") return;
    setSaveError("");
    setNotice("");
    const publishedAt = parseArticleLocalDateTime(date, time);
    if (!publishedAt) {
      setSaveError("Vyber platný dátum a čas. Neexistujúce časy pri zmene letného času nie je možné naplánovať.");
      dateField.current?.focus();
      return;
    }
    if (new Date(publishedAt).getTime() <= Date.now()) {
      setSaveError("Pre plánované publikovanie vyber budúci dátum a čas.");
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/articles/${selectedArticle.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publishedAt, expectedUpdatedAt: selectedArticle.updatedAt }),
      });
      const result = await response.json() as { article?: ManagedArticle; error?: string };
      if (!response.ok || !result.article) throw new Error(result.error || "Termín sa nepodarilo uložiť.");
      // Treat the server response as canonical. The grid is refreshed from
      // the server rather than optimistically inserting a duplicate entry.
      setSelectedArticle(result.article);
      const local = formatArticleLocalDateTime(result.article.publishedAt);
      setDate(local.slice(0, 10));
      setTime(local.slice(11, 16));
      setNotice(`Termín publikovania bol uložený: ${dateFormat.format(new Date(result.article.publishedAt ?? ""))}, ${timeFormat.format(new Date(result.article.publishedAt ?? ""))}.`);
      startRefresh(() => router.refresh());
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Termín sa nepodarilo uložiť.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function entries(articles: EditorialCalendarItem[]) {
    return articles.map((article) => (
      <button key={article.id} type="button" className={styles.entry}
        aria-expanded={selectedArticle?.id === article.id || loadingId === article.id}
        aria-label={`${article.title}, ${statusLabel(article.status)}, ${timeFormat.format(new Date(article.publishedAt))}`}
        onClick={(event) => {
          origin.current = event.currentTarget;
          void openArticle(article.id);
        }}>
        <span className={article.status === "published" ? styles.published : styles.scheduled} aria-hidden="true" />
        <span className={styles.entryTitle}>{article.title}</span>
        <time dateTime={article.publishedAt}>{timeFormat.format(new Date(article.publishedAt))}</time>
        <span className={styles.srOnly}>{statusLabel(article.status)}</span>
      </button>
    ));
  }

  const scheduledMonth = selectedArticle?.publishedAt ? new Date(selectedArticle.publishedAt) : null;
  const outsideMonth = Boolean(notice && scheduledMonth && !dateKey(scheduledMonth).startsWith(monthPrefix));

  return (
    <section className={styles.calendar} aria-label="Redakčný kalendár">
      <div className={styles.toolbar}>
        <nav id="editorial-calendar-month-nav" className={styles.monthNav} aria-label="Navigácia po mesiacoch">
          <Link href={monthUrl(year, month - 1)} aria-label="Predchádzajúci mesiac">←</Link>
          <h2>{monthFormat.format(first)}</h2>
          <Link href={monthUrl(year, month + 1)} aria-label="Nasledujúci mesiac">→</Link>
          <Link className={styles.todayLink} href={monthUrl(new Date().getFullYear(), new Date().getMonth() + 1)}>Dnes</Link>
        </nav>
        <fieldset className={styles.filters}>
          <legend className={styles.srOnly}>Zobraziť články</legend>
          {(["all", "published", "scheduled"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setSelectedDay(null); }}>
              {value === "all" ? "Všetko" : statusLabel(value)}
            </button>
          ))}
        </fieldset>
      </div>
      <p className={styles.summary} role="status">{total === 0 ? "V tomto mesiaci nie sú publikované ani naplánované články." : `V tomto mesiaci: ${total} článkov.`}</p>
      <div className={styles.grid} role="group" aria-label={monthFormat.format(first)}>
        {weekdays.map((day) => <div key={day} className={styles.weekday}>{day}</div>)}
        {cells.map((day, index) => {
          if (day === null) return <div className={styles.blank} key={`blank-${index}`} aria-hidden="true" />;
          const key = `${monthPrefix}${String(day).padStart(2, "0")}`;
          const articles = grouped.get(key) ?? [];
          const dateLabel = new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
          return (
            <div key={key} className={`${styles.day} ${key === today ? styles.currentDay : ""}`}>
              <button type="button" className={styles.dayButton} aria-label={`${dateLabel}, ${articles.length} článkov`}
                aria-expanded={selectedDay === key} onClick={() => setSelectedDay(selectedDay === key ? null : key)}>
                <time dateTime={key}>{day}</time>
                {articles.length > 0 && <span className={styles.count}>{articles.length}</span>}
              </button>
              <div className={styles.dayEntries}>{entries(articles.slice(0, 2))}</div>
              {articles.length > 2 && <button className={styles.more} type="button" onClick={() => setSelectedDay(key)}>+${articles.length - 2} ďalšie</button>}
            </div>
          );
        })}
      </div>
      {selectedDay && (
        <section className={styles.detail} aria-labelledby="calendar-day-detail">
          <div className={styles.detailHeading}>
            <h3 id="calendar-day-detail">{dateFormat.format(new Date(`${selectedDay}T12:00:00`))}</h3>
            <button type="button" onClick={() => setSelectedDay(null)}>Zavrieť detail dňa</button>
          </div>
          {dayArticles.length ? entries(dayArticles) : <p>V tento deň nie sú žiadne články.</p>}
        </section>
      )}
      {(selectedArticle || loadingId !== null || loadError) && (
        <section className={styles.articleDetail} aria-labelledby="calendar-article-detail"
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeArticle(); } }}>
          <div className={styles.detailHeading}>
            <h3 ref={detailHeading} tabIndex={-1} id="calendar-article-detail">
              {selectedArticle?.title ?? (loadingId !== null ? "Načítavam článok…" : "Detail článku")}
            </h3>
            <button type="button" onClick={closeArticle}>Zavrieť detail článku</button>
          </div>
          {loadingId !== null && <p role="status">Načítavam detail z redakcie…</p>}
          {loadError && <p role="alert" className={styles.error}>{loadError} <button type="button" onClick={() => { if (requestedId !== null) void openArticle(requestedId); }}>Skúsiť znova</button></p>}
          {selectedArticle && (
            <>
              <dl className={styles.articleMeta}>
                <div><dt>Stav</dt><dd>{statusLabel(selectedArticle.status)}</dd></div>
                <div><dt>Publikovanie</dt><dd>{selectedArticle.publishedAt ? <time dateTime={selectedArticle.publishedAt}>{dateFormat.format(new Date(selectedArticle.publishedAt))}, {timeFormat.format(new Date(selectedArticle.publishedAt))}</time> : "Bez termínu"}</dd></div>
                <div><dt>Sekcia</dt><dd>{selectedArticle.portalSection}{selectedArticle.topics.length ? ` · ${selectedArticle.topics.map((topic) => topic.label).join(", ")}` : ""}</dd></div>
              </dl>
              {selectedArticle.status === "scheduled" && (
                <form className={styles.scheduleForm} onSubmit={(event) => { event.preventDefault(); void saveSchedule(); }}>
                  <div className={styles.scheduleFields}>
                    <label>Dátum publikovania
                      <input ref={dateField} type="date" value={date} onChange={(event) => setDate(event.target.value)} required disabled={saving || refreshing} />
                    </label>
                    <label>Čas publikovania
                      <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required disabled={saving || refreshing} />
                    </label>
                  </div>
                  <p className={styles.timezoneHint}>Čas sa zadáva v miestnom časovom pásme prehliadača, rovnako ako v editore článku.</p>
                  {saveError && <p ref={saveErrorTarget} tabIndex={-1} role="alert" className={styles.error}>{saveError} <button type="button" onClick={() => void openArticle(selectedArticle.id)}>Obnoviť detail</button></p>}
                  {notice && <p className={styles.success} role="status" aria-live="polite">{notice}</p>}
                  {outsideMonth && scheduledMonth && <p className={styles.outsideMonth}>Článok sa už v tomto mesiaci nezobrazuje. <Link href={monthUrl(scheduledMonth.getFullYear(), scheduledMonth.getMonth() + 1)}>Prejsť na nový mesiac</Link></p>}
                  <div className={styles.articleActions}>
                    <button className={styles.save} type="submit" disabled={saving || refreshing}>{saving || refreshing ? "Ukladám…" : "Uložiť termín"}</button>
                    <Link href={`/admin/clanky/${selectedArticle.id}`}>Otvoriť v editore</Link>
                  </div>
                </form>
              )}
              {selectedArticle.status !== "scheduled" && (
                <div className={styles.articleActions}>
                  <p>{selectedArticle.status === "published" ? "Publikovaný článok: dátum a čas sú tu iba na čítanie." : "Plánovanie konceptu sa spravuje v editore."}</p>
                  <Link href={`/admin/clanky/${selectedArticle.id}`}>Otvoriť v editore</Link>
                </div>
              )}
            </>
          )}
        </section>
      )}
      <p className={styles.caption}>Časy zodpovedajú lokálnemu časovému pásmu prehliadača, rovnako ako pri zadávaní dátumu v editore.</p>
    </section>
  );
}
