import Link from "next/link";

import { adoptionDetailStatusLabels } from "@/lib/adoption-detail";
import type { AdoptionPublicStatus } from "@/lib/adoption";
import styles from "./adoption.module.css";

type AdoptionCardMediaProps = {
  href: string;
  name: string;
  status: AdoptionPublicStatus;
  mainImage: string | null;
};

export function AdoptionCardMedia({ href, name, status, mainImage }: AdoptionCardMediaProps) {
  return (
    <Link className={styles.visual} href={href} aria-label={`Zobraziť profil ${name}`}>
      {mainImage ? (
        <img
          src={mainImage}
          alt={`${name} – pes na adopciu`}
          data-adoption-media="image"
        />
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
