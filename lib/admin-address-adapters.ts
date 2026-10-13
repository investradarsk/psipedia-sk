/** Read-only adapters for the current models. They never manufacture migration columns. */
import {
  validateInternalAddress, type AddressGeoProtection, type InternalAddress,
  type InternalAddressSnapshot, type AddressPatchDecision, type AddressPatch,
} from "@/lib/admin-address-contract";
import type { DirectoryServiceAddress } from "@/lib/directory-service-address";
import type { OrganizationLocationAdminRecord } from "@/lib/organization-location-admin-store";
import type { ManagedEventInput } from "@/lib/event-store";
import type { GeoPointRecord } from "@/lib/geo-store";

// Google fields are queried alongside GeoPointRecord in the current store, not in that base type.
export type AddressGeoInput = Pick<GeoPointRecord,
  "sourceFingerprint" | "resolvedSourceFingerprint" | "publicVisibility" | "publicPrecision" | "geocodeStatus" | "manualOverride"
> & { googlePlaceId?: string | null; googlePlaceSourceFingerprint?: string | null };
export function adaptAddressGeo(point: AddressGeoInput | null, explicitPrivate = false): AddressGeoProtection {
  return {
    googlePlaceId: point?.googlePlaceId ?? null,
    googlePlaceSourceFingerprint: point?.googlePlaceSourceFingerprint ?? null,
    sourceFingerprint: point?.sourceFingerprint ?? null,
    resolvedSourceFingerprint: point?.resolvedSourceFingerprint ?? null,
    publicVisibility: point?.publicVisibility ?? null,
    publicPrecision: point?.publicPrecision ?? null,
    geocodeStatus: point?.geocodeStatus ?? null,
    manualOverride: point?.manualOverride ?? false, explicitPrivate,
  };
}
const absent = (value: string | null | undefined) => value === undefined || value === null || !value.trim() ? null : value;
const emptyStructured = { postalCode: null, street: null, houseNumber: null, addressFormat: null } as const;
function snapshot(
  target: InternalAddressSnapshot["target"], raw: InternalAddress,
  revision: string | null, confirmed: boolean, geo: AddressGeoProtection,
): InternalAddressSnapshot {
  if (!Number.isSafeInteger(target.id) || target.id <= 0
    || (target.organizationId !== undefined && (!Number.isSafeInteger(target.organizationId) || target.organizationId <= 0))) {
    throw new Error("Invalid canonical address target.");
  }
  // Keep original nonempty legacy values for conflict detection: an invalid value is NOT missing.
  return { ...validateInternalAddress(raw), address: { ...raw }, target: { ...target }, revision, serviceLocationConfirmed: confirmed, geo: { ...geo } };
}
export function adaptDirectoryAddress(
  profile: DirectoryServiceAddress & { id: number; address: string; updatedAt?: string },
  geo = adaptAddressGeo(null),
): InternalAddressSnapshot {
  return snapshot({ type: "DIRECTORY_PROFILE", id: profile.id }, {
    mode: "PHYSICAL", region: absent(profile.region), district: absent(profile.district), city: absent(profile.city),
    postalCode: absent(profile.postalCode), street: absent(profile.street), houseNumber: absent(profile.houseNumber),
    addressFormat: profile.addressFormat || null, editorialAddress: absent(profile.address), venue: null, countryCode: "SK",
  }, profile.updatedAt ?? null, profile.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION", geo);
}
export function adaptEventAddress(
  event: Pick<ManagedEventInput, "region" | "city" | "address" | "venue"> & { id: number; updatedAt?: string },
  geo = adaptAddressGeo(null),
): InternalAddressSnapshot {
  const online = [event.region, event.city].some((v) => v?.trim().toLowerCase() === "online");
  return snapshot({ type: "MANAGED_EVENT", id: event.id }, {
    mode: online ? "ONLINE" : "PHYSICAL", ...emptyStructured,
    region: online ? null : absent(event.region), district: null, city: online ? null : absent(event.city),
    editorialAddress: absent(event.address), venue: absent(event.venue), countryCode: "SK",
  }, event.updatedAt ?? null, false, geo);
}
export function adaptOrganizationAddress(
  location: Pick<OrganizationLocationAdminRecord, "id" | "organizationId" | "role" | "region" | "district" | "city" | "address" | "countryCode">,
  geo = adaptAddressGeo(null), revision: string | null = null,
): InternalAddressSnapshot {
  return snapshot({ type: "ORGANIZATION_LOCATION", id: location.id, organizationId: location.organizationId }, {
    mode: location.role === "SERVICE_AREA" ? "SERVICE_AREA" : "PHYSICAL", ...emptyStructured,
    region: absent(location.region), district: absent(location.district), city: absent(location.city),
    editorialAddress: absent(location.address), venue: null, countryCode: absent(location.countryCode),
  }, revision, false, geo);
}

/** Whitelisted legacy field projection. Refuse unavailable columns instead of silently dropping them.
 * This is an address-only patch, not a complete payload for today's full-profile save APIs.
 */
export function projectLegacyAddressPatch(target: InternalAddressSnapshot["target"]["type"], decision: AddressPatchDecision) {
  if (!decision.allowed) throw new Error("Address proposal has unresolved conflicts.");
  const supported = target === "DIRECTORY_PROFILE"
    ? ["region", "district", "city", "postalCode", "street", "houseNumber", "addressFormat", "editorialAddress"]
    : target === "MANAGED_EVENT"
      ? ["region", "city", "editorialAddress", "venue"]
      : ["region", "district", "city", "editorialAddress", "countryCode"];
  const unavailable = Object.keys(decision.changes).filter((key) => !supported.includes(key));
  if (unavailable.length) throw new Error(`Address fields require a later migration/workflow: ${unavailable.join(", ")}`);
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(decision.changes as AddressPatch)) {
    patch[key === "editorialAddress" ? "address" : key] = value ?? "";
  }
  return patch;
}

/** Address evidence only: incomplete components are omitted, not clear operations.
 * Place ID, coordinates and confirmation remain exclusively owned by the existing Google workflow.
 */
export function adaptGoogleAddressProposal(
  components: Partial<import("@/lib/google-place-matching").GooglePlaceStructuredAddress>,
  formattedAddress?: string,
) {
  const fields: AddressPatch = {};
  const mapping = {
    region: components.region, district: components.district,
    city: components.locality && components.sublocality
      ? `${components.locality} - ${components.sublocality}` : components.locality || components.sublocality,
    postalCode: components.postalCode, street: components.street,
    houseNumber: components.houseNumber, countryCode: components.countryCode,
    editorialAddress: formattedAddress,
  };
  for (const [field, value] of Object.entries(mapping)) {
    if (typeof value === "string" && value.trim()) Object.assign(fields, { [field]: value });
  }
  return { fields, validation: validateInternalAddress(fields) };
}
