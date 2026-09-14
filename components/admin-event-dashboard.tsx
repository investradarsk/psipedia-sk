"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { bratislavaDateKey, eventDateStatus, eventHref, eventTypes, formatEventDate, slovakRegions, type EventStatus } from "@/lib/events";
import { adminEventCounts, defaultEventFilters, filterAdminEvents, type AdminEventFilters, type AdminEventSummary } from "@/lib/admin-events";

const timeLabels = { upcoming: "Nadchádzajúce", current: "Prebieha", past: "Ukončené" };
const PAGE_SIZE = 50;
const subscribeToHydration = () => () => {};

export function AdminEventDashboard({ initialEvents }: { initialEvents: AdminEventSummary[] }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [events, setEvents] = useState(initialEvents);
  const [filters, setFilters] = useState(defaultEventFilters);
  const [today, setToday] = useState(bratislavaDateKey);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setToday(bratislavaDateKey()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const visible = useMemo(() => filterAdminEvents(events, filters, today), [events, filters, today]);
  const counts = useMemo(() => adminEventCounts(events, today), [events, today]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const rows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const years = [...new Set(events.map((event) => event.startDate.slice(0, 4)))].sort();
  function changeFilter(key: keyof AdminEventFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value })); setPage(1); setSelected(new Set());
  }
  function toggle(id: number) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function reload() {
    const response = await fetch("/api/admin/events");
    const data = await response.json();
    if (!response.ok) throw new Error("Obnov stránku, aby si videl aktuálne počty.");
    setEvents(data.events); setSelected(new Set());
  }
  async function bulk(status: EventStatus) {
    const targets = events.filter((event) => selected.has(event.id) && event.status !== status);
    if (!targets.length) { setMessage("Vybrané podujatia už majú požadovaný stav."); return; }
    const verb = status === "published" ? "Publikovať" : "Stiahnuť do konceptu";
    if (!window.confirm(`${verb} ${targets.length} podujatí? Zmena sa týka iba publikačného stavu. Zrušenie ani termín sa nemenia.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/events/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, confirmedCount: targets.length, events: targets.map(({ id, status, updatedAt }) => ({ id, status, updatedAt })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Hromadná zmena zlyhala.");
      setSelected(new Set());
      await reload(); setMessage(`Zmenených podujatí: ${data.changed}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Zmena zlyhala."); }
    finally { setBusy(false); }
  }
  async function removeEvent(event: AdminEventSummary) {
    if (!window.confirm(`Naozaj chceš natrvalo odstrániť podujatie „${event.title}“?`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Podujatie sa nepodarilo odstrániť.");
      await reload(); setMessage("Podujatie bolo odstránené.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Odstránenie zlyhalo."); }
    finally { setBusy(false); }
  }
  return <div className="admin-events-workspace" data-hydrated={hydrated}>
    <section className="admin-stats admin-event-stats" aria-label="Stav celého kalendára">
      {([["all", "Všetky"], ["upcoming", "Nadchádzajúce"], ["current", "Prebiehajúce"], ["past", "Minulé"], ["published", "Publikované"], ["draft", "Koncepty"]] as const).map(([key, label]) => <div key={key} data-count={key}><span>{label}</span><strong>{counts[key]}</strong></div>)}
    </section>
    <section className="admin-panel">
      <fieldset className="admin-event-controls" disabled={!hydrated || busy}>
        <legend className="sr-only">Vyhľadávanie a filtre podujatí</legend>
        <label className="admin-search"><span className="sr-only">Hľadať podujatie</span><input value={filters.query} onChange={(e) => changeFilter("query", e.target.value)} placeholder="Názov, mesto, areál, organizátor, typ, kraj alebo slug" /></label>
        <div className="admin-status-filter admin-event-time-filters" aria-label="Časový stav">
          {[["all", "Všetky"], ["upcoming", "Nadchádzajúce"], ["current", "Prebiehajúce"], ["past", "Minulé"], ["cancelled", `Zrušené (${counts.cancelled})`]].map(([value, label]) => <button type="button" key={value} aria-pressed={filters.time === value} className={filters.time === value ? "is-active" : ""} onClick={() => changeFilter("time", value)}>{label}</button>)}
        </div>
        <div className="admin-event-filters">
          <div><label htmlFor="admin-event-filter-status">Publikačný stav</label><select id="admin-event-filter-status" value={filters.status} onChange={(e) => changeFilter("status", e.target.value)}><option value="all">Všetky stavy</option><option value="published">Publikované</option><option value="draft">Koncepty</option></select></div>
          <div><label htmlFor="admin-event-filter-type">Typ podujatia</label><select id="admin-event-filter-type" value={filters.type} onChange={(e) => changeFilter("type", e.target.value)}><option value="">Všetky typy</option>{eventTypes.map((v) => <option key={v}>{v}</option>)}</select></div>
          <div><label htmlFor="admin-event-filter-region">Kraj</label><select id="admin-event-filter-region" value={filters.region} onChange={(e) => changeFilter("region", e.target.value)}><option value="">Všetky kraje</option>{slovakRegions.map((v) => <option key={v}>{v}</option>)}</select></div>
          <div><label htmlFor="admin-event-filter-month">Mesiac začiatku</label><select id="admin-event-filter-month" value={filters.month} onChange={(e) => changeFilter("month", e.target.value)}><option value="">Všetky mesiace</option>{["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"].map((v, i) => <option value={String(i + 1).padStart(2, "0")} key={v}>{v}</option>)}</select></div>
          <div><label htmlFor="admin-event-filter-year">Rok začiatku</label><select id="admin-event-filter-year" value={filters.year} onChange={(e) => changeFilter("year", e.target.value)}><option value="">Všetky roky</option>{years.map((v) => <option key={v}>{v}</option>)}</select></div>
          <div><label htmlFor="admin-event-filter-sort">Zoradiť</label><select id="admin-event-filter-sort" value={filters.sort} onChange={(e) => changeFilter("sort", e.target.value)}><option value="date">Podľa dátumu a priebehu</option><option value="title">Podľa názvu A–Z</option><option value="updated">Posledná úprava</option></select></div>
        </div>
        <button type="button" onClick={() => { setFilters(defaultEventFilters); setPage(1); setSelected(new Set()); }}>Zrušiť filtre</button>
      </fieldset>
      <div className="admin-event-bulk">
        <label><input type="checkbox" disabled={!hydrated || busy || !rows.length} checked={!!rows.length && rows.every((e) => selected.has(e.id))} onChange={(e) => { const checked = e.target.checked; setSelected((current) => { const next = new Set(current); rows.forEach((row) => { if (checked) next.add(row.id); else next.delete(row.id); }); return next; }); }} /> Vybrať túto stranu</label>
        <span role="status">Vybrané: {selected.size}</span>
        <button type="button" disabled={!hydrated || busy || !selected.size || selected.size > 500} onClick={() => void bulk("published")}>Publikovať vybrané</button>
        <button type="button" disabled={!hydrated || busy || !selected.size || selected.size > 500} onClick={() => void bulk("draft")}>Stiahnuť do konceptu</button>
        {!!selected.size && <button type="button" disabled={!hydrated || busy} onClick={() => setSelected(new Set())}>Zrušiť výber</button>}
      </div>
      {selected.size > 500 && <p role="alert">V jednej dávke vyber najviac 500 podujatí.</p>}
      <p className="admin-event-result-count" role="status">Nájdené: {visible.length} z {events.length} · Zobrazené: {rows.length}. Časové filtre nezahŕňajú zrušené podujatia.</p>
      {message && <p className="admin-flash" role="status">{message}</p>}
      <div className="admin-article-list" aria-busy={busy}>
        {rows.map((event) => {
          const dateStatus = eventDateStatus(event, today);
          return <article className={`admin-article-row admin-event-row admin-event-row-v2 ${dateStatus === "past" ? "is-past" : ""}`} key={event.id}>
            <input aria-label={`Vybrať ${event.title}`} type="checkbox" checked={selected.has(event.id)} disabled={!hydrated || busy} onChange={() => toggle(event.id)} />
            <div className="admin-event-date"><strong>{event.startDate.slice(8, 10)}</strong><span>{event.startDate.slice(5, 7)} / {event.startDate.slice(0, 4)}</span></div>
            <div className="admin-article-main">
              <div className="admin-article-tags"><span className={`admin-status admin-status--${event.status}`}>{event.status === "published" ? "Publikované" : "Koncept"}</span><span className={`admin-event-chip is-${event.cancelled ? "cancelled" : dateStatus}`}>{event.cancelled ? "Zrušené" : timeLabels[dateStatus]}</span><span>{event.eventType}</span></div>
              <h2><Link href={`/admin/podujatia/${event.id}`}>{event.title}</Link></h2>
              <p>{formatEventDate(event)} · {event.city} · {event.region}</p><p>{[event.venue, event.organizer].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="admin-row-actions">{event.status === "published" && <Link href={eventHref(event)} target="_blank">Pozrieť ↗</Link>}<Link className="admin-row-edit" href={`/admin/podujatia/${event.id}`}>Upraviť</Link><button type="button" disabled={!hydrated || busy} onClick={() => void removeEvent(event)}>Odstrániť</button></div>
          </article>;
        })}
      </div>
      {!rows.length && <div className="admin-empty"><h2>Žiadne podujatia</h2><p>Skús zmeniť vyhľadávanie alebo filtre.</p></div>}
      <nav className="admin-event-pagination" aria-label="Stránky podujatí"><button type="button" disabled={!hydrated || busy || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Predchádzajúca</button><span>Strana {currentPage} z {pages}</span><button type="button" disabled={!hydrated || busy || currentPage === pages} onClick={() => setPage(currentPage + 1)}>Nasledujúca</button></nav>
    </section>
  </div>;
}
