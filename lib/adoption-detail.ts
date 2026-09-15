import {
  adoptionAgeMonths,
  adoptionIsIndexable,
  adoptionIsStale,
  isAdoptionPublicStatus,
  type AdoptionCompatibility,
  type AdoptionDog,
  type AdoptionPublicStatus,
} from "./adoption.ts";

export type PublicAdoptionDetailDog = AdoptionDog & { status: AdoptionPublicStatus };

export const adoptionDetailStatusLabels: Record<AdoptionPublicStatus, string> = {
  ACTIVE: "Na adopciu",
  RESERVED: "Rezervovaný",
};

export const adoptionDetailSexLabels = {
  MALE: "Pes",
  FEMALE: "Sučka",
  UNKNOWN: "Neuvedené",
} as const;

export const adoptionDetailSizeLabels = {
  SMALL: "Malý",
  MEDIUM: "Stredný",
  LARGE: "Veľký",
  GIANT: "Obrovský",
  UNKNOWN: "Neuvedená",
} as const;

export const adoptionDetailActivityLabels = {
  LOW: "Nízka",
  MEDIUM: "Stredná",
  HIGH: "Vysoká",
  VERY_HIGH: "Veľmi vysoká",
  UNKNOWN: "Neuvedená",
} as const;

export const adoptionDetailCompatibilityLabels: Record<AdoptionCompatibility, string> = {
  YES: "Áno",
  NO: "Nie",
  CONDITIONAL: "S podmienkami",
  UNKNOWN: "Neoverené",
};

export const adoptionDetailVaccinationLabels = {
  UNKNOWN: "Neuvedené",
  NONE: "Nie",
  PARTIAL: "Čiastočne",
  UP_TO_DATE: "Aktuálne",
} as const;

export function adoptionDetailPath(slug: string) {
  return `/pomoc-psom/adopcia/${slug}`;
}

export function asPublicAdoptionDetail(dog: AdoptionDog | null): PublicAdoptionDetailDog | null {
  return dog && isAdoptionPublicStatus(dog.status) ? dog as PublicAdoptionDetailDog : null;
}

export function formatAdoptionDetailAge(
  dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">,
  now = new Date(),
) {
  const months = adoptionAgeMonths(dog, now);
  if (months === null) return null;
  if (months < 12) return `${months} ${months === 1 ? "mesiac" : months >= 2 && months <= 4 ? "mesiace" : "mesiacov"}`;
  const years = Math.max(1, Math.round(months / 12));
  return `približne ${years} ${years === 1 ? "rok" : years >= 2 && years <= 4 ? "roky" : "rokov"}`;
}

export function formatAdoptionDetailVerification(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

export function adoptionDetailBooleanLabel(value: boolean | null) {
  return value === null ? null : value ? "Áno" : "Nie";
}

export function buildAdoptionDetailSections(dog: AdoptionDog) {
  const compatibility = [
    dog.suitableForChildren,
    dog.suitableForDogs,
    dog.suitableForCats,
    dog.suitableForOtherAnimals,
  ].some((value) => value !== "UNKNOWN")
    || dog.apartmentSuitable !== null
    || dog.beginnerSuitable !== null
    || dog.needsExperiencedOwner;
  const health = dog.vaccinationStatus !== "UNKNOWN"
    || dog.chipped !== null
    || dog.neutered !== null
    || Boolean(dog.healthNotes.trim())
    || Boolean(dog.specialNeeds.trim());
  return {
    breed: Boolean(dog.breedName.trim()),
    temperament: Boolean(dog.temperament.trim()),
    story: Boolean(dog.description.trim()),
    compatibility,
    health,
    requirements: Boolean(dog.adoptionRequirements.trim()),
    gallery: dog.gallery.some((item) => item.trim().length > 0),
    contact: Boolean(dog.organizationName.trim() || dog.contactEmail || dog.contactPhone || dog.contactUrl || dog.externalSourceUrl),
  };
}

export function buildAdoptionDetailSeo(dog: PublicAdoptionDetailDog, now = new Date()) {
  const description = dog.shortDescription.trim()
    || `${dog.name}${dog.city ? ` hľadá nový domov v lokalite ${dog.city}` : " hľadá nový domov"}.`;
  return {
    title: `${dog.name} – pes na adopciu`,
    description,
    path: adoptionDetailPath(dog.slug),
    image: dog.mainImage,
    imageAlt: `${dog.name} – pes na adopciu`,
    indexable: adoptionIsIndexable(dog, now),
    publishedTime: dog.publishedAt || dog.createdAt || undefined,
    modifiedTime: dog.updatedAt || undefined,
  };
}

function absoluteDetailUrl(siteUrl: string, value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}${value.startsWith("/") ? value : `/${value}`}`;
}

export function buildAdoptionDetailStructuredData(dog: PublicAdoptionDetailDog, siteUrl: string) {
  const path = adoptionDetailPath(dog.slug);
  const canonical = absoluteDetailUrl(siteUrl, path);
  const page: Record<string, unknown> = {
    "@type": "WebPage",
    "@id": canonical,
    url: canonical,
    name: `${dog.name} – pes na adopciu`,
    inLanguage: "sk",
  };
  if (dog.shortDescription.trim()) page.description = dog.shortDescription.trim();
  if (dog.publishedAt || dog.createdAt) page.datePublished = dog.publishedAt || dog.createdAt;
  if (dog.updatedAt) page.dateModified = dog.updatedAt;
  if (dog.mainImage) page.primaryImageOfPage = absoluteDetailUrl(siteUrl, dog.mainImage);

  return {
    "@context": "https://schema.org",
    "@graph": [
      page,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Domov", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Pomoc psom", item: `${siteUrl}/pomoc-psom` },
          { "@type": "ListItem", position: 3, name: "Psy na adopciu", item: `${siteUrl}/pomoc-psom/adopcia` },
          { "@type": "ListItem", position: 4, name: dog.name, item: canonical },
        ],
      },
    ],
  };
}

export function adoptionDetailIsStale(dog: Pick<AdoptionDog, "lastVerifiedAt">, now = new Date()) {
  return adoptionIsStale(dog.lastVerifiedAt, now);
}
