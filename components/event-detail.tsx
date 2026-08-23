import Link from "next/link";
import { ArrowIcon, PawMark } from "@/components/icons";
import { eventHref, formatEventDate, type DogEvent } from "@/lib/events";

export function EventDetail({ event }: { event: DogEvent }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.excerpt,
    startDate: `${event.startDate}${event.startTime ? `T${event.startTime}:00+02:00` : ""}`,
    endDate: event.endDate ? `${event.endDate}${event.endTime ? `T${event.endTime}:00+02:00` : ""}` : undefined,
    eventStatus: event.cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: event.region === "Online" ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location: event.region === "Online" ? undefined : { "@type": "Place", name: event.venue || event.city, address: `${event.address}, ${event.city}` },
    organizer: { "@type": "Organization", name: event.organizer, url: event.websiteUrl ?? undefined },
    image: event.imageUrl ? (event.imageUrl.startsWith("https://") ? event.imageUrl : `https://psipedia.sk${event.imageUrl}`) : undefined,
    url: `https://psipedia.sk${eventHref(event)}`,
  };

  return (
    <main id="obsah">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <header className="event-detail-hero">
        <div className="shell">
          <nav className="article-breadcrumbs" aria-label="Navigácia">
            <Link href="/">Domov</Link><span>/</span><Link href="/podujatia">Podujatia</Link><span>/</span><span>{event.title}</span>
          </nav>
          <div className="event-detail-hero-grid">
            <div>
              <div className="event-detail-tags"><span>{event.eventType}</span>{event.cancelled && <b>Zrušené podujatie</b>}</div>
              <h1>{event.title}</h1>
              <p>{event.excerpt}</p>
            </div>
            <div className="event-detail-visual">
              {event.imageUrl ? <img src={event.imageUrl} alt={event.title} /> : <PawMark size={92} />}
            </div>
          </div>
        </div>
      </header>

      <section className="event-detail-layout shell">
        <article className="event-detail-copy">
          <span className="eyebrow">O podujatí</span>
          <h2>Čo potrebuješ vedieť</h2>
          {event.description.split(/\n\s*\n/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {event.practicalInfo && (
            <div className="event-practical-info"><strong>Praktické informácie</strong>{event.practicalInfo.split(/\n\s*\n/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
          )}
        </article>
        <aside className="event-detail-facts">
          <h2>Termín a miesto</h2>
          <dl>
            <div><dt>Dátum</dt><dd>{formatEventDate(event)}</dd></div>
            {event.startTime && <div><dt>Čas</dt><dd>{event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}</dd></div>}
            <div><dt>Miesto</dt><dd>{event.venue || event.city}{event.address ? <><br />{event.address}</> : null}<br />{event.city}, {event.region}</dd></div>
            <div><dt>Organizátor</dt><dd>{event.organizer}</dd></div>
          </dl>
          {event.registrationUrl && <a className="button button--coral" href={event.registrationUrl} target="_blank" rel="noreferrer">Prihlásiť sa <ArrowIcon size={18} /></a>}
          {event.websiteUrl && <a className="text-link" href={event.websiteUrl} target="_blank" rel="noreferrer">Web organizátora <ArrowIcon size={17} /></a>}
        </aside>
      </section>
    </main>
  );
}
