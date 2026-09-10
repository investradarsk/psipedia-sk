"use client";

import { useMemo, useState } from "react";
import { EventCard } from "@/components/event-card";
import { SearchIcon } from "@/components/icons";
import { FilterBar } from "@/components/page-system";
import { eventDateStatus, eventTimeFilterHref, eventTypeFilters, eventTypePortalHref, slovakRegions, type DogEvent, type EventTimeFilter, type EventType } from "@/lib/events";

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
  const [region, setRegion] = useState("Všetky kraje");
  const [time, setTime] = useState<EventTimeFilter>(initialTime);
  const listingPath = type === "Všetky" ? "/podujatia" : eventTypePortalHref(type) ?? "/podujatia";

  function selectTime(value: EventTimeFilter) {
    setTime(value);
    window.history.replaceState(null, "", eventTimeFilterHref(value, window.location.pathname));
  }

  function selectType(value: EventType | "Všetky", pathname: string) {
    setType(value);
    window.history.pushState(null, "", eventTimeFilterHref(time, pathname));
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return events.filter((event) => {
      const dateStatus = eventDateStatus(event, today);
      const queryMatches = !needle || `${event.title} ${event.excerpt} ${event.city} ${event.organizer}`.toLocaleLowerCase("sk").includes(needle);
      const timeMatches = time === "all"
        || (time === "upcoming" && dateStatus !== "past")
        || (time === "current" && dateStatus === "current")
        || (time === "past" && dateStatus === "past");
      return queryMatches
        && (type === "Všetky" || event.eventType === type)
        && (region === "Všetky kraje" || event.region === region)
        && timeMatches;
    });
  }, [events, query, region, time, today, type]);

  function resetFilters() {
    setQuery("");
    setType(initialType);
    setRegion("Všetky kraje");
    selectTime("upcoming");
  }

  return (
    <div className="event-calendar">
      <div className="event-time-filter" role="group" aria-label="Typ podujatia">
        {eventTypeFilters.map((option) => {
          const pathname = option.value === "Všetky" ? "/podujatia" : eventTypePortalHref(option.value);
          const href = pathname ? eventTimeFilterHref(time, pathname) : null;
          return href ? (
            <a href={href} className={type === option.value ? "is-active" : ""} aria-current={type === option.value ? "page" : undefined} onClick={(event) => { event.preventDefault(); selectType(option.value, pathname!); }} key={option.value}>{option.label}</a>
          ) : (
            <button type="button" className={type === option.value ? "is-active" : ""} aria-pressed={type === option.value} onClick={() => selectType(option.value, "/podujatia")} key={option.value}>{option.label}</button>
          );
        })}
      </div>

      <FilterBar className="event-calendar-toolbar">
        <label className="event-search">
          <SearchIcon size={20} />
          <span className="sr-only">Hľadať podujatie</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Názov, mesto alebo organizátor" />
        </label>
        <label>
          <span>Kraj</span>
          <select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option>Všetky kraje</option>
            {slovakRegions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Obdobie</span>
          <select value={time} onChange={(event) => selectTime(event.target.value as EventTimeFilter)}>
            <option value="upcoming">Najbližšie</option>
            <option value="current">Prebiehajúce dnes</option>
            <option value="past">Ukončené</option>
            <option value="all">Všetky termíny</option>
          </select>
        </label>
      </FilterBar>

      <div className="event-time-filter" role="group" aria-label="Rýchly filter termínu">
        {([
          ["upcoming", "Najbližšie"],
          ["current", "Prebiehajúce"],
          ["past", "Ukončené"],
          ["all", "Všetky"],
        ] as const).map(([value, label]) => (
          <a
            role="button"
            href={eventTimeFilterHref(value, listingPath)}
            className={time === value ? "is-active" : ""}
            aria-current={time === value ? "page" : undefined}
            onClick={(event) => { event.preventDefault(); selectTime(value); }}
            onKeyDown={(event) => { if (event.key === " ") { event.preventDefault(); selectTime(value); } }}
            key={value}
          >
            {label}
          </a>
        ))}
        <span aria-live="polite">{filtered.length} {filtered.length === 1 ? "podujatie" : "podujatí"}</span>
      </div>

      {filtered.length ? (
        <div className="event-grid">{filtered.map((event) => <EventCard event={event} today={today} key={event.id} />)}</div>
      ) : (
        <div className="event-empty">
          <span aria-hidden="true">📅</span>
          <h2>{events.length ? "Nenašli sme zhodu" : "Prvé podujatia pripravujeme"}</h2>
          <p>{events.length ? "Skús zmeniť typ, kraj, obdobie alebo hľadaný výraz." : "Kalendár je pripravený. Nové termíny sa tu objavia hneď po publikovaní v redakcii."}</p>
          {events.length > 0 && <button type="button" onClick={resetFilters}>Zrušiť filtre a zobraziť najbližšie</button>}
        </div>
      )}
    </div>
  );
}
