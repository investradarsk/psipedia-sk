import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import styles from "./public-magazine-banner.module.css";
import { PublicBannerFrame } from "./public-banner-frame";

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
}) {
  const photo = photoTone ? publicBannerPhotos[photoTone] : null;
  return (
    <PublicBannerFrame as="section"
      className={[compact ? "home-magazine-banner" : "shell home-magazine-banner", styles.magazine, photo && styles.withPhoto, compact && styles.compact, links?.length && styles.withLinks].filter(Boolean).join(" ")}
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
    </PublicBannerFrame>
  );
}
