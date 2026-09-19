import Link from "next/link";
import { EventCalendar } from "@/components/event-calendar";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { bratislavaDateKey, eventDateStatus, type DogEvent, type EventTimeFilter, type EventType } from "@/lib/events";
import type { PortalSection } from "@/lib/portal";
import styles from "./events-public.module.css";

const pageCopy: Record<string, { title: string; description: string }> = {
  Všetky: { title: "Podujatia", description: "Výstavy, preteky, semináre, tréningy a stretnutia pre psí svet na jednom mieste." },
  Výstava: { title: "Výstavy psov", description: "Národné, medzinárodné a klubové výstavy s termínmi, miestom a odkazom na prihlásenie." },
  Preteky: { title: "Preteky a skúšky", description: "Športové súťaže, pracovné skúšky a preteky zoradené podľa dátumu a kraja." },
  Seminár: { title: "Semináre a tréningy", description: "Vzdelávanie, workshopy a otvorené tréningy pre majiteľov, chovateľov aj kynológov." },
};

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
  const copy = pageCopy[initialType] ?? pageCopy.Všetky;
  const isMainListing = initialType === "Všetky";
  const title = isMainListing ? section?.label ?? copy.title : copy.title;
  const description = isMainListing ? section?.description ?? copy.description : copy.description;
  const intro = isMainListing ? section?.intro : undefined;
  const today = bratislavaDateKey();
  const activeCount = events.filter((event) => !event.cancelled && eventDateStatus(event, today) !== "past").length;

  return (
    <main id="obsah">
      <header className={styles.pageHeader}>
        <PageContainer>
          <Breadcrumbs className={styles.breadcrumbs}>
            <Link href="/">Domov</Link><span>/</span>{isMainListing ? <span>Podujatia</span> : <><Link href="/podujatia">Podujatia</Link><span>/</span><span>{copy.title}</span></>}
          </Breadcrumbs>
          <div className={styles.headerContent}>
            <div>
              <span className="eyebrow">Kalendár a databáza</span>
              <h1>{title}</h1>
              <p className={styles.headerDescription}>{description}</p>
              {intro && <p className={styles.headerIntro}>{intro}</p>}
            </div>
            {activeCount > 0 && (
              <div className={styles.activeCount} aria-label={activeCount + " aktívnych podujatí"}>
                <strong>{activeCount}</strong>
                <span>aktívnych termínov</span>
              </div>
            )}
          </div>
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
          <Link href="/podujatia/pridat-podujatie" className="button button--dark">Pridať podujatie</Link>
        </PageContainer>
      </section>
    </main>
  );
}
