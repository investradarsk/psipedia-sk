import Link from "next/link";
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
}: {
  title: string;
  description: string;
  label: string;
  href: string;
  testId: string;
  eyebrow?: string;
  headingId?: string;
  photoTone?: PublicMagazineBannerPhotoTone;
}) {
  const photo = photoTone ? publicBannerPhotos[photoTone] : null;
  return (
    <section
      className={["shell home-magazine-banner", styles.magazine, "ps-public-banner-frame", photo && styles.withPhoto].filter(Boolean).join(" ")}
      data-home-banner={testId}
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
      <Link href={href} className="button button--dark">
        {label} <ArrowIcon size={18} />
      </Link>
    </section>
  );
}
