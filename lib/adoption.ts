export const adoptionStatuses = ["DRAFT", "ACTIVE", "RESERVED", "ADOPTED", "ARCHIVED"] as const;
export type AdoptionStatus = (typeof adoptionStatuses)[number];

export const adoptionPublicStatuses = ["ACTIVE", "RESERVED"] as const;
export type AdoptionPublicStatus = (typeof adoptionPublicStatuses)[number];

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

export const adoptionRegions = [
  "Bratislavský kraj",
  "Trnavský kraj",
  "Trenčiansky kraj",
  "Nitriansky kraj",
  "Žilinský kraj",
  "Banskobystrický kraj",
  "Prešovský kraj",
  "Košický kraj",
] as const;
export type AdoptionRegion = (typeof adoptionRegions)[number];

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
  region: AdoptionRegion | "";
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

export type ManagedAdoptionInput = Partial<{
  name: string;
  slug: string;
  status: string;
  sex: string;
  birthDate: string | null;
  approximateAgeMonths: number | string | null;
  size: string;
  weight: number | string | null;
  breedId: number | string | null;
  breedName: string;
  breedMix: boolean | number | string;
  color: string;
  region: string;
  district: string;
  city: string;
  organizationId: number | string | null;
  organizationName: string;
  organizationSlug: string | null;
  mainImage: string | null;
  gallery: string[] | string;
  shortDescription: string;
  description: string;
  temperament: string;
  activityLevel: string;
  suitableForChildren: string;
  suitableForDogs: string;
  suitableForCats: string;
  suitableForOtherAnimals: string;
  apartmentSuitable: boolean | number | string | null;
  beginnerSuitable: boolean | number | string | null;
  needsExperiencedOwner: boolean | number | string;
  vaccinationStatus: string;
  chipped: boolean | number | string | null;
  neutered: boolean | number | string | null;
  healthNotes: string;
  specialNeeds: string;
  adoptionRequirements: string;
  externalSourceUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactUrl: string | null;
  lastVerifiedAt: string | null;
}>;

export type NormalizedAdoptionInput = {
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
  breedMix: boolean;
  color: string;
  region: AdoptionRegion | "";
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
  lastVerifiedAt: string | null;
  searchText: string;
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
  sort?: AdoptionSort;
  page?: number;
};

export type AdoptionAdminFilters = {
  q?: string;
  status?: AdoptionStatus | "";
  stale?: "all" | "stale" | "fresh";
  page?: number;
};

export type AdoptionFreshness = "fresh" | "stale";

export const adoptionStatusLabels: Record<AdoptionStatus, string> = {
  DRAFT: "Koncept",
  ACTIVE: "Na adopciu",
  RESERVED: "Rezervovaný",
  ADOPTED: "Adoptovaný",
  ARCHIVED: "Archivovaný",
};

const lifecycleTransitions: Record<AdoptionStatus, readonly AdoptionStatus[]> = {
  DRAFT: ["DRAFT", "ACTIVE", "RESERVED", "ARCHIVED"],
  ACTIVE: ["ACTIVE", "RESERVED", "ADOPTED", "ARCHIVED"],
  RESERVED: ["RESERVED", "ACTIVE", "ADOPTED", "ARCHIVED"],
  ADOPTED: ["ADOPTED", "ACTIVE", "ARCHIVED"],
  ARCHIVED: ["ARCHIVED", "DRAFT"],
};

function normalizeChoice<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!normalized) return fallback;
  if (!(allowed as readonly string[]).includes(normalized)) throw new Error(`${label} má neplatnú hodnotu.`);
  return normalized as T;
}

export function normalizeAdoptionText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeAdoptionNullableText(value: unknown) {
  return normalizeAdoptionText(value) || null;
}

export function normalizeAdoptionStatus(value: unknown, fallback: AdoptionStatus = "DRAFT"): AdoptionStatus {
  return normalizeChoice(value, adoptionStatuses, fallback, "Stav adopčného profilu");
}

export function normalizeOptionalPositiveId(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) throw new Error(`${label} musí byť platné kladné ID.`);
  return normalized;
}

function normalizeOptionalInteger(value: unknown, label: string, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) throw new Error(`${label} nie je platné celé číslo.`);
  return normalized;
}

function normalizeOptionalDecimal(value: unknown, label: string, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < min || normalized > max) throw new Error(`${label} nie je platné číslo.`);
  return Math.round(normalized * 10) / 10;
}

function normalizeDate(value: unknown, label: string) {
  const normalized = normalizeAdoptionText(value);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T12:00:00Z`).getTime())) {
    throw new Error(`${label} nie je platný dátum.`);
  }
  return normalized;
}

function normalizeDateTime(value: unknown, label: string) {
  const normalized = normalizeAdoptionText(value);
  if (!normalized) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? new Date(`${normalized}T12:00:00Z`) : new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} nie je platný dátum.`);
  return parsed.toISOString();
}

function normalizeUrl(value: unknown, label: string) {
  const normalized = normalizeAdoptionText(value);
  if (!normalized) return null;
  if (normalized.startsWith("/media/") || normalized.startsWith("/images/")) return normalized;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} nie je platná URL.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${label} musí používať http:// alebo https://.`);
  return normalized;
}

function normalizeEmail(value: unknown) {
  const normalized = normalizeAdoptionText(value).toLowerCase();
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Kontaktný e-mail nie je platný.");
  return normalized;
}

function normalizeNullableBoolean(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new Error("Logická hodnota má neplatný formát.");
}

function normalizeBoolean(value: unknown, fallback = false) {
  const normalized = normalizeNullableBoolean(value);
  return normalized === null ? fallback : normalized;
}

function normalizeGallery(value: unknown) {
  const entries = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return entries
    .map((entry) => normalizeUrl(entry, "Adresa fotografie"))
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .slice(0, 20);
}

export function normalizeAdoptionSearchText(parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyAdoptionSlug(value: unknown) {
  return normalizeAdoptionSearchText([normalizeAdoptionText(value)])
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildAdoptionSearchText(input: Pick<NormalizedAdoptionInput, "name" | "breedName" | "color" | "region" | "district" | "city" | "organizationName" | "shortDescription" | "temperament">) {
  return normalizeAdoptionSearchText([
    input.name,
    input.breedName,
    input.color,
    input.region,
    input.district,
    input.city,
    input.organizationName,
    input.shortDescription,
    input.temperament,
  ]);
}

export function normalizeAdoptionInput(payload: ManagedAdoptionInput): NormalizedAdoptionInput {
  const name = normalizeAdoptionText(payload.name);
  const slug = slugifyAdoptionSlug(normalizeAdoptionText(payload.slug) || name);
  const status = normalizeAdoptionStatus(payload.status);
  const sex = normalizeChoice(payload.sex, adoptionSexes, "UNKNOWN", "Pohlavie");
  const size = normalizeChoice(payload.size, adoptionSizes, "UNKNOWN", "Veľkosť");
  const activityLevel = normalizeChoice(payload.activityLevel, adoptionActivityLevels, "UNKNOWN", "Aktivita");
  const suitableForChildren = normalizeChoice(payload.suitableForChildren, adoptionCompatibilityValues, "UNKNOWN", "Kompatibilita s deťmi");
  const suitableForDogs = normalizeChoice(payload.suitableForDogs, adoptionCompatibilityValues, "UNKNOWN", "Kompatibilita so psami");
  const suitableForCats = normalizeChoice(payload.suitableForCats, adoptionCompatibilityValues, "UNKNOWN", "Kompatibilita s mačkami");
  const suitableForOtherAnimals = normalizeChoice(payload.suitableForOtherAnimals, adoptionCompatibilityValues, "UNKNOWN", "Kompatibilita s inými zvieratami");
  const vaccinationStatus = normalizeChoice(payload.vaccinationStatus, adoptionVaccinationStatuses, "UNKNOWN", "Stav očkovania");
  const birthDate = normalizeDate(payload.birthDate, "Dátum narodenia");
  const approximateAgeMonths = normalizeOptionalInteger(payload.approximateAgeMonths, "Približný vek", 0, 360);
  const weight = normalizeOptionalDecimal(payload.weight, "Hmotnosť", 0, 500);
  const breedId = normalizeOptionalPositiveId(payload.breedId, "Plemeno");
  const organizationId = normalizeOptionalPositiveId(payload.organizationId, "Organizácia");
  const regionValue = normalizeAdoptionText(payload.region);
  if (regionValue && !(adoptionRegions as readonly string[]).includes(regionValue)) throw new Error("Kraj nie je platný slovenský kraj.");
  const region = regionValue as AdoptionRegion | "";

  if (!name) throw new Error("Doplň meno psa.");
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Adresa profilu nie je platná.");
  if (birthDate && approximateAgeMonths !== null) throw new Error("Použi dátum narodenia alebo približný vek, nie oboje naraz.");

  const normalized: NormalizedAdoptionInput = {
    name,
    slug,
    status,
    sex,
    birthDate,
    approximateAgeMonths,
    size,
    weight,
    breedId,
    breedName: normalizeAdoptionText(payload.breedName),
    breedMix: normalizeBoolean(payload.breedMix),
    color: normalizeAdoptionText(payload.color),
    region,
    district: normalizeAdoptionText(payload.district),
    city: normalizeAdoptionText(payload.city),
    organizationId,
    organizationName: normalizeAdoptionText(payload.organizationName),
    organizationSlug: normalizeAdoptionNullableText(payload.organizationSlug),
    mainImage: normalizeUrl(payload.mainImage, "Hlavná fotografia"),
    gallery: normalizeGallery(payload.gallery),
    shortDescription: normalizeAdoptionText(payload.shortDescription),
    description: normalizeAdoptionText(payload.description),
    temperament: normalizeAdoptionText(payload.temperament),
    activityLevel,
    suitableForChildren,
    suitableForDogs,
    suitableForCats,
    suitableForOtherAnimals,
    apartmentSuitable: normalizeNullableBoolean(payload.apartmentSuitable),
    beginnerSuitable: normalizeNullableBoolean(payload.beginnerSuitable),
    needsExperiencedOwner: normalizeBoolean(payload.needsExperiencedOwner),
    vaccinationStatus,
    chipped: normalizeNullableBoolean(payload.chipped),
    neutered: normalizeNullableBoolean(payload.neutered),
    healthNotes: normalizeAdoptionText(payload.healthNotes),
    specialNeeds: normalizeAdoptionText(payload.specialNeeds),
    adoptionRequirements: normalizeAdoptionText(payload.adoptionRequirements),
    externalSourceUrl: normalizeUrl(payload.externalSourceUrl, "Externý zdroj"),
    contactEmail: normalizeEmail(payload.contactEmail),
    contactPhone: normalizeAdoptionNullableText(payload.contactPhone),
    contactUrl: normalizeUrl(payload.contactUrl, "Kontaktný odkaz"),
    lastVerifiedAt: normalizeDateTime(payload.lastVerifiedAt, "Posledné overenie"),
    searchText: "",
  };
  normalized.searchText = buildAdoptionSearchText(normalized);
  assertAdoptionPublishableForStatus(normalized);
  return normalized;
}

export function isAdoptionPublicStatus(status: AdoptionStatus): status is AdoptionPublicStatus {
  return (adoptionPublicStatuses as readonly AdoptionStatus[]).includes(status);
}

export function adoptionPublicationErrors(dog: Pick<NormalizedAdoptionInput, "name" | "slug" | "sex" | "birthDate" | "approximateAgeMonths" | "region" | "city" | "organizationName" | "shortDescription" | "lastVerifiedAt">) {
  const errors: string[] = [];
  if (!dog.name) errors.push("Doplň meno psa.");
  if (!dog.slug) errors.push("Doplň adresu profilu.");
  if (!dog.birthDate && dog.approximateAgeMonths === null) errors.push("Doplň dátum narodenia alebo približný vek.");
  if (dog.sex === "UNKNOWN") errors.push("Doplň pohlavie.");
  if (!dog.region || !dog.city) errors.push("Doplň kraj a mesto.");
  if (!dog.organizationName) errors.push("Doplň organizáciu alebo zodpovednú osobu.");
  if (dog.shortDescription.length < 30) errors.push("Krátky popis musí mať aspoň 30 znakov.");
  if (!dog.lastVerifiedAt) errors.push("Doplň dátum posledného overenia.");
  return errors;
}

export function adoptionIsPublishable(dog: Pick<NormalizedAdoptionInput, "name" | "slug" | "sex" | "birthDate" | "approximateAgeMonths" | "region" | "city" | "organizationName" | "shortDescription" | "lastVerifiedAt">) {
  return adoptionPublicationErrors(dog).length === 0;
}

export function assertAdoptionPublishableForStatus(input: NormalizedAdoptionInput) {
  if (!isAdoptionPublicStatus(input.status)) return;
  const errors = adoptionPublicationErrors(input);
  if (errors.length) throw new Error(errors[0]);
}

export function canTransitionAdoptionStatus(from: AdoptionStatus, to: AdoptionStatus) {
  return lifecycleTransitions[from].includes(to);
}

export function assertAdoptionStatusTransition(from: AdoptionStatus, to: AdoptionStatus) {
  if (!canTransitionAdoptionStatus(from, to)) throw new Error(`Nepovolený prechod stavu adopcie: ${from} → ${to}.`);
}

export function adoptionIsStale(lastVerifiedAt: string | null, now = new Date(), days = ADOPTION_STALE_DAYS) {
  if (!lastVerifiedAt) return true;
  const verified = new Date(lastVerifiedAt);
  if (Number.isNaN(verified.getTime())) return true;
  return now.getTime() - verified.getTime() > days * 86_400_000;
}

export function adoptionFreshness(lastVerifiedAt: string | null, now = new Date()): AdoptionFreshness {
  return adoptionIsStale(lastVerifiedAt, now) ? "stale" : "fresh";
}

export function adoptionIsIndexable(
  dog: Pick<AdoptionDog, "status" | "mainImage" | "description" | "lastVerifiedAt">,
  now = new Date(),
) {
  return dog.status === "ACTIVE"
    && Boolean(dog.mainImage)
    && dog.description.trim().length >= 80
    && !adoptionIsStale(dog.lastVerifiedAt, now, ADOPTION_NOINDEX_STALE_DAYS);
}

export function adoptionAgeMonths(
  dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">,
  now = new Date(),
) {
  if (dog.birthDate) {
    const born = new Date(`${dog.birthDate}T12:00:00Z`);
    if (!Number.isNaN(born.getTime())) return Math.max(0, Math.round((now.getTime() - born.getTime()) / (30.4375 * 86_400_000)));
  }
  return dog.approximateAgeMonths;
}

export function adoptionAgeCategory(
  dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">,
  now = new Date(),
): AdoptionAgeCategory | null {
  const months = adoptionAgeMonths(dog, now);
  if (months === null) return null;
  if (months < 12) return "PUPPY";
  if (months < 36) return "YOUNG";
  if (months < 96) return "ADULT";
  return "SENIOR";
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
