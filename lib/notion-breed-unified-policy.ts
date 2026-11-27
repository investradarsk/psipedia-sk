import type { FieldObservation } from "./notion-unified-field-sync.ts";
import { BREED_NOTION_SCHEMA } from "./notion-breed-property-registry.ts";
import { breedWorkcopyPhysicalProperty } from "./breed-notion-workcopy-field-contract.mjs";

// The historical registry describes the original database, not the current
// workcopy. Derive excluded logical fields from its physical-column contract.
export const NON_MIRRORED_BREED_FIELDS = BREED_NOTION_SCHEMA
  .filter(entry => entry.mode === "content" && !breedWorkcopyPhysicalProperty(entry.notion))
  .map(entry => entry.id).filter(field => field !== "fciNumber");
const nonMirrored = new Set<string>(NON_MIRRORED_BREED_FIELDS);
/** Only fixed registry identifiers; never SQL supplied by callers. */
export function nonMirroredBreedPredicate(alias = "") {
  if (alias !== "" && alias !== "e.") throw Error("BREED_SQL_ALIAS_INVALID");
  return "(" + alias + "agenda='breeds' AND " + alias + "field_key IN (" +
    NON_MIRRORED_BREED_FIELDS.map(field => "'" + field.replaceAll("'", "''") + "'").join(",") + "))";
}

// Legacy workcopy receipts can contain synthetic SQL fallback values. They
// do not prove a shared baseline. Initialize only from live equality (step 10).
export function breedWorkcopyObservation(value: unknown, present: boolean): FieldObservation {
  return present && value !== undefined ? { present: true, value } : { present: false };
}

/** Ordinary mirrored content only. Moderation, immutable identity and
 * unsupported aggregate/relationship fields retain their separate owners. */
export function isUnifiedBreedEditorialField(field: string): boolean {
  return !nonMirrored.has(field) && !new Set(["id", "slug", "status", "editorialComplete", "seo.noindex",
    "relatedBreedIds", "relatedArticleIds", "directoryProfileIds", "fciStandard", "editorial"]).has(field);
}
