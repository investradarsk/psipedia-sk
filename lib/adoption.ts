import type { SlovakRegion } from "@/lib/events";

export const adoptionStatuses = ["DRAFT", "ACTIVE", "RESERVED", "ADOPTED", "ARCHIVED"] as const;
export type AdoptionStatus = (typeof adoptionStatuses)[number];

export const adoptionSexes = ["MALE", "FEMALE", "UNKNOWN"] as const;
export type AdoptionSex = (typeof adoptionSexes)[number];

export const adoptionSizes = ["SMALL", "MEDIUM", "LARGE", "GIANT", "UNKNOWN"] as const;
export type AdoptionSize = (typeof adoptionSizes)[number];

export const adoptionActivityLevels = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH", "UNKNOWN"] as const;
export type AdoptionActivityLevel = (typeof adoptionActivityLevels)[number];

export const adoptionCompatibilityValues = ["YES", "NO", "CONDITIONAL", "UNKNOWN"] as const;
export type AdoptionCompatibility = (typeof adoptionCompatibilityValues)[number];

export const adoptionVaccinationStatuses = ["UNKNOWN", "NONE", "PARTIAL", "UP_TO_DATE"] as const;
export type AdoptionVaccinationStatus = (typeof adoptionVaccinationStatuses)[number];

export const adoptionAgeCategories = ["PUPPY", "YOUNG", "ADULT", "SENIOR"] as const;
export type AdoptionAgeCategory = (typeof adoptionAgeCategories)[number];

export const adoptionSorts = ["newest", "verified", "youngest", "oldest"] as const;
export type AdoptionSort = (typeof adoptionSorts)[number];

export const ADOPTION_STALE_DAYS = 30;
export const ADOPTION_NOINDEX_STALE_DAYS = 45;
export const ADOPTION_PAGE_SIZE = 24;
export const ADOPTION_ADMIN_PAGE_SIZE = 40;

export type AdoptionDog = {
  id: number;
  name: string;
  slug: string;
  status: AdoptionStatus;
  sex: AdoptionSex;
  birthDate: string | null;
  approximateAgeMonths: number | null;
  size: AdoptionSize;
  weight: number | null;
  breedId: number | null;
  breedName: string;
  breedSlug: string | null;
  breedMix: boolean;
  color: string;
  region: SlovakRegion | "";
  district: string;
  city: string;
  organizationId: number | null;
  organizationName: string;
  organizationSlug: string | null;
  mainImage: string | null;
  gallery: string[];
  shortDescription: string;
  description: string;
  temperament: string;
  activityLevel: AdoptionActivityLevel;
  suitableForChildren: AdoptionCompatibility;
  suitableForDogs: AdoptionCompatibility;
  suitableForCats: AdoptionCompatibility;
  suitableForOtherAnimals: AdoptionCompatibility;
  apartmentSuitable: boolean | null;
  beginnerSuitable: boolean | null;
  needsExperiencedOwner: boolean;
  vaccinationStatus: AdoptionVaccinationStatus;
  chipped: boolean | null;
  neutered: boolean | null;
  healthNotes: string;
  specialNeeds: string;
  adoptionRequirements: string;
  externalSourceUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactUrl: string | null;
  publishedAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type AdoptionPublicFilters = {
  q?: string;
  region?: string;
  sex?: AdoptionSex | "";
  age?: AdoptionAgeCategory | "";
  size?: AdoptionSize | "";
  children?: boolean;
  dogs?: boolean;
  cats?: boolean;
  status?: Extract<AdoptionStatus, "ACTIVE" | "RESERVED" | "ADOPTED">;
  sort?: AdoptionSort;
  page?: number;
};

export type AdoptionAdminFilters = {
  q?: string;
  status?: AdoptionStatus | "";
  stale?: "all" | "stale" | "fresh";
  page?: number;
};

export const adoptionStatusLabels: Record<AdoptionStatus, string> = {
  DRAFT: "Koncept",
  ACTIVE: "Na adopciu",
  RESERVED: "Rezervovaný",
  ADOPTED: "Adoptovaný",
  ARCHIVED: "Archivovaný",
};

export const adoptionSexLabels: Record<AdoptionSex, string> = {
  MALE: "Pes",
  FEMALE: "Sučka",
  UNKNOWN: "Neuvedené",
};

export const adoptionSizeLabels: Record<AdoptionSize, string> = {
  SMALL: "Malý",
  MEDIUM: "Stredný",
  LARGE: "Veľký",
  GIANT: "Obrovský",
  UNKNOWN: "Neuvedená",
};

export const adoptionActivityLabels: Record<AdoptionActivityLevel, string> = {
  LOW: "Nízka",
  MEDIUM: "Stredná",
  HIGH: "Vysoká",
  VERY_HIGH: "Veľmi vysoká",
  UNKNOWN: "Neuvedená",
};

export const adoptionCompatibilityLabels: Record<AdoptionCompatibility, string> = {
  YES: "Áno",
  NO: "Nie",
  CONDITIONAL: "Po dohode / s podmienkami",
  UNKNOWN: "Neoverené",
};

export const adoptionVaccinationLabels: Record<AdoptionVaccinationStatus, string> = {
  UNKNOWN: "Neuvedené",
  NONE: "Nie",
  PARTIAL: "Čiastočne",
  UP_TO_DATE: "Aktuálne",
};

export const adoptionAgeLabels: Record<AdoptionAgeCategory, string> = {
  PUPPY: "Šteniatko do 1 roka",
  YOUNG: "Mladý 1–3 roky",
  ADULT: "Dospelý 3–8 rokov",
  SENIOR: "Senior 8+ rokov",
};

export function adoptionHref(dog: Pick<AdoptionDog, "slug">) {
  return `/pomoc-psom/adopcia/${dog.slug}`;
}

export function adoptionOrganizationHref(dog: Pick<AdoptionDog, "organizationId" | "organizationSlug">) {
  return dog.organizationId && dog.organizationSlug ? `/pomoc-psom/utulky/${dog.organizationSlug}` : null;
}

export function adoptionBreedHref(dog: Pick<AdoptionDog, "breedId" | "breedSlug">) {
  return dog.breedId && dog.breedSlug ? `/plemena/${dog.breedSlug}` : null;
}

export function adoptionAgeMonths(dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">, now = new Date()) {
  if (dog.birthDate) {
    const born = new Date(`${dog.birthDate}T12:00:00Z`);
    if (!Number.isNaN(born.getTime())) return Math.max(0, Math.round((now.getTime() - born.getTime()) / (30.4375 * 24 * 60 * 60 * 1000)));
  }
  return dog.approximateAgeMonths;
}

export function adoptionAgeCategory(dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">, now = new Date()): AdoptionAgeCategory | null {
  const months = adoptionAgeMonths(dog, now);
  if (months === null) return null;
  if (months < 12) return "PUPPY";
  if (months < 36) return "YOUNG";
  if (months < 96) return "ADULT";
  return "SENIOR";
}

export function formatAdoptionAge(dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">, now = new Date()) {
  const months = adoptionAgeMonths(dog, now);
  if (months === null) return "Vek neuvedený";
  if (months < 12) return `${months} ${months === 1 ? "mesiac" : months >= 2 && months <= 4 ? "mesiace" : "mesiacov"}`;
  const years = Math.max(1, Math.round(months / 12));
  return `približne ${years} ${years === 1 ? "rok" : years >= 2 && years <= 4 ? "roky" : "rokov"}`;
}

export function adoptionIsStale(lastVerifiedAt: string | null, now = new Date(), days = ADOPTION_STALE_DAYS) {
  if (!lastVerifiedAt) return true;
  const verified = new Date(lastVerifiedAt);
  if (Number.isNaN(verified.getTime())) return true;
  return now.getTime() - verified.getTime() > days * 24 * 60 * 60 * 1000;
}

export function adoptionIsIndexable(dog: Pick<AdoptionDog, "status" | "mainImage" | "description" | "lastVerifiedAt">, now = new Date()) {
  return dog.status === "ACTIVE"
    && Boolean(dog.mainImage)
    && dog.description.trim().length >= 80
    && !adoptionIsStale(dog.lastVerifiedAt, now, ADOPTION_NOINDEX_STALE_DAYS);
}

export function formatAdoptionVerification(lastVerifiedAt: string | null) {
  if (!lastVerifiedAt) return "Zatiaľ neoverené";
  const date = new Date(lastVerifiedAt);
  if (Number.isNaN(date.getTime())) return "Zatiaľ neoverené";
  return `Overené ${new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bratislava" }).format(date)}`;
}

export function adoptionBooleanLabel(value: boolean | null) {
  return value === null ? "Neoverené" : value ? "Áno" : "Nie";
}

export function isAdoptionStatus(value: string): value is AdoptionStatus {
  return (adoptionStatuses as readonly string[]).includes(value);
}

export function isAdoptionSex(value: string): value is AdoptionSex {
  return (adoptionSexes as readonly string[]).includes(value);
}

export function isAdoptionSize(value: string): value is AdoptionSize {
  return (adoptionSizes as readonly string[]).includes(value);
}

export function isAdoptionAgeCategory(value: string): value is AdoptionAgeCategory {
  return (adoptionAgeCategories as readonly string[]).includes(value);
}

export function isAdoptionSort(value: string): value is AdoptionSort {
  return (adoptionSorts as readonly string[]).includes(value);
}
