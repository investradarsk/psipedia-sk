import type { ReactNode } from "react";
import { DetailHero, DetailProfileTitle, PublicDetailLayout } from "@/components/detail-primitives/detail-primitives";
import { Breadcrumbs } from "@/components/page-system";
import { ImageDisplay } from "@/components/image-display";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { PublicMediaFallback, PublicPhotoLightboxLink } from "@/components/public-visual-system";
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
  return (
    <DetailHero
      kind="organization"
      mediaPresentation="compact"
      breadcrumbs={<Breadcrumbs label="Drobečková navigácia">{breadcrumbs}</Breadcrumbs>}
      copy={
        <>
          <DetailProfileTitle
            title={title}
            category={typeLabel}
            categoryClassName={styles.typeBadge}
            badgeClassName={styles.badges}
            badges={badges.map((badge) => (
              <span
                className={styles[badge.tone]}
                key={badge.tone + badge.label}
                title={badge.title}
                aria-label={badge.title ? `${badge.label} – ${badge.title}` : undefined}
              >
                {badge.label}
              </span>
            ))}
          />
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
        </>
      }
      media={
        <div>
          {imageUrl ? (
          <PublicPhotoLightboxLink src={imageUrl} alt={imageAlt || title}>
            <ImageDisplay
            roleHint="generic"
            fallbackOnError
            context="detail"
            config={imageConfig}
            src={imageUrl}
            srcSet={responsiveMediaSrcSet(imageUrl, [320, 480, 640, 768, 960, 1280])}
            sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1280px) 48vw, 610px"
            alt={imageAlt || title}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          </PublicPhotoLightboxLink>
        ) : (
          <PublicMediaFallback
            size="detail"
            label={`Fotografia profilu ${title} zatiaľ nie je pridaná`}
          />
          )}
        </div>
      }
    />
  );
}

export function PublicProfileContentLayout({
  children,
  aside,
}: {
  children: ReactNode;
  aside: ReactNode;
}) {
  return (
    <PublicDetailLayout
      element="section"
      className={styles.layout}
      contentClassName={styles.body}
      asideClassName={styles.aside}
      asideLabel="Kontaktné a praktické informácie"
      aside={<div data-public-profile-sidebar>{aside}</div>}
      data-public-profile-layout
    >
      <div data-public-profile-body>{children}</div>
    </PublicDetailLayout>
  );
}
