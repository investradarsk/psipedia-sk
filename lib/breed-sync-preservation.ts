import type { ManagedBreed, ManagedBreedInput } from "./breed-store";

/**
 * Notion is a sparse editorial source, not the authority for every ManagedBreed field.
 * A blank optional Notion property means "not provided", never "delete D1 data".
 * Explicit clears must be performed in the existing admin editor.
 */
export function mergeNotionBreedInput(existing: ManagedBreed, incoming: ManagedBreedInput): ManagedBreedInput {
  if (incoming.slug && incoming.slug !== existing.slug) {
    throw new Error("Notion slug sa nezhoduje s kanonickou identitou prepojeného plemena.");
  }
  if (incoming.fciNumber != null && existing.fciNumber != null && incoming.fciNumber !== existing.fciNumber) {
    throw new Error("Notion FCI číslo sa nezhoduje s kanonickou identitou prepojeného plemena.");
  }
  if (incoming.importKey && existing.importKey && incoming.importKey !== existing.importKey) {
    throw new Error("Notion importný kľúč sa nezhoduje s kanonickou identitou prepojeného plemena.");
  }

  const merged: ManagedBreedInput = { ...existing, status: "draft" };
  const target = merged as Record<string, unknown>;
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "seo" || key === "status" || key === "slug" || key === "importKey") continue;
    if (value == null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length)) continue;
    target[key] = value;
  }
  // The mapping row and canonical slug identify the same D1 record throughout sync.
  merged.slug = existing.slug;
  merged.importKey = existing.importKey || incoming.importKey || null;

  const seo = { ...existing.seo };
  if (incoming.seo?.title?.trim()) seo.title = incoming.seo.title;
  if (incoming.seo?.description?.trim()) seo.description = incoming.seo.description;
  // Notion does not currently expose independent OG fields. Never overwrite
  // editorial OG, canonical, focus keyword or noindex settings on resync.
  if (!seo.ogTitle && incoming.seo?.ogTitle?.trim()) seo.ogTitle = incoming.seo.ogTitle;
  if (!seo.ogDescription && incoming.seo?.ogDescription?.trim()) seo.ogDescription = incoming.seo.ogDescription;
  merged.seo = seo;
  return merged;
}

/**
 * API clients may send only edited fields. Missing keys preserve current D1
 * values; explicit "" / [] in the editor can still intentionally clear values.
 */
export function mergeManagedBreedEdit(existing: ManagedBreed, patch: ManagedBreedInput): ManagedBreedInput {
  return {
    ...existing,
    ...patch,
    seo: patch.seo === undefined ? existing.seo : { ...existing.seo, ...(patch.seo ?? {}) },
    fciStandard: patch.fciStandard === undefined ? existing.fciStandard : { ...existing.fciStandard, ...(patch.fciStandard ?? {}) },
    editorial: patch.editorial === undefined ? existing.editorial : { ...existing.editorial, ...(patch.editorial ?? {}) },
  };
}
