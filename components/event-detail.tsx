import { EventMarkdown } from "@/components/event-markdown";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { EventCard } from "@/components/event-card";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { PublicActionLink, PublicFoundation } from "@/components/public-visual-system";
import { eventDateStatus, eventPortalCategory, eventTypePortalHref, formatEventDate, type DogEvent } from "@/lib/events";
import styles from "./events-public.module.css";

function eventTimeLabel(event: DogEvent) {
  if (event.startTime && event.endTime) return event.startTime + " – " + event.endTime;
  if (event.startTime) return event.startTime;
  if (event.endTime) return "do " + event.endTime;
  return null;
}

function eventLocationLines(event: DogEvent) {
  const raw = event.region === "Online"
    ? [event.venue, event.city, "Online"]
    : [event.venue, event.address, event.city, event.region];
  return [...new Set(raw.map((value) => value.trim()).filter(Boolean))];
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
      <PublicFoundation className={styles.foundation}>
      <header className={styles.detailHeader} data-event-detail-header>
        <PageContainer>
          <Breadcrumbs className={styles.breadcrumbs}>
            <Link href="/">Domov</Link><span>/</span><Link href="/podujatia">Podujatia</Link><span>/</span>{category && <><Link href={category.href}>{category.label}</Link><span>/</span></>}<span>{event.title}</span>
          </Breadcrumbs>

          <div className={event.imageUrl ? styles.detailGrid : styles.detailGridNoImage}>
            <div className={styles.detailHeading}>
              <div className={styles.detailTags}>
                {typeHref ? <Link href={typeHref}>{event.eventType}</Link> : <span>{event.eventType}</span>}
                {statusLabel && <b>{statusLabel}</b>}
              </div>
              <h1>{event.title}</h1>
              {event.excerpt && <p className={styles.detailExcerpt}>{event.excerpt}</p>}

              <dl className={styles.detailFacts} data-event-facts aria-label="Základné informácie o podujatí">
                <div>
                  <dt>Termín</dt>
                  <dd>
                    {formatEventDate(event)}
                    {timeLabel && <span>{timeLabel}</span>}
                  </dd>
                </div>
                {locationLines.length > 0 && (
                  <div>
                    <dt>Miesto</dt>
                    <dd>{locationLines.map((line) => <span key={line}>{line}</span>)}</dd>
                  </div>
                )}
                {event.organizer && (
                  <div>
                    <dt>Organizátor</dt>
                    <dd>{event.organizer}</dd>
                  </div>
                )}
              </dl>

              {hasActions && (
                <div className={styles.detailActions} aria-label="Odkazy podujatia">
                  {event.registrationUrl && <PublicActionLink href={event.registrationUrl} target="_blank" rel="noreferrer" icon={<ArrowIcon size={18} />}>Registrácia</PublicActionLink>}
                  {event.websiteUrl && <PublicActionLink href={event.websiteUrl} variant="secondary" target="_blank" rel="noreferrer" icon={<ArrowIcon size={17} />}>Oficiálna stránka</PublicActionLink>}
                </div>
              )}
            </div>

            {event.imageUrl && (
              <figure className={styles.detailVisual} data-event-image>
                <img src={event.imageUrl} alt={event.title} loading="eager" fetchPriority="high" decoding="async" />
              </figure>
            )}
          </div>
        </PageContainer>
      </header>

      {(event.description || event.practicalInfo) && (
        <PageContainer className={styles.detailBody}>
          <article className={styles.detailCopy}>
            {event.description && (
              <section aria-labelledby="event-about-title">
                <span className="eyebrow">O podujatí</span>
                <h2 id="event-about-title">Čo potrebuješ vedieť</h2>
                <EventMarkdown value={event.description} />
              </section>
            )}
            {event.practicalInfo && (
              <section className={styles.practicalInfo} aria-labelledby="event-practical-title">
                <span className="eyebrow">Pred návštevou</span>
                <h2 id="event-practical-title">Praktické informácie</h2>
                <EventMarkdown value={event.practicalInfo} />
              </section>
            )}
          </article>
        </PageContainer>
      )}

      {related.length > 0 && (
        <section className={styles.relatedSection} aria-labelledby="event-related-title">
          <PageContainer>
            <div className={styles.relatedHeading}>
              <div>
                <span className="eyebrow">Ďalšie termíny</span>
                <h2 id="event-related-title">{dateStatus === "past" ? "Najbližšie podujatia" : "Ďalšie podujatia"}</h2>
              </div>
              <Link href="/podujatia" className={styles.officialLink}>Všetky podujatia <ArrowIcon size={18} /></Link>
            </div>
            <div className={styles.relatedList}>
              {related.map((item) => <EventCard key={item.id} event={item} />)}
            </div>
          </PageContainer>
        </section>
      )}
      </PublicFoundation>
    </main>
  );
}
