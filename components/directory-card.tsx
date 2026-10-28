import Link from "next/link";
import { directoryProfileHref, getDirectoryCategory, type PublicDirectoryProfile } from "@/lib/directory";
import styles from "./directory-public.module.css";
import { ImageDisplay } from "@/components/image-display";
import { PublicMediaFallback } from "@/components/public-visual-system";
import { publicLocationLabel, publicLocationValue } from "@/lib/public-location";

export function DirectoryCard({ profile }: { profile: PublicDirectoryProfile }) {
  const category = getDirectoryCategory(profile.category);
  const city = publicLocationValue(profile.city, "city");
  const district = publicLocationValue(profile.district, "district");
  const region = publicLocationValue(profile.region, "region");
  const location = publicLocationLabel([city, district && district !== city ? district : "", region]);
  const serviceMeta = profile.services.slice(0, 2);

  return (
    <Link
      className={styles.card}
      href={directoryProfileHref(profile)}
      data-directory-card
      data-public-card="directory"
      data-directory-featured={profile.featured ? "true" : undefined}
    >
      <span className={`${styles.cardInner} ${styles.cardWithImage}`}>
        <span className={styles.cardImage}>
          {profile.imageUrl ? <ImageDisplay fallbackOnError roleHint="generic" context="thumbnail" config={profile.thumbnailImageDisplay} src={profile.imageUrl} alt="" loading="lazy" decoding="async" /> : <PublicMediaFallback />}
        </span>
        <span className={styles.cardCopy}>
          <span className={styles.cardTopline} data-public-card-meta>
            <span className={styles.cardType}>{category?.singular ?? "Služba pre psov"}</span>
            {profile.featured && <span className={styles.featured}>Odporúčame</span>}
          </span>
          <strong className={styles.cardTitle} data-public-card-title>{profile.name}</strong>
          {location && <span className={styles.cardLocation}>{location}</span>}
          {(serviceMeta.length > 0 || profile.priceNote) && (
            <span className={styles.cardMeta} data-public-card-meta>
              {serviceMeta.map((service) => <span key={service}>{service}</span>)}
              {profile.priceNote && <span>{profile.priceNote}</span>}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
