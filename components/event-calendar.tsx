import { EventListingResults } from './event-listing-results';
import { eventListingParams, parseEventListing, type EventListingFilters } from '@/lib/event-listing';
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { eventTypePresentation } from "@/lib/event-type-presentation";
import {
  calendarMonthDays,
  calendarDaySummary,
  calendarMonthLabel,
  calendarWeekdays,
  eventsForCalendarDay,
  moveCalendarMonth,
  resolveCalendarMonth,
} from "@/lib/event-calendar-view";
import {
  eventHref,
  eventTimeFilterParam,
  eventTypePortalHref,
  eventTypes,
  formatEventDate,
  type DogEvent,
  type EventTimeFilter,
  type EventType,
  type SlovakRegion,
} from "@/lib/events";
import styles from "./events-public.module.css";

function dateLabel(day: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}

export function EventCalendar({
  events,
  filters,
  listing,
  calendarEvents = [],
  calendarSummaries,
  today,
  initialType = "Všetky",
  initialTime = "upcoming",
  initialQuery = "",
  initialRegion = "",
  initialMonth = "",
  initialCalendarMonth = "",
  initialDay = "",
  afterCalendar,
}: {
  events: DogEvent[];
  filters?: EventListingFilters;
  listing?: {total:number;page:number;pages:number};
  calendarEvents?: DogEvent[];
  calendarSummaries?: {date:string;count:number;types:EventType[]}[];
  today: string;
  initialType?: EventType | "Všetky";
  initialTime?: EventTimeFilter;
  initialQuery?: string;
  initialRegion?: "" | SlovakRegion;
  initialMonth?: string;
  initialCalendarMonth?: string;
  initialDay?: string;
  afterCalendar?: ReactNode;
}) {
  const f = filters ?? parseEventListing({q:initialQuery,region:initialRegion,mesiac:initialMonth,termin:eventTimeFilterParam(initialTime)},initialType);
  const query = initialQuery.trim().slice(0, 120);
  const region = initialRegion;
  const month = initialMonth;
  const visibleMonth = resolveCalendarMonth(initialCalendarMonth, month, today);
  const todayMonth = today.slice(0, 7);
  const days = calendarMonthDays(visibleMonth);
  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(initialDay)
    && days.some((item) => item.date === initialDay && item.inMonth) ? initialDay : "";
  const typePathname = initialType === "Všetky" ? "/podujatia" : eventTypePortalHref(initialType) ?? "/podujatia";
  // Both reads are already filtered by the shared D1 contract; never filter a partial page.
  const filtered = events;
  const monthMatches = calendarEvents;
  const dailyEvents = selectedDay ? eventsForCalendarDay(monthMatches, selectedDay) : [];
  const daySummaries = calendarSummaries ? new Map(calendarSummaries.map(summary=>[summary.date,summary])) : new Map(days.filter((day) => day.inMonth).map((day) => [day.date, calendarDaySummary(monthMatches, day.date)]));


  function calendarHref(targetMonth: string, day = "") {
    const params = eventListingParams(f);
    if (query) params.set("q", query);
    if (region) params.set("region", region);
    // A month filter must not silently suppress every day after navigating to a different month.
    if (month && targetMonth !== month) params.delete("mesiac");
    const timeParam = eventTimeFilterParam(initialTime);
    if (timeParam) params.set("termin", timeParam);
    if (targetMonth !== (month || todayMonth)) params.set("kalendar", targetMonth);
    if (day) params.set("den", day);
    const serialized = params.toString();
    return serialized ? typePathname + "?" + serialized : typePathname;
  }

  function timeHref(value: EventTimeFilter) {
    const params = eventListingParams(f);
    if (query) params.set("q", query);
    if (region) params.set("region", region);
    if (month) params.set("mesiac", month);
    if (visibleMonth !== (month || todayMonth)) params.set("kalendar", visibleMonth);
    if (selectedDay) params.set("den", selectedDay);
    params.delete("termin");
    const timeParam = eventTimeFilterParam(value);
    if (timeParam) params.set("termin", timeParam);
    const serialized = params.toString();
    return serialized ? typePathname + "?" + serialized : typePathname;
  }

  const upcomingTitle = initialTime === "past" ? "Ukončené podujatia" : initialTime === "current"
    ? "Prebiehajúce podujatia" : initialTime === "all" ? "Zoznam podujatí" : "Nadchádzajúce podujatia";

  return (
    <div className={styles.calendar}>
      <div className={styles.resultBar}>
        <div className={styles.timeBar} role="group" aria-label="Obdobie podujatia">
          {([
            ["upcoming", "Najbližšie"],
            ["current", "Prebiehajúce"],
            ["past", "Ukončené"],
            ["all", "Všetky"],
          ] as const).map(([value, label]) => (
            <Link
              href={timeHref(value)}
              className={initialTime === value ? styles.activeTimeChip : styles.timeChip}
              aria-current={initialTime === value ? "page" : undefined}
              key={value}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.calendarLayout} data-events-calendar-layout>
      <section className={styles.monthCalendar} id="events-calendar" data-events-month-calendar aria-labelledby="events-calendar-title">
        <div className={styles.monthHeading}>
          <div>
            <p className={styles.monthEyebrow}>Vyberte si deň</p>
            <h2 id="events-calendar-title">{calendarMonthLabel(visibleMonth)}</h2>
          </div>
          <nav className={styles.monthNavigation} aria-label="Navigácia kalendára">
            <Link href={calendarHref(moveCalendarMonth(visibleMonth, -1))} aria-label="Predchádzajúci mesiac" rel="prev">←</Link>
            <Link href={calendarHref(todayMonth)} aria-label="Prejsť na aktuálny mesiac">Dnes</Link>
            <Link href={calendarHref(moveCalendarMonth(visibleMonth, 1))} aria-label="Nasledujúci mesiac" rel="next">→</Link>
          </nav>
        </div>

        <div className={styles.monthGrid} role="group" aria-label={"Dni kalendára " + calendarMonthLabel(visibleMonth)}>
          {calendarWeekdays.map((name) => <span className={styles.weekday} key={name}>{name}</span>)}
          {days.map((day) => {
            const { count = 0, types = [] } = daySummaries.get(day.date) ?? {};
            const dayName = dateLabel(day.date);
            const active = selectedDay === day.date;
            const todayFlag = day.date === today;
            if (!day.inMonth) return <span className={styles.outsideDay} aria-hidden="true" key={day.date} />;
            return (
              <Link
                key={day.date}
                href={calendarHref(visibleMonth, day.date) + "#vybrany-den"}
                className={styles.monthDay}
                data-calendar-date={day.date}
                data-selected={active ? "true" : undefined}
                data-today={todayFlag ? "true" : undefined}
                data-count={count}
                aria-current={todayFlag ? "date" : undefined}
                aria-label={(active ? "Vybraný deň " : "") + dayName + (count ? ", " + count + " podujatí, " + types.map((type) => eventTypePresentation[type].label).join(", ") : ", bez podujatí")}
              >
                <span className={styles.dayHeading}>
                <span className={styles.monthDayNumber}>{day.day}</span>
                {count > 0 ? <span className={styles.monthDayCount} aria-hidden="true">{count}</span> : null}
                </span>
                {types.length ? (
                  <span className={styles.dayIndicators} aria-hidden="true">
                    {types.slice(0, 4).map((type) => <span key={type} className={styles.typeDot} data-event-type={type} style={{ "--event-type-color": eventTypePresentation[type].color } as CSSProperties} />)}
                    {types.length > 4 ? <span className={styles.moreTypes}>+{types.length - 4}</span> : null}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {selectedDay ? (
          <section className={styles.dayDetail} id="vybrany-den" tabIndex={-1} aria-labelledby="selected-day-title" data-selected-day={selectedDay}>
            <div className={styles.dayDetailHeading}>
              <div><p className={styles.selectedDayEyebrow}>Vybraný dátum</p><h3 id="selected-day-title">{dateLabel(selectedDay)}</h3></div>
              <Link href={calendarHref(visibleMonth)} aria-label="Zrušiť výber dňa">Zavrieť výber</Link>
            </div>
            {(daySummaries.get(selectedDay)?.count ?? 0) > dailyEvents.length ? <p>Zobrazených prvých {dailyEvents.length} z {daySummaries.get(selectedDay)?.count} podujatí. <Link href={typePathname + '?' + (()=>{const p=eventListingParams({...f,from:selectedDay,to:selectedDay,page:1}); return p.toString();})() + '#events-list'}>Zobraziť všetky podujatia tohto dňa</Link></p>:null}
            {dailyEvents.length ? (
              <ul className={styles.dayEvents}>
                {dailyEvents.map((event) => (
                  <li key={event.id} className={styles.dayEvent}>
                    <div>
                      <Link href={eventHref(event)}>{event.title}</Link>
                      <span>{formatEventDate(event)}{event.startTime ? " · " + event.startTime : ""}</span>
                      <span>{event.region === "Online" ? "Online podujatie" : [event.venue, event.city].filter(Boolean).join(" · ") || "Miesto bude upresnené"}</span>
                    </div>
                    {event.cancelled ? <strong>Zrušené</strong> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.dayEmpty}>V tento deň nie sú podujatia, ktoré zodpovedajú zvoleným filtrom. Skúste iný deň alebo upravte filtre.</p>
            )}
          </section>
        ) : (
          <p className={styles.monthHint}>{daySummaries.size === 0 ? "V tomto mesiaci nie sú podujatia zodpovedajúce aktuálnym filtrom. Zmeňte mesiac alebo upravte vyhľadávanie." : "Vyberte deň a zobrazia sa podujatia s odkazmi na ich detail."}</p>
        )}
      </section>

      <nav className={styles.calendarLegend} aria-label="Kategórie podujatí" data-events-legend>
        {eventTypes.map((type) => {
          const presentation = eventTypePresentation[type];
          const href = eventTypePortalHref(type);
          if (!href) return null;
          return <Link key={type} href={href + timeHref(initialTime).slice(typePathname.length)} aria-current={initialType === type ? "page" : undefined}>
            <span className={styles.typeDot} aria-hidden="true" data-event-type={type} style={{ "--event-type-color": presentation.color } as CSSProperties} />
            {presentation.label}
          </Link>;
        })}
      </nav>
      </div>
      {afterCalendar}

      <EventListingResults events={filtered} filters={f} listing={listing ?? {total:filtered.length,page:1,pages:1}} today={today} pathname={typePathname} title={upcomingTitle} calendarMonth={visibleMonth} day={selectedDay}/>

    </div>
  );
}
