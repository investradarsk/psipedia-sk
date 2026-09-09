import Link from "next/link";
import { EventCalendar } from "@/components/event-calendar";
import { Breadcrumbs, SectionHero } from "@/components/page-system";
import { bratislavaDateKey, type DogEvent, type EventType } from "@/lib/events";

const pageCopy: Record<string, { title: string; description: string }> = {
  Všetky: { title: "Kalendár podujatí", description: "Výstavy, preteky, semináre, tréningy a stretnutia pre psí svet na jednom mieste." },
  Výstava: { title: "Výstavy psov", description: "Národné, medzinárodné a klubové výstavy s termínmi, miestom a odkazom na prihlásenie." },
  Preteky: { title: "Preteky a skúšky", description: "Športové súťaže, pracovné skúšky a preteky zoradené podľa dátumu a kraja." },
  Seminár: { title: "Semináre a tréningy", description: "Vzdelávanie, workshopy a otvorené tréningy pre majiteľov, chovateľov aj kynológov." },
};

export function EventsPage({ events, initialType = "Všetky" }: { events: DogEvent[]; initialType?: EventType | "Všetky" }) {
  const copy = pageCopy[initialType] ?? pageCopy.Všetky;
  const heroImage = events.find((event) => event.imageUrl)?.imageUrl || "/images/trening-pri-nohe.webp";
  return (
    <main id="obsah">
      <SectionHero className="event-calendar-hero event-calendar-hero--photo" image={heroImage}>
        <Breadcrumbs>
          <Link href="/">Domov</Link><span>/</span><Link href="/podujatia">Podujatia</Link><span>/</span><span>{copy.title}</span>
        </Breadcrumbs>
        <span className="eyebrow">Čo sa deje</span>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </SectionHero>
      <section className="event-calendar-section shell">
        <EventCalendar events={events} today={bratislavaDateKey()} initialType={initialType} />
      </section>
    </main>
  );
}
