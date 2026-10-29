import type { HTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { PublicHelpCardSurface } from "./public-help-card-surface";
import styles from "./public-help-profile-card.module.css";

/**
 * Canonical presentation for EVERY help profile, in the overview and category
 * results. Cards own neither status logic nor data fetching: category-specific
 * callers supply only their real fields/media, while geometry stays identical.
 */
export function PublicHelpProfileCard({
  href, title, media, category, meta, excerpt, badge, extras, actionLabel = "Zobraziť detail",
  className, titleLevel = "h3", children, ...attrs
}: {
  href: string;
  title: string;
  media: ReactNode;
  category: string;
  meta?: ReactNode;
  excerpt?: ReactNode;
  badge?: ReactNode;
  extras?: ReactNode;
  actionLabel?: string;
  className?: string;
  titleLevel?: "h2" | "h3";
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "title" | "children">) {
  const heading = <Link href={href}>{title}</Link>;
  return (
    <PublicHelpCardSurface
      {...attrs}
      className={[styles.card, className].filter(Boolean).join(" ")}
      data-help-profile-card
    >
      <div className={styles.media} data-help-profile-media>
        {media}
        {badge ? <div className={styles.badges}>{badge}</div> : null}
      </div>
      <div className={styles.body} data-help-profile-copy>
        <span className={styles.category}>{category}</span>
        {titleLevel === "h2" ? <h2 className={styles.title}>{heading}</h2> : <h3 className={styles.title}>{heading}</h3>}
        {meta ? <div className={styles.meta}>{meta}</div> : null}
        {excerpt ? <p className={styles.excerpt}>{excerpt}</p> : null}
        {extras ? <div className={styles.extras}>{extras}</div> : null}
        {children}
        <Link className={styles.action} href={href}>{actionLabel}<ArrowIcon size={17} /></Link>
      </div>
    </PublicHelpCardSurface>
  );
}
