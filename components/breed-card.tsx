import Link from "next/link";
import type { ManagedBreedIndexItem } from "@/lib/breed-store";
import { ArrowIcon, PawMark } from "./icons";

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
  const profileHref = `/plemena/${breed.slug}`;
  return (
    <article className={`breed-card breed-card--${breed.accent}`}>
      <Link href={profileHref} className="breed-card-media" aria-label={`Otvoriť profil: ${breed.name}`}>
        {breed.image ? <img src={breed.image} alt={`${breed.name} – fotografia plemena`} loading="lazy" decoding="async" /> : <span className="breed-card-placeholder" aria-hidden="true"><PawMark size={54} /><small>Fotografia sa pripravuje</small></span>}
        <span className="fci-badge">FCI {breed.fciGroup}</span>
      </Link>
      <div className="breed-card-body">
        <span className="breed-card-classification">FCI {breed.fciGroup}{breed.fciSection ? ` · ${breed.fciSection}` : ""}</span>
        <h3><Link href={profileHref}>{breed.name}</Link></h3>
        <dl className="breed-card-facts">
          {breed.origin && <div><dt>Pôvod</dt><dd>{breed.origin}</dd></div>}
          {breed.height && <div><dt>Výška</dt><dd>{breed.height}</dd></div>}
          {breed.weight && <div><dt>Hmotnosť</dt><dd>{breed.weight}</dd></div>}
        </dl>
        {(breed.intro || breed.officialFciName) && <p>{breed.intro || breed.officialFciName}</p>}
        {breed.editorialComplete && <div className="breed-ratings">
          <RatingDots value={breed.energy} label="Energia" />
          <RatingDots value={breed.trainability} label="Cvičiteľnosť" />
          <RatingDots value={breed.family} label="Rodina" />
        </div>}
        <Link href={profileHref} className="text-link">Zobraziť profil <ArrowIcon size={18} /></Link>
      </div>
    </article>
  );
}
