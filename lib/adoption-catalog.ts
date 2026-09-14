import {
  adoptionAgeCategories,
  adoptionAgeMonths,
  adoptionPublicStatuses,
  adoptionRegions,
  adoptionSexes,
  adoptionSizes,
  adoptionSorts,
  type AdoptionAgeCategory,
  type AdoptionDog,
  type AdoptionPublicFilters,
  type AdoptionPublicStatus,
  type AdoptionSex,
  type AdoptionSize,
  type AdoptionSort,
} from "./adoption.ts";

export type AdoptionCatalogSearchParams = Record<string, string | string[] | undefined>;
export type AdoptionCatalogFilters = AdoptionPublicFilters & {
  breedId?: number | null;
  status?: AdoptionPublicStatus | "";
};

export const adoptionCatalogAgeLabels: Record<AdoptionAgeCategory, string> = {
  PUPPY: "Šteniatko do 1 roka",
  YOUNG: "Mladý 1–3 roky",
  ADULT: "Dospelý 3–8 rokov",
  SENIOR: "Senior 8+ rokov",
};

export const adoptionCatalogSexLabels: Record<AdoptionSex, string> = {
  MALE: "Pes",
  FEMALE: "Sučka",
  UNKNOWN: "Neuvedené",
};

export const adoptionCatalogSizeLabels: Record<AdoptionSize, string> = {
  SMALL: "Malý",
  MEDIUM: "Stredný",
  LARGE: "Veľký",
  GIANT: "Obrovský",
  UNKNOWN: "Neuvedená",
};

export const adoptionCatalogStatusLabels: Record<AdoptionPublicStatus, string> = {
  ACTIVE: "Na adopciu",
  RESERVED: "Rezervovaný",
};

const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";
const truthy = (value: string) => value === "1" || value === "true" || value === "ano";

export function parseAdoptionCatalogFilters(params: AdoptionCatalogSearchParams): AdoptionCatalogFilters {
  const sexValue = scalar(params.pohlavie).toUpperCase();
  const sizeValue = scalar(params.velkost).toUpperCase();
  const ageValue = scalar(params.vek).toUpperCase();
  const sortValue = scalar(params.radenie);
  const statusValue = scalar(params.stav).toUpperCase();
  const breedValue = Number(scalar(params.plemeno));
  const regionValue = scalar(params.kraj).trim();
  return {
    q: scalar(params.q).trim().slice(0, 120),
    breedId: Number.isSafeInteger(breedValue) && breedValue > 0 ? breedValue : null,
    region: (adoptionRegions as readonly string[]).includes(regionValue) ? regionValue : "",
    sex: (adoptionSexes as readonly string[]).includes(sexValue) ? sexValue as AdoptionSex : "",
    age: (adoptionAgeCategories as readonly string[]).includes(ageValue) ? ageValue as AdoptionAgeCategory : "",
    size: (adoptionSizes as readonly string[]).includes(sizeValue) ? sizeValue as AdoptionSize : "",
    children: truthy(scalar(params.deti)),
    dogs: truthy(scalar(params.psy)),
    cats: truthy(scalar(params.macky)),
    status: (adoptionPublicStatuses as readonly string[]).includes(statusValue) ? statusValue as AdoptionPublicStatus : "",
    sort: (adoptionSorts as readonly string[]).includes(sortValue) ? sortValue as AdoptionSort : "newest",
    page: Math.max(1, Number.parseInt(scalar(params.strana) || "1", 10) || 1),
  };
}

export function adoptionCatalogHasFacet(params: AdoptionCatalogSearchParams) {
  return Object.values(params).some((value) => {
    const first = scalar(value);
    return first.trim().length > 0;
  });
}

export function adoptionCatalogHref(filters: AdoptionCatalogFilters, patch: Partial<AdoptionCatalogFilters> = {}) {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.breedId) params.set("plemeno", String(next.breedId));
  if (next.region) params.set("kraj", next.region);
  if (next.sex) params.set("pohlavie", next.sex);
  if (next.age) params.set("vek", next.age);
  if (next.size) params.set("velkost", next.size);
  if (next.children) params.set("deti", "1");
  if (next.dogs) params.set("psy", "1");
  if (next.cats) params.set("macky", "1");
  if (next.status) params.set("stav", next.status);
  if (next.sort && next.sort !== "newest") params.set("radenie", next.sort);
  if (next.page && next.page > 1) params.set("strana", String(next.page));
  const query = params.toString();
  return `/pomoc-psom/adopcia${query ? `?${query}` : ""}`;
}

export function buildAdoptionCatalogView(items: AdoptionDog[]) {
  const visibleItems = items.filter((dog) => (adoptionPublicStatuses as readonly string[]).includes(dog.status));
  return { items: visibleItems, isEmpty: visibleItems.length === 0 };
}

export function formatAdoptionCatalogAge(dog: Pick<AdoptionDog, "birthDate" | "approximateAgeMonths">, now = new Date()) {
  const months = adoptionAgeMonths(dog, now);
  if (months === null) return "Vek neuvedený";
  if (months < 12) return `${months} ${months === 1 ? "mesiac" : months >= 2 && months <= 4 ? "mesiace" : "mesiacov"}`;
  const years = Math.max(1, Math.round(months / 12));
  return `približne ${years} ${years === 1 ? "rok" : years >= 2 && years <= 4 ? "roky" : "rokov"}`;
}
