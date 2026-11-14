/**
 * A directory entity has one permanent primary category/URL and may also
 * appear in other category listings. This additive metadata lives in the
 * existing source_data_json so no production D1 migration is required.
 * Never create a second directory profile to represent a secondary category.
 */
import type { DirectoryCategorySlug } from "./directory";

export const DIRECTORY_ADDITIONAL_CATEGORIES_KEY = "_psipedia_additional_categories";
// Keep in sync with the canonical public directoryCategories registry in directory.ts.
// A literal readonly registry keeps this pure helper usable by Node's TS test runner
// without importing unrelated Next/Cloudflare modules into standalone tests.
const categoryOrder = [
  "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie", "fyzioterapia", "dalsie-sluzby",
] as const satisfies readonly DirectoryCategorySlug[];
const validCategories = new Set<string>(categoryOrder);

export function normalizeAdditionalDirectoryCategories(
  values: unknown, primary: string,
): DirectoryCategorySlug[] {
  if (!Array.isArray(values)) return [];
  const selected = new Set(values.filter(
    (value): value is DirectoryCategorySlug =>
      typeof value === "string" && value !== primary && validCategories.has(value),
  ));
  return categoryOrder.filter((value) => selected.has(value));
}

export function readAdditionalDirectoryCategories(
  source: Record<string, unknown> | null | undefined, primary: string,
): DirectoryCategorySlug[] {
  const raw = source?.[DIRECTORY_ADDITIONAL_CATEGORIES_KEY];
  if (typeof raw !== "string") return [];
  try {
    return normalizeAdditionalDirectoryCategories(JSON.parse(raw), primary);
  } catch {
    return [];
  }
}

export function mergeAdditionalDirectoryCategories(
  source: Record<string, string | number | null>,
  submitted: unknown,
  primary: string,
): Record<string, string | number | null> {
  if (submitted !== undefined &&
      (!Array.isArray(submitted) ||
       submitted.some((value) => typeof value !== "string" || !validCategories.has(value)))) {
    throw new Error("Vyber iba platné ďalšie kategórie adresára.");
  }
  const values = submitted === undefined
    ? readAdditionalDirectoryCategories(source, primary)
    : normalizeAdditionalDirectoryCategories(submitted, primary);
  source[DIRECTORY_ADDITIONAL_CATEGORIES_KEY] = JSON.stringify(values);
  return source;
}

/** Safe even for legacy invalid/missing source JSON and malformed category metadata. */
export function directoryAdditionalCategoryJsonSql(alias = "directory_profiles") {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL table alias");
  const raw = `CASE WHEN json_valid(${alias}.source_data_json) THEN
    json_extract(${alias}.source_data_json, '$."${DIRECTORY_ADDITIONAL_CATEGORIES_KEY}"')
    ELSE NULL END`;
  return `CASE WHEN json_valid(${raw}) THEN ${raw} ELSE '[]' END`;
}

/** Exactly two bound values (the same category), without dynamic user SQL. */
export function directoryCategoryMembershipSql(alias = "directory_profiles") {
  return `(${alias}.category = ? OR EXISTS (
    SELECT 1 FROM json_each(${directoryAdditionalCategoryJsonSql(alias)}) AS extra
    WHERE extra.value = ?
  ))`;
}
