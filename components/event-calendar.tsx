"use client";

import { useMemo, useState } from "react";
import { EventCard } from "@/components/event-card";
import { SearchIcon } from "@/components/icons";
import { eventTypeFilters, slovakRegions, type DogEvent, type EventType } from "@/lib/events";

type TimeFilter = "upcoming" | "past" | "all";

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
      const lastDate = event.endDate ?? event.startDate;
      const isPast = lastDate < today;
      const queryMatches = !needle || `${event.title} ${event.excerpt} ${event.city} ${event.organizer}`.toLocaleLowerCase("sk").includes(needle);
      return queryMatches
        && (type === "Všetky" || event.eventType === type)
        && (region === "Všetky kraje" || event.region === region)
        && (time === "all" || (time === "past" ? isPast : !isPast));
    });
  }, [events, query, region, time, today, type]);

  return (
    <div className="event-calendar">
      <div className="event-calendar-toolbar">
        <label className="event-search">
          <SearchIcon size={20} />
          <span className="sr-only">Hľadať podujatie</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Názov, mesto alebo organizátor" />
        </label>
        <label>
          <span>Typ</span>
          <select value={type} onChange={(event) => setType(event.target.value as EventType | "Všetky")}>
            {eventTypeFilters.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>Kraj</span>
          <select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option>Všetky kraje</option>
            {slovakRegions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="event-time-filter" aria-label="Filtrovať termín">
        {([
          ["upcoming", "Najbližšie"],
          ["past", "Ukončené"],
          ["all", "Všetky"],
        ] as const).map(([value, label]) => <button type="button" className={time === value ? "is-active" : ""} onClick={() => setTime(value)} key={value}>{label}</button>)}
        <span>{filtered.length} {filtered.length === 1 ? "podujatie" : "podujatí"}</span>
      </div>

      {filtered.length ? (
        <div className="event-grid">{filtered.map((event) => <EventCard event={event} key={event.id} />)}</div>
      ) : (
        <div className="event-empty">
          <span aria-hidden="true">📅</span>
          <h2>{events.length ? "Nenašli sme zhodu" : "Prvé podujatia pripravujeme"}</h2>
          <p>{events.length ? "Skús zmeniť typ, kraj alebo hľadaný výraz." : "Kalendár je pripravený. Nové termíny sa tu objavia hneď po publikovaní v redakcii."}</p>
          {events.length > 0 && <button type="button" onClick={() => { setQuery(""); setType("Všetky"); setRegion("Všetky kraje"); setTime("all"); }}>Zrušiť filtre</button>}
        </div>
      )}
    </div>
  );
}
