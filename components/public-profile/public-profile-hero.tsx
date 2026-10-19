import type { ReactNode } from "react";
import { DetailHero } from "@/components/detail-primitives/detail-primitives";
import { Breadcrumbs } from "@/components/page-system";
import { ImageDisplay } from "@/components/image-display";
import type { ImageDisplayConfig } from "@/lib/image-display";
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
  title?: string;
};

export function PublicProfileHero({
  breadcrumbs,
  typeLabel,
  title,
  lead,
  location,
  imageUrl,
  imageAlt,
  imageConfig,
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
  imageConfig?: ImageDisplayConfig | null;
  badges?: PublicProfileBadge[];
  actions?: PublicProfileAction[];
}) {
  return <DetailHero kind="organization" breadcrumbs={<Breadcrumbs label="Drobečková navigácia">{breadcrumbs}</Breadcrumbs>}
    copy={<>
            <div className={styles.badges}>
              <span className={styles.typeBadge}>{typeLabel}</span>
              {badges.map((badge) => (
                <span className={styles[badge.tone]} key={badge.tone + badge.label} title={badge.title} aria-label={badge.title ? `${badge.label} – ${badge.title}` : undefined}>{badge.label}</span>
              ))}
            </div>
            <h1 data-long-title={title.length >= 70 ? "" : undefined}>{title}</h1>
            {location ? <p className={styles.location}>{location}</p> : null}
            {lead ? <p className={styles.lead}>{lead}</p> : null}
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
</>}
    media={imageUrl ? <ImageDisplay roleHint="generic" context="detail" config={imageConfig} src={imageUrl} alt={imageAlt || title} loading="eager" fetchPriority="high" decoding="async" /> : null} />;

}

export function PublicProfileContentLayout({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <section className={styles.layout} data-public-profile-layout>
      <div className={styles.body} data-public-profile-body>{children}</div>
      <aside className={styles.aside} aria-label="Kontaktné a praktické informácie" data-public-profile-sidebar>
        {aside}
      </aside>

    </section>
  );
}
