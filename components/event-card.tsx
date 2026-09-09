import Link from "next/link";
import { ArrowIcon, PawMark } from "@/components/icons";
import { EVENT_TIME_ZONE, eventDateStatus, eventHref, formatEventDate, type DogEvent } from "@/lib/events";

export function EventCard({ event, today }: { event: DogEvent; today?: string }) {
  const day = Number(event.startDate.slice(8, 10));
  const month = new Intl.DateTimeFormat("sk-SK", { month: "short", timeZone: EVENT_TIME_ZONE })
    .format(new Date(`${event.startDate}T12:00:00Z`))
    .replace(".", "");
  const dateStatus = eventDateStatus(event, today);

  return (
    <article className={`event-card ${event.cancelled ? "is-cancelled" : ""}`}>
      <Link href={eventHref(event)} className="event-card-media" tabIndex={-1} aria-hidden="true">
        {event.imageUrl ? <img src={event.imageUrl} alt="" loading="lazy" decoding="async" /> : <PawMark size={64} />}
        <span className="event-date-badge"><strong>{day}</strong><small>{month}</small></span>
      </Link>
      <div className="event-card-body">
        <div className="event-card-meta">
          <span>{event.eventType}</span>
          {event.cancelled ? <b>Zrušené</b> : dateStatus === "current" ? <b>Prebieha</b> : null}
        </div>
        <h3><Link href={eventHref(event)}>{event.title}</Link></h3>
        {event.excerpt && <p>{event.excerpt}</p>}
        <dl>
          <div><dt>Termín</dt><dd>{formatEventDate(event)}{event.startTime ? ` · ${event.startTime}` : ""}</dd></div>
          {(event.city || event.region) && <div><dt>Miesto</dt><dd>{[event.city, event.region].filter(Boolean).join(" · ")}</dd></div>}
        </dl>
        <Link href={eventHref(event)} className="text-link">Detail podujatia <ArrowIcon size={18} /></Link>
      </div>
    </article>
  );
}
