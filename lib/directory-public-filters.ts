/**
 * Public read-only adapter for the already approved Services V2 filter registry.
 * Only explicit, category-scoped, non-unknown values may narrow public results.
 * Neither this adapter nor the public routes infer values from legacy free text.
 */
import { legacyFacetMappings } from "./service-catalog-contract.ts";
import {
  serviceFilterCategories, serviceFiltersForCategory,
  type DirectoryFilterDefinition,
} from "./directory-filter-contract.ts";

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

export function directoryPublicFacetQueryFields(facets: DirectoryPublicFacets = {}) {
  return serviceFilterCategories.flatMap((category) => serviceFiltersForCategory(category))
    .filter((definition) => publicDirectoryFacetOptions(definition).includes(facets[definition.id]))
    .map((definition) => ({ name: publicDirectoryFacetKey(definition.id), value: facets[definition.id] }));
}

/**
 * Static migration map: Services V3 choices own every service/attribute
 * represented by a former category facet. Provider types still use the
 * original category field until their dedicated canonical editor is ready.
 */
const catalogFacetMap = new Map(
  legacyFacetMappings
    .filter((mapping) => mapping.targetKind !== "provider")
    .map((mapping) => [mapping.legacyId, mapping.targetId]),
);

/** SQL identifiers originate only from this static registry; all user values are bound.
 * Public listings and map search must read the SAME V3 choice as the Admin editor.
 * Old source_data_json remains intact for history but cannot override the choice.
 */
export function directoryPublicFacetSql(category: string, facets: DirectoryPublicFacets = {}, column = "source_data_json") {
  // Both callers are fixed SQL read paths; never interpolate an arbitrary alias.
  if (column !== "source_data_json" && column !== "d.source_data_json")
    throw new Error("DIRECTORY_PUBLIC_FACET_INVALID_COLUMN");
  const clauses: string[] = [];
  const bindings: string[] = [];
  const profileIdColumn = column === "d.source_data_json" ? "d.id" : "directory_profiles.id";
  for (const definition of serviceFiltersForCategory(category)) {
    const value = facets[definition.id];
    if (!publicDirectoryFacetOptions(definition).includes(value)) continue;
    const catalogId = catalogFacetMap.get(definition.id);
    if (catalogId) {
      clauses.push(
        "EXISTS (SELECT 1 FROM service_profile_option_choices AS public_choice " +
        "WHERE public_choice.profile_id = " + profileIdColumn +
        " AND public_choice.option_id = ? AND public_choice.choice = ?)",
      );
      bindings.push(catalogId, value);
      continue;
    }
    // Only unmapped provider facets use this legacy/0170 read-through.
    // An explicitly edited SQL row overrides the historical JSON, including
    // 'unknown' (which must not match any public yes/no/select request).
    // A missing SQL row retains the original JSON for unreviewed profiles.
    // Other 20 facets continue to read Services V3 and never consult this row.
    const path = '$."' + definition.d1.key + '"';
    const legacyValue =
      "json_extract(CASE WHEN json_valid(" + column + ") THEN " +
      column + " ELSE '{}' END, '" + path + "')";
    clauses.push(
      "COALESCE((SELECT sql_filter.value_text FROM directory_profile_filter_values AS sql_filter " +
      "WHERE sql_filter.profile_id = " + profileIdColumn +
      " AND sql_filter.category = ? AND sql_filter.filter_id = ?), " +
      legacyValue + ") = ?",
    );
    bindings.push(definition.category, definition.id, value);
  }
  return { clauses, bindings };
}
