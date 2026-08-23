import Link from "next/link";
import { EventCalendar } from "@/components/event-calendar";
import type { DogEvent, EventType } from "@/lib/events";

const pageCopy: Record<string, { title: string; description: string }> = {
  Všetky: { title: "Kalendár podujatí", description: "Výstavy, preteky, semináre, tréningy a stretnutia pre psí svet na jednom mieste." },
  Výstava: { title: "Výstavy psov", description: "Národné, medzinárodné a klubové výstavy s termínmi, miestom a odkazom na prihlásenie." },
  Preteky: { title: "Preteky a skúšky", description: "Športové súťaže, pracovné skúšky a preteky zoradené podľa dátumu a kraja." },
  Seminár: { title: "Semináre a tréningy", description: "Vzdelávanie, workshopy a otvorené tréningy pre majiteľov, chovateľov aj kynológov." },
};

export function EventsPage({ events, initialType = "Všetky" }: { events: DogEvent[]; initialType?: EventType | "Všetky" }) {
  const copy = pageCopy[initialType] ?? pageCopy.Všetky;
  return (
    <main id="obsah">
      <header className="event-calendar-hero">
        <div className="shell">
          <nav className="article-breadcrumbs" aria-label="Navigácia">
            <Link href="/">Domov</Link><span>/</span><Link href="/podujatia">Podujatia</Link><span>/</span><span>{copy.title}</span>
          </nav>
          <span className="eyebrow">Čo sa deje</span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>
      <section className="event-calendar-section shell">
        <EventCalendar events={events} today={new Date().toISOString().slice(0, 10)} initialType={initialType} />
      </section>
    </main>
  );
}
