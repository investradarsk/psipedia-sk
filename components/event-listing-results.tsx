import { PublicHeading } from "@/components/public-heading";
import { formatSlovakCount } from "@/lib/slovak-count";
import {
  PublicFilterLayout,
  PublicFilterPanel,
  PublicResultsToolbar,
  PublicActiveFilters,
  PublicFilterField,
} from "@/components/public-filters";
import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import {
  PublicChoiceInput,
  PublicSelect,
  PublicTextInput,
} from "@/components/public-visual-system/public-form-controls";
import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { EventCard } from "./event-card";
import { ArrowIcon } from "@/components/icons";
import {
  PublicActionButton,
  PublicActionLink,
  PublicFilterTag,
  PublicNotice,
  PublicPagination,
} from "@/components/public-visual-system";
import { eventListingParams, eventTypeBatchGroupingEnabled, EVENT_PAGE_SIZE, type EventListingFilters } from "@/lib/event-listing";
import { publicPaginationPages } from "@/lib/public-pagination";
import { eventTypePortalHref, eventTypes, slovakRegions, type PublicEventCard } from "@/lib/events";
import { eventTypePresentation } from "@/lib/event-type-presentation";
import styles from "./events-public.module.css";
import directoryStyles from "./directory-public.module.css";

type Props = {
  events: PublicEventCard[];
  filters: EventListingFilters;
  listing: { total: number; page: number; pages: number };
  today: string;
  pathname: string;
  title: string;
  calendarMonth: string;
  day: string;
  beforeResults?: ReactNode;
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
  beforeResults,
}: Props) {
  const groupedByType = eventTypeBatchGroupingEnabled(f);
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
    else next.delete("strana");
    return `${pathname}?${next.toString()}#events-list`;
  }
  const active = [
    { key: "q", label: "Hľadanie", value: f.query },
    { key: "region", label: "Kraj", value: f.region },
    { key: "mesiac", label: "Mesiac", value: f.month },
    { key: "od", label: "Od", value: f.from },
    { key: "do", label: "Do", value: f.to },
    { key: "mesto", label: "Lokalita", value: f.city },
    {
      key: "typ",
      label: "Typ",
      value: f.type === "Všetky" ? "" : eventTypePresentation[f.type].label,
    },
    {
      key: "termin",
      label: "Obdobie",
      value: f.time === "current" ? "Prebiehajúce" : f.time === "past" ? "Ukončené" : "",
    },
    {
      key: "zoradenie",
      label: "Zoradenie",
      value: f.sort === "najblizsie" ? "Najbližšie" : f.sort === "najnovsie" ? "Najnovšie" : "",
    },
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
  const pages = publicPaginationPages(listing.page, listing.pages);

  return (
    <PublicFilterLayout className={styles.listingLayout} data-events-listing-layout>
      <PublicFilterPanel
        title="Filtrovať podujatia"
        resetHref="/podujatia"
        className={styles.filterSidebar}
        aria-label="Filtre podujatí"
      >
        {/* The sibling panel stays usable on desktop without JavaScript; native
            disclosure state controls its mobile visibility and accessibility. */}
        <details className={styles.mobileFilters}>
          <summary aria-controls="events-filter-panel">
            Filtrovať{active.length ? ` (${active.length})` : ""}
          </summary>
        </details>
        <div id="events-filter-panel" className={styles.sidebarContent}>
          <div className={styles.sidebarHeading} data-public-filter-heading>
            <PublicHeading role="section" as="h2">
              Filtrovať podujatia
            </PublicHeading>
            <Link href="/podujatia">Vymazať filtre</Link>
          </div>
          <form method="get" action={`${pathname}#events-list`} data-event-filters>
            {/* A changed month/date/location invalidates the previously selected calendar day.
                Let the server derive the visible month from the submitted mesiac filter. */}
            {hidden(["region", "od", "do", "mesto", "mesiac", "kalendar", "den"])}
            <PublicFilterField label="Dátum od">
              <PublicTextInput appearance="context" type="date" name="od" defaultValue={f.from} />
            </PublicFilterField>
            <PublicFilterField label="Dátum do">
              <PublicTextInput appearance="context" type="date" name="do" defaultValue={f.to} />
            </PublicFilterField>
            <PublicFilterField label="Kraj">
              <PublicSelect
                appearance="context"
                aria-label="Kraj"
                name="region"
                defaultValue={f.region}
              >
                <option value="">Všetky kraje</option>
                {slovakRegions.filter((region) => region !== "Online").map((region) => (
                    <option key={region}>{region}</option>
                  ))}
              </PublicSelect>
            </PublicFilterField>
            <PublicFilterField label="Mesto / lokalita">
              <PublicTextInput
                appearance="context"
                name="mesto"
                defaultValue={f.city}
                maxLength={120}
              />
            </PublicFilterField>
            <PublicFilterField label="Mesiac">
              <PublicTextInput
                appearance="context"
                type="month"
                name="mesiac"
                defaultValue={f.month}
              />
            </PublicFilterField>
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
      </PublicFilterPanel>

      <section
        className={styles.upcomingSection}
        id="events-list"
        aria-labelledby="events-upcoming-heading"
      >
        {beforeResults ? <div data-event-organizer>{beforeResults}</div> : null}
        <PublicResultsToolbar className={styles.listHeading}>
          <div>
            <PublicHeading role="section" as="h2" id="events-upcoming-heading">
              {title}
            </PublicHeading>
            <p>
              {formatSlovakCount(listing.total, {
                one: "podujatie",
                few: "podujatia",
                many: "podujatí",
              })}
            </p>
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
                <option value="">{groupedByType ? "Podľa typu (po 5)" : "Predvolené poradie"}</option>
                <option value="najblizsie">Od najbližšieho dátumu</option>
                <option value="najnovsie">Od najnovšieho dátumu</option>
              </PublicSelect>
            </label>
            <PublicActionButton type="submit">Zoradiť</PublicActionButton>
          </form>
        </PublicResultsToolbar>
        {active.length ? (
          <PublicActiveFilters className={styles.filterSummary}>
            {active.map(({ key, label, value }) => (
              <PublicFilterTag
                key={key}
                href={clearOneHref(key)}
                removeLabel={`Odstrániť filter ${label}: ${value}`}
              >
                <span>
                  {label}: {value}
                </span>
                <span aria-hidden="true">×</span>
              </PublicFilterTag>
            ))}
            <Link href="/podujatia" data-public-filter-reset>
              Vymazať všetko
            </Link>
          </PublicActiveFilters>
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
              {Math.min(listing.page * EVENT_PAGE_SIZE, listing.total)} z{" "}
              {formatSlovakCount(listing.total, {
                one: "podujatia",
                few: "podujatí",
                many: "podujatí",
              })}{" "}
              · Strana {listing.page} z {listing.pages}
            </p>
            <div className={`${styles.cardGrid} ${directoryStyles.listRows}`} data-event-list>
              {events.map((event, index) => (
                <Fragment key={event.id}>
                  {groupedByType && (index === 0 || events[index - 1]?.eventType !== event.eventType) ? (
                    <h3 className={styles.eventTypeGroupHeading}>
                      {eventTypePresentation[event.eventType].label}
                    </h3>
                  ) : null}
                  <EventCard event={event} today={today} variant="grid" />
                  {groupedByType && (index === events.length - 1 || events[index + 1]?.eventType !== event.eventType) ? (
                    <div className={styles.eventTypeGroupFooter} data-event-type-cta={event.eventType}>
                      <PublicActionLink
                        href={`${eventTypePortalHref(event.eventType) ?? "/podujatia"}#events-list`}
                        variant="tertiary"
                        icon={<ArrowIcon size={16} />}
                      >
                        Zobraziť všetky {event.eventType === "Iné"
                          ? "ostatné podujatia"
                          : eventTypePresentation[event.eventType].label.toLocaleLowerCase("sk")}
                      </PublicActionLink>
                    </div>
                  ) : null}
                </Fragment>
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
    </PublicFilterLayout>
  );
}
