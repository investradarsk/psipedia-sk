import { normalizeBreedSearchText } from "./breed-fci";
import type { BreedAtlasCard } from "./breed-store";

// Normalize each breed's searchable text once when the catalog changes,
// instead of once per breed on every character the visitor types.
export type BreedSearchIndexEntry<T extends BreedSearchFields = BreedAtlasCard> = {
  breed: T;
  normalizedText: string;
};
type BreedSearchFields = Pick<
  BreedAtlasCard,
  "name" | "officialFciName" | "group" | "fciSection" | "intro" |
  "searchText" | "fciGroup" | "fciSectionNumber" | "origin"
>;

export function indexBreedSearch<T extends BreedSearchFields>(
  breeds: readonly T[],
): BreedSearchIndexEntry<T>[] {
  return breeds.map((breed) => ({
    breed,
    // Keep the exact original search-field order and string interpolation
    // to preserve whitespace, accents, FCI matches and legacy text.
    normalizedText: normalizeBreedSearchText(
      `${breed.name} ${breed.officialFciName} ${breed.group} ${breed.fciSection} ${breed.intro} ${breed.searchText}`,
    ),
  }));
}

export function filterIndexedBreeds<T extends BreedSearchFields>(
  index: readonly BreedSearchIndexEntry<T>[],
  options: {
    query: string;
    group: string;
    section: string;
    origin: string;
  },
): T[] {
  const normalized = normalizeBreedSearchText(options.query);
  return index
    .filter(({ breed, normalizedText }) => {
      const queryMatch = !normalized || normalizedText.includes(normalized);
      const groupMatch = options.group === "all" || breed.fciGroup === Number(options.group);
      const sectionMatch = !options.section || breed.fciSectionNumber === options.section;
      const originMatch = options.origin === "all" || breed.origin === options.origin;
      return queryMatch && groupMatch && sectionMatch && originMatch;
    })
    .map(({ breed }) => breed);
}
