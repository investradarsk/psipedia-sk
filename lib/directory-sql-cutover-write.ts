/**
 * Phase 3/4 – SINGLE planned SQL mutation contract for Directory Admin/Notion.
 *
 * INERT until the phase-2 migration has been deployed and field data backfilled.
 * Neither Admin nor Notion handlers call this yet. It cannot be enabled by
 * setting a flag: both read AND write sides need the same reviewed cutover.
 *
 * D1 batch statements are designed to be transactional. The first statement
 * uses optimistic locking (updated_at CAS) and all subsequent statements
 * depend on the timestamp/category written by that CAS. A fail-closed
 * SQLite changes() assertion immediately after the CAS aborts the entire
 * batch if zero rows were updated. The caller also verifies RETURNING id.
 */
import {
  normalizeAdditionalDirectoryCategories,
} from "./directory-multi-category.ts";
import {
  directoryFilterRegistry, normalizeDirectoryFilterValue,
  serviceFilterCategories, type ServiceFilterCategory,
} from "./directory-filter-contract.ts";
import { proposedDirectorySqlPlacement } from "./directory-sql-cutover-contract.ts";

export type DirectorySqlContactField =
  "publicPhone" | "publicEmail" | "facebookUrl" | "instagramUrl";

const CONTACT_COLUMN: Record<DirectorySqlContactField,string> = {
  publicPhone:"public_phone",
  publicEmail:"public_email",
  facebookUrl:"facebook_url",
  instagramUrl:"instagram_url",
};
type DirectorySqlProfilePatch = Readonly<{
  profileId: number;
  category: ServiceFilterCategory;
  expectedUpdatedAt: string;
  nextUpdatedAt: string;
  actor: string;
  /** Undefined = leave unchanged. Empty string = explicitly clear. */
  contacts?: Partial<Record<DirectorySqlContactField,string>>;
  /** Undefined = unchanged; [] = explicitly no secondary categories. */
  additionalCategories?: readonly string[];
  /** Only approved text facts, no canonical Services V3 / breed / club IDs. */
  facts?: Readonly<Record<string,string>>;
  /** Validated category-specific Notion select filter IDs and values. */
  filters?: Readonly<Record<string,string>>;
}>;

export class DirectorySqlCutoverConflict extends Error {
  constructor() {super("DIRECTORY_SQL_CUTOVER_STALE_OR_WRONG_PROFILE");}
}
function validatedPatch(patch: DirectorySqlProfilePatch) {
  if (!Number.isSafeInteger(patch.profileId) || patch.profileId<=0)
    throw new Error("DIRECTORY_SQL_CUTOVER_INVALID_ID");
  if (!(serviceFilterCategories as readonly string[]).includes(patch.category))
    throw new Error("DIRECTORY_SQL_CUTOVER_INVALID_CATEGORY");
  if (!patch.actor.trim() || !patch.expectedUpdatedAt ||
    !patch.nextUpdatedAt || patch.nextUpdatedAt===patch.expectedUpdatedAt ||
    !Number.isFinite(Date.parse(patch.nextUpdatedAt)) ||
    !Number.isFinite(Date.parse(patch.expectedUpdatedAt)))
    throw new Error("DIRECTORY_SQL_CUTOVER_INVALID_REVISION");
  const contacts=patch.contacts??{};
  for (const [key,value] of Object.entries(contacts)) {
    if (!Object.hasOwn(CONTACT_COLUMN,key) || typeof value!=="string")
      throw new Error("DIRECTORY_SQL_CUTOVER_INVALID_CONTACT");
  }
  const facts=patch.facts??{};
  for (const [key,value] of Object.entries(facts)) {
    if (typeof value!=="string" ||
      proposedDirectorySqlPlacement(patch.category,key).table !==
      "directory_profile_public_facts")
      throw new Error("DIRECTORY_SQL_CUTOVER_FACT_NOT_APPROVED: "+key);
  }
  const filters=patch.filters??{};
  for (const [id,value] of Object.entries(filters)) {
    const definition=directoryFilterRegistry.find(def=>def.id===id);
    if (!definition || definition.category!==patch.category ||
      normalizeDirectoryFilterValue(definition,value).status!=="known")
      throw new Error("DIRECTORY_SQL_CUTOVER_INVALID_FILTER: "+id);
  }
  const more=patch.additionalCategories===undefined
    ? null : normalizeAdditionalDirectoryCategories(
      Array.from(patch.additionalCategories),patch.category);
  if (patch.additionalCategories!==undefined &&
    (!Array.isArray(patch.additionalCategories) ||
      patch.additionalCategories.some(v=>typeof v!=="string" ||
        !(serviceFilterCategories as readonly string[]).includes(v)) ||
      patch.additionalCategories.includes(patch.category))) {
    throw new Error("DIRECTORY_SQL_CUTOVER_INVALID_SECONDARY_CATEGORY");
  }
  if (!Object.keys(contacts).length && !Object.keys(facts).length &&
      !Object.keys(filters).length && more===null)
    throw new Error("DIRECTORY_SQL_CUTOVER_EMPTY_PATCH");
  return {contacts,facts,filters,more};
}
type SqlStatement=Readonly<{sql:string;bindings:readonly (string|number)[]}>;
export type DirectorySqlCutoverPlan=Readonly<{
  statements:readonly SqlStatement[];
  updatedFields:number;
  /** The first statement must RETURN exactly one guarded profile ID. */
  profileId:number;
  nextUpdatedAt:string;
}>;

export function planDirectorySqlCutoverPatch(
  patch: DirectorySqlProfilePatch,
):DirectorySqlCutoverPlan {
  const {contacts,facts,filters,more}=validatedPatch(patch);
  const setters=Object.entries(contacts).map(([key])=>CONTACT_COLUMN[key as DirectorySqlContactField]+"=?");
  const values=Object.values(contacts) as string[];
  const statements:SqlStatement[]=[];
  statements.push({
    sql:"UPDATE directory_profiles SET "+[
      ...setters,"updated_at=?","updated_by=?",
    ].join(", ")+" WHERE id=? AND category=? AND status<>'archived' "+
    "AND updated_at=? RETURNING id",
    bindings:[...values,patch.nextUpdatedAt,patch.actor,patch.profileId,patch.category,patch.expectedUpdatedAt],
  });
  // Batch runs on one SQLite connection. changes() describes the preceding
  // CAS UPDATE. On a conflict the malformed-JSON branch deliberately raises
  // a SQLite error, forcing a transactional D1 batch rollback. This protects
  // against even a coincidental collision on nextUpdatedAt.
  statements.push({
    sql:"SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('CAS_CONFLICT', '$') END AS cas_ok",
    bindings:[],
  });
  // Independently constrain every subsequent relation operation.
  const guard="EXISTS (SELECT 1 FROM directory_profiles WHERE id=? AND updated_at=? AND category=?)";
  const guardParams=[patch.profileId,patch.nextUpdatedAt,patch.category] as const;
  if (more!==null) {
    statements.push({
      sql:"DELETE FROM directory_profile_additional_categories WHERE profile_id=? AND "+guard,
      bindings:[patch.profileId,...guardParams],
    });
    for (const category of more) statements.push({
      sql:"INSERT INTO directory_profile_additional_categories " +
        "(profile_id,category,updated_at,updated_by) "+
        "SELECT ?,?,?,? WHERE "+guard,
      bindings:[patch.profileId,category,patch.nextUpdatedAt,patch.actor,...guardParams],
    });
  }
  for (const [key,value] of Object.entries(facts)) statements.push({
    sql:"INSERT INTO directory_profile_public_facts "+
      "(profile_id,field_key,value_text,updated_at,updated_by) "+
      "SELECT ?,?,?,?,? WHERE "+guard+" "+
      "ON CONFLICT(profile_id,field_key) DO UPDATE SET "+
      "value_text=excluded.value_text,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
    bindings:[patch.profileId,key,value,patch.nextUpdatedAt,patch.actor,...guardParams],
  });
  for (const [key,value] of Object.entries(filters)) statements.push({
    sql:"INSERT INTO directory_profile_filter_values "+
      "(profile_id,category,filter_id,value_text,updated_at,updated_by) "+
      "SELECT ?,?,?,?,?,? WHERE "+guard+" "+
      "ON CONFLICT(profile_id,filter_id) DO UPDATE SET "+
      "value_text=excluded.value_text,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
    bindings:[patch.profileId,patch.category,key,value,patch.nextUpdatedAt,patch.actor,...guardParams],
  });
  return {
    statements,profileId:patch.profileId,nextUpdatedAt:patch.nextUpdatedAt,
    updatedFields:Object.keys(contacts).length+Object.keys(facts).length+
      Object.keys(filters).length+(more===null?0:1),
  };
}

/**
 * Apply ONLY after the verified migration/backfill and coordinated cutover.
 * No feature flag or ordinary Admin save calls this staged helper yet.
 */
export async function applyDirectorySqlCutoverPatch(
  database: D1Database,patch:DirectorySqlProfilePatch,
) {
  const plan=planDirectorySqlCutoverPatch(patch);
  // Preflight yields a clear 409-class conflict for an already stale editor.
  // The in-batch changes() assertion also catches the race AFTER this read.
  const current=await database.prepare(
    "SELECT category,status,updated_at FROM directory_profiles WHERE id=? LIMIT 1",
  ).bind(plan.profileId).first<{category:string;status:string;updated_at:string}>();
  if (!current || current.category!==patch.category || current.status==="archived" ||
      current.updated_at!==patch.expectedUpdatedAt)
    throw new DirectorySqlCutoverConflict();
  const prepared=plan.statements.map(item=>
    database.prepare(item.sql).bind(...item.bindings));
  const responses=await database.batch(prepared);
  const id=(responses[0]?.results?.[0] as {id?:unknown}|undefined)?.id;
  if (id!==plan.profileId)
    throw new DirectorySqlCutoverConflict();
  return {profileId:plan.profileId,updatedAt:plan.nextUpdatedAt,fields:plan.updatedFields};
}
