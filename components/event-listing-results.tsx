import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import {
  PublicChoiceInput,
  PublicSelect,
  PublicTextInput,
} from "@/components/public-visual-system/public-form-controls";
import Link from "next/link";
import type { CSSProperties } from "react";
import { EventCard } from "./event-card";
import { PublicActionButton, PublicFilterTag, PublicNotice, PublicPagination } from "@/components/public-visual-system";
import { eventListingParams, EVENT_PAGE_SIZE, type EventListingFilters } from "@/lib/event-listing";
import { eventTypes, slovakRegions, type PublicEventCard } from "@/lib/events";
import { eventTypePresentation } from "@/lib/event-type-presentation";
import styles from "./events-public.module.css";

type Props = {
  events: PublicEventCard[];
  filters: EventListingFilters;
  listing: { total: number; page: number; pages: number };
  today: string;
  pathname: string;
  title: string;
  calendarMonth: string;
  day: string;
};

export function EventListingResults({
  events,
  filters: f,
  listing,
  today,
  pathname,
  title,
  calendarMonth,
  day,
}: Props) {
  const params = eventListingParams(f);
  params.set("kalendar", calendarMonth);
  if (day) params.set("den", day);
  const hidden = (exclude: string[]) =>
    [...params]
      .filter(([key]) => !exclude.includes(key))
      .map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  function href(page: number) {
    const next = new URLSearchParams(params);
    if (page > 1) next.set("strana", String(page));
    return `${pathname}?${next.toString()}#events-list`;
  }
  const active = [
    { key: "q", label: "Hľadanie", value: f.query },
    { key: "region", label: "Kraj", value: f.region },
    { key: "mesiac", label: "Mesiac", value: f.month },
    { key: "od", label: "Od", value: f.from },
    { key: "do", label: "Do", value: f.to },
    { key: "mesto", label: "Lokalita", value: f.city },
    { key: "typ", label: "Typ", value: f.type === "Všetky" ? "" : eventTypePresentation[f.type].label },
    { key: "termin", label: "Obdobie", value: f.time === "current" ? "Prebiehajúce" : f.time === "past" ? "Ukončené" : "" },
    { key: "zoradenie", label: "Zoradenie", value: f.sort === "najblizsie" ? "Najbližšie" : f.sort === "najnovsie" ? "Najnovšie" : "" },
  ].filter((entry) => Boolean(entry.value));
  const clearOneHref = (key: string) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    // The type is encoded in the event category pathname, not in a query parameter.
    const target = key === "typ" ? "/podujatia" : pathname;
    // Removing a date period must show all events, rather than restore the default upcoming filter.
    if (key === "termin") next.set("termin", "vsetky");
    return target + (next.size ? `?${next.toString()}` : "") + "#events-list";
  };
  const pages = [...new Set([1, listing.page - 1, listing.page, listing.page + 1, listing.pages])]
    .filter((page) => page >= 1 && page <= listing.pages)
    .sort((a, b) => a - b);

  return (
    <div className={styles.listingLayout} data-events-listing-layout>
      <aside className={styles.filterSidebar} aria-label="Filtre podujatí">
        {/* The sibling panel stays usable on desktop without JavaScript; native
            disclosure state controls its mobile visibility and accessibility. */}
        <details className={styles.mobileFilters}>
          <summary aria-controls="events-filter-panel">
            Filtrovať{active.length ? ` (${active.length})` : ""}
          </summary>
        </details>
        <div id="events-filter-panel" className={styles.sidebarContent}>
          <div className={styles.sidebarHeading}>
            <h2>Filtrovať podujatia</h2>
            <Link href="/podujatia">Vymazať filtre</Link>
          </div>
          <form method="get" action={`${pathname}#events-list`} data-event-filters>
            {hidden(["region", "od", "do", "mesto", "mesiac"])}
            <label>
              Dátum od
              <PublicTextInput appearance="context" type="date" name="od" defaultValue={f.from} />
            </label>
            <label>
              Dátum do
              <PublicTextInput appearance="context" type="date" name="do" defaultValue={f.to} />
            </label>
            <label>
              Kraj
              <PublicSelect
                appearance="context"
                aria-label="Kraj"
                name="region"
                defaultValue={f.region}
              >
                <option value="">Všetky kraje</option>
                {slovakRegions
                  .filter((region) => region !== "Online")
                  .map((region) => (
                    <option key={region}>{region}</option>
                  ))}
              </PublicSelect>
            </label>
            <label>
              Mesto / lokalita
              <PublicTextInput
                appearance="context"
                name="mesto"
                defaultValue={f.city}
                maxLength={120}
              />
            </label>
            <label>
              Mesiac
              <PublicTextInput
                appearance="context"
                type="month"
                name="mesiac"
                defaultValue={f.month}
              />
            </label>
            <fieldset>
              <legend>Typ podujatia</legend>
              {(["Všetky", ...eventTypes] as const).map((type) => (
                <label className={styles.typeChoice} key={type}>
                  <PublicChoiceInput
                    type="radio"
                    name="typ"
                    value={type}
                    defaultChecked={f.type === type}
                  />
                  {type !== "Všetky" ? (
                    <span
                      className={styles.typeDot}
                      aria-hidden="true"
                      style={
                        { "--event-type-color": eventTypePresentation[type].color } as CSSProperties
                      }
                    />
                  ) : null}
                  {type === "Všetky" ? "Všetky typy" : eventTypePresentation[type].label}
                </label>
              ))}
            </fieldset>
            <PublicActionButton type="submit">Zobraziť výsledky</PublicActionButton>
          </form>
        </div>
      </aside>

      <section
        className={styles.upcomingSection}
        id="events-list"
        aria-labelledby="events-upcoming-heading"
      >
        <div className={styles.listHeading}>
          <div>
            <h2 id="events-upcoming-heading">{title}</h2>
            <p>{listing.total} podujatí</p>
          </div>
          <form method="get" action={`${pathname}#events-list`}>
            {hidden(["zoradenie"])}
            <label>
              Zoradenie
              <PublicSelect
                appearance="context"
                aria-label="Zoradenie"
                name="zoradenie"
                defaultValue={f.sort}
              >
                <option value="">Predvolené poradie</option>
                <option value="najblizsie">Od najbližšieho dátumu</option>
                <option value="najnovsie">Od najnovšieho dátumu</option>
              </PublicSelect>
            </label>
            <PublicActionButton type="submit">Zoradiť</PublicActionButton>
          </form>
        </div>
        {active.length ? (
          <div className={styles.filterSummary} aria-label="Aktívne filtre" data-public-active-filters>
            <span data-public-active-filter-label>Aktívne filtre</span>
            {active.map(({ key, label, value }) => (
              <PublicFilterTag key={key} href={clearOneHref(key)} removeLabel={`Odstrániť filter ${label}: ${value}`}>
                <span>{label}: {value}</span><span aria-hidden="true">×</span>
              </PublicFilterTag>
            ))}
            <Link href="/podujatia" data-public-filter-reset>Vymazať všetko</Link>
          </div>
        ) : null}
        {f.error ? (
          <PublicNotice role="alert" tone="error">
            {f.error}
          </PublicNotice>
        ) : null}
        {events.length ? (
          <>
            <p data-event-range>
              Zobrazených {(listing.page - 1) * EVENT_PAGE_SIZE + 1}–
              {Math.min(listing.page * EVENT_PAGE_SIZE, listing.total)} z {listing.total} podujatí ·
              Strana {listing.page} z {listing.pages}
            </p>
            <div className={styles.cardGrid} data-event-list>
              {events.map((event) => (
                <EventCard key={event.id} event={event} today={today} variant="grid" />
              ))}
            </div>
            <PublicPagination
              className={styles.pagination}
              label="Stránkovanie podujatí"
              currentPage={listing.page}
              totalPages={listing.pages}
              previousHref={listing.page > 1 ? href(listing.page - 1) : undefined}
              nextHref={listing.page < listing.pages ? href(listing.page + 1) : undefined}
              previousLabel="Predchádzajúca"
              nextLabel="Nasledujúca"
              numberedPages={pages}
              pageHref={href}
              showDisabledControls={false}
            />
          </>
        ) : (
          <PublicEmptyState variant="context" className={styles.emptyState}>
            <h3>Nenašli sme zhodu</h3>
            <p>Upravte vyhľadávanie alebo filtre.</p>
            <Link href="/podujatia">Vymazať filtre</Link>
          </PublicEmptyState>
        )}
      </section>
    </div>
  );
}
