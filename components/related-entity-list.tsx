import Link from "next/link";
import type { PublicRelatedBreed } from "@/lib/content-relations";
import styles from "./related-entity-list.module.css";

export function RelatedBreedList({
  breeds,
  label,
}: {
  breeds: readonly PublicRelatedBreed[];
  label: string;
}) {
  if (!breeds.length) return null;

  return (
    <ul className={styles.grid} aria-label={label} data-related-breed-list>
      {breeds.map((breed) => (
        <li key={breed.id}>
          <Link className={styles.card} href={breed.href}>
            {breed.imageUrl ? (
              <span className={styles.media} aria-hidden="true">
                <img src={breed.imageUrl} alt="" loading="lazy" decoding="async" />
              </span>
            ) : (
              <span className={styles.placeholder} aria-hidden="true">🐾</span>
            )}
            <span className={styles.copy}>
              <small>FCI skupina {breed.fciGroup}</small>
              <strong>{breed.name}</strong>
              <span className={styles.action}>Zobraziť profil <span aria-hidden="true">→</span></span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
