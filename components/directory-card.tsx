import { directoryProfileHref, getDirectoryCategory, type PublicDirectoryProfile } from "@/lib/directory";
import { ImageDisplay } from "@/components/image-display";
import { PublicMediaFallback } from "@/components/public-visual-system";
import { PublicListingRowCard } from "@/components/public-listing-row-card";
import { publicLocationLabel, publicLocationValue } from "@/lib/public-location";
import styles from "./directory-public.module.css";

export function DirectoryCard({ profile }: { profile: PublicDirectoryProfile }) {
  const category = getDirectoryCategory(profile.category);
  const city = publicLocationValue(profile.city, "city");
  const district = publicLocationValue(profile.district, "district");
  const region = publicLocationValue(profile.region, "region");
  const location = publicLocationLabel([city, district && district !== city ? district : "", region]);
  const serviceMeta = profile.services.slice(0, 2);

  return (
    <PublicListingRowCard
      kind="directory"
      href={directoryProfileHref(profile)}
      typeLabel={category?.singular ?? "Služba pre psov"}
      title={profile.name}
      location={location}
      featured={profile.featured}
      badge={profile.featured ? <span className={styles.featured}>Odporúčame</span> : undefined}
      media={
        profile.imageUrl ? (
          <ImageDisplay
            fallbackOnError
            roleHint="generic"
            context="thumbnail"
            config={profile.thumbnailImageDisplay}
            src={profile.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <PublicMediaFallback />
        )
      }
      meta={
        serviceMeta.length || profile.priceNote ? (
          <>
            {serviceMeta.map((service) => <span key={service}>{service}</span>)}
            {profile.priceNote && <span>{profile.priceNote}</span>}
          </>
        ) : undefined
      }
    />
  );
}
