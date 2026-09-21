"use client";

import { useMemo, useState } from "react";
import { EventCard } from "@/components/event-card";
import { SearchIcon } from "@/components/icons";
import { FilterBar } from "@/components/page-system";
import {
  eventDateStatus,
  eventTimeFilterHref,
  eventTypeFilters,
  eventTypePortalHref,
  eventTypes,
  slovakRegions,
  type DogEvent,
  type EventTimeFilter,
  type EventType,
} from "@/lib/events";
import styles from "./events-public.module.css";

const ALL_REGIONS = "Všetky kraje";
const ALL_MONTHS = "Všetky mesiace";
const MONTH_NAMES = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
const EVENT_SECTION_COPY: Record<EventType, { title: string; allLabel: string }> = {
  Výstava: { title: "Výstavy", allLabel: "Všetky výstavy" },
  Preteky: { title: "Preteky", allLabel: "Všetky preteky" },
  Seminár: { title: "Semináre", allLabel: "Všetky semináre" },
  Tréning: { title: "Tréningy", allLabel: "Všetky tréningy" },
  Stretnutie: { title: "Stretnutia", allLabel: "Všetky stretnutia" },
  Iné: { title: "Ďalšie podujatia", allLabel: "Všetky ostatné" },
};

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk");
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

export function EventCalendar({
  events,
  today,
  initialType = "Všetky",
  initialTime = "upcoming",
}: {
  events: DogEvent[];
  today: string;
  initialType?: EventType | "Všetky";
  initialTime?: EventTimeFilter;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<EventType | "Všetky">(initialType);
  const [region, setRegion] = useState(ALL_REGIONS);
  const [month, setMonth] = useState(ALL_MONTHS);
  const [time, setTime] = useState<EventTimeFilter>(initialTime);
  const listingPath = type === "Všetky" ? "/podujatia" : eventTypePortalHref(type) ?? "/podujatia";

  const months = useMemo(() => {
    const values = new Set<string>();
    events.forEach((event) => monthKeysForEvent(event).forEach((value) => values.add(value)));
    return [...values].sort();
  }, [events]);

  function selectTime(value: EventTimeFilter) {
    setTime(value);
    window.history.replaceState(null, "", eventTimeFilterHref(value, window.location.pathname));
  }

  function selectType(value: EventType | "Všetky", pathname: string) {
    setType(value);
    window.history.pushState(null, "", eventTimeFilterHref(time, pathname));
  }

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    const result = events.filter((event) => {
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
      const timeMatches = time === "all"
        || (time === "upcoming" && dateStatus !== "past")
        || (time === "current" && dateStatus === "current")
        || (time === "past" && dateStatus === "past");
      const monthMatches = month === ALL_MONTHS
        || (event.startDate.slice(0, 7) <= month && (event.endDate || event.startDate).slice(0, 7) >= month);

      return queryMatches
        && (type === "Všetky" || event.eventType === type)
        && (region === ALL_REGIONS || event.region === region)
        && monthMatches
        && timeMatches;
    });

    return result.sort((left, right) => compareEvents(left, right, today));
  }, [events, month, query, region, time, today, type]);

  const isOverviewMode = type === "Všetky"
    && time === "upcoming"
    && !query.trim()
    && region === ALL_REGIONS
    && month === ALL_MONTHS;

  const overviewGroups = useMemo(() => {
    if (!isOverviewMode) return [];
    return eventTypes
      .map((eventType) => {
        const items = filtered.filter((event) => event.eventType === eventType);
        return { eventType, items: items.slice(0, 5), total: items.length };
      })
      .filter((group) => group.total > 0);
  }, [filtered, isOverviewMode]);

  function resetFilters() {
    setQuery("");
    setType(initialType);
    setRegion(ALL_REGIONS);
    setMonth(ALL_MONTHS);
    selectTime(initialTime);
  }

  return (
    <div className={styles.calendar}>
      <div className={styles.typeBar} role="group" aria-label="Typ podujatia">
        {eventTypeFilters.map((option) => {
          const pathname = option.value === "Všetky" ? "/podujatia" : eventTypePortalHref(option.value);
          const href = pathname ? eventTimeFilterHref(time, pathname) : null;
          return href ? (
            <a
              href={href}
              className={type === option.value ? styles.activeChip : styles.chip}
              aria-current={type === option.value ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                selectType(option.value, pathname);
              }}
              key={option.value}
            >
              {option.label}
            </a>
          ) : (
            <button
              type="button"
              className={type === option.value ? styles.activeChip : styles.chip}
              aria-pressed={type === option.value}
              onClick={() => selectType(option.value, "/podujatia")}
              key={option.value}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div data-event-filters>
        <FilterBar className={styles.toolbar}>
          <label className={styles.searchControl}>
            <span>Hľadať</span>
            <span className={styles.searchInput}>
              <SearchIcon size={20} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Názov, mesto, miesto alebo organizátor"
              />
            </span>
          </label>
          <label className={styles.filterControl}>
            <span>Kraj</span>
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              <option>{ALL_REGIONS}</option>
              {slovakRegions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className={styles.filterControl}>
            <span>Mesiac</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              <option>{ALL_MONTHS}</option>
              {months.map((value) => <option value={value} key={value}>{monthLabel(value)}</option>)}
            </select>
          </label>
        </FilterBar>
      </div>

      <div className={styles.resultBar}>
        <div className={styles.timeBar} role="group" aria-label="Obdobie podujatia">
          {([
            ["upcoming", "Najbližšie"],
            ["current", "Prebiehajúce"],
            ["past", "Ukončené"],
            ["all", "Všetky"],
          ] as const).map(([value, label]) => (
            <a
              href={eventTimeFilterHref(value, listingPath)}
              className={time === value ? styles.activeTimeChip : styles.timeChip}
              aria-current={time === value ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                selectTime(value);
              }}
              key={value}
            >
              {label}
            </a>
          ))}
        </div>
        <div className={styles.resultCount} aria-live="polite">
          <strong>{filtered.length}</strong>
          <span>{filtered.length === 1 ? "podujatie" : "podujatí"}</span>
        </div>
      </div>

      {filtered.length ? (
        isOverviewMode ? (
          <div className={styles.categoryOverview} data-event-category-overview>
            {overviewGroups.map((group) => {
              const copy = EVENT_SECTION_COPY[group.eventType];
              const pathname = eventTypePortalHref(group.eventType);
              return (
                <section className={styles.categorySection} data-event-category={group.eventType} key={group.eventType}>
                  <div className={styles.categoryHeading}>
                    <div className={styles.categoryHeadingCopy}>
                      <span className={styles.categoryKicker}>Najbližšie podľa typu</span>
                      <h2 className={styles.categoryTitle}>{copy.title}</h2>
                      <p className={styles.categorySummary}>
                        {group.items.length} najbližších z {group.total}
                      </p>
                    </div>
                    {pathname ? (
                      <a
                        href={eventTimeFilterHref("upcoming", pathname)}
                        className={styles.categoryAll}
                        onClick={(event) => {
                          event.preventDefault();
                          selectType(group.eventType, pathname);
                        }}
                      >
                        {copy.allLabel} <span aria-hidden="true">→</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        className={styles.categoryAll}
                        onClick={() => selectType(group.eventType, "/podujatia")}
                      >
                        {copy.allLabel} <span aria-hidden="true">→</span>
                      </button>
                    )}
                  </div>
                  <div className={styles.categoryList} data-event-category-list>
                    {group.items.map((event) => <EventCard event={event} today={today} key={event.id} />)}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className={styles.eventList} data-event-list>
            {filtered.map((event) => <EventCard event={event} today={today} key={event.id} />)}
          </div>
        )
      ) : (
        <div className={styles.emptyState}>
          <span aria-hidden="true">📅</span>
          <h2>{events.length ? "Nenašli sme zhodu" : "Prvé podujatia pripravujeme"}</h2>
          <p>{events.length ? "Skús zmeniť typ, kraj, mesiac, obdobie alebo hľadaný výraz." : "Kalendár je pripravený. Nové termíny sa tu objavia hneď po publikovaní v redakcii."}</p>
          {events.length > 0 && <button type="button" onClick={resetFilters}>Zrušiť filtre</button>}
        </div>
      )}
    </div>
  );
}
