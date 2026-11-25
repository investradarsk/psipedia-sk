"use client";
import { AffiliateRotatingBanner } from "@/components/affiliate-rotating-banner";
import { formatSlovakCount } from "@/lib/slovak-count";

import { EventListingResults } from "./event-listing-results";
import { PublicSubcategoryNavigator } from "@/components/public-visual-system";
import {
  eventListingParams,
  parseEventListing,
  type EventListingFilters,
} from "@/lib/event-listing";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type MouseEvent,
} from "react";
import { eventTypePresentation } from "@/lib/event-type-presentation";
import {
  calendarMonthDays,
  calendarDaySummary,
  calendarMonthLabel,
  calendarWeekdays,
  moveCalendarMonth,
  resolveCalendarMonth,
} from "@/lib/event-calendar-view";
import {
  eventTimeFilterParam,
  eventTimeFilterFromParam,
  eventMonthFilterFromParam,
  eventTypePortalHref,
  eventTypes,
  type PublicEventDayPreview,
  type PublicEventCard,
  type EventTimeFilter,
  type EventType,
  type SlovakRegion,
} from "@/lib/events";
import styles from "./events-public.module.css";
import { eventsListingType, rememberEventsListing } from "./events-return-link";

function dateLabel(day: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}

export function EventCalendar({
  events,
  filters,
  listing,
  calendarEvents = [],
  calendarSummaries,
  initialCalendarUnavailable = false,
  today,
  initialType = "Všetky",
  initialTime = "upcoming",
  initialQuery = "",
  initialRegion = "",
  initialMonth = "",
  initialCalendarMonth = "",
  initialDay = "",
  afterCalendar,
  sidebar,
}: {
  events: PublicEventCard[];
  filters?: EventListingFilters;
  listing?: { total: number; page: number; pages: number };
  calendarEvents?: PublicEventDayPreview[];
  calendarSummaries?: { date: string; count: number; types: EventType[] }[];
  initialCalendarUnavailable?: boolean;
  today: string;
  initialType?: EventType | "Všetky";
  initialTime?: EventTimeFilter;
  initialQuery?: string;
  initialRegion?: "" | SlovakRegion;
  initialMonth?: string;
  initialCalendarMonth?: string;
  initialDay?: string;
  afterCalendar?: ReactNode;
  sidebar?: ReactNode;
}) {
  const initialFilters =
    filters ??
    parseEventListing(
      {
        q: initialQuery,
        region: initialRegion,
        mesiac: initialMonth,
        termin: eventTimeFilterParam(initialTime),
      },
      initialType,
    );
  type View = {
    month: string;
    page: number;
    day: string;
    filterMonth: string;
    time: EventTimeFilter;
    type: EventType | "Všetky";
  };
  type CalendarData = {
    events: PublicEventCard[];
    listing: { total: number; page: number; pages: number };
    calendarEvents: PublicEventDayPreview[];
    calendarSummaries?: { date: string; count: number; types: EventType[] }[];
    calendarUnavailable?: boolean;
  };
  const [view, setView] = useState<View>(() => ({
    month: resolveCalendarMonth(initialCalendarMonth, initialMonth, today),
    day: initialDay,
    page: initialFilters.page,
    filterMonth: initialMonth,
    time: initialTime,
    type: initialType,
  }));
  const [data, setData] = useState<CalendarData>(() => ({
    events,
    listing: listing ?? { total: events.length, page: 1, pages: 1 },
    calendarEvents,
    calendarSummaries,
    calendarUnavailable: initialCalendarUnavailable,
  }));
  const [pending, setPending] = useState(false);
  const [pendingCalendarOnly, setPendingCalendarOnly] = useState(false);
  const [loadError, setLoadError] = useState("");
  const calendarRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const calendar = calendarRef.current;
    calendar?.setAttribute("data-calendar-ready", "true");
    return () => calendar?.removeAttribute("data-calendar-ready");
  }, []);
  const cacheRef = useRef(new Map<string, CalendarData>());
  // Only retain bounded, short-lived client data. Published event changes
  // become visible again when the cache expires or the page is revisited.
  function remember(key: string, payload: CalendarData) {
    cacheRef.current.delete(key);
    cacheRef.current.set(key, payload);
    window.setTimeout(() => {
      if (cacheRef.current.get(key) === payload) cacheRef.current.delete(key);
    }, 120_000);
    if (cacheRef.current.size > 24) cacheRef.current.delete(cacheRef.current.keys().next().value!);
  }
  useEffect(() => {
    // Never cache a degraded calendar as a successful empty month.
    if (initialCalendarUnavailable) return;
    // Reuse server-rendered data when returning to the initial month/day.
    const current = new URL(window.location.href);
    const endpoint = new URL("/api/public/events/calendar", current.origin);
    current.searchParams.forEach((value, key) => endpoint.searchParams.set(key, value));
    if (initialType !== "Všetky") endpoint.searchParams.set("typ", initialType);
    remember(endpoint.pathname + endpoint.search, {
      events,
      listing: listing ?? { total: events.length, page: 1, pages: 1 },
      calendarEvents,
      calendarSummaries,
    });
  }, []);
  const f = { ...initialFilters, day: view.day || undefined, month: view.filterMonth, time: view.time, type: view.type };
  const query = initialQuery.trim().slice(0, 120);
  const region = initialRegion;
  const month = view.filterMonth;
  const visibleMonth = view.month;
  const todayMonth = today.slice(0, 7);
  // Switching a day, opening filters or a mobile sheet does not change
  // the calendar grid: reuse the same month cell array until the month changes.
  const days = useMemo(() => calendarMonthDays(visibleMonth), [visibleMonth]);
  const selectedDay =
    /^\d{4}-\d{2}-\d{2}$/.test(view.day) &&
    days.some((item) => item.inMonth && item.date === view.day)
      ? view.day
      : "";
  const typePathname =
    view.type === "Všetky" ? "/podujatia" : (eventTypePortalHref(view.type) ?? "/podujatia");
  const filtered = loadError || (pending && !pendingCalendarOnly) ? [] : data.events;
  // A calendar response can contain many event previews. Avoid regenerating
  // summaries and scanning day events when unrelated UI controls rerender.
  const daySummaries = useMemo(
    () =>
      pending
        ? new Map<string, { date: string; count: number; types: EventType[] }>()
        : data.calendarSummaries
          ? new Map(data.calendarSummaries.map((item) => [item.date, item]))
          : new Map(
              days
                .filter((day) => day.inMonth)
                .map((day) => [day.date, calendarDaySummary(data.calendarEvents, day.date)]),
            ),
    [pending, data.calendarSummaries, data.calendarEvents, days],
  );
  async function navigate(href: string, next: Omit<View, "page">, addHistory = true) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (addHistory) window.history.pushState(window.history.state, "", href);
    // Client-only navigation must update the return URL after every month/day change.
    rememberEventsListing(window.location.pathname + window.location.search + window.location.hash);
    const target = new URL(href, window.location.origin);
    const nextPage = parseEventListing({
      strana: target.searchParams.get("strana") ?? undefined,
    }).page;
    setView({ ...next, page: nextPage });
    setLoadError("");
    const endpoint = new URL("/api/public/events/calendar", window.location.origin);
    target.searchParams.forEach((value, key) => endpoint.searchParams.set(key, value));
    if (next.type !== "Všetky") endpoint.searchParams.set("typ", next.type);
    const key = endpoint.pathname + endpoint.search;
    const sameListing =
      view.time === next.time &&
      view.type === next.type &&
      view.filterMonth === next.filterMonth &&
      view.page === nextPage &&
      view.day === next.day;
    const calendarOnly = sameListing && !pending && !loadError && (!next.day || data.calendarUnavailable === true);
    setPendingCalendarOnly(calendarOnly);
    setPending(true);
    const cached = cacheRef.current.get(key);
    if (cached) {
      setData(cached);
      setPending(false);
      setPendingCalendarOnly(false);
      return;
    }
    // When only the calendar month changes, the 12-card listing is unchanged.
    // Request just the new month's aggregate instead of two more list queries.
    if (calendarOnly) endpoint.searchParams.set("calendarOnly", "1");
    try {
      const response = await fetch(endpoint.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Calendar request failed");
      const received = (await response.json()) as Partial<CalendarData>;
      if (
        !Array.isArray(received.calendarEvents) ||
        !Array.isArray(received.calendarSummaries) ||
        (!calendarOnly && (!Array.isArray(received.events) || !received.listing))
      )
        throw new Error("Calendar response invalid");
      if (!controller.signal.aborted) {
        const payload = calendarOnly
          ? {
              ...data,
              calendarEvents: received.calendarEvents,
              calendarSummaries: received.calendarSummaries,
              calendarUnavailable: false,
            }
          : (received as CalendarData);
        remember(key, payload);
        setData(payload);
      }
    } catch {
      if (!controller.signal.aborted) {
        if (calendarOnly) {
          setData((current) => ({ ...current, calendarEvents: [], calendarSummaries: undefined, calendarUnavailable: true }));
        } else {
          setLoadError("Podujatia sa nepodarilo načítať. Skúste to znova.");
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        setPendingCalendarOnly(false);
      }
    }
  }
  // Browser popstate must use current view/data, not the initial render's closure.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });
  // Calendar controls use native anchors: the handler owns history + data
  // updates; a framework Link would also attempt route navigation.
  function clickNavigate(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    next: Omit<View, "page">,
  ) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    void navigate(href, next);
  }
  useEffect(() => {
    function restore() {
      const url = new URL(window.location.href);
      const type = eventsListingType(url.pathname);
      if (!type) return;
      const fromUrlMonth = eventMonthFilterFromParam(url.searchParams.get("mesiac") ?? "");
      const visible = resolveCalendarMonth(
        eventMonthFilterFromParam(url.searchParams.get("kalendar") ?? ""),
        fromUrlMonth,
        today,
      );
      void navigateRef.current(
        url.pathname + url.search,
        {
          month: visible,
          day: url.searchParams.get("den") ?? "",
          filterMonth: fromUrlMonth,
          time: eventTimeFilterFromParam(url.searchParams.get("termin") ?? ""),
          type,
        },
        false,
      );
    }
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      requestRef.current?.abort();
    };
  }, []);

  function calendarHref(targetMonth: string, day = "") {
    const params = eventListingParams({ ...f, day: undefined });
    if (query) params.set("q", query);
    if (region) params.set("region", region);
    // A month filter must not silently suppress every day after navigating to a different month.
    if (month && targetMonth !== month) params.delete("mesiac");
    else if (!day && !view.day && view.page > 1) params.set("strana", String(view.page));
    const timeParam = eventTimeFilterParam(view.time);
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

  useEffect(() => {
    if (pending || !selectedDay || loadError) return;
    const target = document.getElementById("events-list");
    if (!target) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    const id = window.requestAnimationFrame(() =>
      target.scrollIntoView({ behavior: motion, block: "start" }),
    );
    return () => window.cancelAnimationFrame(id);
  }, [selectedDay, pending, loadError]);

  const windowSafeQuery = (state: View) => {
    const params = eventListingParams({
      ...initialFilters,
      day: state.day || undefined,
      time: state.time,
      month: state.filterMonth,
      type: state.type,
    });
    if (state.month !== (state.filterMonth || todayMonth)) params.set("kalendar", state.month);
    if (state.day) params.set("den", state.day);
    if (state.page > 1) params.set("strana", String(state.page));
    return params.size ? "?" + params.toString() : "";
  };
  const timeOptions = [
    ["upcoming", "Najbližšie"],
    ["current", "Prebiehajúce"],
    ["past", "Ukončené"],
    ["all", "Všetky"],
  ] as const;
  const upcomingTitle =
    view.time === "past"
      ? "Ukončené podujatia"
      : view.time === "current"
        ? "Prebiehajúce podujatia"
        : view.time === "all"
          ? "Zoznam podujatí"
          : "Nadchádzajúce podujatia";

  return (
    <div
      ref={calendarRef}
      className={styles.calendar}
      data-public-calendar
      data-event-workspace
      aria-busy={pending}
    >
      <div className={styles.resultBar}>
        <p className={styles.periodLabel}>Obdobie podujatí</p>
        <PublicSubcategoryNavigator
          mode="compact"
          mobileLayout="grid"
          columns={4}
          label="Obdobie podujatia"
          items={timeOptions.map(([value, label]) => ({
            href: timeHref(value),
            title: label,
            current: view.time === value,
          }))}
          onSelect={(event, index) => {
            const value = timeOptions[index][0];
            clickNavigate(event, timeHref(value), { ...view, time: value });
          }}
        />
      </div>


      {pending ? (
        <p role="status" className={styles.monthHint}>
          Načítavajú sa podujatia…
        </p>
      ) : null}
      {loadError ? (
        <p role="alert" className={styles.monthHint}>
          {loadError} <a href={typePathname + windowSafeQuery(view)}>Načítať stránku</a>
        </p>
      ) : null}

      <EventListingResults
          beforeResults={afterCalendar}
          events={filtered}
          filters={f}
          listing={data.listing}
          today={today}
          pathname={typePathname}
          title={selectedDay ? `Podujatia – ${dateLabel(selectedDay)}` : upcomingTitle}
          calendarMonth={visibleMonth}
          day={selectedDay}
          pending={pending && !pendingCalendarOnly}
          loadError={loadError}
          sidebar={<>
      {data.calendarUnavailable ? (
        <p role="status" className={styles.monthHint}>
          Kalendár je dočasne nedostupný. Zoznam podujatí zostáva dostupný.{" "}
          <a href={typePathname + windowSafeQuery(view)} onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            void navigate(typePathname + windowSafeQuery(view), view, false);
          }}>Načítať kalendár znova</a>
        </p>
      ) : (
      <div className={styles.calendarLayout} data-events-calendar-layout>
        <section
          className={styles.monthCalendar}
          id="events-calendar"
          data-events-month-calendar
          aria-labelledby="events-calendar-title"
        >
          <div className={styles.desktopCalendarColumns} data-calendar-desktop-columns>
            <div className={styles.calendarMonthColumn}>
              <div className={styles.monthHeading}>
                <div>
                  <p className={styles.monthEyebrow}>Vyberte si deň</p>
                  <h2 id="events-calendar-title">{calendarMonthLabel(visibleMonth)}</h2>
                </div>
                <nav className={styles.monthNavigation} aria-label="Navigácia kalendára">
                  <a
                    href={calendarHref(moveCalendarMonth(visibleMonth, -1))}
                    onClick={(event) => {
                      const target = moveCalendarMonth(visibleMonth, -1);
                      clickNavigate(event, calendarHref(target), {
                        ...view,
                        month: target,
                        day: "",
                        filterMonth: month && target !== month ? "" : month,
                      });
                    }}
                    aria-label="Predchádzajúci mesiac"
                    rel="prev"
                  >
                    ←
                  </a>
                  <a
                    href={calendarHref(todayMonth)}
                    onClick={(event) =>
                      clickNavigate(event, calendarHref(todayMonth), {
                        ...view,
                        month: todayMonth,
                        day: "",
                        filterMonth: month && todayMonth !== month ? "" : month,
                      })
                    }
                    aria-label="Prejsť na aktuálny mesiac"
                  >
                    Dnes
                  </a>
                  <a
                    href={calendarHref(moveCalendarMonth(visibleMonth, 1))}
                    onClick={(event) => {
                      const target = moveCalendarMonth(visibleMonth, 1);
                      clickNavigate(event, calendarHref(target), {
                        ...view,
                        month: target,
                        day: "",
                        filterMonth: month && target !== month ? "" : month,
                      });
                    }}
                    aria-label="Nasledujúci mesiac"
                    rel="next"
                  >
                    →
                  </a>
                </nav>
              </div>

                <div
                  className={styles.monthGrid}
                  role="group"
                  aria-label={"Dni kalendára " + calendarMonthLabel(visibleMonth)}
                >
                  {calendarWeekdays.map((name) => (
                    <span className={styles.weekday} key={name}>
                      {name}
                    </span>
                  ))}
                  {days.map((day) => {
                    const { count = 0, types = [] } = daySummaries.get(day.date) ?? {};
                    const dayName = dateLabel(day.date);
                    const active = selectedDay === day.date;
                    const todayFlag = day.date === today;
                    if (!day.inMonth)
                      return (
                        <span className={styles.outsideDay} aria-hidden="true" key={day.date} />
                      );
                    return (
                      <a
                        key={day.date}
                        href={calendarHref(visibleMonth, day.date) + "#events-list"}
                        onClick={(event) =>
                          clickNavigate(
                            event,
                            calendarHref(visibleMonth, day.date) + "#events-list",
                            { ...view, day: day.date },
                          )
                        }
                        className={styles.monthDay}
                        data-calendar-date={day.date}
                        data-selected={active ? "true" : undefined}
                        data-today={todayFlag ? "true" : undefined}
                        data-count={count}
                        aria-current={todayFlag ? "date" : undefined}
                        aria-label={
                          (active ? "Vybraný deň " : "") +
                          dayName +
                          (count
                            ? ", " +
                              formatSlovakCount(count, {
                                one: "podujatie",
                                few: "podujatia",
                                many: "podujatí",
                              }) +
                              ", " +
                              types.map((type) => eventTypePresentation[type].label).join(", ")
                            : ", bez podujatí")
                        }
                      >
                        <span className={styles.dayHeading} data-event-day-heading>
                          <span className={styles.monthDayNumber} data-event-day-number>
                            {day.day}
                          </span>
                          {count > 0 ? (
                            <span
                              className={styles.monthDayCount}
                              data-event-day-count
                              aria-hidden="true"
                            >
                              {count}
                            </span>
                          ) : null}
                        </span>
                        {types.length ? (
                          <span
                            className={styles.dayIndicators}
                            data-event-day-dots
                            aria-hidden="true"
                          >
                            {types.slice(0, 4).map((type) => (
                              <span
                                key={type}
                                className={styles.typeDot}
                                data-event-type={type}
                                style={
                                  {
                                    "--event-type-color": eventTypePresentation[type].color,
                                  } as CSSProperties
                                }
                              />
                            ))}
                            {types.length > 4 ? (
                              <span className={styles.moreTypes}>+{types.length - 4}</span>
                            ) : null}
                          </span>
                        ) : null}
                      </a>
                    );
                  })}
                </div>
            </div>
          </div>
          <div
            className={styles.calendarLegend}
            role="list"
            aria-label="Typy podujatí v kalendári"
            data-events-legend
          >
            {eventTypes.map((type) => {
              const presentation = eventTypePresentation[type];
              return (
                <span key={type} role="listitem">
                  <span
                    className={styles.typeDot}
                    aria-hidden="true"
                    data-event-type={type}
                    style={{ "--event-type-color": presentation.color } as CSSProperties}
                  />
                  {presentation.label}
                </span>
              );
            })}
          </div>
        </section>
      </div>
      )}
            <AffiliateRotatingBanner placement="sidebar" />
            <div data-events-popularity>{sidebar}</div>
          </>}
        />
    </div>
  );
}
