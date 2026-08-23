"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Breed } from "@/lib/content";
import { ArrowIcon } from "./icons";

function CompareRating({ value, label }: { value: number; label: string }) {
  return (
    <div className="compare-rating" aria-label={`${label}: ${value} z 5`}>
      <span aria-hidden="true">
        {[1, 2, 3, 4, 5].map((dot) => <i key={dot} className={dot <= value ? "is-on" : ""} />)}
      </span>
      <strong>{value}/5</strong>
    </div>
  );
}

function BreedHeading({ breed }: { breed: Breed }) {
  return (
    <div className={`compare-breed-heading compare-breed-heading--${breed.accent}`}>
      <img className="compare-breed-image" src={breed.image} alt="" aria-hidden="true" />
      <span>FCI {breed.fciGroup} · {breed.fciSection}</span>
      <h2>{breed.name}</h2>
      <small>{breed.origin}</small>
      <Link href={`/plemena/${breed.slug}`}>Celý profil <ArrowIcon size={17} /></Link>
    </div>
  );
}

export function BreedComparison({ breeds }: { breeds: Breed[] }) {
  const [firstSlug, setFirstSlug] = useState(breeds[0]?.slug ?? "");
  const [secondSlug, setSecondSlug] = useState(breeds[2]?.slug ?? breeds[1]?.slug ?? "");

  const first = useMemo(() => breeds.find((breed) => breed.slug === firstSlug) ?? breeds[0], [breeds, firstSlug]);
  const second = useMemo(() => breeds.find((breed) => breed.slug === secondSlug) ?? breeds[1] ?? breeds[0], [breeds, secondSlug]);

  if (!first || !second) return null;

  const facts = [
    { label: "FCI skupina", first: `${first.fciGroup} – ${first.fciSection}`, second: `${second.fciGroup} – ${second.fciSection}` },
    { label: "Veľkosť", first: first.size, second: second.size },
    { label: "Hmotnosť", first: first.weight, second: second.weight },
    { label: "Dĺžka života", first: first.lifespan, second: second.lifespan },
    { label: "Srsť", first: first.coat, second: second.coat },
  ];

  function swapBreeds() {
    setFirstSlug(secondSlug);
    setSecondSlug(firstSlug);
  }

  return (
    <div className="breed-compare">
      <div className="compare-picker" aria-label="Výber plemien na porovnanie">
        <label>
          <span>Prvé plemeno</span>
          <select value={firstSlug} onChange={(event) => setFirstSlug(event.target.value)}>
            {breeds.map((breed) => <option key={breed.slug} value={breed.slug} disabled={breed.slug === secondSlug}>{breed.name}</option>)}
          </select>
        </label>
        <button type="button" className="compare-swap" onClick={swapBreeds} aria-label="Vymeniť poradie plemien" title="Vymeniť poradie">
          <span aria-hidden="true">⇄</span>
        </button>
        <label>
          <span>Druhé plemeno</span>
          <select value={secondSlug} onChange={(event) => setSecondSlug(event.target.value)}>
            {breeds.map((breed) => <option key={breed.slug} value={breed.slug} disabled={breed.slug === firstSlug}>{breed.name}</option>)}
          </select>
        </label>
      </div>

      <div className="comparison-table" aria-live="polite">
        <div className="comparison-row comparison-row--head">
          <div className="comparison-label">Porovnávame</div>
          <BreedHeading breed={first} />
          <BreedHeading breed={second} />
        </div>

        {facts.map((fact) => (
          <div className="comparison-row" key={fact.label}>
            <div className="comparison-label">{fact.label}</div>
            <div>{fact.first}</div>
            <div>{fact.second}</div>
          </div>
        ))}

        <div className="comparison-row">
          <div className="comparison-label">Energia</div>
          <CompareRating value={first.energy} label={`${first.name} – energia`} />
          <CompareRating value={second.energy} label={`${second.name} – energia`} />
        </div>
        <div className="comparison-row">
          <div className="comparison-label">Cvičiteľnosť</div>
          <CompareRating value={first.trainability} label={`${first.name} – cvičiteľnosť`} />
          <CompareRating value={second.trainability} label={`${second.name} – cvičiteľnosť`} />
        </div>
        <div className="comparison-row">
          <div className="comparison-label">Rodinný život</div>
          <CompareRating value={first.family} label={`${first.name} – rodinný život`} />
          <CompareRating value={second.family} label={`${second.name} – rodinný život`} />
        </div>
      </div>

      <div className="comparison-summary">
        {[first, second].map((breed) => (
          <article key={breed.slug}>
            <span className="eyebrow">{breed.name} v skratke</span>
            <p className="comparison-intro">{breed.intro}</p>
            <h3>Môže dobre sedieť pre</h3>
            <ul className="comparison-good">{breed.goodFor.map((item) => <li key={item}>{item}</li>)}</ul>
            <h3>Pred rozhodnutím zváž</h3>
            <ul className="comparison-consider">{breed.consider.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        ))}
      </div>

      <p className="compare-note">
        Hodnotenie opisuje typické vlohy plemena, nie záruku povahy konkrétneho psa. Rozhoduje aj línia, zdravie, skoré skúsenosti a každodenné vedenie.
      </p>
    </div>
  );
}
