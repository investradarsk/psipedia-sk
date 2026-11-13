import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./directory-public.module.css";

/** Shared compact public-listing card for directory profiles and events. */
export function PublicListingRowCard({
  href,
  media,
  typeLabel,
  title,
  location,
  meta,
  badge,
  kind,
  featured = false,
  eventStatus,
  hasImage,
}: {
  href: string;
  media: ReactNode;
  typeLabel: ReactNode;
  title: string;
  location?: string;
  meta?: ReactNode;
  badge?: ReactNode;
  kind: "directory" | "event";
  featured?: boolean;
  eventStatus?: string;
  hasImage?: boolean;
}) {
  const contents = (
    <div className={`${styles.cardInner} ${styles.cardWithImage}`}>
      <div className={styles.cardImage} aria-hidden="true">
        {media}
      </div>
      <div className={styles.cardCopy}>
        <div className={styles.cardTopline} data-public-card-meta>
          <span className={styles.cardType}>{typeLabel}</span>
          {badge}
        </div>
        {kind === "event" && meta ? (
          <div className={`${styles.cardMeta} ${styles.eventDateMeta}`} data-public-card-meta data-event-date-line>
            {meta}
          </div>
        ) : null}
        {kind === "event" ? (
          <h3 className={styles.cardTitle} data-public-card-title>{title}</h3>
        ) : (
          <strong className={styles.cardTitle} data-public-card-title>{title}</strong>
        )}
        {location && <span className={styles.cardLocation}>{location}</span>}
        {kind !== "event" && meta ? (
          <div className={styles.cardMeta} data-public-card-meta>
            {meta}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (kind === "event") {
    // The event card remains an article containing exactly one full-card link.
    // This retains the existing event's semantic/a11y and navigation contract.
    return (
      <article
        className={styles.card}
        data-public-card="event-grid"
        data-event-card
        data-event-has-image={String(Boolean(hasImage))}
        data-event-status={eventStatus}
      >
        <Link className={styles.cardLink} href={href}>{contents}</Link>
      </article>
    );
  }

  return (
    <Link
      className={styles.card}
      href={href}
      data-public-card="directory"
      data-directory-card
      data-directory-featured={featured ? "true" : undefined}
    >
      {contents}
    </Link>
  );
}
