/**
 * 0170 editorial SQL shadow for explicit, validated field edits.
 *
 * The existing directory_profiles UPDATE is still the JSON/read-model owner.
 * Its first-row CAS and the mirror statements must run IN ONE D1.batch.
 * Missing fields never create a SQL value, and an intentional filter clear
 * removes only the selected filter ID.
 *
 * This module does not switch public, Admin or Notion reads.
 */
import { proposedDirectorySqlPlacement } from "./directory-sql-cutover-contract.ts";
import {
  getDirectoryFilterDefinition, normalizeDirectoryFilterValue,
  serviceFilterCategories, type ServiceFilterCategory,
} from "./directory-filter-contract.ts";

export type Directory0170SqlStatement = Readonly<{
  sql: string;
  bindings: readonly (string | number)[];
}>;

function guard(input: { profileId: number; category: ServiceFilterCategory; updatedAt: string; actor: string }) {
  const { profileId, category, updatedAt, actor } = input;
  if (!Number.isSafeInteger(profileId) || profileId <= 0)
    throw new Error("DIRECTORY_0170_MIRROR_INVALID_ID");
  if (!(serviceFilterCategories as readonly string[]).includes(category))
    throw new Error("DIRECTORY_0170_MIRROR_INVALID_CATEGORY");
  if (!actor.trim() || !updatedAt || !Number.isFinite(Date.parse(updatedAt)))
    throw new Error("DIRECTORY_0170_MIRROR_INVALID_REVISION");
  return {
    where: "EXISTS (SELECT 1 FROM directory_profiles WHERE id=? AND category=? " +
      "AND updated_at=? AND status<>'archived')",
    params: [profileId, category, updatedAt] as const,
  };
}

const requiredUpdate: Directory0170SqlStatement = {
  // Must be placed IMMEDIATELY after the authoritative profile UPDATE.
  // Malformed JSON throws when changes()!=1, rolling back the whole D1 batch.
  sql: "SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('CAS_CONFLICT', '$') END AS cas_ok",
  bindings: [],
};

export function approvedDirectoryFactSqlSlot(
  category: ServiceFilterCategory, field: string,
): boolean {
  return proposedDirectorySqlPlacement(category, field).table === "directory_profile_public_facts";
}

export function planDirectory0170FactSqlMirror(input: {
  profileId: number; category: ServiceFilterCategory; field: string;
  value: string; updatedAt: string; actor: string;
}): readonly Directory0170SqlStatement[] {
  const scope = guard(input);
  if (!approvedDirectoryFactSqlSlot(input.category, input.field))
    throw new Error("DIRECTORY_0170_FACT_NOT_APPROVED");
  if (typeof input.value !== "string")
    throw new Error("DIRECTORY_0170_FACT_INVALID_VALUE");
  return [
    requiredUpdate,
    {
      sql: "INSERT INTO directory_profile_public_facts " +
        "(profile_id,field_key,value_text,updated_at,updated_by) " +
        "SELECT ?,?,?,?,? WHERE " + scope.where + " " +
        "ON CONFLICT(profile_id,field_key) DO UPDATE SET " +
        "value_text=excluded.value_text,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      bindings: [input.profileId,input.field,input.value,input.updatedAt,input.actor,...scope.params],
    },
  ];
}

export function planDirectory0170FilterSqlMirror(input: {
  profileId: number; category: ServiceFilterCategory;
  /** null is an explicit cleared Notion select; omitted IDs are unchanged. */
  values: Readonly<Record<string,string | null>>;
  updatedAt: string; actor: string;
}): readonly Directory0170SqlStatement[] {
  const scope = guard(input);
  const entries = Object.entries(input.values);
  if (!entries.length || entries.length > 21)
    throw new Error("DIRECTORY_0170_FILTER_INVALID_PATCH");
  const statements:Directory0170SqlStatement[] = [requiredUpdate];
  for (const [id,raw] of entries) {
    const def=getDirectoryFilterDefinition(id);
    if (!def || def.category!==input.category)
      throw new Error("DIRECTORY_0170_FILTER_INVALID_ID");
    if (raw === null) {
      statements.push({
        sql:"DELETE FROM directory_profile_filter_values WHERE profile_id=? AND filter_id=? AND "+scope.where,
        bindings:[input.profileId,id,...scope.params],
      });
      continue;
    }
    const normalized=normalizeDirectoryFilterValue(def,raw);
    if (normalized.status!=="known")
      throw new Error("DIRECTORY_0170_FILTER_INVALID_VALUE");
    statements.push({
      sql:"INSERT INTO directory_profile_filter_values " +
        "(profile_id,category,filter_id,value_text,updated_at,updated_by) " +
        "SELECT ?,?,?,?,?,? WHERE "+scope.where+" " +
        "ON CONFLICT(profile_id,filter_id) DO UPDATE SET " +
        "value_text=excluded.value_text,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      bindings:[
        input.profileId,input.category,id,normalized.value,input.updatedAt,input.actor,...scope.params,
      ],
    });
  }
  return statements;
}
