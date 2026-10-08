import Link from "next/link";
import { EventCalendar } from "@/components/event-calendar";
import { RememberEventsListing } from "@/components/events-return-link";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import {
  PublicContextBanner,
  PublicContentShell,
  PublicFoundation,
  PublicLandingSectionHeading,
  PublicSubcategoryNavigator,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { PawMark, SparkIcon, WhistleIcon } from "@/components/icons";
import {
  bratislavaDateKey,
  eventDateStatus,
  eventTypeListingSeo,
  eventTypePortalHref,
  eventTypes,
  type DogEvent,
  type EventTimeFilter,
  type EventType,
  type SlovakRegion,
} from "@/lib/events";
import type { PortalSection } from "@/lib/portal";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import styles from "./events-public.module.css";

const EVENT_NAV_COPY: Record<EventType, { title: string; description: string }> = {
  Výstava: { title: "Výstavy", description: "Národné, medzinárodné a klubové výstavy psov." },
  Preteky: { title: "Preteky", description: "Športové súťaže, pracovné skúšky a ďalšie preteky." },
  Seminár: { title: "Semináre", description: "Vzdelávanie, workshopy a odborné stretnutia." },
  Tréning: { title: "Tréningy", description: "Verejné tréningy a praktické kynologické aktivity." },
  Stretnutie: { title: "Stretnutia", description: "Klubové, komunitné a spoločenské akcie so psami." },
  Iné: { title: "Ďalšie", description: "Ďalšie termíny a akcie zo sveta psov." },
};

function eventLandingIcon(eventType: EventType) {
  if (eventType === "Preteky") return <WhistleIcon size={22} />;
  if (eventType === "Výstava") return <SparkIcon size={22} />;
  return <PawMark size={22} />;
}

function eventLandingFallbackImage(eventType: EventType, sectionImage: string) {
  if (eventType === "Preteky" || eventType === "Seminár" || eventType === "Tréning") {
    return "/images/trening-pri-nohe.webp";
  }
  return sectionImage;
}

export async function EventsPage({
  events,
  calendarEvents = [],
  initialCalendarMonth = "",
  initialDay = "",
  initialType = "Všetky",
  initialTime = "upcoming",
  initialQuery = "",
  initialRegion = "",
  initialMonth = "",
  section,
}: {
  events: DogEvent[];
  calendarEvents?: DogEvent[];
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
  const title = isMainListing ? section?.label ?? copy.title : copy.title;
  const description = isMainListing ? section?.description ?? copy.description : copy.description;
  const categoryHref = isMainListing ? null : eventTypePortalHref(initialType);
  const categorySlug = categoryHref?.split("/").filter(Boolean).at(-1) ?? "";
  const heroVisual = await getSectionHeroVisual(isMainListing || !categorySlug ? "section.podujatia" : `events.${categorySlug}`);
  const heroVisualForPage = {
    ...heroVisual,
    heroContent: {
      ...(heroVisual.heroContent ?? {}),
      config: {
        ...(heroVisual.heroContent?.config ?? {}),
        ctaEnabled: false,
        quickLinks: [],
      },
    },
  };
  const today = bratislavaDateKey();
  const landingCategories = isMainListing ? eventTypes.flatMap((eventType) => {
    const href = eventTypePortalHref(eventType);
    if (!href) return [];
    const copy = EVENT_NAV_COPY[eventType];
    const count = events.filter((event) => !event.cancelled && event.eventType === eventType && eventDateStatus(event, today) !== "past").length;
    const featuredEvent = events.find((event) =>
      !event.cancelled
      && event.eventType === eventType
      && eventDateStatus(event, today) !== "past"
      && Boolean(event.imageUrl),
    );
    const image = {
      src: featuredEvent?.imageUrl || eventLandingFallbackImage(eventType, heroVisual.imageUrl),
      alt: "",
    };
    return [{
      href,
      title: copy.title,
      description: copy.description,
      meta: `${count} aktívnych`,
      image,
      icon: eventLandingIcon(eventType),
    }];
  }) : [];

  const compactNavigation = [
    { href: "/podujatia", title: "Všetky podujatia", current: isMainListing },
    ...eventTypes.flatMap((eventType) => {
      const href = eventTypePortalHref(eventType);
      return href ? [{
        href,
        title: EVENT_NAV_COPY[eventType].title,
        current: initialType === eventType,
      }] : [];
    }),
  ];

  return (
    <main id="obsah">
      <RememberEventsListing key={[initialCalendarMonth, initialDay, initialType, initialTime, initialQuery, initialRegion, initialMonth].join("|")} />
      <PublicFoundation className={styles.foundation}>
        <UnifiedSectionHeroShell className={styles.heroShell}>
          <UnifiedSectionHero
            breadcrumbs={<Breadcrumbs className={styles.breadcrumbs}>
              <Link href="/">Domov</Link><span>/</span>
              {isMainListing ? <span>Podujatia</span> : <><Link href="/podujatia">Podujatia</Link><span>/</span><span>{copy.title}</span></>}
            </Breadcrumbs>}
            eyebrow="Kalendár a databáza"
            title={title}
            intro={description}
            visual={heroVisualForPage}
          />
        </UnifiedSectionHeroShell>

        <section className={styles.calendarSection} aria-label="Kalendár podujatí">
          <PublicContentShell variant="listing">
            <EventCalendar events={events} calendarEvents={calendarEvents} initialCalendarMonth={initialCalendarMonth} initialDay={initialDay} today={today} initialType={initialType} initialTime={initialTime} initialQuery={initialQuery} initialRegion={initialRegion} initialMonth={initialMonth} />
          </PublicContentShell>
        </section>

        {isMainListing ? (
          <section className={styles.landingCategories} aria-labelledby="events-category-heading">
            <PublicContentShell variant="landing">
              <PublicLandingSectionHeading
                eyebrow="Typy podujatí"
                title="Vyberte si, čo vás zaujíma"
                description="Vyberte typ alebo rovno pokračujte do kalendára a hľadajte podľa názvu, termínu či lokality."
                id="events-category-heading"
              />
              <PublicSubcategoryNavigator items={landingCategories} label="Typy podujatí" mode="landing" />
            </PublicContentShell>
          </section>
        ) : (
          <PublicSubcategoryNavigator
            items={compactNavigation}
            label="Typy podujatí"
            mode="compact"
            className={styles.typeNavigator}
          />
        )}


        <section className={styles.organizerSection} aria-label="Pre organizátorov">
          <PageContainer>
            <PublicContextBanner
              eyebrow="Pre organizátorov"
              title="Organizujete podujatie?"
              text="Pridajte ho do kalendára Psipedia. Údaje pred zverejnením prejdú redakčnou kontrolou."
              ctaLabel="Pridať podujatie"
              ctaHref="/podujatia/pridat-podujatie"
              tone="coral"
            />
          </PageContainer>
        </section>
      </PublicFoundation>
    </main>
  );
}
