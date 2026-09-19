import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { eventDateStatus, eventHref, formatEventDate, type DogEvent } from "@/lib/events";
import styles from "./events-public.module.css";

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

export function EventCard({ event, today }: { event: DogEvent; today?: string }) {
  const day = Number(event.startDate.slice(8, 10));
  const month = MONTHS[Number(event.startDate.slice(5, 7)) - 1] || event.startDate.slice(5, 7);
  const dateStatus = eventDateStatus(event, today);
  const timeLabel = eventTimeLabel(event);
  const location = eventLocation(event);
  const endLabel = endDateLabel(event);
  const statusLabel = event.cancelled ? "Zrušené" : dateStatus === "current" ? "Prebieha" : dateStatus === "past" ? "Ukončené" : null;

  return (
    <article className={event.cancelled ? styles.cancelledCard : styles.eventCard} data-event-card data-event-status={event.cancelled ? "cancelled" : dateStatus}>
      <time className={styles.dateBlock} dateTime={event.startDate} aria-label={formatEventDate(event)}>
        <strong>{day}</strong>
        <span>{month}</span>
        {endLabel && <small>{endLabel}</small>}
      </time>

      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          <span>{event.eventType}</span>
          {statusLabel && <b>{statusLabel}</b>}
        </div>
        <h3><Link href={eventHref(event)}>{event.title}</Link></h3>
        <div className={styles.cardFacts}>
          {timeLabel && <span><strong>Čas</strong> {timeLabel}</span>}
          {location && <span><strong>Miesto</strong> {location}</span>}
          {event.organizer && <span><strong>Organizátor</strong> {event.organizer}</span>}
        </div>
      </div>

      <Link href={eventHref(event)} className={styles.detailLink} aria-label={"Detail podujatia " + event.title}>
        Detail <ArrowIcon size={17} />
      </Link>
    </article>
  );
}
