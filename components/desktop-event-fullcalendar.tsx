"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import skLocale from "@fullcalendar/core/locales/sk";
import { useEffect, useRef } from "react";
import { eventTypePresentation } from "@/lib/event-type-presentation";
import type { EventType } from "@/lib/events";
import styles from "./events-public.module.css";

type Summary = { date: string; count: number; types: EventType[] };

/**
 * Desktop month grid only. The mobile calendar keeps its existing tested UI.
 * Dates remain navigational links to the canonical calendar/day URLs.
 */
export function DesktopEventFullCalendar({
  month, today, selectedDay, summaries, hrefForDay, onSelectDay,
}: {
  month: string;
  today: string;
  selectedDay: string;
  summaries: Summary[];
  hrefForDay: (date: string) => string;
  onSelectDay: (date: string) => void;
}) {
  const byDate = new Map(summaries.map(item => [item.date, item]));
  const host = useRef<HTMLDivElement>(null);
  // FullCalendar already renders an anchor around dayCellContent. Enhance that
  // anchor instead of nesting a second link (which breaks keyboard/HTML semantics).
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    for (const marker of container.querySelectorAll<HTMLElement>("[data-calendar-date]")) {
      const day = marker.dataset.calendarDate;
      const anchor = marker.closest<HTMLAnchorElement>("a.fc-daygrid-day-number");
      if (!anchor || !day) continue;
      anchor.href = hrefForDay(day) + "#vybrany-den";
      anchor.dataset.calendarDate = day;
      anchor.classList.add(styles.fullCalendarDayLink);
      anchor.setAttribute("aria-label", marker.getAttribute("aria-label") ?? day);
    }
    const handleClick = (event: globalThis.MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a.fc-daygrid-day-number[data-calendar-date]");
      if (!anchor || !container.contains(anchor) || !anchor.dataset.calendarDate) return;
      event.preventDefault();
      onSelectDay(anchor.dataset.calendarDate);
    };
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [hrefForDay, onSelectDay, month, summaries, selectedDay]);
  return <div ref={host} className={styles.desktopFullCalendar} data-fullcalendar-desktop>
    <FullCalendar
      key={month}
      plugins={[dayGridPlugin]}
      initialView="dayGridMonth"
      initialDate={month+"-01"}
      locale={skLocale}
      firstDay={1}
      headerToolbar={false}
      fixedWeekCount={false}
      showNonCurrentDates={false}
      height="auto"
      dayHeaderFormat={{ weekday: "short" }}
      dayCellContent={arg => {
        const day = [
          arg.date.getFullYear(),
          String(arg.date.getMonth()+1).padStart(2,"0"),
          String(arg.date.getDate()).padStart(2,"0"),
        ].join("-");
        const summary = byDate.get(day);
        const count = summary?.count ?? 0;
        const types = summary?.types ?? [];
        const active = day === selectedDay;
        const todayFlag = day === today;
        return <span
          data-calendar-date={day}
          data-selected={active ? "true" : undefined}
          data-today={todayFlag ? "true" : undefined}
          data-count={count}
          aria-current={todayFlag ? "date" : undefined}
          aria-label={day + (count ? ", "+count+" podujatí" : ", bez podujatí")}
          className={styles.fullCalendarDayContent}
        >
          <span className={styles.fullCalendarDayHeading}>
            <span>{arg.date.getDate()}</span>
            {count > 0 && <span className={styles.fullCalendarCount}>{count}</span>}
          </span>
          {types.length > 0 && <span className={styles.fullCalendarIndicators} aria-hidden="true">
            {types.slice(0,4).map(type =>
              <span key={type} title={eventTypePresentation[type].label}
                style={{backgroundColor:eventTypePresentation[type].color}} />)}
            {types.length > 4 ? <small>+{types.length-4}</small> : null}
          </span>}
        </span>;
      }}
    />
  </div>;
}
