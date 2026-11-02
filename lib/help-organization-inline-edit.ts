import {
  OrganizationAdminValidationError,
  parseOrganizationAdminInput,
  organizationAdminInputFromCandidate,
  type OrganizationAdminInput,
} from "./help-organization-admin-input.ts";
import type { OrganizationPublicationAdminItem } from "./help-organization-admin-store.ts";

/** Only these public text fields may be changed directly in the shelter grid.
 * Status, type, slug, address/location and media require their domain editors. */
export const SHELTER_INLINE_FIELDS = [
  "name", "shortDescription", "publicEmail", "publicPhone", "websiteUrl",
] as const;
export type ShelterInlineField = (typeof SHELTER_INLINE_FIELDS)[number];
export type ShelterInlineValues = Pick<OrganizationAdminInput, ShelterInlineField>;

export function shelterInlineValues(item: OrganizationPublicationAdminItem): ShelterInlineValues {
  return {
    name: item.name,
    shortDescription: item.shortDescription,
    publicEmail: item.publicEmail,
    publicPhone: item.publicPhone,
    websiteUrl: item.websiteUrl,
  };
}

/** Reject extra keys and missing fields rather than silently ignoring dangerous writes. */
export function organizationInputWithShelterInlineChanges(
  item: OrganizationPublicationAdminItem,
  value: unknown,
): OrganizationAdminInput {
  if (item.type !== "SHELTER" || item.status === "ARCHIVED" || item.archivedAt) {
    throw new OrganizationAdminValidationError("Tento záznam nie je upraviteľný v tabuľke útulkov.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrganizationAdminValidationError("Chýbajú údaje na rýchlu úpravu útulku.");
  }
  const data = value as Record<string, unknown>;
  const fields = Object.keys(data);
  if (fields.length !== SHELTER_INLINE_FIELDS.length ||
      fields.some(key => !SHELTER_INLINE_FIELDS.includes(key as ShelterInlineField))) {
    throw new OrganizationAdminValidationError("Rýchla úprava podporuje iba názov, krátky popis a verejné kontakty.");
  }
  for (const key of SHELTER_INLINE_FIELDS) {
    if (!(key in data) || (typeof data[key] !== "string" && data[key] !== null)) {
      throw new OrganizationAdminValidationError("Neplatný údaj: " + key);
    }
  }
  const base = organizationAdminInputFromCandidate(item);
  const changes: ShelterInlineValues = {
    name: data.name as string,
    shortDescription: data.shortDescription as string,
    publicEmail: (data.publicEmail as string | null) || null,
    publicPhone: (data.publicPhone as string | null) || null,
    websiteUrl: (data.websiteUrl as string | null) || null,
  };
  // Reuse the canonical editor's validation and avoid writing unrelated fields.
  return parseOrganizationAdminInput({ ...base, ...changes });
}
