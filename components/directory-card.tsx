import Link from "next/link";
import { directoryProfileHref, getDirectoryCategory, type PublicDirectoryProfile } from "@/lib/directory";
import styles from "./directory-public.module.css";

export function DirectoryCard({ profile }: { profile: PublicDirectoryProfile }) {
  const category = getDirectoryCategory(profile.category);
  const location = [
    profile.city,
    profile.district && profile.district !== profile.city ? profile.district : "",
    profile.region,
  ].filter(Boolean).join(" · ");
  const serviceMeta = profile.services.slice(0, 2);

  return (
    <Link
      className={styles.card}
      href={directoryProfileHref(profile)}
      data-directory-card
      data-directory-featured={profile.featured ? "true" : undefined}
    >
      <span className={`${styles.cardInner}${profile.imageUrl ? ` ${styles.cardWithImage}` : ""}`}>
        {profile.imageUrl && (
          <img className={styles.cardImage} src={profile.imageUrl} alt="" loading="lazy" decoding="async" />
        )}
        <span className={styles.cardCopy}>
          <span className={styles.cardTopline}>
            <span className={styles.cardType}>{category?.singular ?? "Služba pre psov"}</span>
            {profile.featured && <span className={styles.featured}>Odporúčame</span>}
          </span>
          <strong className={styles.cardTitle}>{profile.name}</strong>
          {(location || profile.online) && (
            <span className={styles.cardLocation}>
              {[location, profile.online ? "aj online" : ""].filter(Boolean).join(" · ")}
            </span>
          )}
          {(serviceMeta.length > 0 || profile.priceNote) && (
            <span className={styles.cardMeta}>
              {serviceMeta.map((service) => <span key={service}>{service}</span>)}
              {profile.priceNote && <span>{profile.priceNote}</span>}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
