import Link from "next/link";
import type { ManagedBreedIndexItem } from "@/lib/breed-store";
import { ArrowIcon } from "./icons";

export function RatingDots({ value, label }: { value: number; label: string }) {
  return (
    <div className="rating-row" aria-label={`${label}: ${value} z 5`}>
      <span>{label}</span>
      <i aria-hidden="true">
        {[1, 2, 3, 4, 5].map((dot) => <b key={dot} className={dot <= value ? "is-on" : ""} />)}
      </i>
    </div>
  );
}

export function BreedCard({ breed }: { breed: ManagedBreedIndexItem }) {
  return (
    <article className={`breed-card breed-card--${breed.accent}`}>
      <Link href={`/plemena/${breed.slug}`} className="breed-card-media" aria-label={`Otvoriť profil: ${breed.name}`}>
        {breed.image ? <img src={breed.image} alt={`${breed.name} v prírodnom prostredí`} loading="lazy" decoding="async" /> : <span className="breed-card-placeholder" aria-hidden="true">🐕</span>}
        <span className="fci-badge">FCI {breed.fciGroup}</span>
      </Link>
      <div className="breed-card-body">
        <span className="eyebrow">{breed.fciSection}</span>
        <h3><Link href={`/plemena/${breed.slug}`}>{breed.name}</Link></h3>
        <p>{breed.intro || breed.officialFciName}</p>
        {breed.editorialComplete && <div className="breed-ratings">
          <RatingDots value={breed.energy} label="Energia" />
          <RatingDots value={breed.trainability} label="Cvičiteľnosť" />
          <RatingDots value={breed.family} label="Rodina" />
        </div>}
        <Link href={`/plemena/${breed.slug}`} className="text-link">Profil plemena <ArrowIcon size={18} /></Link>
      </div>
    </article>
  );
}
