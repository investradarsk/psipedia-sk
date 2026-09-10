import Link from "next/link";
import { ArrowIcon, PawMark } from "@/components/icons";
import { EventCard } from "@/components/event-card";
import { Breadcrumbs, MediaFrame, PageContainer, cardShellClassName } from "@/components/page-system";
import { eventDateStatus, eventPortalCategory, eventTypePortalHref, formatEventDate, type DogEvent } from "@/lib/events";

function eventTimeLabel(event: DogEvent) {
  if (event.startTime && event.endTime) return `${event.startTime} – ${event.endTime}`;
  if (event.startTime) return event.startTime;
  if (event.endTime) return `do ${event.endTime}`;
  return null;
}

function eventLocationLines(event: DogEvent) {
  const raw = event.region === "Online"
    ? [event.venue, event.city, "Online"]
    : [event.venue, event.address, event.city, event.region];
  return [...new Set(raw.map((value) => value.trim()).filter(Boolean))];
}

function paragraphs(value: string) {
  return value.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

export function EventDetail({ event, related = [] }: { event: DogEvent; related?: DogEvent[] }) {
  const dateStatus = eventDateStatus(event);
  const timeLabel = eventTimeLabel(event);
  const locationLines = eventLocationLines(event);
  const typeHref = eventTypePortalHref(event.eventType);
  const category = eventPortalCategory(event.eventType);
  const statusLabel = event.cancelled
    ? "Zrušené podujatie"
    : dateStatus === "current"
      ? "Prebieha"
      : dateStatus === "past"
        ? "Ukončené"
        : null;
  const hasActions = Boolean(event.registrationUrl || event.websiteUrl);

  return (
    <main id="obsah">
      <header className="event-detail-hero">
        <PageContainer>
          <Breadcrumbs>
            <Link href="/">Domov</Link><span>/</span><Link href="/podujatia">Podujatia</Link><span>/</span>{category && <><Link href={category.href}>{category.label}</Link><span>/</span></>}<span>{event.title}</span>
          </Breadcrumbs>

          <div className="event-detail-hero-grid">
            <div className="event-detail-heading">
              <div className="event-detail-tags">
                {typeHref ? <Link className="event-detail-type-link" href={typeHref}>{event.eventType}</Link> : <span>{event.eventType}</span>}
                {statusLabel && <b>{statusLabel}</b>}
              </div>
              <h1>{event.title}</h1>
              {event.excerpt && <p>{event.excerpt}</p>}
              {hasActions && (
                <div className="event-detail-actions" aria-label="Odkazy podujatia">
                  {event.registrationUrl && <a className="button button--coral" href={event.registrationUrl} target="_blank" rel="noreferrer">Registrácia <ArrowIcon size={18} /></a>}
                  {event.websiteUrl && <a className="text-link event-detail-official-link" href={event.websiteUrl} target="_blank" rel="noreferrer">Oficiálna stránka <ArrowIcon size={17} /></a>}
                </div>
              )}
            </div>

            <MediaFrame className="event-detail-visual" variant="landscape">
              {event.imageUrl ? <img src={event.imageUrl} alt={event.title} /> : <PawMark size={92} />}
            </MediaFrame>
          </div>

          <dl className="event-detail-summary" aria-label="Základné informácie o podujatí">
            <div className={cardShellClassName}><dt>Termín</dt><dd>{formatEventDate(event)}</dd></div>
            {timeLabel && <div className={cardShellClassName}><dt>Čas</dt><dd>{timeLabel}</dd></div>}
            {locationLines.length > 0 && <div className={cardShellClassName}><dt>Miesto</dt><dd>{locationLines.map((line) => <span key={line}>{line}</span>)}</dd></div>}
            {event.organizer && <div className={cardShellClassName}><dt>Organizátor</dt><dd>{event.organizer}</dd></div>}
          </dl>
        </PageContainer>
      </header>

      {(event.description || event.practicalInfo) && (
        <PageContainer className="event-detail-body">
          <article className="event-detail-copy">
            {event.description && (
              <section aria-labelledby="event-about-title">
                <span className="eyebrow">O podujatí</span>
                <h2 id="event-about-title">Čo potrebuješ vedieť</h2>
                {paragraphs(event.description).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </section>
            )}
            {event.practicalInfo && (
              <section className={`event-practical-info ${cardShellClassName}`} aria-labelledby="event-practical-title">
                <span className="eyebrow">Pred návštevou</span>
                <h2 id="event-practical-title">Praktické informácie</h2>
                {paragraphs(event.practicalInfo).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </section>
            )}
          </article>
        </PageContainer>
      )}

      {related.length > 0 && (
        <section className="event-detail-related" aria-labelledby="event-related-title">
          <PageContainer>
            <div className="event-detail-related-heading">
              <div>
                <span className="eyebrow">Pokračuj ďalej</span>
                <h2 id="event-related-title">{dateStatus === "past" ? "Najbližšie podujatia" : "Ďalšie podujatia"}</h2>
              </div>
              <Link href="/podujatia" className="text-link">Všetky podujatia <ArrowIcon size={18} /></Link>
            </div>
            <div className="event-grid event-detail-related-grid">
              {related.map((item) => <EventCard key={item.id} event={item} />)}
            </div>
          </PageContainer>
        </section>
      )}
    </main>
  );
}
