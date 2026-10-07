"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EditorialCalendarItem } from "@/lib/editorial-calendar";
import styles from "./admin-editorial-calendar.module.css";

const weekdays = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const monthFormat = new Intl.DateTimeFormat("sk-SK", { month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthUrl(year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return `/admin/clanky/kalendar?mesiac=${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function statusLabel(status: EditorialCalendarItem["status"]) {
  return status === "published" ? "Publikované" : "Naplánované";
}

export function AdminEditorialCalendar({
  year, month, items,
}: { year: number; month: number; items: EditorialCalendarItem[] }) {
  const [filter, setFilter] = useState<"all" | "published" | "scheduled">("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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

  function entries(articles: EditorialCalendarItem[]) {
    return articles.map((article) => (
      <Link key={article.id} className={styles.entry} href={`/admin/clanky/${article.id}`}
        aria-label={`${article.title}, ${statusLabel(article.status)}, ${timeFormat.format(new Date(article.publishedAt))}`}>
        <span className={article.status === "published" ? styles.published : styles.scheduled} aria-hidden="true" />
        <span className={styles.entryTitle}>{article.title}</span>
        <time dateTime={article.publishedAt}>{timeFormat.format(new Date(article.publishedAt))}</time>
        <span className={styles.srOnly}>{statusLabel(article.status)}</span>
      </Link>
    ));
  }

  return (
    <section className={styles.calendar} aria-label="Redakčný kalendár">
      <div className={styles.toolbar}>
        <nav className={styles.monthNav} aria-label="Navigácia po mesiacoch">
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
              {articles.length > 2 && <button className={styles.more} type="button" onClick={() => setSelectedDay(key)}>+{articles.length - 2} ďalšie</button>}
            </div>
          );
        })}
      </div>
      {selectedDay && (
        <section className={styles.detail} aria-labelledby="calendar-day-detail">
          <div className={styles.detailHeading}>
            <h3 id="calendar-day-detail">{new Intl.DateTimeFormat("sk-SK", { dateStyle: "full" }).format(new Date(`${selectedDay}T12:00:00`))}</h3>
            <button type="button" onClick={() => setSelectedDay(null)}>Zavrieť detail dňa</button>
          </div>
          {dayArticles.length ? entries(dayArticles) : <p>V tento deň nie sú žiadne články.</p>}
        </section>
      )}
      <p className={styles.caption}>Časy zodpovedajú lokálnemu časovému pásmu prehliadača, rovnako ako pri zadávaní dátumu v editore.</p>
    </section>
  );
}
