import { eventTypePresentation, getEventOwnImage } from '@/lib/event-type-presentation';
import type { CSSProperties } from 'react';
import { ArrowIcon } from "@/components/icons";
import { eventDateStatus, eventHref, formatEventDate, type PublicEventCard } from "@/lib/events";
import { publicLocationLabel, publicLocationValue } from "@/lib/public-location";
import styles from "./events-public.module.css";
import { EventImage } from "@/components/event-image";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MÁJ", "JÚN", "JÚL", "AUG", "SEP", "OKT", "NOV", "DEC"];

function eventTimeLabel(event: PublicEventCard) {
  if (event.startTime && event.endTime) return event.startTime + " – " + event.endTime;
  if (event.startTime) return event.startTime;
  if (event.endTime) return "do " + event.endTime;
  return null;
}

function endDateLabel(event: PublicEventCard) {
  if (!event.endDate || event.endDate === event.startDate) return null;
  const startYear = event.startDate.slice(0, 4);
  const endYear = event.endDate.slice(0, 4);
  const day = Number(event.endDate.slice(8, 10));
  const month = MONTHS[Number(event.endDate.slice(5, 7)) - 1] || event.endDate.slice(5, 7);
  return "→ " + day + ". " + month + (startYear === endYear ? "" : " " + endYear);
}

function eventLocation(event: PublicEventCard) {
  return publicLocationLabel([event.venue, publicLocationValue(event.city, "city"), publicLocationValue(event.region, "region")]);
}

export function EventCard({ event, today, variant }: { event: PublicEventCard; today?: string; variant?: "grid" }) {
  const ownImage = getEventOwnImage(event.imageUrl);
  const day = Number(event.startDate.slice(8, 10));
  const month = MONTHS[Number(event.startDate.slice(5, 7)) - 1] || event.startDate.slice(5, 7);
  const dateStatus = eventDateStatus(event, today);
  const timeLabel = eventTimeLabel(event);
  const location = eventLocation(event);
  const endLabel = endDateLabel(event);
  const statusLabel = event.cancelled ? "Zrušené" : dateStatus === "current" ? "Prebieha" : dateStatus === "past" ? "Uskutočnilo sa" : null;

  if (variant === 'grid') return <article className={styles.gridCard} data-public-card="event-grid" data-event-card data-event-has-image={ownImage ? 'true':'false'} data-event-status={event.cancelled ? 'cancelled':dateStatus}>
    <a data-events-native-detail href={eventHref(event)} className={styles.gridCardLink}>
      <div className={styles.gridMedia}>
        <EventImage imageUrl={event.imageUrl} eventType={event.eventType} mode={event.imageDisplay} config={event.thumbnailImageDisplay} sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 900px) calc(100vw - 284px), (max-width: 1199px) calc((100vw - 334px) / 2), (max-width: 1279px) calc((100vw - 354px) / 3), 290px" alt="" loading="lazy" decoding="async"/>
        <time className={styles.gridDate} dateTime={event.startDate}>{day}. {month}</time>
      </div>
      <div className={styles.gridBody}>
        <div className={styles.cardMeta} data-public-card-meta><span className={styles.gridType} style={{'--event-type-color':eventTypePresentation[event.eventType].color} as CSSProperties}>{eventTypePresentation[event.eventType].label}</span>{statusLabel ? <b>{statusLabel}</b>:null}</div>
        <h3 data-public-card-title>{event.title}</h3>
        <p>{formatEventDate(event)}{timeLabel ? ' · '+timeLabel:''}</p>
        <p>{location || "Miesto nie je uvedené"}</p>
      </div>
    </a>
  </article>;

  return (
    <article
      className={[
        event.cancelled ? styles.cancelledCard : styles.eventCard,
        styles.eventCardWithImage,
      ].filter(Boolean).join(" ")}
      data-public-card="event-list"
      data-event-card
      data-event-has-image={ownImage ? "true" : "false"}
      data-event-status={event.cancelled ? "cancelled" : dateStatus}
    >
      <time className={styles.dateBlock} dateTime={event.startDate} aria-label={formatEventDate(event)}>
        <strong>{day}</strong>
        <span>{month}</span>
        {endLabel && <small>{endLabel}</small>}
      </time>

      <span className={styles.cardMedia} aria-hidden="true">
        <EventImage imageUrl={event.imageUrl} eventType={event.eventType} mode={event.imageDisplay} config={event.thumbnailImageDisplay} sizes="(max-width: 520px) 68px, (max-width: 760px) 82px, 128px" alt="" loading="lazy" decoding="async" />
      </span>

      <div className={styles.cardBody}>
        <div className={styles.cardMeta} data-public-card-meta>
          <span>{event.eventType}</span>
          {statusLabel && <b>{statusLabel}</b>}
        </div>
        <h3 data-public-card-title><a data-events-native-detail href={eventHref(event)}>{event.title}</a></h3>
        <div className={styles.cardFacts}>
          {timeLabel && <span><strong>Čas</strong> {timeLabel}</span>}
          <span><strong>Miesto</strong> {location || "Miesto nie je uvedené"}</span>
        </div>
      </div>

      <a data-events-native-detail href={eventHref(event)} className={styles.detailLink} aria-label={"Detail podujatia " + event.title}>
        Detail <ArrowIcon size={17} />
      </a>
    </article>
  );
}
