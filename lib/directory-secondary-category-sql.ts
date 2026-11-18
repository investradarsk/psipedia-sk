/**
 * Directory 0170 secondary-category shadow: explicit Admin edits only.
 *
 * Source JSON remains the live read contract until the coordinated cutover.
 * The caller executes the canonical profile UPDATE (with RETURNING) and these
 * statements in ONE D1 batch transaction. The first statement here verifies
 * that the immediately preceding UPDATE matched exactly one profile.
 *
 * Missing optional category input is NOT an instruction to clear the relation.
 */
import { normalizeAdditionalDirectoryCategories } from "./directory-multi-category.ts";
import { serviceFilterCategories } from "./directory-filter-contract.ts";

export type SecondaryCategorySqlStatement = Readonly<{
  sql: string;
  bindings: readonly (string | number)[];
}>;

export function planDirectorySecondaryCategorySqlMirror(input: {
  profileId: number;
  primaryCategory: string;
  submitted: readonly string[];
  updatedAt: string;
  actor: string;
}): readonly SecondaryCategorySqlStatement[] {
  const { profileId, primaryCategory, submitted, updatedAt, actor } = input;
  if (!Number.isSafeInteger(profileId) || profileId <= 0)
    throw new Error("DIRECTORY_SECONDARY_SQL_INVALID_ID");
  if (!(serviceFilterCategories as readonly string[]).includes(primaryCategory))
    throw new Error("DIRECTORY_SECONDARY_SQL_INVALID_PRIMARY");
  if (!Array.isArray(submitted) || submitted.some(category =>
    typeof category !== "string" ||
    !(serviceFilterCategories as readonly string[]).includes(category)))
    throw new Error("DIRECTORY_SECONDARY_SQL_INVALID_CATEGORY");
  if (!actor.trim() || !Number.isFinite(Date.parse(updatedAt)))
    throw new Error("DIRECTORY_SECONDARY_SQL_INVALID_REVISION");
  const categories = normalizeAdditionalDirectoryCategories(submitted, primaryCategory);

  // D1.batch runs statements in order in one transaction. Abort and roll
  // back if the preceding canonical profile UPDATE had no matching row.
  const assertChanged: SecondaryCategorySqlStatement = {
    sql: "SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('CAS_CONFLICT', '$') END AS cas_ok",
    bindings: [],
  };
  const guard = "EXISTS (SELECT 1 FROM directory_profiles WHERE id=? AND category=? " +
    "AND updated_at=? AND status<>'archived')";
  const guardBindings = [profileId, primaryCategory, updatedAt] as const;
  const clear: SecondaryCategorySqlStatement = {
    sql: "DELETE FROM directory_profile_additional_categories WHERE profile_id=? AND " + guard,
    bindings: [profileId, ...guardBindings],
  };
  const inserts: SecondaryCategorySqlStatement[] = categories.map(category => ({
    sql: "INSERT INTO directory_profile_additional_categories " +
      "(profile_id,category,updated_at,updated_by) " +
      "SELECT ?,?,?,? WHERE " + guard,
    bindings: [profileId, category, updatedAt, actor, ...guardBindings],
  }));
  return [assertChanged, clear, ...inserts];
}
