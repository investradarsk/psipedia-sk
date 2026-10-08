"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DogNameDayResolverRecord } from "@/lib/dog-name-days";
import {
  calendarMonthLabel,
  calendarWeekdays,
  moveCalendarMonth,
  publishedNamesForCalendarDate,
  resolveDogNameDayCalendar,
  slovakNameDayDateLabel,
} from "@/lib/dog-name-day-calendar";
import styles from "./dog-name-day-calendar.module.css";

export function DogNameDayCalendar({
  today,
  month,
  day,
  records,
}: {
  today: string;
  month: string;
  day: string;
  records: readonly DogNameDayResolverRecord[];
}) {
  const view = resolveDogNameDayCalendar(month, day, today);
  // Worker public HTML may be cached briefly; the canonical read-only API is not.
  // Refresh current month on mount and when navigating, without a second dataset.
  const [fresh, setFresh] = useState<{ month: string; records: readonly DogNameDayResolverRecord[] } | null>(null);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/name-days/month?month=" + view.month.slice(5, 7), { cache: "no-store" });
        if (!response.ok) throw new Error("Monthly name-day lookup failed");
        const data = await response.json() as { records?: DogNameDayResolverRecord[] };
        if (active) setFresh({ month: view.month, records: Array.isArray(data.records) ? data.records : [] });
      } catch {
        if (active) setFresh({ month: view.month, records: [] });
      }
    }
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [view.month]);
  const visibleRecords = fresh?.month === view.month ? fresh.records : records;
  const selectedNames = view.selectedDay ? publishedNamesForCalendarDate(view.selectedDay, visibleRecords) : [];
  const monthLabel = calendarMonthLabel(view.month);
  const dateLink = (date: string) => "/psie-meniny?mesiac=" + view.month + "&den=" + date;

  return (
    <section className={styles.calendar} data-name-day-calendar aria-labelledby="name-day-calendar-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Mesačný kalendár</p>
          <h2 id="name-day-calendar-title">{monthLabel}</h2>
        </div>
        <nav className={styles.controls} aria-label="Navigácia kalendára psích menín">
          <Link href={"/psie-meniny?mesiac=" + moveCalendarMonth(view.month, -1)} rel="prev" aria-label="Predchádzajúci mesiac">←</Link>
          <Link href="/psie-meniny" aria-label="Prejsť na dnešný dátum">Dnes</Link>
          <Link href={"/psie-meniny?mesiac=" + moveCalendarMonth(view.month, 1)} rel="next" aria-label="Nasledujúci mesiac">→</Link>
        </nav>
      </div>
      <div className={styles.grid} role="group" aria-label={"Dni kalendára " + monthLabel}>
        {calendarWeekdays.map((name) => (
          <span key={name} className={styles.weekday} aria-hidden="true">{name}</span>
        ))}
        {view.days.map((item) => {
          if (!item.inMonth) return <span key={item.date} className={styles.blank} aria-hidden="true" />;
          const names = publishedNamesForCalendarDate(item.date, visibleRecords);
          const todayFlag = item.date === today;
          const selected = item.date === view.selectedDay;
          const accessibleName = (todayFlag ? "Dnes, " : "") + (selected ? "Vybraný deň, " : "") + slovakNameDayDateLabel(item.date)
            + (names.length ? ", meniny: " + names.join(", ") : ", bez evidovaných psích menín");
          return (
            <Link
              key={item.date}
              href={dateLink(item.date)}
              className={styles.day}
              data-name-day-date={item.date}
              data-today={todayFlag ? "true" : undefined}
              data-selected={selected ? "true" : undefined}
              aria-current={todayFlag ? "date" : selected ? "true" : undefined}
              aria-label={accessibleName}
            >
              <span>{item.day}</span>
              {names.length ? <i className={styles.marker} aria-hidden="true" /> : null}
            </Link>
          );
        })}
      </div>
      <div className={styles.detail} data-name-day-selected-date={view.selectedDay || undefined} aria-live="polite">
        {view.selectedDay ? (
          <>
            <span className={styles.detailLabel}>Psie meniny · {slovakNameDayDateLabel(view.selectedDay)}</span>
            {selectedNames.length
              ? <p className={styles.names}>{selectedNames.join(", ")}</p>
              : <p className={styles.empty}>Na tento deň zatiaľ nemáme evidované publikované psie meniny.</p>}
          </>
        ) : (
          <p className={styles.empty}>Vyber deň v kalendári a zobrazia sa jeho psie meniny.</p>
        )}
      </div>
    </section>
  );
}
