import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowIcon } from "@/components/icons";
import styles from "./public-magazine-banner.module.css";

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
  promoKey,
  promoVariant,
  anchorId,
  desktopColors,
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
  promoKey?: string;
  promoVariant?: string;
  /** Optional stable link target for read-only visual-library usage navigation. */
  anchorId?: string;
  desktopColors?: { background: "original" | "sage" | "cream" | "white"; button: "original" | "green" | "red" } | null;
}) {
  const photo = photoTone ? publicBannerPhotos[photoTone] : null;
  const bg = desktopColors?.background === "sage" ? "#e1ebdf" : desktopColors?.background === "cream" ? "#f9f1e5" : desktopColors?.background === "white" ? "#ffffff" : undefined;
  const buttonBg = desktopColors?.button === "green" ? "#20543e" : desktopColors?.button === "red" ? "#b44939" : undefined;
  const desktopStyle = { "--ps-visual-desktop-bg": bg, "--ps-visual-desktop-button": buttonBg } as CSSProperties;
  return (
    <section
      id={anchorId}
      style={desktopColors ? desktopStyle : undefined}
      data-visual-library-desktop-published={desktopColors ? "true" : undefined}
      className={[compact ? "home-magazine-banner" : "shell home-magazine-banner", styles.magazine, "ps-public-banner-frame", photo && styles.withPhoto, compact && styles.compact, links?.length && styles.withLinks].filter(Boolean).join(" ")}
      data-home-banner={testId}
      data-promo-key={promoKey}
      data-promo-variant={promoVariant}
      data-public-photo-callout={photoTone}
      aria-label={headingId ? undefined : title}
      aria-labelledby={headingId}
    >
      {photo ? (
        <span className={styles.photoMedia} aria-hidden="true">
          <img className={styles.photoBlur} src={photo} alt="" width={1200} height={800} loading="lazy" decoding="async" />
          <img className={styles.photoFull} src={photo} alt="" width={1200} height={800} loading="lazy" decoding="async" />
        </span>
      ) : null}
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      {links?.length ? (
        <nav className={styles.links} aria-label={title}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={styles.link}>
              <span>{link.label}</span><ArrowIcon size={16} />
            </Link>
          ))}
        </nav>
      ) : href && label ? (
        <Link href={href} className="button button--dark">
          {label} <ArrowIcon size={18} />
        </Link>
      ) : null}
    </section>
  );
}
