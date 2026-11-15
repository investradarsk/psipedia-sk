/**
 * Explicit Admin "Save entire profile" contract.
 *
 * A complete visible form is authoritative, including untouched values and
 * intentionally empty strings. Protect against older clients that omit fields,
 * and against another writer changing D1 after this form was loaded.
 *
 * This validates structure, NEVER the format of free-text contacts.
 */
export const DIRECTORY_FULL_SAVE_TEXT_FIELDS = [
  "name", "slug", "category", "status", "excerpt", "description",
  "city", "district", "region", "address", "postalCode", "street",
  "houseNumber", "addressFormat", "priceNote", "websiteUrl",
  "publicPhone", "publicEmail", "facebookUrl", "instagramUrl",
] as const;

export function validateDirectoryFullProfileSave(input: {
  expectedUpdatedAt: unknown;
  currentUpdatedAt: string;
  submitted: Record<string, unknown>;
}): "valid" | "missing-fields" | "stale" {
  const { expectedUpdatedAt, currentUpdatedAt, submitted } = input;
  if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt)
    return "missing-fields";
  if (expectedUpdatedAt !== currentUpdatedAt) return "stale";
  if (DIRECTORY_FULL_SAVE_TEXT_FIELDS.some(field => typeof submitted[field] !== "string"))
    return "missing-fields";
  if (!Array.isArray(submitted.services) || !Array.isArray(submitted.qualifications))
    return "missing-fields";
  if (typeof submitted.verified !== "boolean" || typeof submitted.featured !== "boolean")
    return "missing-fields";
  if (!submitted.seo || typeof submitted.seo !== "object" || Array.isArray(submitted.seo))
    return "missing-fields";
  return "valid";
}
