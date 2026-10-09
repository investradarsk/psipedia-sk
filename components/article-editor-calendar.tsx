"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatArticleLocalDateTime } from "@/lib/article-schedule-time";
import styles from "./article-editor-calendar.module.css";

type CalendarItem = {
  id: number;
  title: string;
  status: "published" | "scheduled";
  publishedAt: string;
};
type Snapshot = { month: string; items: CalendarItem[]; error?: string };
type Props = { value: string; articleId?: number; onChoose: (value: string) => void; readOnly?: boolean };
const weekdays = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const pad = (num: number) => String(num).padStart(2, "0");
const monthFormat = new Intl.DateTimeFormat("sk-SK", { year: "numeric", month: "long" });
const dateFormat = new Intl.DateTimeFormat("sk-SK", { dateStyle: "full" });
const timeFormat = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });

function localDateKey(date: Date) {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}
function shiftMonth(month: string, by: number) {
  const parts = month.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1 + by, 1);
  if (date.getFullYear() < 2000 || date.getFullYear() > 2100) return month;
  return date.getFullYear() + "-" + pad(date.getMonth() + 1);
}
function groupByDay(items: CalendarItem[], excludeId?: number) {
  const days = new Map<string, CalendarItem[]>();
  for (const article of items) {
    if (article.id === excludeId) continue;
    const date = new Date(article.publishedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = localDateKey(date);
    days.set(key, [...(days.get(key) ?? []), article]);
  }
  return days;
}

export function ArticleEditorCalendar({ value, articleId, onChoose, readOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => value.slice(0, 7) || localDateKey(new Date()).slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(() => value.slice(0, 10) || localDateKey(new Date()));
  const [monthData, setMonthData] = useState<Snapshot | null>(null);
  const [valueData, setValueData] = useState<Snapshot | null>(null);
  const [retry, setRetry] = useState(0);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const valueMonth = /^\d{4}-\d{2}$/.test(value.slice(0, 7)) ? value.slice(0, 7) : "";

  // Check the selected timestamp even if the calendar is not open.
  useEffect(() => {
    if (!valueMonth || readOnly) return;
    const controller = new AbortController();
    void fetch("/api/admin/articles/calendar?mesiac=" + valueMonth, {
      cache: "no-store", headers: { accept: "application/json" }, signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json() as { items?: CalendarItem[]; error?: string };
      if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error || "Termíny sa nepodarilo načítať.");
      if (!controller.signal.aborted) setValueData({ month: valueMonth, items: data.items });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setValueData({ month: valueMonth, items: [], error: error instanceof Error ? error.message : "Kalendár nie je dostupný." });
    });
    return () => controller.abort();
  }, [valueMonth, readOnly, retry]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch("/api/admin/articles/calendar?mesiac=" + month, {
      cache: "no-store", headers: { accept: "application/json" }, signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json() as { items?: CalendarItem[]; error?: string };
      if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error || "Kalendár sa nepodarilo načítať.");
      if (!controller.signal.aborted) setMonthData({ month, items: data.items });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setMonthData({ month, items: [], error: error instanceof Error ? error.message : "Kalendár nie je dostupný." });
    });
    return () => controller.abort();
  }, [open, month, retry]);

  useEffect(() => {
    if (!open) return;
    const container = dialog.current;
    if (!container) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    heading.current?.focus();
    const selectable = () => Array.from(container.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )).filter((node) => node.getClientRects().length > 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = selectable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); }
      else if (!elements.includes(document.activeElement as HTMLElement)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !container.contains(event.target)) heading.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      opener.current?.focus();
    };
  }, [open]);

  function openCalendar() {
    setMonth(value.slice(0, 7) || localDateKey(new Date()).slice(0, 7));
    setSelectedDay(value.slice(0, 10) || localDateKey(new Date()));
    setOpen(true);
  }

  const { days, startOffset } = useMemo(() => {
    const parts = month.split("-").map(Number);
    const first = new Date(parts[0], parts[1] - 1, 1);
    return {
      days: new Date(parts[0], parts[1], 0).getDate(),
      startOffset: (first.getDay() + 6) % 7,
    };
  }, [month]);
  const visibleItems = monthData?.month === month ? monthData.items : null;
  const grouped = useMemo(() => groupByDay(visibleItems ?? [], articleId), [visibleItems, articleId]);
  const availableDayItems = grouped.get(selectedDay) ?? [];
  const exactCollisions = valueMonth && valueData?.month === valueMonth && !valueData.error && value
    ? valueData.items.filter((item) => item.id !== articleId && formatArticleLocalDateTime(item.publishedAt) === value)
    : [];
  const candidateTime = value.slice(11, 16) || "09:00";
  const selectedValue = selectedDay + "T" + candidateTime;
  const candidateCollisions = availableDayItems.filter((item) => formatArticleLocalDateTime(item.publishedAt) === selectedValue);
  const pastDate = new Date(selectedValue).getTime() <= Date.now();

  return (
    <>
      <button ref={opener} type="button" className={styles.openButton} onClick={openCalendar}
        aria-haspopup="dialog" aria-label="Zobraziť redakčný kalendár a obsadené termíny">
        <span aria-hidden="true">▦</span> Zobraziť kalendár
      </button>
      {valueMonth && !readOnly && valueData?.month === valueMonth && (
        valueData.error
          ? <p className={styles.warning} role="status">Termíny sa nepodarilo overiť. <button type="button" onClick={() => setRetry((n) => n + 1)}>Skúsiť znova</button></p>
          : exactCollisions.length > 0
            ? <p className={styles.warning} role="alert">
              <strong>Pozor, tento termín je už obsadený.</strong> {exactCollisions.map((item) => item.title).join(", ")}.
              Vyber iný čas alebo deň.
            </p>
            : null
      )}
      {open && typeof document !== "undefined" && createPortal(
        <div className={styles.backdrop}>
          <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="editor-calendar-heading"
            className={styles.dialog} data-testid="article-editor-calendar-dialog">
            <div className={styles.dialogHeader}>
              <div>
                <h2 id="editor-calendar-heading" ref={heading} tabIndex={-1}>Redakčný kalendár</h2>
                <p>Skontroluj, čo je už publikované a čo je naplánované. Otvorenie kalendára nič neuloží.</p>
              </div>
              <button type="button" className={styles.close} onClick={() => setOpen(false)}>Zavrieť</button>
            </div>
            <div className={styles.nav}>
              <button type="button" disabled={month === "2000-01"} aria-label="Predchádzajúci mesiac"
                onClick={() => { setMonth(shiftMonth(month, -1)); setSelectedDay(""); }}>←</button>
              <h3>{monthFormat.format(new Date(month + "-01T12:00:00"))}</h3>
              <button type="button" disabled={month === "2100-12"} aria-label="Nasledujúci mesiac"
                onClick={() => { setMonth(shiftMonth(month, 1)); setSelectedDay(""); }}>→</button>
              <button type="button" onClick={() => {
                const today = localDateKey(new Date());
                setMonth(today.slice(0, 7)); setSelectedDay(today);
              }}>Dnes</button>
            </div>
            <div className={styles.legend}>
              <span><i className={styles.published} /> Publikované</span>
              <span><i className={styles.scheduled} /> Naplánované</span>
            </div>
            {visibleItems === null ? <p role="status">Načítavam termíny…</p> : monthData?.error
              ? <p className={styles.warning} role="alert">{monthData.error} <button type="button" onClick={() => setRetry((n) => n + 1)}>Znova načítať</button></p>
              : <>
                <div className={styles.grid} aria-label="Mesačný kalendár">
                  {weekdays.map((day) => <strong key={day} className={styles.weekday}>{day}</strong>)}
                  {Array.from({ length: startOffset }, (_, i) => <span key={"empty-" + i} aria-hidden="true" className={styles.blank} />)}
                  {Array.from({ length: days }, (_, index) => {
                    const day = index + 1;
                    const key = month + "-" + pad(day);
                    const list = grouped.get(key) ?? [];
                    return <button key={key} type="button"
                      className={styles.day + (selectedDay === key ? " " + styles.active : "")}
                      aria-pressed={selectedDay === key}
                      aria-label={day + ". " + monthFormat.format(new Date(month + "-01T12:00:00")) + ", " + list.length + " článkov"}
                      onClick={() => setSelectedDay(key)}>
                      <strong>{day}</strong>
                      {list.length > 0 && <small>{list.length} čl.</small>}
                      <span className={styles.entries}>
                        {list.slice(0, 2).map((item) => <span key={item.id} className={styles.miniEntry}>
                          <i className={item.status === "published" ? styles.published : styles.scheduled} />
                          <span>{timeFormat.format(new Date(item.publishedAt))} {item.title}</span>
                        </span>)}
                        {list.length > 2 && <span className={styles.more}>+{list.length - 2} ďalšie</span>}
                      </span>
                    </button>;
                  })}
                </div>
                <div className={styles.dayDetail}>
                  <h3>{selectedDay ? dateFormat.format(new Date(selectedDay + "T12:00:00")) : "Vyber deň v kalendári"}</h3>
                  {!selectedDay ? <p>Klikni na konkrétny deň a zobrazia sa všetky články aj časy.</p>
                    : availableDayItems.length === 0 ? <p>Na tento deň zatiaľ nie je naplánovaný žiadny článok.</p>
                    : <ul>{availableDayItems.map((item) => <li key={item.id}>
                      <i className={item.status === "published" ? styles.published : styles.scheduled} />
                      <time dateTime={item.publishedAt}>{timeFormat.format(new Date(item.publishedAt))}</time>
                      <span>{item.title}</span>
                      <small>{item.status === "published" ? "Publikované" : "Naplánované"}</small>
                    </li>)}</ul>}
                  {selectedDay && !readOnly && (
                    <div className={styles.selectRow}>
                      {candidateCollisions.length > 0 && <p className={styles.warning} role="alert">
                        Čas {candidateTime} je už obsadený. Môžeš vybrať tento deň a zmeniť čas v editore.
                      </p>}
                      {pastDate && <p className={styles.hint}>Termín je v minulosti. Na plánovanie vyber budúci deň.</p>}
                      <button className={styles.selectButton} type="button" disabled={pastDate}
                        onClick={() => { onChoose(selectedValue); setOpen(false); }}>Použiť tento dátum ({candidateTime})</button>
                    </div>
                  )}
                </div>
              </>}
          </section>
        </div>, document.body)}
    </>
  );
}
