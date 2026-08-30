import type { ManagedBreedIndexItem } from "@/lib/breed-store";

export type BreedAtlasFilters = {
  query: string;
  fciGroup: string;
  fciSection: string;
  origin: string;
  energy: "all" | "calm" | "active";
};

export type FciSectionOption = { number: string; name: string; count: number };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function parseBreedAtlasFilters(params: Record<string, string | string[] | undefined>): BreedAtlasFilters {
  const group = first(params.fciGroup).trim();
  const energy = first(params.energy);
  return {
    query: first(params.q).trim().slice(0, 120),
    fciGroup: /^(?:[1-9]|10)$/.test(group) ? group : "",
    fciSection: first(params.fciSection).trim().slice(0, 20),
    origin: first(params.origin).trim().slice(0, 160),
    energy: energy === "calm" || energy === "active" ? energy : "all",
  };
}

export function breedAtlasHref(filters: BreedAtlasFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.fciGroup) params.set("fciGroup", filters.fciGroup);
  if (filters.fciGroup && filters.fciSection) params.set("fciSection", filters.fciSection);
  if (filters.origin) params.set("origin", filters.origin);
  if (filters.energy !== "all") params.set("energy", filters.energy);
  const query = params.toString();
  return `/plemena${query ? `?${query}` : ""}`;
}

export function listFciSectionOptions(breeds: ManagedBreedIndexItem[], group: string): FciSectionOption[] {
  if (!/^(?:[1-9]|10)$/.test(group)) return [];
  const sectionNames = new Map<string, Map<string, number>>();
  for (const breed of breeds) {
    if (breed.fciGroup !== Number(group)) continue;
    const number = breed.fciSectionNumber.trim();
    if (!number) continue;
    const storedName = breed.fciSection.trim();
    const name = storedName && storedName !== number ? storedName : "";
    const names = sectionNames.get(number) ?? new Map<string, number>();
    names.set(name, (names.get(name) ?? 0) + 1);
    sectionNames.set(number, names);
  }
  return [...sectionNames.entries()].map(([number, names]) => {
    const orderedNames = [...names.entries()].sort((first, second) => second[1] - first[1] || Number(Boolean(second[0])) - Number(Boolean(first[0])) || first[0].localeCompare(second[0], "sk"));
    return { number, name: orderedNames[0]?.[0] ?? "", count: [...names.values()].reduce((total, count) => total + count, 0) };
  }).sort((first, second) => first.number.localeCompare(second.number, "sk", { numeric: true }));
}

export function validFciSectionForGroup(breeds: ManagedBreedIndexItem[], group: string, section: string) {
  return listFciSectionOptions(breeds, group).some((option) => option.number === section) ? section : "";
}
