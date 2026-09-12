export const adoptionStatuses = ["DRAFT", "ACTIVE", "RESERVED", "ADOPTED", "ARCHIVED"] as const;
export const adoptionSexes = ["MALE", "FEMALE", "UNKNOWN"] as const;
export const adoptionSizes = ["SMALL", "MEDIUM", "LARGE", "XL", "UNKNOWN"] as const;
export const compatibilityValues = ["YES", "NO", "UNKNOWN"] as const;
export const activityLevels = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"] as const;
export const vaccinationStatuses = ["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"] as const;
export const ADOPTION_STALE_AFTER_DAYS = 30;

export type AdoptionStatus = (typeof adoptionStatuses)[number];
export type AdoptionSex = (typeof adoptionSexes)[number];
export type AdoptionSize = (typeof adoptionSizes)[number];
export type CompatibilityValue = (typeof compatibilityValues)[number];
export type ActivityLevel = (typeof activityLevels)[number];
export type VaccinationStatus = (typeof vaccinationStatuses)[number];

export type AdoptionDog = {
  id: number; name: string; slug: string; status: AdoptionStatus; sex: AdoptionSex;
  birthDate: string | null; approximateAgeMonths: number | null; size: AdoptionSize; weightKg: number | null;
  breedId: number | null; breedName: string; breedSlug: string; breedMix: boolean; color: string;
  region: string; district: string; city: string; organizationId: number | null; organizationName: string; organizationUrl: string | null;
  mainImage: string | null; gallery: string[]; shortDescription: string; description: string; temperament: string; activityLevel: ActivityLevel;
  suitableForChildren: CompatibilityValue; suitableForDogs: CompatibilityValue; suitableForCats: CompatibilityValue; suitableForOtherAnimals: CompatibilityValue;
  apartmentSuitable: CompatibilityValue; beginnerSuitable: CompatibilityValue; needsExperiencedOwner: CompatibilityValue;
  vaccinationStatus: VaccinationStatus; chipped: CompatibilityValue; neutered: CompatibilityValue;
  healthNotes: string; specialNeeds: string; adoptionRequirements: string; externalSourceUrl: string | null;
  contactName: string; contactEmail: string | null; contactPhone: string; publishedAt: string | null; lastVerifiedAt: string | null;
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string;
};

export type AdoptionAgeCategory = "PUPPY" | "YOUNG" | "ADULT" | "SENIOR";

export function ageInMonths(dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">, now = new Date()) {
  if (dog.birthDate) {
    const birth = new Date(`${dog.birthDate}T12:00:00Z`);
    if (!Number.isNaN(birth.getTime())) return Math.max(0, Math.floor((now.getTime() - birth.getTime()) / 2629800000));
  }
  return dog.approximateAgeMonths;
}

export function adoptionAgeCategory(dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">, now = new Date()): AdoptionAgeCategory | null {
  const months = ageInMonths(dog, now); if (months === null) return null;
  if (months < 12) return "PUPPY"; if (months < 36) return "YOUNG"; if (months < 96) return "ADULT"; return "SENIOR";
}

export function isAdoptionStale(lastVerifiedAt: string | null, now = new Date()) {
  if (!lastVerifiedAt) return true;
  const verified = new Date(lastVerifiedAt); if (Number.isNaN(verified.getTime())) return true;
  return now.getTime() - verified.getTime() > ADOPTION_STALE_AFTER_DAYS * 86400000;
}

export function formatAdoptionAge(dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">) {
  const months = ageInMonths(dog); if (months === null) return "vek neuvedený";
  if (months < 12) return `${months} mes.`;
  const years = Math.floor(months / 12); return `${years} ${years === 1 ? "rok" : years < 5 ? "roky" : "rokov"}`;
}

export const statusLabels: Record<AdoptionStatus, string> = { DRAFT: "Koncept", ACTIVE: "Hľadá domov", RESERVED: "Rezervovaný", ADOPTED: "Adoptovaný", ARCHIVED: "Archivovaný" };
export const compatibilityLabels: Record<CompatibilityValue, string> = { YES: "Áno", NO: "Nie", UNKNOWN: "Neoverené" };
