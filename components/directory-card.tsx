import { directoryProfileHref, getDirectoryCategory, type PublicDirectoryProfile } from "@/lib/directory";
import { ImageDisplay } from "@/components/image-display";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { PublicMediaFallback } from "@/components/public-visual-system";
import { PublicListingRowCard } from "@/components/public-listing-row-card";
import { publicLocationValue } from "@/lib/public-location";
import styles from "./directory-public.module.css";

export function DirectoryCard({ profile }: { profile: PublicDirectoryProfile }) {
  const category = getDirectoryCategory(profile.category);
  const city = publicLocationValue(profile.city, "city");
  const breederBreeds = profile.category === "chovatelske-stanice"
    ? profile.breedSummary?.trim()
    : "";

  return (
    <PublicListingRowCard
      kind="directory"
      href={directoryProfileHref(profile)}
      typeLabel={category?.singular ?? "Služba pre psov"}
      title={profile.name}
      location={city}
      meta={breederBreeds ? <span className={styles.breederBreedSummary} title={breederBreeds}>{breederBreeds}</span> : undefined}
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
            srcSet={responsiveMediaSrcSet(profile.imageUrl, [160, 320])}
            sizes="(max-width: 620px) 76px, 88px"
            alt=""
            width={88}
            height={76}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <PublicMediaFallback />
        )
      }
    />
  );
}
