"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import skLocale from "@fullcalendar/core/locales/sk";
import { type MouseEvent } from "react";
import { eventTypePresentation } from "@/lib/event-type-presentation";
import type { EventType } from "@/lib/events";
import styles from "./events-public.module.css";

type Summary = { date: string; count: number; types: EventType[] };

/**
 * Desktop month grid only. The mobile calendar keeps its existing tested UI.
 * Dates remain navigational links to the canonical calendar/day URLs.
 */
export function DesktopEventFullCalendar({
  month, today, selectedDay, summaries, hrefForDay, onDayLinkClick,
}: {
  month: string;
  today: string;
  selectedDay: string;
  summaries: Summary[];
  hrefForDay: (date: string) => string;
  onDayLinkClick: (event: MouseEvent<HTMLAnchorElement>, date: string) => void;
}) {
  const byDate = new Map(summaries.map(item => [item.date, item]));
  return <div className={styles.desktopFullCalendar} data-fullcalendar-desktop>
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
        return <a
          href={hrefForDay(day)+"#vybrany-den"}
          onClick={event => onDayLinkClick(event,day)}
          data-calendar-date={day}
          data-selected={active ? "true" : undefined}
          data-today={todayFlag ? "true" : undefined}
          data-count={count}
          aria-current={todayFlag ? "date" : undefined}
          aria-label={day + (count ? ", "+count+" podujatí" : ", bez podujatí")}
          className={styles.fullCalendarDayLink}
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
        </a>;
      }}
    />
  </div>;
}
