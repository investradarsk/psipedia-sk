"use client";

import { useMemo, useState } from "react";
import { EventCard } from "@/components/event-card";
import { SearchIcon } from "@/components/icons";
import { eventDateStatus, eventTypeFilters, slovakRegions, type DogEvent, type EventType } from "@/lib/events";

type TimeFilter = "upcoming" | "current" | "past" | "all";

export function EventCalendar({
  events,
  today,
  initialType = "Všetky",
}: {
  events: DogEvent[];
  today: string;
  initialType?: EventType | "Všetky";
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<EventType | "Všetky">(initialType);
  const [region, setRegion] = useState("Všetky kraje");
  const [time, setTime] = useState<TimeFilter>("upcoming");

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
    setTime("upcoming");
  }

  return (
    <div className="event-calendar">
      <nav className="event-time-filter" aria-label="Typ podujatia">
        {eventTypeFilters.map((option) => (
          <button
            type="button"
            className={type === option.value ? "is-active" : ""}
            aria-pressed={type === option.value}
            onClick={() => setType(option.value)}
            key={option.value}
          >
            {option.label}
          </button>
        ))}
      </nav>

      <div className="event-calendar-toolbar">
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
          <select value={time} onChange={(event) => setTime(event.target.value as TimeFilter)}>
            <option value="upcoming">Najbližšie</option>
            <option value="current">Prebiehajúce dnes</option>
            <option value="past">Ukončené</option>
            <option value="all">Všetky termíny</option>
          </select>
        </label>
      </div>

      <div className="event-time-filter" aria-label="Rýchly filter termínu">
        {([
          ["upcoming", "Najbližšie"],
          ["current", "Prebiehajúce"],
          ["past", "Ukončené"],
          ["all", "Všetky"],
        ] as const).map(([value, label]) => (
          <button
            type="button"
            className={time === value ? "is-active" : ""}
            aria-pressed={time === value}
            onClick={() => setTime(value)}
            key={value}
          >
            {label}
          </button>
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
