"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { eventHref, formatEventDate, type DogEvent } from "@/lib/events";
import { SearchIcon } from "@/components/icons";

type StatusFilter = "all" | "published" | "draft";

export function AdminEventDashboard({ initialEvents }: { initialEvents: DogEvent[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const visibleEvents = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return events.filter((event) => (status === "all" || event.status === status)
      && (!needle || `${event.title} ${event.eventType} ${event.city} ${event.organizer}`.toLocaleLowerCase("sk").includes(needle)));
  }, [events, query, status]);

  const published = events.filter((event) => event.status === "published").length;

  async function removeEvent(event: DogEvent) {
    if (!window.confirm(`Naozaj chceš natrvalo odstrániť podujatie „${event.title}“?`)) return;
    setDeletingId(event.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Podujatie sa nepodarilo odstrániť.");
      setEvents((current) => current.filter((item) => item.id !== event.id));
      setMessage("Podujatie bolo odstránené.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Podujatie sa nepodarilo odstrániť.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Stav kalendára">
        <div><span>Všetky podujatia</span><strong>{events.length}</strong></div>
        <div><span>Publikované</span><strong>{published}</strong></div>
        <div><span>Koncepty</span><strong>{events.length - published}</strong></div>
      </section>
      <section className="admin-panel">
        <div className="admin-toolbar">
          <label className="admin-search"><SearchIcon size={19} /><span className="sr-only">Hľadať podujatie</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Názov, mesto alebo organizátor" /></label>
          <div className="admin-status-filter" aria-label="Filtrovať podľa stavu">
            {([ ["all", "Všetky"], ["published", "Publikované"], ["draft", "Koncepty"] ] as const).map(([value, label]) => <button type="button" className={status === value ? "is-active" : ""} onClick={() => setStatus(value)} key={value}>{label}</button>)}
          </div>
        </div>
        {message && <p className="admin-flash" role="status">{message}</p>}
        {visibleEvents.length ? (
          <div className="admin-article-list">
            {visibleEvents.map((event) => (
              <article className="admin-article-row admin-event-row" key={event.id}>
                <div className="admin-event-date"><strong>{event.startDate.slice(8, 10)}</strong><span>{event.startDate.slice(5, 7)} / {event.startDate.slice(0, 4)}</span></div>
                <div className="admin-article-main">
                  <div className="admin-article-tags"><span className={`admin-status admin-status--${event.status}`}>{event.status === "published" ? "Publikované" : "Koncept"}</span><span>{event.eventType}</span>{event.cancelled && <span>Zrušené</span>}</div>
                  <h2><Link href={`/admin/podujatia/${event.id}`}>{event.title}</Link></h2>
                  <p>{formatEventDate(event)} · {event.city} · {event.organizer}</p>
                </div>
                <div className="admin-row-actions">
                  {event.status === "published" && <Link href={eventHref(event)} target="_blank">Pozrieť ↗</Link>}
                  <Link className="admin-row-edit" href={`/admin/podujatia/${event.id}`}>Upraviť</Link>
                  <button type="button" disabled={deletingId === event.id} onClick={() => void removeEvent(event)}>{deletingId === event.id ? "Odstraňujem…" : "Odstrániť"}</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty"><span>📅</span><h2>Žiadne podujatia</h2><p>Pridaj prvé podujatie alebo zmeň filter.</p></div>
        )}
      </section>
    </>
  );
}
