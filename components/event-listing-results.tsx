import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { EventCard } from "./event-card";
import { eventListingParams, EVENT_PAGE_SIZE, type EventListingFilters } from "@/lib/event-listing";
import { eventTypes, slovakRegions, type DogEvent } from "@/lib/events";
import { eventTypePresentation } from "@/lib/event-type-presentation";
import styles from "./events-public.module.css";

type Props = {
  events: DogEvent[];
  filters: EventListingFilters;
  listing: { total: number; page: number; pages: number };
  today: string;
  pathname: string;
  title: string;
  calendarMonth: string;
  day: string;
};

export function EventListingResults({ events, filters: f, listing, today, pathname, title, calendarMonth, day }: Props) {
  const params = eventListingParams(f);
  params.set("kalendar", calendarMonth);
  if (day) params.set("den", day);
  const hidden = (exclude: string[]) => [...params]
    .filter(([key]) => !exclude.includes(key))
    .map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  function href(page: number) {
    const next = new URLSearchParams(params);
    if (page > 1) next.set("strana", String(page));
    return `${pathname}?${next.toString()}#events-list`;
  }
  const active = [
    f.query && `Hľadať: ${f.query}`,
    f.region && `Kraj: ${f.region}`,
    f.month && `Mesiac: ${f.month}`,
    f.from && `Od: ${f.from}`,
    f.to && `Do: ${f.to}`,
    f.city && `Lokalita: ${f.city}`,
    f.type === "Všetky" ? "" : `Typ: ${eventTypePresentation[f.type].label}`,
    f.time === "current" ? "Obdobie: Prebiehajúce" : f.time === "past" ? "Obdobie: Ukončené" : "",
  ].filter(Boolean);
  const pages = [...new Set([1, listing.page - 1, listing.page, listing.page + 1, listing.pages])]
    .filter(page => page >= 1 && page <= listing.pages).sort((a, b) => a - b);

  return (
    <div className={styles.listingLayout} data-events-listing-layout>
      <aside className={styles.filterSidebar} aria-label="Filtre podujatí">
        {/* The sibling panel stays usable on desktop without JavaScript; native
            disclosure state controls its mobile visibility and accessibility. */}
        <details className={styles.mobileFilters}>
          <summary aria-controls="events-filter-panel">Filtrovať{active.length ? ` (${active.length})` : ""}</summary>
        </details>
        <div id="events-filter-panel" className={styles.sidebarContent}>
          <div className={styles.sidebarHeading}>
            <h2>Filtrovať podujatia</h2>
            <Link href="/podujatia">Vymazať filtre</Link>
          </div>
          <form method="get" action={`${pathname}#events-list`} data-event-filters>
            {hidden(["region", "od", "do", "mesto", "mesiac"])}
            <label>Dátum od<input type="date" name="od" defaultValue={f.from} /></label>
            <label>Dátum do<input type="date" name="do" defaultValue={f.to} /></label>
            <label>Kraj
              <select aria-label="Kraj" name="region" defaultValue={f.region}>
                <option value="">Všetky kraje</option>
                {slovakRegions.map(region => <option key={region}>{region}</option>)}
              </select>
            </label>
            <label>Mesto / lokalita<input name="mesto" defaultValue={f.city} maxLength={120} /></label>
            <label>Mesiac<input type="month" name="mesiac" defaultValue={f.month} /></label>
            <fieldset>
              <legend>Typ podujatia</legend>
              {(["Všetky", ...eventTypes] as const).map(type => (
                <label className={styles.typeChoice} key={type}>
                  <input type="radio" name="typ" value={type} defaultChecked={f.type === type} />
                  {type !== "Všetky" ? <span className={styles.typeDot} aria-hidden="true"
                    style={{ "--event-type-color": eventTypePresentation[type].color } as CSSProperties} /> : null}
                  {type === "Všetky" ? "Všetky typy" : eventTypePresentation[type].label}
                </label>
              ))}
            </fieldset>
            <button type="submit">Zobraziť výsledky</button>
          </form>
        </div>
      </aside>

      <section className={styles.upcomingSection} id="events-list" aria-labelledby="events-upcoming-heading">
        <div className={styles.listHeading}>
          <div><h2 id="events-upcoming-heading">{title}</h2><p>{listing.total} podujatí</p></div>
          <form method="get" action={`${pathname}#events-list`}>
            {hidden(["zoradenie"])}
            <label>Zoradenie
              <select aria-label="Zoradenie" name="zoradenie" defaultValue={f.sort}>
                <option value="">Predvolené poradie</option>
                <option value="najblizsie">Od najbližšieho dátumu</option>
                <option value="najnovsie">Od najnovšieho dátumu</option>
              </select>
            </label>
            <button type="submit">Zoradiť</button>
          </form>
        </div>
        {active.length ? <p className={styles.filterSummary} aria-label="Aktívne filtre">
          {active.map((value, i) => <span key={i}>{value}</span>)}
        </p> : null}
        {f.error ? <p role="alert">{f.error}</p> : null}
        {events.length ? (
          <>
            <p data-event-range>
              Zobrazených {(listing.page - 1) * EVENT_PAGE_SIZE + 1}–{Math.min(listing.page * EVENT_PAGE_SIZE, listing.total)} z {listing.total} podujatí · Strana {listing.page} z {listing.pages}
            </p>
            <div className={styles.cardGrid} data-event-list>
              {events.map(event => <EventCard key={event.id} event={event} today={today} variant="grid" />)}
            </div>
            <nav className={styles.pagination} aria-label="Stránkovanie podujatí">
              {listing.page > 1 ? <Link href={href(listing.page - 1)} rel="prev">Predchádzajúca</Link> : null}
              {pages.map((page, index) => (
                <Fragment key={page}>
                  {index > 0 && page > pages[index - 1] + 1 ? <span aria-hidden="true">…</span> : null}
                  <Link href={href(page)} aria-current={page === listing.page ? "page" : undefined}>{page}</Link>
                </Fragment>
              ))}
              {listing.page < listing.pages ? <Link href={href(listing.page + 1)} rel="next">Nasledujúca</Link> : null}
            </nav>
          </>
        ) : (
          <div className={styles.emptyState}>
            <h3>Nenašli sme zhodu</h3><p>Upravte vyhľadávanie alebo filtre.</p>
            <Link href="/podujatia">Vymazať filtre</Link>
          </div>
        )}
      </section>
    </div>
  );
}
