export type BreedCompletenessIssue =
  | "Chýba obrázok"
  | "Chýba prehľad"
  | "Chýba praktický obsah"
  | "Chýba FCI referencia"
  | "Bez športov"
  | "Bez prepojení";

export type AdminBreedCompletenessInput = {
  image: string;
  overview: string;
  needs: string;
  exercise: string;
  training: string;
  health: string;
  fciNumber: number | null;
  hasFciReference: boolean;
  sportsCount: number;
  articleRelationCount: number;
  directoryRelationCount: number;
};

export type AdminBreedFilterable = {
  id: number;
  slug: string;
  name: string;
  status: "draft" | "published";
  fciGroup: number;
  fciSection: string;
  origin: string;
  group: string;
  officialFciName: string;
  completenessIssues: BreedCompletenessIssue[];
};

export type AdminBreedFilters = {
  query: string;
  fciGroup: string;
  fciSection: string;
  origin: string;
  status: string;
  completeness: string;
};

export const defaultAdminBreedFilters: AdminBreedFilters = {
  query: "",
  fciGroup: "all",
  fciSection: "all",
  origin: "all",
  status: "all",
  completeness: "all",
};

export function normalizeAdminBreedSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk");
}

export function breedCompletenessIssues(input: AdminBreedCompletenessInput): BreedCompletenessIssue[] {
  const issues: BreedCompletenessIssue[] = [];
  if (!input.image.trim()) issues.push("Chýba obrázok");
  if (!input.overview.trim()) issues.push("Chýba prehľad");
  if (![input.needs, input.exercise, input.training, input.health].some((value) => value.trim())) {
    issues.push("Chýba praktický obsah");
  }
  if (!input.fciNumber || !input.hasFciReference) issues.push("Chýba FCI referencia");
  if (input.sportsCount === 0) issues.push("Bez športov");
  if (input.articleRelationCount === 0 && input.directoryRelationCount === 0) issues.push("Bez prepojení");
  return issues;
}

export function filterAdminBreeds<T extends AdminBreedFilterable>(breeds: T[], filters: AdminBreedFilters) {
  const needles = normalizeAdminBreedSearch(filters.query).trim().split(/\s+/).filter(Boolean);
  return breeds.filter((breed) => {
    const haystack = normalizeAdminBreedSearch([
      breed.name,
      breed.slug,
      breed.officialFciName,
      breed.origin,
      breed.group,
      breed.fciSection,
      `FCI ${breed.fciGroup}`,
    ].join(" "));
    return needles.every((needle) => haystack.includes(needle))
      && (filters.fciGroup === "all" || breed.fciGroup === Number(filters.fciGroup))
      && (filters.fciSection === "all" || breed.fciSection === filters.fciSection)
      && (filters.origin === "all" || breed.origin === filters.origin)
      && (filters.status === "all" || breed.status === filters.status)
      && (filters.completeness === "all"
        || (filters.completeness === "incomplete" ? breed.completenessIssues.length > 0 : breed.completenessIssues.length === 0));
  });
}

export function adminBreedCounts<T extends AdminBreedFilterable>(breeds: T[]) {
  return breeds.reduce((counts, breed) => {
    counts.all += 1;
    counts[breed.status] += 1;
    if (breed.completenessIssues.length > 0) counts.incomplete += 1;
    return counts;
  }, { all: 0, published: 0, draft: 0, incomplete: 0 });
}

export type BreedBulkSelectionSnapshot = {
  id: number;
  status: "draft" | "published";
  updatedAt: string;
};

export function validateBulkBreedStatus(input: unknown) {
  const value = input as {
    breeds?: BreedBulkSelectionSnapshot[];
    status?: string;
    confirmedCount?: number;
  } | null;
  if (!value || !Array.isArray(value.breeds) || value.breeds.length < 1 || value.breeds.length > 500
    || value.confirmedCount !== value.breeds.length) {
    throw new Error("Potvrď platný výber 1 až 500 plemien.");
  }
  if (value.status !== "draft" && value.status !== "published") {
    throw new Error("Publikačný stav nie je platný.");
  }
  const seen = new Set<number>();
  for (const breed of value.breeds) {
    if (!breed || !Number.isSafeInteger(breed.id) || breed.id <= 0 || seen.has(breed.id)
      || (breed.status !== "draft" && breed.status !== "published")
      || !breed.updatedAt?.trim()) {
      throw new Error("Výber plemien je neplatný. Obnov zoznam.");
    }
    if (breed.status === value.status) {
      throw new Error("Výber obsahuje plemeno, ktoré už má požadovaný stav.");
    }
    seen.add(breed.id);
  }
  return {
    breeds: value.breeds.map(({ id, status, updatedAt }) => ({ id, status, updatedAt })),
    status: value.status,
  } as const;
}
