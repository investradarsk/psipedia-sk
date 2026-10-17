/**
 * Public read-only adapter for the already approved Services V2 filter registry.
 * Only explicit, category-scoped, non-unknown values may narrow public results.
 * Neither this adapter nor the public routes infer values from legacy free text.
 */
import {
  serviceFilterCategories, serviceFiltersForCategory,
  type DirectoryFilterDefinition,
} from "./directory-filter-contract";

export type DirectoryPublicFacets = Record<string, string>;
type RawParams = Record<string, string | string[] | undefined>;

export function publicDirectoryFacetKey(id: string) {
  return "f." + id;
}

export function publicDirectoryFacetOptions(definition: DirectoryFilterDefinition) {
  return definition.allowedValues.filter((value) => value !== "unknown");
}

export function publicDirectoryFacetLabels(value: string) {
  const labels: Record<string, string> = {
    yes: "Áno", no: "Nie",
    ambulance: "Ambulancia", clinic: "Klinika", hospital: "Nemocnica",
  };
  return labels[value] ?? value;
}

export function parsePublicDirectoryFacets(params: RawParams, category: string): DirectoryPublicFacets {
  if (!(serviceFilterCategories as readonly string[]).includes(category)) return {};
  const facets: DirectoryPublicFacets = {};
  for (const definition of serviceFiltersForCategory(category)) {
    const raw = params[publicDirectoryFacetKey(definition.id)];
    // Ambiguous duplicate GET parameters must never broaden or change matches.
    if (Array.isArray(raw)) continue;
    const value = raw?.trim() ?? "";
    if (publicDirectoryFacetOptions(definition).includes(value)) facets[definition.id] = value;
  }
  return facets;
}

export function directoryPublicFacetQueryFields(category: string, facets: DirectoryPublicFacets = {}) {
  return serviceFiltersForCategory(category)
    .filter((definition) => publicDirectoryFacetOptions(definition).includes(facets[definition.id]))
    .map((definition) => ({ name: publicDirectoryFacetKey(definition.id), value: facets[definition.id] }));
}

/** SQL identifiers/JSON keys originate only from the static registry; values are bound. */
export function directoryPublicFacetSql(category: string, facets: DirectoryPublicFacets = {}, column = "source_data_json") {
  const clauses: string[] = [];
  const bindings: string[] = [];
  for (const definition of serviceFiltersForCategory(category)) {
    const value = facets[definition.id];
    if (!publicDirectoryFacetOptions(definition).includes(value)) continue;
    const path = '$."' + definition.d1.key + '"';
    clauses.push("json_extract(" + column + ", '" + path + "') = ?");
    bindings.push(value);
  }
  return { clauses, bindings };
}
