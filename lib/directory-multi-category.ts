/**
 * A profile retains one permanent primary category/URL. Secondary membership
 * has a canonical 0170 SQL relation after an explicit confirmed write; older
 * profiles keep JSON fallback until the owner edits them. No new migration.
 */
import type { DirectoryCategorySlug } from "./directory";

export const DIRECTORY_ADDITIONAL_CATEGORIES_KEY = "_psipedia_additional_categories";
/** Written in the SAME transaction as SQL membership. "1" also confirms []. */
export const DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY =
  "_psipedia_additional_categories_sql_confirmed";

export function directorySecondaryCategoriesSqlConfirmed(
  source: Record<string, unknown> | null | undefined,
): boolean {
  return source?.[DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY] === "1";
}

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

/** Canonical SQL-only category membership. Old profile JSON is retired. */
export function directoryAdditionalCategoryJsonSql(alias = "directory_profiles") {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL table alias");
  return `COALESCE((SELECT json_group_array(c.category)
    FROM (SELECT category FROM directory_profile_additional_categories
      WHERE profile_id=${alias}.id ORDER BY category) AS c), '[]')`;
}

/** Both bound values are still required; no JSON aliases or marker fallback. */
export function directoryCategoryMembershipSql(alias = "directory_profiles") {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL table alias");
  return `(${alias}.category = ? OR EXISTS (
    SELECT 1 FROM directory_profile_additional_categories AS secondary
    WHERE secondary.profile_id = ${alias}.id AND secondary.category = ?
  ))`;
}
