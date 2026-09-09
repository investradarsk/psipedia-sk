import Link from "next/link";
import { EventCalendar } from "@/components/event-calendar";
import { Breadcrumbs, PageContainer, SectionHero } from "@/components/page-system";
import { bratislavaDateKey, type DogEvent, type EventType } from "@/lib/events";
import type { PortalSection } from "@/lib/portal";

const pageCopy: Record<string, { title: string; description: string }> = {
  Všetky: { title: "Podujatia", description: "Výstavy, preteky, semináre, tréningy a stretnutia pre psí svet na jednom mieste." },
  Výstava: { title: "Výstavy psov", description: "Národné, medzinárodné a klubové výstavy s termínmi, miestom a odkazom na prihlásenie." },
  Preteky: { title: "Preteky a skúšky", description: "Športové súťaže, pracovné skúšky a preteky zoradené podľa dátumu a kraja." },
  Seminár: { title: "Semináre a tréningy", description: "Vzdelávanie, workshopy a otvorené tréningy pre majiteľov, chovateľov aj kynológov." },
};

export function EventsPage({
  events,
  initialType = "Všetky",
  section,
}: {
  events: DogEvent[];
  initialType?: EventType | "Všetky";
  section?: PortalSection;
}) {
  const copy = pageCopy[initialType] ?? pageCopy.Všetky;
  const heroImage = events.find((event) => event.imageUrl)?.imageUrl || "/images/trening-pri-nohe.webp";
  const isMainListing = initialType === "Všetky";
  const title = isMainListing ? section?.label ?? copy.title : copy.title;
  const description = isMainListing ? section?.description ?? copy.description : copy.description;
  const intro = isMainListing ? section?.intro : undefined;

  return (
    <main id="obsah">
      <SectionHero className="event-calendar-hero event-calendar-hero--photo" image={heroImage}>
        <Breadcrumbs>
          <Link href="/">Domov</Link><span>/</span>{isMainListing ? <span>Podujatia</span> : <><Link href="/podujatia">Podujatia</Link><span>/</span><span>{copy.title}</span></>}
        </Breadcrumbs>
        <span className="eyebrow">Čo sa deje</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {intro && <p className="portal-hero-intro">{intro}</p>}
      </SectionHero>

      <section className="event-calendar-section" aria-labelledby="event-listing-heading">
        <PageContainer>
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">Kalendár</span>
              <h2 id="event-listing-heading">Kalendár podujatí</h2>
            </div>
            <p>Výstavy, preteky, semináre a ďalšie typy môžeš filtrovať podľa kraja, termínu alebo hľadať podľa názvu, mesta či organizátora.</p>
          </div>
          <EventCalendar events={events} today={bratislavaDateKey()} initialType={initialType} />
        </PageContainer>
      </section>

      <section className="section section--tint">
        <PageContainer className="portal-more">
          <div>
            <span className="eyebrow">Pre organizátorov</span>
            <h2>Chýba tu vaše podujatie?</h2>
            <p>Pošlite nám údaje na redakčné overenie. Pridanie podujatia zostáva samostatnou cestou, ale neodvádza pozornosť od vyhľadávania v kalendári.</p>
          </div>
          <Link href="/podujatia/pridat-podujatie" className="button button--dark">Pridať podujatie</Link>
        </PageContainer>
      </section>
    </main>
  );
}
