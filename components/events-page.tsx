import Link from "next/link";
import { EventCalendar } from "@/components/event-calendar";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { PublicActionLink, PublicCategoryTiles, PublicFoundation, PublicLandingHero, PublicSectionHeader } from "@/components/public-visual-system";
import { PawMark, SparkIcon, WhistleIcon } from "@/components/icons";
import { bratislavaDateKey, eventDateStatus, eventTypeListingSeo, eventTypePortalHref, eventTypes, type DogEvent, type EventTimeFilter, type EventType } from "@/lib/events";
import type { PortalSection } from "@/lib/portal";
import styles from "./events-public.module.css";

function eventLandingIcon(eventType: EventType) {
  if (eventType === "Preteky") return <WhistleIcon size={22} />;
  if (eventType === "Výstava") return <SparkIcon size={22} />;
  return <PawMark size={22} />;
}

export function EventsPage({
  events,
  initialType = "Všetky",
  initialTime = "upcoming",
  section,
}: {
  events: DogEvent[];
  initialType?: EventType | "Všetky";
  initialTime?: EventTimeFilter;
  section?: PortalSection;
}) {
  const isMainListing = initialType === "Všetky";
  const copy = isMainListing
    ? { title: "Podujatia", description: "Výstavy, preteky, semináre, tréningy a stretnutia pre psí svet na jednom mieste." }
    : eventTypeListingSeo(initialType);
  const title = isMainListing ? section?.label ?? copy.title : copy.title;
  const description = isMainListing ? section?.description ?? copy.description : copy.description;
  const today = bratislavaDateKey();
  const activeCount = events.filter((event) => !event.cancelled && eventDateStatus(event, today) !== "past").length;
  const landingCategories = eventTypes
    .map((eventType) => {
      const href = eventTypePortalHref(eventType);
      if (!href) return null;
      const seo = eventTypeListingSeo(eventType);
      const count = events.filter((event) => !event.cancelled && event.eventType === eventType && eventDateStatus(event, today) !== "past").length;
      return {
        href,
        title: seo.title,
        description: seo.description,
        meta: `${count} aktívnych`,
        icon: eventLandingIcon(eventType),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <main id="obsah">
      <PublicFoundation className={styles.foundation}>
      <header className={styles.pageHeader}>
        <PageContainer>
          <Breadcrumbs className={styles.breadcrumbs}>
            <Link href="/">Domov</Link><span>/</span>{isMainListing ? <span>Podujatia</span> : <><Link href="/podujatia">Podujatia</Link><span>/</span><span>{copy.title}</span></>}
          </Breadcrumbs>
          {isMainListing ? (
            <>
              <PublicLandingHero
                tone="events"
                eyebrow="Kalendár a databáza"
                title={title}
                intro={description}
                meta={activeCount > 0 ? <span><strong>{activeCount}</strong> aktívnych termínov</span> : undefined}
                ornament={<SparkIcon size={96} />}
                actions={<PublicActionLink href="/podujatia/pridat-podujatie" variant="secondary">Pridať podujatie</PublicActionLink>}
              />
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
            </>
          ) : (
            <PublicSectionHeader
              variant="data"
              eyebrow="Kalendár a databáza"
              title={title}
              intro={<span className={styles.headerDescription}>{description}</span>}
              meta={activeCount > 0 ? (
                <span className={styles.headerMeta} aria-label={activeCount + " aktívnych podujatí"}>
                  <strong>{activeCount}</strong> aktívnych termínov
                </span>
              ) : undefined}
            />
          )}
        </PageContainer>
      </header>

      <section className={styles.calendarSection} aria-label="Kalendár podujatí">
        <PageContainer>
          <EventCalendar events={events} today={today} initialType={initialType} initialTime={initialTime} />
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
