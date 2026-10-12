/** Compatibility adapters; no persistence, provider calls or public formatting. */
import type { GeoSourceLocation } from "@/lib/geo";
import type { GooglePlaceCandidate } from "@/lib/google-place-matching";
import type { ManagedDirectoryProfileInput } from "@/lib/directory-store";
import type { ManagedEventInput } from "@/lib/event-store";
import type { OrganizationLocationAdminRecord } from "@/lib/organization-location-admin-store";
import {
  adminAddressFromSource, normalizeAdminAddress, addressFieldKeys,
  type AddressGeoSnapshot, type AddressPatch, type AddressField,
} from "@/lib/admin-address-contract";

type SnapshotContext = { revision: string; geo: AddressGeoSnapshot | null };
type DirectoryAddressInput = Pick<ManagedDirectoryProfileInput, "region" | "district" | "city" | "postalCode" | "street" | "houseNumber" | "address"> &
  Pick<GeoSourceLocation, "addressFormat" | "serviceAddressConfirmation">;

export function directoryAdminAddress(id: number, input: DirectoryAddressInput, context: SnapshotContext) {
  return adminAddressFromSource({ ...input, targetType: "DIRECTORY_PROFILE", targetId: id, label: "", countryCode: "SK" }, context.revision, context.geo);
}
export function eventAdminAddress(id: number, input: Pick<ManagedEventInput, "region" | "city" | "address" | "venue">, context: SnapshotContext) {
  return adminAddressFromSource({ ...input, targetType: "MANAGED_EVENT", targetId: id, label: "", countryCode: "SK" }, context.revision, context.geo);
}
export function organizationAdminAddress(input: OrganizationLocationAdminRecord, context: SnapshotContext) {
  return adminAddressFromSource({
    targetType: "ORGANIZATION_LOCATION", targetId: input.id, organizationId: input.organizationId,
    label: input.label, locationRole: input.role, countryCode: input.countryCode,
    region: input.region, district: input.district, city: input.city, address: input.address,
  }, context.revision, context.geo);
}

/** An untrusted discovery result remains evidence. It can NEVER confirm or replace GEO. */
export function googleAdminAddressProposal(candidate: GooglePlaceCandidate) {
  const components = candidate.address;
  const raw = {
    region: components?.region, district: components?.district,
    city: components?.sublocality || components?.locality,
    postalCode: components?.postalCode, street: components?.street,
    houseNumber: components?.houseNumber, editorialAddress: candidate.formattedAddress,
  };
  let normalized = normalizeAdminAddress(raw, "PHYSICAL", components?.countryCode || "SK");
  // Sublocality can be a neighborhood outside the snapshot. Try supplied locality,
  // never guess the district or keep a previous record's locality.
  if (normalized.issues.some((issue) => issue.field === "city") && components?.locality) {
    const fallback = normalizeAdminAddress({ ...raw, city: components.locality }, "PHYSICAL", components.countryCode || "SK");
    if (!fallback.issues.some((issue) => issue.field === "city")) normalized = fallback;
  }
  const patch: AddressPatch = {};
  for (const field of addressFieldKeys) {
    const value = normalized.fields[field];
    patch[field] = value === null ? { kind: "missing" } : { kind: "set", value };
  }
  // Invalid raw components are evidence, not values eligible for missing-only application.
  const blocked = new Set<AddressField>(normalized.issues.flatMap((issue) =>
    issue.field === "countryCode" ? [...addressFieldKeys] : [issue.field as AddressField]));
  if (normalized.issues.some((issue) => ["region", "district", "city"].includes(issue.field))) {
    for (const field of ["region", "district", "city"] as const) blocked.add(field);
  }
  for (const field of blocked) patch[field] = { kind: "missing" };
  return {
    kind: "PROPOSAL" as const, patch, issues: normalized.issues,
    evidence: { googlePlaceId: candidate.id, formattedAddress: candidate.formattedAddress, components: components ? { ...components } : null },
    requiresReview: normalized.issues.length > 0,
  };
}
