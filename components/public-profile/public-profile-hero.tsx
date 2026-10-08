import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/page-system";
import styles from "./public-profile.module.css";

export type PublicProfileAction = {
  label: string;
  href: string;
  external?: boolean;
  primary?: boolean;
};

export type PublicProfileBadge = {
  label: string;
  tone: "featured" | "premium" | "sponsored";
};

export function PublicProfileHero({
  breadcrumbs,
  typeLabel,
  title,
  lead,
  location,
  imageUrl,
  imageAlt,
  badges = [],
  actions = [],
}: {
  breadcrumbs: ReactNode;
  typeLabel: string;
  title: string;
  lead?: string | null;
  location?: ReactNode;
  imageUrl?: string | null;
  imageAlt?: string;
  badges?: PublicProfileBadge[];
  actions?: PublicProfileAction[];
}) {
  return (
    <header className={styles.hero} data-public-profile-hero>
      <div className="shell">
        <Breadcrumbs label="Drobečková navigácia">{breadcrumbs}</Breadcrumbs>
        <div className={[styles.heroGrid, imageUrl ? styles.hasMedia : ""].filter(Boolean).join(" ")}>
          <div className={styles.heroCopy}>
            <div className={styles.badges}>
              <span className={styles.typeBadge}>{typeLabel}</span>
              {badges.map((badge) => (
                <span className={styles[badge.tone]} key={badge.tone + badge.label}>{badge.label}</span>
              ))}
            </div>
            <h1>{title}</h1>
            {lead ? <p className={styles.lead}>{lead}</p> : null}
            {location ? <p className={styles.location}>{location}</p> : null}
            {actions.length > 0 ? (
              <nav className={styles.actions} aria-label="Akcie profilu">
                {actions.map((action) => (
                  <a
                    key={action.href + action.label}
                    data-profile-primary-action={action.primary ? "" : undefined}
                    className={action.primary ? styles.primaryAction : styles.secondaryAction}
                    href={action.href}
                    target={action.external ? "_blank" : undefined}
                    rel={action.external ? "noreferrer" : undefined}
                  >
                    {action.label}
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
          {imageUrl ? (
            <div className={styles.media} data-public-profile-media>
              <img src={imageUrl} alt={imageAlt || title} loading="eager" fetchPriority="high" decoding="async" />
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function PublicProfileContentLayout({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <section className={["shell", styles.layout].join(" ")} data-public-profile-layout>
      <aside className={styles.aside} aria-label="Kontaktné a praktické informácie" data-public-profile-sidebar>
        {aside}
      </aside>
      <div className={styles.body} data-public-profile-body>{children}</div>
    </section>
  );
}
