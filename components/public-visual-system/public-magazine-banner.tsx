import { PublicHeading } from "@/components/public-heading";
import { PublicActionLink } from "./public-visual-system";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowIcon } from "@/components/icons";
import styles from "./public-magazine-banner.module.css";
import { PublicBannerFrame, type PublicBannerVisual, type PublicBannerSize } from "./public-banner-frame";

export type PublicMagazineBannerPhotoTone = "care" | "rescue" | "volunteer" | "closing";

const publicBannerPhotos: Record<PublicMagazineBannerPhotoTone, string> = {
  care: "/images/zdravie-veterinar.webp",
  rescue: "/images/hero-labrador.webp",
  volunteer: "/images/trening-pri-nohe.webp",
  closing: "/images/hero-labrador.webp",
};

/** One homepage-derived banner structure, optionally with safe photographic media. */
export function PublicMagazineBanner({
  title,
  description,
  label,
  href,
  testId,
  eyebrow = "Psipedia spája ľudí so psami",
  headingId,
  photoTone,
  links,
  compact = false,
  visual,
  size,
  promoKey,
  promoVariant,
  anchorId,
  desktopColors,
  desktopCopy,
}: {
  title: string;
  description: string;
  label?: string;
  href?: string;
  testId: string;
  eyebrow?: string;
  headingId?: string;
  photoTone?: PublicMagazineBannerPhotoTone;
  links?: Array<{ href: string; label: string }>;
  compact?: boolean;
  visual?: PublicBannerVisual;
  size?: PublicBannerSize;
  promoKey?: string;
  promoVariant?: string;
  /** Optional stable link target for read-only visual-library usage navigation. */
  anchorId?: string;
  desktopColors?: {
    visual?: PublicBannerVisual;
    size?: PublicBannerSize;
    background: "original" | "sage" | "cream" | "white";
    button: "original" | "green" | "red";
  } | null;
  /** Owner-approved copy for desktop only, original props are the mobile source of truth. */
  desktopCopy?: { eyebrow: string; title: string; description: string; ctaLabel: string } | null;
}) {
  const photo = photoTone ? publicBannerPhotos[photoTone] : null;
  // Legacy custom background/button values remain readable for saved drafts.
  // Rendering uses only the approved two themes and three size presets.
  return (
    <PublicBannerFrame
      as="section"
      visual={visual ?? (photoTone ? "dark" : "light")}
      size={size ?? (compact ? "small" : "medium")}
      data-banner-desktop-visual={desktopColors?.visual}
      data-banner-desktop-size={desktopColors?.size}
      id={anchorId}
      data-visual-library-desktop-published={desktopColors ? "true" : undefined}
      className={[
        compact ? "home-magazine-banner" : "shell home-magazine-banner",
        styles.magazine,
        photo && styles.withPhoto,
        compact && styles.compact,
        links?.length && styles.withLinks,
      ]
        .filter(Boolean)
        .join(" ")}
      data-home-banner={testId}
      data-promo-key={promoKey}
      data-promo-variant={promoVariant}
      data-public-photo-callout={photoTone}
      aria-label={headingId || desktopCopy ? undefined : title}
      aria-labelledby={headingId ?? (desktopCopy && anchorId ? `${anchorId}-heading` : undefined)}
    >
      {photo ? (
        <span className={styles.photoMedia} aria-hidden="true">
          <img
            className={styles.photoBlur}
            src={photo}
            alt=""
            width={1200}
            height={800}
            loading="lazy"
            decoding="async"
          />
          <img
            className={styles.photoFull}
            src={photo}
            alt=""
            width={1200}
            height={800}
            loading="lazy"
            decoding="async"
          />
        </span>
      ) : null}
      <PublicBannerContent
        eyebrow={
          desktopCopy ? (
            <>
              <span className={styles.mobileCopy}>{eyebrow}</span>
              <span className={styles.desktopCopy}>{desktopCopy.eyebrow}</span>
            </>
          ) : (
            eyebrow
          )
        }
        title={
          desktopCopy ? (
            <>
              <span className={styles.mobileCopy}>{title}</span>
              <span className={styles.desktopCopy}>{desktopCopy.title}</span>
            </>
          ) : (
            title
          )
        }
        description={
          desktopCopy ? (
            <>
              <span className={styles.mobileCopy}>{description}</span>
              <span className={styles.desktopCopy}>{desktopCopy.description}</span>
            </>
          ) : (
            description
          )
        }
        headingId={headingId ?? (desktopCopy && anchorId ? `${anchorId}-heading` : undefined)}
        href={href}
        label={
          desktopCopy ? (
            <>
              <span className={styles.mobileCopy}>{label}</span>
              <span className={styles.desktopCopy}>{desktopCopy.ctaLabel}</span>
            </>
          ) : (
            label
          )
        }
        links={links}
      />
    </PublicBannerFrame>
  );
}

/** Canonical text and action structure for internal editorial promotions. */
export function PublicBannerContent({
  eyebrow,
  title,
  description,
  headingId,
  href,
  label,
  links,
  actions,
  icon,
  className,
  actionVariant = "primary",
  headingAs = "h2",
  headingClassName,
  copyClassName,
  actionsClassName,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  headingId?: string;
  href?: string;
  label?: ReactNode;
  links?: Array<{ href: string; label: string }>;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  actionVariant?: "primary" | "secondary";
  /** Semantic level is independent of the common banner visual. */
  headingAs?: "h2" | "h3";
  headingClassName?: string;
  copyClassName?: string;
  actionsClassName?: string;
}) {
  return (
    <div
      className={[styles.bannerContent, className].filter(Boolean).join(" ")}
      data-public-banner-content
    >
      <div className={[styles.bannerCopy, copyClassName].filter(Boolean).join(" ")} data-public-banner-copy>
        {icon}
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <PublicHeading role="section" as={headingAs} id={headingId} className={headingClassName}>
          {title}
        </PublicHeading>
        {description ? (
          <div className={styles.bannerDescription} data-public-banner-description>
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className={actionsClassName} data-public-banner-actions>{actions}</div>
      ) : links?.length ? (
        <nav className={styles.links} aria-label="Užitočné odkazy">
          {links.map((link) => (
            <Link className={styles.link} key={link.href} href={link.href}>
              <span>{link.label}</span>
              <ArrowIcon size={16} />
            </Link>
          ))}
        </nav>
      ) : href && label ? (
        <PublicActionLink
          href={href}
          variant={actionVariant}
          className="button button--dark"
          icon={<ArrowIcon size={18} />}
        >
          {label}
        </PublicActionLink>
      ) : null}
    </div>
  );
}
