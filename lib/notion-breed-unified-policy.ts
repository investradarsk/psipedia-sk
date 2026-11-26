import { decideUnifiedField, type FieldIdentity, type FieldObservation } from "./notion-unified-field-sync.ts";
import { sha256Text } from "./notion-sync-shared";

/** Independent legacy receipts can be different. Never invent a common
 * baseline from a current SQL value, a missing receipt or parser defaults. */
export async function verifiedBreedWorkcopyBaseline(receipt: string | null, identity: FieldIdentity) {
  if (!receipt?.startsWith("breed-field-v1:")) return null;
  try {
    const envelope = JSON.parse(receipt.slice("breed-field-v1:".length));
    const notion = JSON.parse(envelope.notion);
    const admin = JSON.parse(envelope.admin);
    if (!notion || !admin || !Object.hasOwn(notion, identity.field) || !Object.hasOwn(admin, identity.field)) return null;
    const decision = decideUnifiedField({
      identity, baseline: null, notion: { present: true, value: notion[identity.field] },
      psipedia: { present: true, value: admin[identity.field] },
    });
    if (decision.action !== "unchanged") return null;
    return { value: decision.value, version: await sha256Text(receipt) };
  } catch {
    return null;
  }
}

export function breedWorkcopyObservation(value: unknown, present: boolean): FieldObservation {
  return present && value !== undefined ? { present: true, value } : { present: false };
}

/** Ordinary mirrored content only. Moderation, immutable identity and
 * unsupported aggregate/relationship fields retain their separate owners. */
export function isUnifiedBreedEditorialField(field: string): boolean {
  return !new Set(["id", "slug", "status", "editorialComplete", "seo.noindex",
    "relatedBreedIds", "relatedArticleIds", "directoryProfileIds", "fciStandard", "editorial"]).has(field);
}
