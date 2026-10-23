import { EventMarkdown } from "@/components/event-markdown";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { EventCard } from "@/components/event-card";
import { EventImage } from "@/components/event-image";
import { EventsBackLink } from "@/components/events-return-link";
import { PublicLocationMap } from "@/components/map/public-location-map";
import type { PublicEntityMapResult } from "@/lib/map-query";
import type { PublicMapRuntime } from "@/lib/public-map-runtime";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { DetailHero, DetailFactsCard, DetailSection } from "./detail-primitives/detail-primitives";
import detailStyles from "./detail-primitives/detail-primitives.module.css";
import { PublicActionLink, PublicFoundation } from "@/components/public-visual-system";
import { eventDateStatus, eventPortalCategory, eventTypePortalHref, formatEventDate, formatEventUpdatedAt, type DogEvent, type PublicEventCard } from "@/lib/events";
import { publicLocationValue } from "@/lib/public-location";
import styles from "./events-public.module.css";

function eventTimeLabel(event: DogEvent) {
  if (event.startTime && event.endTime) return event.startTime + " – " + event.endTime;
  if (event.startTime) return event.startTime;
  if (event.endTime) return "do " + event.endTime;
  return null;
}

function eventLocationLines(event: DogEvent) {
  const raw = [event.venue, event.address, publicLocationValue(event.city, "city"), publicLocationValue(event.region, "region")];
  const lines = [...new Set(raw.map((value) => publicLocationValue(value)).filter(Boolean))];
  return lines.length ? lines : [/\bwebin[aá]r\b/iu.test(event.title) ? "Webinár" : "Miesto nie je uvedené"];
}

export function EventDetail({
  event,
  related = [],
  publicMap,
}: {
  event: DogEvent;
  related?: PublicEventCard[];
  publicMap?: PublicEntityMapResult & PublicMapRuntime;
}) {
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
        ? "Uskutočnilo sa"
        : null;
  const showRegistration = dateStatus !== "past" && !event.cancelled && Boolean(event.registrationUrl);
  const hasActions = Boolean(showRegistration || event.websiteUrl);
  const publicCity = publicLocationValue(event.city, "city");
  const publicRegion = publicLocationValue(event.region, "region");
  const updatedLabel = formatEventUpdatedAt(event.updatedAt);

  return (
    <main id="obsah" className={styles.detailPage}>
      <PublicFoundation className={styles.foundation}>
      <DetailHero kind="event"
        breadcrumbs={<><Breadcrumbs className={styles.breadcrumbs}>
            <Link href="/">Domov</Link><span>/</span><Link href="/podujatia">Podujatia</Link><span>/</span>{category && <><Link href={category.href}>{category.label}</Link><span>/</span></>}<span>{event.title}</span>
          </Breadcrumbs><div className={styles.returnBar}><EventsBackLink fallbackHref={typeHref ?? "/podujatia"} /></div></>}
        media={<EventImage imageUrl={event.imageUrl} eventType={event.eventType} mode={event.imageDisplay} context="detail" config={event.detailImageDisplay} sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 980px) 640px, 480px" alt={event.title} loading="eager" fetchPriority="high" decoding="async" />}
        copy={<>
          <div className={detailStyles.tags}>
            {typeHref ? <Link href={typeHref}>{event.eventType}</Link> : <span>{event.eventType}</span>}
            {statusLabel && <b data-detail-state={event.cancelled ? "cancelled" : dateStatus === "past" ? "past" : "current"}>{statusLabel}</b>}
          </div>
          <h1 data-long-title={event.title.length >= 70 ? "" : undefined}>{event.title}</h1>
          {dateStatus === "past" && !event.cancelled && <p className={detailStyles.lead} role="status" data-event-past-notice>Podujatie sa už uskutočnilo. Tento detail zostáva dostupný ako archív.</p>}
          {publicCity && <p className={detailStyles.location}>{publicCity}{publicRegion ? ` · ${publicRegion}` : ""}</p>}
          {event.excerpt && <p className={detailStyles.lead}>{event.excerpt}</p>}
          <dl className={detailStyles.factTiles} data-event-facts aria-label="Základné informácie o podujatí">
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
                {updatedLabel && (
                  <div>
                    <dt>Aktualizované</dt>
                    <dd><time dateTime={event.updatedAt}>{updatedLabel}</time></dd>
                  </div>
                )}
              </dl>
          {hasActions && <nav className={detailStyles.heroActions} aria-label="Odkazy podujatia">
            {showRegistration && event.registrationUrl && <PublicActionLink className={detailStyles.primaryAction} href={event.registrationUrl} target="_blank" rel="noreferrer" icon={<ArrowIcon size={18} />}>Registrácia</PublicActionLink>}
            {event.websiteUrl && <PublicActionLink className={detailStyles.secondaryAction} href={event.websiteUrl} variant="secondary" target="_blank" rel="noreferrer" icon={<ArrowIcon size={17} />}>Oficiálna stránka</PublicActionLink>}
          </nav>}
        </>} />
      <div className={`${detailStyles.shell} ${detailStyles.layout}`}>
        <article className={detailStyles.body}>
          {event.description && <DetailSection title="O podujatí"><EventMarkdown value={event.description} /></DetailSection>}
          {event.practicalInfo && <DetailSection eyebrow="Pred návštevou" title="Praktické informácie"><EventMarkdown value={event.practicalInfo} /></DetailSection>}
        </article>
        <aside className={detailStyles.aside} aria-label="Organizátor a praktické informácie">
          {event.organizer && <DetailFactsCard title="Organizátor" facts={[{ label: "Organizátor", value: event.organizer }, event.websiteUrl ? { label: "Oficiálna stránka", value: <a href={event.websiteUrl} target="_blank" rel="noreferrer">{event.websiteUrl}</a> } : null]} />}
          <DetailFactsCard title="Termín a čas" facts={[{ label: "Termín", value: formatEventDate(event) }, timeLabel ? { label: "Čas", value: timeLabel } : null]} />
          <DetailFactsCard title="Miesto konania" facts={[{ label: "Miesto", value: locationLines.join(" · ") }]} />
          {event.region !== "Online" && publicMap?.items.length ?           <PublicLocationMap
            eyebrow="Miesto"
            title="Miesto podujatia"
            items={publicMap.items}
            attribution={publicMap.attribution}
            googleApiKey={publicMap.googleApiKey}
            googleMapId={publicMap.googleMapId}
            rendererEnabled={publicMap.rendererEnabled}
            testRendererEnvironment={publicMap.testRendererEnvironment}
          /> : null}
        </aside>
      </div>

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
