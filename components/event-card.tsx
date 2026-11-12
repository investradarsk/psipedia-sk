import { eventTypePresentation, getEventOwnImage } from '@/lib/event-type-presentation';
import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { eventDateStatus, eventHref, formatEventDate, type PublicEventCard } from "@/lib/events";
import { publicLocationValue } from "@/lib/public-location";
import styles from "./events-public.module.css";
import { EventImage } from "@/components/event-image";
import { PublicListingRowCard } from "@/components/public-listing-row-card";

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
  return publicLocationValue(event.city, "city");
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

  if (variant === "grid") {
    return (
      <PublicListingRowCard
        kind="event"
        href={eventHref(event)}
        typeLabel={
          <span
            className={styles.listTypeBadge}
            style={{ "--event-type-color": eventTypePresentation[event.eventType].color } as CSSProperties}
          >
            {eventTypePresentation[event.eventType].label}
          </span>
        }
        title={event.title}
        location={location || "Miesto nie je uvedené"}
        hasImage={Boolean(ownImage)}
        eventStatus={event.cancelled ? "cancelled" : dateStatus}
        badge={statusLabel ? <span className={styles.listStatusBadge}>{statusLabel}</span> : undefined}
        media={
          <EventImage
            imageUrl={event.imageUrl}
            eventType={event.eventType}
            mode={event.imageDisplay}
            config={event.thumbnailImageDisplay}
            sizes="(max-width: 620px) 76px, 96px"
            alt=""
            loading="lazy"
            decoding="async"
          />
        }
        meta={
          <time dateTime={event.startDate}>
            {formatEventDate(event)}
            {timeLabel ? " · " + timeLabel : ""}
          </time>
        }
      />
    );
  }

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
        <h3 data-public-card-title><Link href={eventHref(event)}>{event.title}</Link></h3>
        <div className={styles.cardFacts}>
          {timeLabel && <span><strong>Čas</strong> {timeLabel}</span>}
          <span><strong>Miesto</strong> {location || "Miesto nie je uvedené"}</span>
        </div>
      </div>

      <Link href={eventHref(event)} className={styles.detailLink} aria-label={"Detail podujatia " + event.title}>
        Detail <ArrowIcon size={17} />
      </Link>
    </article>
  );
}
