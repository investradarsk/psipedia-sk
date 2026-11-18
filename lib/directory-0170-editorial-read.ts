/**
 * 0170 SQL-first read-through for one Directory detail/profile editor.
 *
 * A SQL fact/filter row exists ONLY after an explicit edit was mirrored in the
 * canonical writer. This adapter never backfills legacy values. A missing row
 * keeps the historical JSON for records awaiting the owner's review.
 *
 * It intentionally does NOT switch category listing membership, secondary
 * categories or public faceted filtering. Those require a separate, complete
 * producer/read contract (notably Notion category changes and explicit []).
 */
import { proposedDirectorySqlPlacement } from "./directory-sql-cutover-contract.ts";
import {
  getDirectoryFilterDefinition,
  normalizeDirectoryFilterValue,
  serviceFilterCategories,
  type ServiceFilterCategory,
} from "./directory-filter-contract.ts";

export type Directory0170FactRow = Readonly<{field_key:string;value_text:string}>;
export type Directory0170FilterRow = Readonly<{
  category:string;filter_id:string;value_text:string;
}>;
type EditorialSource = Record<string, string | number | null>;

export function overlayDirectory0170EditorialFields(input: {
  category: string;
  source: EditorialSource | null | undefined;
  facts: readonly Directory0170FactRow[];
  filters: readonly Directory0170FilterRow[];
  /** Public importData must not expose internal, underscore-prefixed filters. */
  audience: "public" | "admin";
}): EditorialSource | null {
  const {category, source, facts, filters, audience} = input;
  if (!(serviceFilterCategories as readonly string[]).includes(category))
    return source ? {...source} : null;
  const sourceCopy:EditorialSource = {...(source ?? {})};
  const typedCategory=category as ServiceFilterCategory;

  for (const entry of facts) {
    if (!entry || typeof entry.field_key !== "string" ||
        typeof entry.value_text !== "string") continue;
    // Conflicting fact/select labels, Services V3, breed and club relations
    // are explicitly NOT approved for SQL text facts.
    if (proposedDirectorySqlPlacement(typedCategory,entry.field_key).table !==
        "directory_profile_public_facts") continue;
    // Including '' is essential. It must suppress historical JSON aliases.
    sourceCopy[entry.field_key]=entry.value_text;
  }
  if (audience === "admin") {
    for(const entry of filters) {
      if (!entry || entry.category !== category) continue;
      const definition=getDirectoryFilterDefinition(entry.filter_id);
      if (!definition || definition.category!==category) continue;
      const normalized=normalizeDirectoryFilterValue(definition,entry.value_text);
      if (normalized.status!=="known") continue;
      sourceCopy[definition.d1.key]=normalized.value;
    }
  }
  return Object.keys(sourceCopy).length ? sourceCopy : source ? {...source} : null;
}

type EditorialQueryRow = {
  facts_json: string | null;
  filters_json: string | null;
};
function parseRows(value: string | null): unknown[] {
  if(value===null)return [];
  let parsed:unknown;
  try{parsed=JSON.parse(value);}catch{throw Error("DIRECTORY_0170_READ_INVALID_JSON");}
  if(!Array.isArray(parsed))throw Error("DIRECTORY_0170_READ_INVALID_JSON");
  // Protect the single-profile projection from an unexpectedly large result.
  if(parsed.length>250)throw Error("DIRECTORY_0170_READ_OVERSIZED");
  return parsed;
}

/** One indexed SELECT and zero mutations. Throws on a read error. */
export async function readDirectory0170EditorialFields(
  database:D1Database,
  input:{
    profileId:number;
    category:string;
    source:EditorialSource | null | undefined;
    audience:"public"|"admin";
  },
):Promise<EditorialSource | null> {
  if(!Number.isSafeInteger(input.profileId) || input.profileId<=0)
    throw Error("DIRECTORY_0170_READ_INVALID_ID");
  const data=await database.prepare(
    "SELECT ("+
      "SELECT json_group_array(json_object('field_key',field_key,'value_text',value_text)) "+
      "FROM directory_profile_public_facts WHERE profile_id=?1"+
    ") AS facts_json, ("+
      "SELECT json_group_array(json_object('category',category,'filter_id',filter_id,'value_text',value_text)) "+
      "FROM directory_profile_filter_values WHERE profile_id=?1"+
    ") AS filters_json"
  ).bind(input.profileId).first<EditorialQueryRow>();
  if(!data)throw Error("DIRECTORY_0170_READ_MISSING_ROW");
  const facts=parseRows(data.facts_json);
  const filters=parseRows(data.filters_json);
  return overlayDirectory0170EditorialFields({
    category:input.category,
    source:input.source,
    facts:facts as Directory0170FactRow[],
    filters:filters as Directory0170FilterRow[],
    audience:input.audience,
  });
}
