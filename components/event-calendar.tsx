import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { SearchIcon } from "@/components/icons";
import { PublicFilterDisclosure } from "@/components/public-filter-disclosure";
import {
  calendarMonthDays,
  calendarMonthLabel,
  calendarWeekdays,
  eventsForCalendarDay,
  moveCalendarMonth,
  resolveCalendarMonth,
} from "@/lib/event-calendar-view";
import {
  eventDateStatus,
  eventHref,
  eventTimeFilterParam,
  eventTypePortalHref,
  formatEventDate,
  slovakRegions,
  type DogEvent,
  type EventTimeFilter,
  type EventType,
  type SlovakRegion,
} from "@/lib/events";
import styles from "./events-public.module.css";

const MONTH_NAMES = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .trim();
}

function monthKeysForEvent(event: Pick<DogEvent, "startDate" | "endDate">) {
  const start = event.startDate.slice(0, 7);
  const end = (event.endDate || event.startDate).slice(0, 7);
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  const keys: string[] = [];

  for (let guard = 0; guard < 120 && (year < endYear || (year === endYear && month <= endMonth)); guard += 1) {
    keys.push(String(year) + "-" + String(month).padStart(2, "0"));
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function monthLabel(key: string) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return (MONTH_NAMES[month - 1] || key) + " " + year;
}

function compareEvents(left: DogEvent, right: DogEvent, today: string) {
  const leftStatus = eventDateStatus(left, today);
  const rightStatus = eventDateStatus(right, today);
  const rank = (event: DogEvent, status: ReturnType<typeof eventDateStatus>) => {
    if (status === "current") return event.cancelled ? 2 : 0;
    if (status === "upcoming") return event.cancelled ? 2 : 1;
    return event.cancelled ? 4 : 3;
  };
  const rankDifference = rank(left, leftStatus) - rank(right, rightStatus);
  if (rankDifference) return rankDifference;

  if (leftStatus === "past" && rightStatus === "past") {
    const leftEnd = left.endDate || left.startDate;
    const rightEnd = right.endDate || right.startDate;
    return rightEnd.localeCompare(leftEnd) || right.startTime.localeCompare(left.startTime) || right.id - left.id;
  }

  return left.startDate.localeCompare(right.startDate)
    || left.startTime.localeCompare(right.startTime)
    || left.id - right.id;
}

function dateLabel(day: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}

export function EventCalendar({
  events,
  calendarEvents = [],
  today,
  initialType = "Všetky",
  initialTime = "upcoming",
  initialQuery = "",
  initialRegion = "",
  initialMonth = "",
  initialCalendarMonth = "",
  initialDay = "",
}: {
  events: DogEvent[];
  calendarEvents?: DogEvent[];
  today: string;
  initialType?: EventType | "Všetky";
  initialTime?: EventTimeFilter;
  initialQuery?: string;
  initialRegion?: "" | SlovakRegion;
  initialMonth?: string;
  initialCalendarMonth?: string;
  initialDay?: string;
}) {
  const query = initialQuery.trim().slice(0, 120);
  const region = initialRegion;
  const month = initialMonth;
  const visibleMonth = resolveCalendarMonth(initialCalendarMonth, month, today);
  const todayMonth = today.slice(0, 7);
  const days = calendarMonthDays(visibleMonth);
  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(initialDay)
    && days.some((item) => item.date === initialDay && item.inMonth) ? initialDay : "";
  const typePathname = initialType === "Všetky" ? "/podujatia" : eventTypePortalHref(initialType) ?? "/podujatia";
  const months = new Set<string>();
  events.forEach((event) => monthKeysForEvent(event).forEach((value) => months.add(value)));
  if (month) months.add(month);
  const monthOptions = [...months].sort();
  const needle = normalizeSearch(query);

  // One public filtering contract for the existing list and the bounded calendar read.
  // Filtering stays server-rendered; no independent browser search engine is introduced.
  const matchesFilters = (event: DogEvent) => {
    if (event.status !== "published") return false;
    const dateStatus = eventDateStatus(event, today);
    const haystack = normalizeSearch([
      event.title,
      event.excerpt,
      event.eventType,
      event.venue,
      event.address,
      event.city,
      event.region,
      event.organizer,
    ].filter(Boolean).join(" "));
    const queryMatches = !needle || haystack.includes(needle);
    const timeMatches = initialTime === "all"
      || (initialTime === "upcoming" && dateStatus !== "past")
      || (initialTime === "current" && dateStatus === "current")
      || (initialTime === "past" && dateStatus === "past");
    const monthMatches = !month
      || (event.startDate.slice(0, 7) <= month && (event.endDate || event.startDate).slice(0, 7) >= month);

    return queryMatches
      && (initialType === "Všetky" || event.eventType === initialType)
      && (!region || event.region === region)
      && monthMatches
      && timeMatches;
  };
  const filtered = events.filter(matchesFilters).sort((left, right) => compareEvents(left, right, today));
  const monthMatches = calendarEvents.filter(matchesFilters);
  const dailyEvents = selectedDay ? eventsForCalendarDay(monthMatches, selectedDay) : [];
  const eventCounts = new Map(days.map((day) => [day.date, day.inMonth ? eventsForCalendarDay(monthMatches, day.date).length : 0]));

  const activeSecondaryCount = Number(Boolean(region)) + Number(Boolean(month));
  const hasActiveFilters = Boolean(query || region || month || initialTime !== "upcoming");

  function calendarHref(targetMonth: string, day = "") {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (region) params.set("region", region);
    // A month filter must not silently suppress every day after navigating to a different month.
    if (month && targetMonth === month) params.set("mesiac", month);
    const timeParam = eventTimeFilterParam(initialTime);
    if (timeParam) params.set("termin", timeParam);
    if (targetMonth !== (month || todayMonth)) params.set("kalendar", targetMonth);
    if (day) params.set("den", day);
    const serialized = params.toString();
    return serialized ? typePathname + "?" + serialized : typePathname;
  }

  function timeHref(value: EventTimeFilter) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (region) params.set("region", region);
    if (month) params.set("mesiac", month);
    if (visibleMonth !== (month || todayMonth)) params.set("kalendar", visibleMonth);
    if (selectedDay) params.set("den", selectedDay);
    const timeParam = eventTimeFilterParam(value);
    if (timeParam) params.set("termin", timeParam);
    const serialized = params.toString();
    return serialized ? typePathname + "?" + serialized : typePathname;
  }

  const upcomingTitle = initialTime === "past" ? "Ukončené podujatia" : initialTime === "current"
    ? "Prebiehajúce podujatia" : initialTime === "all" ? "Zoznam podujatí" : "Nadchádzajúce podujatia";

  return (
    <div className={styles.calendar}>
      <form
        className={styles.toolbar}
        method="get"
        action={typePathname}
        data-event-filters
        data-public-search-form="events"
      >
        {eventTimeFilterParam(initialTime) ? (
          <input type="hidden" name="termin" value={eventTimeFilterParam(initialTime)} />
        ) : null}
        {visibleMonth !== (month || todayMonth) ? <input type="hidden" name="kalendar" value={visibleMonth} /> : null}

        <label className={styles.searchControl}>
          <span>Hľadať</span>
          <span className={styles.searchInput}>
            <SearchIcon size={20} />
            <input
              name="q"
              defaultValue={query}
              maxLength={120}
              placeholder="Názov, mesto, miesto alebo organizátor"
            />
          </span>
        </label>

        <button className={styles.searchSubmit} type="submit">Hľadať</button>

        <PublicFilterDisclosure
          activeCount={activeSecondaryCount}
          buttonClassName={styles.filterToggle}
          contentClassName={styles.secondaryFilters}
          openContentClassName={styles.secondaryFiltersOpen}
        >
          <label className={styles.filterControl}>
            <span>Kraj</span>
            <select name="region" defaultValue={region}>
              <option value="">Všetky kraje</option>
              {slovakRegions.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <label className={styles.filterControl}>
            <span>Mesiac</span>
            <select name="mesiac" defaultValue={month}>
              <option value="">Všetky mesiace</option>
              {monthOptions.map((value) => <option value={value} key={value}>{monthLabel(value)}</option>)}
            </select>
          </label>
          <Link className={styles.resetFilters} href={typePathname}>Zrušiť filtre</Link>
        </PublicFilterDisclosure>
      </form>

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
        <div className={styles.resultMeta}>
          {hasActiveFilters ? <Link className={styles.clearActiveFilters} href={typePathname}>Vymazať filtre</Link> : null}
          <div className={styles.resultCount} aria-live="polite">
          <strong>{filtered.length}</strong>
          <span>{filtered.length === 1 ? "podujatie" : "podujatí"}</span>
          </div>
        </div>
      </div>

      {(query || region || month) ? (
        <p className={styles.filterSummary} aria-label="Aktívne filtre">
          {query ? <span>Hľadanie: {query}</span> : null}
          {region ? <span>Kraj: {region}</span> : null}
          {month ? <span>Mesiac: {monthLabel(month)}</span> : null}
        </p>
      ) : null}

      <nav className={styles.browseNavigation} aria-label="Prezeranie podujatí">
        <a href="#events-calendar">Kalendár</a>
        <a href="#events-list">Zoznam podujatí ↓</a>
      </nav>

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
            const count = eventCounts.get(day.date) ?? 0;
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
                aria-label={(active ? "Vybraný deň " : "") + dayName + (count ? ", " + count + " podujatí" : ", bez podujatí")}
              >
                <span className={styles.monthDayNumber}>{day.day}</span>
                {count > 0 ? <span className={styles.monthDayCount} aria-hidden="true">{count}</span> : null}
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
          <p className={styles.monthHint}>{monthMatches.length === 0 ? "V tomto mesiaci nie sú podujatia zodpovedajúce aktuálnym filtrom. Zmeňte mesiac alebo upravte vyhľadávanie." : "Vyberte deň a zobrazia sa podujatia s odkazmi na ich detail."}</p>
        )}
      </section>

      <section className={styles.upcomingSection} id="events-list" aria-labelledby="events-upcoming-heading">
        <div className={styles.listHeading}><h2 id="events-upcoming-heading">{upcomingTitle}</h2><a href="#events-calendar">↑ Späť ku kalendáru</a></div>
        {filtered.length ? (
          <div className={styles.eventList} data-event-list>
            {filtered.map((event) => <EventCard event={event} today={today} key={event.id} />)}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h3>{events.length ? "Nenašli sme zhodu" : "Prvé podujatia pripravujeme"}</h3>
            <p>{events.length ? "Upravte vyhľadávanie alebo filtre, prípadne sa vráťte k celému zoznamu." : "Kalendár je pripravený. Nové termíny sa tu objavia hneď po publikovaní v redakcii."}</p>
            {events.length > 0 && hasActiveFilters ? <Link href={typePathname}>Zobraziť celý zoznam</Link> : null}
          </div>
        )}
      </section>
    </div>
  );
}
