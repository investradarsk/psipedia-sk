import type { FieldObservation } from "./notion-unified-field-sync.ts";

// Legacy workcopy receipts can contain synthetic SQL fallback values. They
// do not prove a shared baseline. Initialize only from live equality (step 10).
export function breedWorkcopyObservation(value: unknown, present: boolean): FieldObservation {
  return present && value !== undefined ? { present: true, value } : { present: false };
}

/** Ordinary mirrored content only. Moderation, immutable identity and
 * unsupported aggregate/relationship fields retain their separate owners. */
export function isUnifiedBreedEditorialField(field: string): boolean {
  return !new Set(["id", "slug", "status", "editorialComplete", "seo.noindex",
    "relatedBreedIds", "relatedArticleIds", "directoryProfileIds", "fciStandard", "editorial"]).has(field);
}
