/** Internal address foundation. No persistence, provider calls or public consumers. */
import {
  SLOVAK_REGIONS, getSlovakDistricts, getSlovakMunicipalities,
  normalizeSlovakLocationSearch, resolveSlovakLocation,
} from "@/lib/slovakia-locations";
import {
  directoryAddressFormats, directoryAddressTextSemanticallyEqual,
  evaluateDirectoryServiceAddress, normalizeSlovakPostalCode,
  type DirectoryAddressFormat, type DirectoryServiceAddressState,
} from "@/lib/directory-service-address";
import type { GeoTargetType, GeoPublicVisibility, GeoPublicPrecision, GeoStatus } from "@/lib/geo";

export type AddressMode = "PHYSICAL" | "ONLINE" | "SERVICE_AREA";
export type InternalAddress = {
  mode: AddressMode;
  region: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  street: string | null;
  houseNumber: string | null;
  addressFormat: DirectoryAddressFormat | null;
  editorialAddress: string | null;
  venue: string | null;
  countryCode: string | null;
};
export const addressFields = [
  "mode", "region", "district", "city", "postalCode", "street", "houseNumber",
  "addressFormat", "editorialAddress", "venue", "countryCode",
] as const satisfies readonly (keyof InternalAddress)[];
export type AddressField = typeof addressFields[number];
export type AddressIssue = { field: AddressField; code: "INVALID_TYPE" | "INVALID_VALUE" | "INVALID_HIERARCHY" | "AMBIGUOUS" | "ONLINE_PHYSICAL_DATA" };
export type AddressValidation = {
  address: InternalAddress;
  issues: AddressIssue[];
  completeness: DirectoryServiceAddressState;
};
export type AddressGeoProtection = {
  googlePlaceId: string | null;
  googlePlaceSourceFingerprint: string | null;
  sourceFingerprint: string | null;
  resolvedSourceFingerprint: string | null;
  publicVisibility: GeoPublicVisibility | null;
  publicPrecision: GeoPublicPrecision | null;
  geocodeStatus: GeoStatus | null;
  manualOverride: boolean;
  /** Must come from the existing server-side privacy decision, not client input. */
  explicitPrivate: boolean;
};
export type InternalAddressSnapshot = AddressValidation & {
  target: { type: GeoTargetType; id: number; organizationId?: number };
  revision: string | null;
  serviceLocationConfirmed: boolean;
  geo: AddressGeoProtection;
};

function clean(value: string) { return value.normalize("NFC").trim().replace(/\s+/g, " "); }
// Formatting aliases only; never prefix/fuzzy matching or invented municipality data.
function localityKey(value: string) {
  return normalizeSlovakLocationSearch(clean(value)).replace(/[.\s\-–—]+/g, "");
}
function uniqueMatch(value: string, options: readonly string[]) {
  const exact = options.find((item) => item === value);
  if (exact) return { value: exact, ambiguous: false };
  const matches = options.filter((item) => localityKey(item) === localityKey(value));
  return { value: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
}

/** Unknown raw inputs remain with the caller as evidence, never in canonical fields. */
export function validateInternalAddress(input: Partial<Record<AddressField, unknown>>): AddressValidation {
  const issues: AddressIssue[] = [];
  function text(field: AddressField) {
    const value = input[field];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") { issues.push({ field, code: "INVALID_TYPE" }); return null; }
    // Check before whitespace cleanup so control characters cannot be hidden.
    if ((field === "editorialAddress" ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/u : /[\u0000-\u001F\u007F]/u).test(value)) { issues.push({ field, code: "INVALID_VALUE" }); return null; }
    return clean(value) || null;
  }
  const rawMode = input.mode ?? "PHYSICAL";
  const mode: AddressMode = rawMode === "ONLINE" || rawMode === "SERVICE_AREA" || rawMode === "PHYSICAL" ? rawMode : "PHYSICAL";
  if (mode !== rawMode) issues.push({ field: "mode", code: "INVALID_VALUE" });
  const rawRegion = text("region"), rawDistrict = text("district"), rawCity = text("city");
  let region: string | null = null, district: string | null = null, city: string | null = null;
  if (rawRegion) {
    const key = localityKey(rawRegion);
    const candidates = SLOVAK_REGIONS.filter((r) => localityKey(r) === key || localityKey(r.replace(/ kraj$/, "")) === key);
    region = candidates.length === 1 ? candidates[0] : null;
    if (!region) issues.push({ field: "region", code: "INVALID_VALUE" });
  }
  if (rawDistrict) {
    const match = uniqueMatch(rawDistrict, region ? getSlovakDistricts(region) : []);
    district = match.value;
    if (!district) issues.push({ field: "district", code: match.ambiguous ? "AMBIGUOUS" : "INVALID_HIERARCHY" });
  }
  if (rawCity) {
    const match = uniqueMatch(rawCity, district ? getSlovakMunicipalities(district) : []);
    city = match.value;
    if (!city) issues.push({ field: "city", code: match.ambiguous ? "AMBIGUOUS" : "INVALID_HIERARCHY" });
  }
  // The existing canonical hierarchy remains the final authority.
  if (region && district && city && !resolveSlovakLocation({ region, district, city })) {
    issues.push({ field: "city", code: "INVALID_HIERARCHY" }); city = null;
  }
  const rawPostal = text("postalCode");
  const postalCode = rawPostal ? normalizeSlovakPostalCode(rawPostal) : null;
  if (postalCode && !/^\d{3} \d{2}$/.test(postalCode)) issues.push({ field: "postalCode", code: "INVALID_VALUE" });
  const format = text("addressFormat");
  const addressFormat = directoryAddressFormats.find((f) => f === format) ?? null;
  if (format && !addressFormat) issues.push({ field: "addressFormat", code: "INVALID_VALUE" });
  const country = text("countryCode");
  const countryCode = country?.toUpperCase() ?? null;
  if (countryCode && countryCode !== "SK") issues.push({ field: "countryCode", code: "INVALID_VALUE" });
  const address: InternalAddress = {
    mode, region, district, city, postalCode, addressFormat, countryCode,
    street: text("street"), houseNumber: text("houseNumber"),
    editorialAddress: text("editorialAddress"), venue: text("venue"),
  };
  if (mode === "ONLINE") {
    for (const field of ["region", "district", "city", "postalCode", "street", "houseNumber", "addressFormat", "editorialAddress", "venue"] as const) {
      if (input[field] !== undefined && input[field] !== null && input[field] !== "") issues.push({ field, code: "ONLINE_PHYSICAL_DATA" });
    }
  }
  const hasData = addressFields.some((field) => field !== "mode" && field !== "countryCode" && Boolean(address[field]));
  let completeness: DirectoryServiceAddressState = !hasData ? "MISSING" : "INCOMPLETE";
  if (mode === "ONLINE" && !issues.length) completeness = "COMPLETE";
  else if (mode === "SERVICE_AREA" && region && district && city) completeness = "COMPLETE";
  else if (mode === "PHYSICAL") {
    // Reuse existing technical evaluator, but do NOT use this temporary flag as confirmation.
    const evaluated = evaluateDirectoryServiceAddress({
      region: region ?? "", district: district ?? "", city: city ?? "",
      postalCode: postalCode ?? "", street: address.street ?? "", houseNumber: address.houseNumber ?? "",
      addressFormat: addressFormat ?? "", serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    });
    completeness = evaluated.state;
    if (evaluated.reason === "STREET_NOT_ALLOWED") issues.push({ field: "street", code: "INVALID_VALUE" });
  }
  if (issues.length) completeness = "NEEDS_REVIEW";
  return { address, issues, completeness };
}

export function googlePlaceConfirmationState(geo: AddressGeoProtection): "NONE" | "CURRENT" | "STALE" {
  if (!geo.googlePlaceId?.trim()) return "NONE";
  return geo.sourceFingerprint && geo.googlePlaceSourceFingerprint === geo.sourceFingerprint
    && geo.resolvedSourceFingerprint === geo.sourceFingerprint && geo.geocodeStatus === "RESOLVED"
    && geo.publicVisibility === "EXACT_PUBLIC" && geo.publicPrecision === "EXACT"
    ? "CURRENT" : "STALE";
}

/** Omitted/undefined = unchanged; null = explicit clear; empty string is not a clear command. */
export type AddressPatch = Partial<{ [K in AddressField]: InternalAddress[K] }>;
export type AddressConflict = { code: "INVALID_PATCH" | "INVALID_ADDRESS" | "GOOGLE_PLACE_LOCKED" | "MANUAL_GEO_LOCKED" | "PRIVATE_LOCATION_LOCKED" | "CONFIRMED_ADDRESS_LOCKED" | "EXISTING_VALUE" | "REVISION_CONFLICT"; fields: string[] };
export type AddressPatchDecision = {
  allowed: boolean;
  next: InternalAddress;
  changes: AddressPatch;
  conflicts: AddressConflict[];
};

/** Pure proposal decision. Does not grant admin authority, confirm a place or modify GEO. */
export function planInternalAddressPatch(
  snapshot: InternalAddressSnapshot,
  input: unknown,
  options: { missingOnly?: boolean; expectedRevision?: string | null } = {},
): AddressPatchDecision {
  const conflicts: AddressConflict[] = [];
  const changes: AddressPatch = {};
  const current = snapshot.address;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { allowed: false, next: { ...current }, changes, conflicts: [{ code: "INVALID_PATCH", fields: [] }] };
  }
  const record = input as Record<string, unknown>;
  const unknownFields = Object.keys(record).filter((key) => !(addressFields as readonly string[]).includes(key));
  if (unknownFields.length) conflicts.push({ code: "INVALID_PATCH", fields: unknownFields });
  const candidate = { ...current };
  for (const field of addressFields) {
    const value = Object.hasOwn(record, field) ? record[field] : undefined;
    if (value === undefined) continue;
    if ((value !== null && typeof value !== "string") || (typeof value === "string" && !value.trim())
      || (field === "mode" && value === null)) {
      conflicts.push({ code: "INVALID_PATCH", fields: [field] }); continue;
    }
    Object.assign(candidate, { [field]: value });
  }
  const validation = validateInternalAddress(candidate);
  const currentValidation = validateInternalAddress(current);
  for (const field of addressFields) {
    if (!Object.hasOwn(record, field) || record[field] === undefined) continue;
    const value = validation.address[field];
    const before = currentValidation.issues.some((issue) => issue.field === field) ? current[field] : currentValidation.address[field];
    const equal = value === before || (typeof value === "string" && typeof before === "string"
      && directoryAddressTextSemanticallyEqual(value, before));
    if (!equal) Object.assign(changes, { [field]: value });
  }
  const fields = Object.keys(changes);
  // Legacy-invalid untouched fields are not silently repaired; strict proposals need review.
  if (validation.issues.some((issue) => record[issue.field] !== undefined) || (fields.length && validation.issues.length)) conflicts.push({ code: "INVALID_ADDRESS", fields: validation.issues.map((issue) => issue.field) });
  if (options.expectedRevision !== undefined && options.expectedRevision !== snapshot.revision) conflicts.push({ code: "REVISION_CONFLICT", fields });
  if (fields.length) {
    if (snapshot.geo.googlePlaceId?.trim()) conflicts.push({ code: "GOOGLE_PLACE_LOCKED", fields });
    if (snapshot.geo.manualOverride) conflicts.push({ code: "MANUAL_GEO_LOCKED", fields });
    if (snapshot.geo.explicitPrivate || snapshot.geo.publicVisibility === "HIDDEN") conflicts.push({ code: "PRIVATE_LOCATION_LOCKED", fields });
    if (snapshot.serviceLocationConfirmed) conflicts.push({ code: "CONFIRMED_ADDRESS_LOCKED", fields });
    if (options.missingOnly) {
      const existing = fields.filter((f) => current[f as AddressField] !== null || record[f] === null);
      if (existing.length) conflicts.push({ code: "EXISTING_VALUE", fields: existing });
    }
  }
  return { allowed: conflicts.length === 0, next: conflicts.length ? { ...current } : { ...current, ...changes }, changes, conflicts };
}
