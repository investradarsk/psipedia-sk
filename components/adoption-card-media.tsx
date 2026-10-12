import Link from "next/link";
import { ImageDisplay } from "@/components/image-display";
import type { ImageDisplayConfig } from "@/lib/image-display";

import { adoptionDetailStatusLabels } from "@/lib/adoption-detail";
import type { AdoptionPublicStatus } from "@/lib/adoption";
import styles from "./adoption.module.css";

type AdoptionCardMediaProps = {
  href: string;
  name: string;
  status: AdoptionPublicStatus;
  mainImage: string | null;
  imageConfig?: ImageDisplayConfig | null;
};

export function AdoptionCardMedia({ href, name, status, mainImage, imageConfig }: AdoptionCardMediaProps) {
  return (
    <Link className={styles.visual} href={href} aria-label={`Zobraziť profil ${name}`}>
      {mainImage ? (
        <ImageDisplay roleHint="generic" context="thumbnail" config={imageConfig} src={mainImage} alt={`${name} – pes na adopciu`} loading="lazy" decoding="async" data-adoption-media="image" />
      ) : (
        <div className={styles.imageFallback} aria-hidden="true" data-adoption-media="fallback">
          <span />
        </div>
      )}
      <span className={`${styles.statusBadge} ${status === "RESERVED" ? styles.reserved : styles.active}`}>
        {adoptionDetailStatusLabels[status]}
      </span>
    </Link>
  );
}
