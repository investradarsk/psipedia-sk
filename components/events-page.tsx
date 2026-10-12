import { eventListingParams, type EventListingFilters } from '@/lib/event-listing';
import Link from "next/link";
import { HomePortalSearch } from "@/components/home-portal-search";
import homeStyles from "@/app/home-v2.module.css";
import { calendarMonthDays, resolveCalendarMonth } from "@/lib/event-calendar-view";
import { EventCalendar } from "@/components/event-calendar";
import { RememberEventsListing } from "@/components/events-return-link";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import {
  PublicContextBanner,
  PublicContentShell,
  PublicFoundation,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { eventTypePresentation } from "@/lib/event-type-presentation";
import {
  bratislavaDateKey,
  eventTypeListingSeo,
  eventTypePortalHref,
  eventTimeFilterParam,
  eventTypes,
  type DogEvent,
  type EventTimeFilter,
  type EventType,
  type SlovakRegion,
} from "@/lib/events";
import type { PortalSection } from "@/lib/portal";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import styles from "./events-public.module.css";

export async function EventsPage({
  events,
  filters,
  listing,
  calendarEvents = [],
  calendarSummaries,
  initialCalendarMonth = "",
  initialDay = "",
  initialType = "Všetky",
  initialTime = "upcoming",
  initialQuery = "",
  initialRegion = "",
  initialMonth = "",
}: {
  events: DogEvent[];
  filters?: EventListingFilters;
  listing?: {total:number;page:number;pages:number};
  calendarEvents?: DogEvent[];
  calendarSummaries?: {date:string;count:number;types:EventType[]}[];
  initialCalendarMonth?: string;
  initialDay?: string;
  initialType?: EventType | "Všetky";
  initialTime?: EventTimeFilter;
  initialQuery?: string;
  initialRegion?: "" | SlovakRegion;
  initialMonth?: string;
  section?: PortalSection;
}) {
  const isMainListing = initialType === "Všetky";
  const copy = isMainListing
    ? { title: "Podujatia", description: "Výstavy, preteky, semináre, tréningy a stretnutia pre psí svet na jednom mieste." }
    : eventTypeListingSeo(initialType);
  const title = isMainListing ? "Podujatia" : copy.title;
  const description = isMainListing
    ? "Objav výstavy psov, preteky, tréningy, semináre a stretnutia po celom Slovensku. Vyber si termín a miesto, ktoré ti vyhovuje."
    : copy.description;
  const categoryHref = isMainListing ? null : eventTypePortalHref(initialType);
  const categorySlug = categoryHref?.split("/").filter(Boolean).at(-1) ?? "";
  const heroVisual = await getSectionHeroVisual(isMainListing || !categorySlug ? "section.podujatia" : `events.${categorySlug}`);
  const heroVisualForPage = {
    ...heroVisual,
    heroContent: {
      ...(heroVisual.heroContent ?? {}),
      // Approved landing copy; retain the managed image, crops and category copy.
      ...(isMainListing ? { title, eyebrow: "KALENDÁR PSÍCH PODUJATÍ", intro: description } : {}),
      config: {
        ...(heroVisual.heroContent?.config ?? {}),
        ctaEnabled: false,
        quickLinks: [],
        ...(isMainListing ? { metaLabel: "" } : {}),
      },
    },
  };
  const today = bratislavaDateKey();
  const visibleMonth = resolveCalendarMonth(initialCalendarMonth, initialMonth, today);
  const selectedDay = calendarMonthDays(visibleMonth).some((day) => day.inMonth && day.date === initialDay) ? initialDay : "";
  const searchHidden = [
    { name: "termin", value: eventTimeFilterParam(initialTime) },
    { name: "region", value: initialRegion },
    { name: "mesiac", value: initialMonth },
    { name: "kalendar", value: visibleMonth !== (initialMonth || today.slice(0, 7)) ? visibleMonth : "" },
    { name: "den", value: selectedDay },
    ...Object.entries({od: filters?.from, do: filters?.to, mesto: filters?.city, zoradenie: filters?.sort}).map(([name,value]) => ({name,value: value ?? ""})),
  ].filter((field) => Boolean(field.value));
  const searchShortcuts = eventTypes.filter((type) => type !== "Iné").flatMap((type) => {
    const href = eventTypePortalHref(type);
    const params = filters ? eventListingParams(filters) : new URLSearchParams();
    if (selectedDay) params.set("den", selectedDay);
    if (visibleMonth !== (initialMonth || today.slice(0,7))) params.set("kalendar", visibleMonth);
    return href ? [{ href: href + (params.size ? "?" + params.toString() : ""), label: eventTypePresentation[type].label }] : [];
  });


  return (
    <main id="obsah">
      <RememberEventsListing key={[initialCalendarMonth, initialDay, initialType, initialTime, initialQuery, initialRegion, initialMonth, filters?.from, filters?.to, filters?.city, filters?.sort, listing?.page].join("|")} />
      <PublicFoundation className={styles.foundation}>
        <div className={homeStyles.homeV2}>
          <UnifiedSectionHeroShell className={isMainListing ? styles.homeHeroShell : styles.heroShell}>
            <UnifiedSectionHero
              breadcrumbs={<Breadcrumbs className={styles.breadcrumbs}>
                <Link href="/">Domov</Link><span>/</span>
                {isMainListing ? <span>Podujatia</span> : <><Link href="/podujatia">Podujatia</Link><span>/</span><span>{copy.title}</span></>}
              </Breadcrumbs>}
              variant="homepage-style"
              eyebrow={isMainListing ? "KALENDÁR PSÍCH PODUJATÍ" : "Kalendár a databáza"}
              title={title}
              intro={description}
              visual={heroVisualForPage}
            />
          </UnifiedSectionHeroShell>
          <PageContainer className={isMainListing ? "home-search-shell" : styles.categorySearchShell}>
            <HomePortalSearch
              action={categoryHref ?? "/podujatia"}
              id="events-search"
              label="Hľadať podujatia"
              panelLabel="Vyhľadávanie podujatí"
              eyebrow="ČO HĽADÁŠ?"
              title="Nájdi podujatie pre seba a svojho psa."
              placeholder="Názov podujatia, mesto, miesto alebo organizátor..."
              buttonLabel="Hľadať"
              defaultValue={initialQuery}
              allowEmpty
              hidden={searchHidden}
              shortcuts={searchShortcuts}
              searchScope="events"
            />
          </PageContainer>
        </div>

        <section className={styles.calendarSection} aria-label="Kalendár podujatí">
          <PublicContentShell variant="listing">
            <EventCalendar filters={filters} listing={listing} events={events} calendarEvents={calendarEvents} calendarSummaries={calendarSummaries} initialCalendarMonth={initialCalendarMonth} initialDay={initialDay} today={today} initialType={initialType} initialTime={initialTime} initialQuery={initialQuery} initialRegion={initialRegion} initialMonth={initialMonth}
              afterCalendar={
                <section className={styles.calendarOrganizer} aria-label="Pre organizátorov">
                  <PublicContextBanner
                    eyebrow="PRE ORGANIZÁTOROV"
                    title="Organizujete podujatie?"
                    text="Pridajte výstavu, preteky, tréning alebo inú kynologickú akciu do kalendára Psipedie."
                    ctaLabel="Pridať podujatie"
                    ctaHref="/podujatia/pridat-podujatie"
                    tone="coral"
                  />
                </section>
              }
            />
          </PublicContentShell>
        </section>




      </PublicFoundation>
    </main>
  );
}
