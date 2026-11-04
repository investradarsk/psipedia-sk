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
  return (
    <Link
      className={styles.card}
      href={href}
      data-public-card={kind === "directory" ? "directory" : "event-grid"}
      data-directory-card={kind === "directory" ? "" : undefined}
      data-directory-featured={kind === "directory" && featured ? "true" : undefined}
      data-event-card={kind === "event" ? "" : undefined}
      data-event-has-image={kind === "event" ? String(Boolean(hasImage)) : undefined}
      data-event-status={kind === "event" ? eventStatus : undefined}
    >
      <span className={`${styles.cardInner} ${styles.cardWithImage}`}>
        <span className={styles.cardImage} aria-hidden="true">
          {media}
        </span>
        <span className={styles.cardCopy}>
          <span className={styles.cardTopline} data-public-card-meta>
            <span className={styles.cardType}>{typeLabel}</span>
            {badge}
          </span>
          <strong className={styles.cardTitle} data-public-card-title>
            {title}
          </strong>
          {location && <span className={styles.cardLocation}>{location}</span>}
          {meta && (
            <span className={styles.cardMeta} data-public-card-meta>
              {meta}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
