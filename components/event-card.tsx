import { eventTypePresentation } from '@/lib/event-type-presentation';
import type { CSSProperties } from 'react';
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { eventDateStatus, eventHref, formatEventDate, type DogEvent } from "@/lib/events";
import styles from "./events-public.module.css";
import { SmartCardImage } from "@/components/smart-card-image";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MÁJ", "JÚN", "JÚL", "AUG", "SEP", "OKT", "NOV", "DEC"];

function eventTimeLabel(event: DogEvent) {
  if (event.startTime && event.endTime) return event.startTime + " – " + event.endTime;
  if (event.startTime) return event.startTime;
  if (event.endTime) return "do " + event.endTime;
  return null;
}

function endDateLabel(event: DogEvent) {
  if (!event.endDate || event.endDate === event.startDate) return null;
  const startYear = event.startDate.slice(0, 4);
  const endYear = event.endDate.slice(0, 4);
  const day = Number(event.endDate.slice(8, 10));
  const month = MONTHS[Number(event.endDate.slice(5, 7)) - 1] || event.endDate.slice(5, 7);
  return "→ " + day + ". " + month + (startYear === endYear ? "" : " " + endYear);
}

function eventLocation(event: DogEvent) {
  const values = [event.venue, event.city, event.region].map((value) => value.trim()).filter(Boolean);
  return [...new Set(values)].join(" · ");
}

export function EventCard({ event, today, variant }: { event: DogEvent; today?: string; variant?: "grid" }) {
  const day = Number(event.startDate.slice(8, 10));
  const month = MONTHS[Number(event.startDate.slice(5, 7)) - 1] || event.startDate.slice(5, 7);
  const dateStatus = eventDateStatus(event, today);
  const timeLabel = eventTimeLabel(event);
  const location = eventLocation(event);
  const endLabel = endDateLabel(event);
  const statusLabel = event.cancelled ? "Zrušené" : dateStatus === "current" ? "Prebieha" : dateStatus === "past" ? "Ukončené" : null;

  if (variant === 'grid') return <article className={styles.gridCard} data-event-card data-event-has-image={event.imageUrl ? 'true':'false'} data-event-status={event.cancelled ? 'cancelled':dateStatus}>
    <Link href={eventHref(event)} className={styles.gridCardLink}>
      <div className={styles.gridMedia}>
        {event.imageUrl ? <SmartCardImage src={event.imageUrl} mode={event.imageDisplay} alt="" loading="lazy" decoding="async"/> : <span className={styles.neutralMedia} aria-hidden="true">Podujatie</span>}
        <time className={styles.gridDate} dateTime={event.startDate}>{day}. {month}</time>
      </div>
      <div className={styles.gridBody}>
        <div className={styles.cardMeta}><span className={styles.gridType} style={{'--event-type-color':eventTypePresentation[event.eventType].color} as CSSProperties}>{eventTypePresentation[event.eventType].label}</span>{statusLabel ? <b>{statusLabel}</b>:null}</div>
        <h3>{event.title}</h3>
        <p>{formatEventDate(event)}{timeLabel ? ' · '+timeLabel:''}</p>
        <p>{event.region === 'Online' ? 'Online podujatie' : [...new Set([event.venue,event.city].map(v=>v.trim()).filter(Boolean))].join(' · ') || 'Miesto bude upresnené'}</p>
        {event.region !== 'Online' ? <p>{event.region}</p>:null}
      </div>
    </Link>
  </article>;

  return (
    <article
      className={[
        event.cancelled ? styles.cancelledCard : styles.eventCard,
        event.imageUrl ? styles.eventCardWithImage : "",
      ].filter(Boolean).join(" ")}
      data-event-card
      data-event-has-image={event.imageUrl ? "true" : "false"}
      data-event-status={event.cancelled ? "cancelled" : dateStatus}
    >
      <time className={styles.dateBlock} dateTime={event.startDate} aria-label={formatEventDate(event)}>
        <strong>{day}</strong>
        <span>{month}</span>
        {endLabel && <small>{endLabel}</small>}
      </time>

      {event.imageUrl ? (
        <span className={styles.cardMedia} aria-hidden="true">
          <SmartCardImage src={event.imageUrl} mode={event.imageDisplay} alt="" loading="lazy" decoding="async" />
        </span>
      ) : null}

      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          <span>{event.eventType}</span>
          {statusLabel && <b>{statusLabel}</b>}
        </div>
        <h3><Link href={eventHref(event)}>{event.title}</Link></h3>
        <div className={styles.cardFacts}>
          {timeLabel && <span><strong>Čas</strong> {timeLabel}</span>}
          <span><strong>Miesto</strong> {event.region === "Online" ? "Online podujatie" : location || "Miesto bude upresnené"}</span>
        </div>
      </div>

      <Link href={eventHref(event)} className={styles.detailLink} aria-label={"Detail podujatia " + event.title}>
        Detail <ArrowIcon size={17} />
      </Link>
    </article>
  );
}
