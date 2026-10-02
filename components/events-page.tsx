import Link from "next/link";
import { EventCalendar } from "@/components/event-calendar";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { PublicActionLink, PublicCategoryTiles, PublicFoundation, UnifiedSectionHero } from "@/components/public-visual-system";
import { SectionHeroSearch } from "@/components/section-hero-search";
import { PawMark, SparkIcon, WhistleIcon } from "@/components/icons";
import { bratislavaDateKey, eventDateStatus, eventTypeListingSeo, eventTypePortalHref, eventTypes, type DogEvent, type EventTimeFilter, type EventType } from "@/lib/events";
import type { PortalSection } from "@/lib/portal";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import styles from "./events-public.module.css";

function eventLandingIcon(eventType: EventType) {
  if (eventType === "Preteky") return <WhistleIcon size={22} />;
  if (eventType === "Výstava") return <SparkIcon size={22} />;
  return <PawMark size={22} />;
}

export async function EventsPage({
  events,
  initialType = "Všetky",
  initialTime = "upcoming",
  initialQuery = "",
  section,
}: {
  events: DogEvent[];
  initialType?: EventType | "Všetky";
  initialTime?: EventTimeFilter;
  initialQuery?: string;
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
  const today = bratislavaDateKey();
  const activeCount = events.filter((event) => !event.cancelled && eventDateStatus(event, today) !== "past").length;
  const landingCategories = eventTypes.flatMap((eventType) => {
    const href = eventTypePortalHref(eventType);
    if (!href) return [];
    const seo = eventTypeListingSeo(eventType);
    const count = events.filter((event) => !event.cancelled && event.eventType === eventType && eventDateStatus(event, today) !== "past").length;
    return [{
      href,
      title: seo.title,
      description: seo.description,
      meta: `${count} aktívnych`,
      icon: eventLandingIcon(eventType),
    }];
  });

  return (
    <main id="obsah">
      <PublicFoundation className={styles.foundation}>
      <header className={styles.pageHeader}>
        <PageContainer>
          <UnifiedSectionHero
            breadcrumbs={<Breadcrumbs className={styles.breadcrumbs}>
              <Link href="/">Domov</Link><span>/</span>
              {isMainListing ? <span>Podujatia</span> : <><Link href="/podujatia">Podujatia</Link><span>/</span><span>{copy.title}</span></>}
            </Breadcrumbs>}
            eyebrow="Kalendár a databáza"
            title={title}
            intro={description}
            visual={heroVisual}
            metaSlot={activeCount > 0 ? <span><strong>{activeCount}</strong> aktívnych termínov</span> : undefined}
            searchSlot={
              <SectionHeroSearch
                action={categoryHref ?? "/podujatia"}
                id={isMainListing ? "events-hero-query" : `events-hero-${categorySlug}`}
                label={isMainListing ? "Hľadať podujatie" : `Hľadať v kategórii ${copy.title}`}
                placeholder="Hľadať podujatie alebo mesto…"
                defaultValue={initialQuery}
              />
            }
            ctaSlot={isMainListing ? <PublicActionLink href="/podujatia/pridat-podujatie" variant="secondary">Pridať podujatie</PublicActionLink> : undefined}
          />

          {isMainListing ? (
            <section className={styles.landingCategories} aria-labelledby="events-category-heading">
              <div className={styles.landingCategoryHeading}>
                <div>
                  <span>Typy podujatí</span>
                  <h2 id="events-category-heading">Vyberte si, čo vás zaujíma</h2>
                </div>
                <p>Rýchle vstupy používajú existujúce verejné kategórie. Kalendár, filtre a vyhľadávanie zostávajú nižšie bez zmeny.</p>
              </div>
              <PublicCategoryTiles items={landingCategories} label="Hlavné typy podujatí" />
            </section>
          ) : null}
        </PageContainer>
      </header>

      <section className={styles.calendarSection} aria-label="Kalendár podujatí">
        <PageContainer>
          <EventCalendar events={events} today={today} initialType={initialType} initialTime={initialTime} initialQuery={initialQuery} />
        </PageContainer>
      </section>

      <section className={styles.organizerSection} aria-labelledby="event-organizer-heading">
        <PageContainer className={styles.organizerRow}>
          <div>
            <h2 id="event-organizer-heading">Chýba tu vaše podujatie?</h2>
            <p>Pošlite nám údaje na redakčné overenie. Zverejnenie zostáva pod kontrolou redakcie.</p>
          </div>
          <PublicActionLink href="/podujatia/pridat-podujatie">Pridať podujatie</PublicActionLink>
        </PageContainer>
      </section>
      </PublicFoundation>
    </main>
  );
}
