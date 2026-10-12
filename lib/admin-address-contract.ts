/** Internal, side-effect-free proposal contract. Not a public DTO or persistence API. */
import {
  SLOVAK_REGIONS, SLOVAK_DISTRICTS_BY_REGION, SLOVAK_MUNICIPALITIES_BY_DISTRICT,
  normalizeSlovakLocationSearch, resolveSlovakLocation,
} from "@/lib/slovakia-locations";
import {
  evaluateDirectoryServiceAddress, normalizeSlovakPostalCode,
  type DirectoryAddressFormat, type DirectoryServiceAddressConfirmation,
} from "@/lib/directory-service-address";
import { isGeoRecordStale, type GeoSourceLocation, type GeoPublicVisibility, type GeoPublicPrecision, type GeoStatus } from "@/lib/geo";

export type AddressMode = "PHYSICAL" | "ONLINE" | "SERVICE_AREA";
export type AddressFields = {
  region: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  street: string | null;
  houseNumber: string | null;
  addressFormat: DirectoryAddressFormat | null;
  editorialAddress: string | null;
};
export const addressFieldKeys = ["region", "district", "city", "postalCode", "street", "houseNumber", "addressFormat", "editorialAddress"] as const;
export type AddressField = typeof addressFieldKeys[number];
export type AddressIssue = { field: AddressField | "locationMode" | "countryCode"; code: string };

// Missing in evidence is not a clear. Omitted/undefined patch = unchanged.
export type AddressOperation = { kind: "missing" } | { kind: "unchanged" }
  | { kind: "set"; value: string } | { kind: "clear"; reason: string };
export type AddressPatch = Partial<Record<AddressField, AddressOperation>>;

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new TypeError("Address values must be text, never numeric.");
  const result = value.normalize("NFC").trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) throw new TypeError("Invalid address control character.");
  return result || null;
}
function key(value: string) {
  return normalizeSlovakLocationSearch(value).replace(/[–—]/g, "-").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
}
function match(value: string, candidates: readonly string[]) {
  const matches = candidates.filter((candidate) => key(candidate) === key(value));
  return matches.length === 1 ? matches[0] : null;
}

/** Normalizes only supplied components. Never invents missing ancestors or parses free text. */
export function normalizeAdminAddress(input: Partial<Record<AddressField, unknown>>, mode: AddressMode = "PHYSICAL", countryCode = "SK") {
  const fields = Object.fromEntries(addressFieldKeys.map((field) => [field, text(input[field])])) as AddressFields;
  const issues: AddressIssue[] = [];
  const issue = (field: AddressIssue["field"], code: string) => issues.push({ field, code });
  if (!["PHYSICAL", "ONLINE", "SERVICE_AREA"].includes(mode)) issue("locationMode", "INVALID_MODE");
  if (countryCode.toUpperCase() !== "SK") issue("countryCode", "UNSUPPORTED_COUNTRY");
  if (mode === "ONLINE") {
    if (addressFieldKeys.some((field) => field !== "editorialAddress" && fields[field])) issue("locationMode", "ONLINE_PHYSICAL_FIELDS");
  } else if (countryCode.toUpperCase() === "SK") {
    const regions = [...SLOVAK_REGIONS];
    const districts = Object.values(SLOVAK_DISTRICTS_BY_REGION).flat();
    if (fields.region) {
      const canonical = match(fields.region, regions);
      if (canonical) fields.region = canonical;
      else issue("region", "UNKNOWN_REGION");
    }
    if (fields.district) {
      const canonical = match(fields.district.replace(/^okres\s+/i, ""), districts);
      if (canonical) fields.district = canonical;
      else issue("district", "UNKNOWN_DISTRICT");
      if (fields.region && canonical && !SLOVAK_DISTRICTS_BY_REGION[fields.region]?.includes(canonical)) issue("district", "REGION_DISTRICT_MISMATCH");
    }
    if (fields.city) {
      const candidates = fields.district
        ? SLOVAK_MUNICIPALITIES_BY_DISTRICT[fields.district] ?? []
        : Object.entries(SLOVAK_MUNICIPALITIES_BY_DISTRICT)
          .filter(([district]) => !fields.region || SLOVAK_DISTRICTS_BY_REGION[fields.region]?.includes(district))
          .flatMap(([, cities]) => cities);
      const canonical = match(fields.city, candidates);
      if (canonical) fields.city = canonical;
      else issue("city", candidates.some((city) => key(city) === key(fields.city!)) ? "AMBIGUOUS_CITY" : "CITY_OUTSIDE_HIERARCHY");
    }
    if (fields.region && fields.district && fields.city && !resolveSlovakLocation({ region: fields.region, district: fields.district, city: fields.city })) {
      issue("city", "INVALID_HIERARCHY");
    }
  }
  if (fields.postalCode) {
    fields.postalCode = normalizeSlovakPostalCode(fields.postalCode);
    if (!/^\d{3} \d{2}$/.test(fields.postalCode)) issue("postalCode", "INVALID_POSTAL_CODE");
  }
  if (fields.addressFormat && !["STREET", "MUNICIPALITY_NUMBER"].includes(fields.addressFormat)) issue("addressFormat", "INVALID_ADDRESS_FORMAT");
  return { fields, issues };
}

/** System-owned snapshot from the existing GEO store/operator join, never from a proposal. */
export type AddressGeoSnapshot = Readonly<{
  sourceFingerprint: string;
  resolvedSourceFingerprint: string | null;
  googlePlaceId: string | null;
  googlePlaceSourceFingerprint: string | null;
  googlePlaceMatchedAt: string | null;
  geocodeStatus: GeoStatus;
  publicVisibility: GeoPublicVisibility | null;
  publicPrecision: GeoPublicPrecision | null;
  manualOverride: boolean;
  latitude: number | null;
  longitude: number | null;
}>;
export type AdminAddress = {
  target: Pick<GeoSourceLocation, "targetType" | "targetId" | "organizationId">;
  revision: string;
  locationMode: AddressMode;
  countryCode: string;
  locationRole: string | null;
  fields: AddressFields;
  issues: AddressIssue[];
  serviceAddressConfirmation: DirectoryServiceAddressConfirmation;
  geo: AddressGeoSnapshot | null;
};

/** Adapter for all three existing getGeoSourceLocation target models. No legacy writes. */
export function adminAddressFromSource(source: GeoSourceLocation, revision: string, geo: AddressGeoSnapshot | null): AdminAddress {
  const online = source.targetType === "MANAGED_EVENT" && (source.online || key(source.region ?? "") === "online" || key(source.city ?? "") === "online");
  const locationMode = online ? "ONLINE" : source.locationRole === "SERVICE_AREA" ? "SERVICE_AREA" : "PHYSICAL";
  const countryCode = source.countryCode?.trim().toUpperCase() || "SK";
  const result = normalizeAdminAddress({
    region: online && key(source.region ?? "") === "online" ? null : source.region,
    district: source.district,
    city: online && key(source.city ?? "") === "online" ? null : source.city,
    postalCode: source.postalCode, street: source.street, houseNumber: source.houseNumber,
    addressFormat: source.addressFormat, editorialAddress: source.address,
  }, locationMode, countryCode);
  return {
    target: { targetType: source.targetType, targetId: source.targetId, organizationId: source.organizationId },
    revision, locationMode, countryCode, locationRole: source.locationRole ?? null,
    ...result, serviceAddressConfirmation: source.serviceAddressConfirmation ?? "LEGACY_UNCONFIRMED",
    geo: geo ? { ...geo } : null,
  };
}

export function adminAddressPlaceState(address: AdminAddress): "NONE" | "CURRENT" | "STALE" {
  const geo = address.geo;
  if (!geo?.googlePlaceId) return "NONE";
  const coordinatesValid = typeof geo.latitude === "number" && Number.isFinite(geo.latitude) && Math.abs(geo.latitude) <= 90
    && typeof geo.longitude === "number" && Number.isFinite(geo.longitude) && Math.abs(geo.longitude) <= 180;
  return address.locationMode === "PHYSICAL" && coordinatesValid && Boolean(geo.googlePlaceMatchedAt)
    && Boolean(geo.sourceFingerprint) && Boolean(geo.googlePlaceSourceFingerprint) && Boolean(geo.resolvedSourceFingerprint)
    && !isGeoRecordStale(geo.sourceFingerprint, geo.googlePlaceSourceFingerprint)
    && !isGeoRecordStale(geo.sourceFingerprint, geo.resolvedSourceFingerprint)
    && geo.geocodeStatus === "RESOLVED" && geo.publicVisibility === "EXACT_PUBLIC" && geo.publicPrecision === "EXACT"
    && (address.target.targetType !== "ORGANIZATION_LOCATION" || address.locationRole === "SITE")
    ? "CURRENT" : "STALE";
}

export function evaluateAdminAddress(address: AdminAddress) {
  if (address.issues.length) return { state: "NEEDS_REVIEW" as const, reason: address.issues[0].code };
  if (address.locationMode !== "PHYSICAL") return { state: "NOT_APPLICABLE" as const, reason: address.locationMode };
  const fields = address.fields;
  // Structural completeness only; this local evaluator argument does NOT confer confirmation.
  return evaluateDirectoryServiceAddress({
    region: fields.region ?? "", district: fields.district ?? "", city: fields.city ?? "",
    postalCode: fields.postalCode ?? "", street: fields.street ?? "", houseNumber: fields.houseNumber ?? "",
    addressFormat: fields.addressFormat ?? "", serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
  });
}

export type AddressWriteGuard = {
  target: AdminAddress["target"];
  revision: string;
  sourceFingerprint: string | null;
};
export type AddressConflict = { code: string; field?: AddressField };

/** Pure preview, not authorization or an atomic DB write. Callers must recheck guard at commit. */
export function previewAdminAddressPatch(current: AdminAddress, patch: AddressPatch, guard: AddressWriteGuard, actor: "ADMIN" | "IMPORT" = "IMPORT") {
  const conflicts: AddressConflict[] = [];
  const reject = (code: string, field?: AddressField) => conflicts.push({ code, field });
  if (guard.target.targetType !== current.target.targetType || guard.target.targetId !== current.target.targetId
    || guard.target.organizationId !== current.target.organizationId) reject("TARGET_MISMATCH");
  if (!current.revision || guard.revision !== current.revision || guard.sourceFingerprint !== (current.geo?.sourceFingerprint ?? null)) reject("STALE_REVISION");
  const proposed = { ...current.fields };
  const touched: AddressField[] = [];
  for (const [rawField, operation] of Object.entries(patch)) {
    if (!addressFieldKeys.includes(rawField as AddressField)) { reject("SYSTEM_OWNED_OR_UNKNOWN_FIELD"); continue; }
    const field = rawField as AddressField;
    if (operation === undefined) continue;
    if (!operation || typeof operation !== "object") { reject("INVALID_OPERATION", field); continue; }
    if (operation.kind === "missing" || operation.kind === "unchanged") continue;
    if (operation.kind === "clear") {
      if (actor !== "ADMIN" || typeof operation.reason !== "string" || !operation.reason.trim()) { reject("CLEAR_REQUIRES_ADMIN_REASON", field); continue; }
      proposed[field] = null;
    } else if (operation.kind === "set") {
      if (typeof operation.value !== "string" || !operation.value.trim()) { reject("EMPTY_SET_USE_CLEAR", field); continue; }
      // Runtime format validation is performed below; avoid accepting a new enum silently.
      Object.assign(proposed, { [field]: operation.value });
    } else { reject("INVALID_OPERATION", field); continue; }
    touched.push(field);
  }
  let normalized: ReturnType<typeof normalizeAdminAddress>;
  try { normalized = normalizeAdminAddress(proposed, current.locationMode, current.countryCode); }
  catch { reject("INVALID_TEXT"); return { status: "CONFLICT" as const, fields: current.fields, conflicts, changed: [] as AddressField[] }; }
  const changed = touched.filter((field) => normalized.fields[field] !== current.fields[field]);
  if (changed.length) {
    if (current.geo?.manualOverride) reject("MANUAL_OVERRIDE");
    if (current.geo?.publicVisibility === "HIDDEN") reject("PRIVATE_LOCATION");
    if (current.geo?.googlePlaceId) reject("GOOGLE_CONFIRMED_ADDRESS"); // Includes stale anchors.
    if (current.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION") reject("CONFIRMED_SERVICE_ADDRESS");
    if (actor === "IMPORT" && current.locationRole === "LEGAL_SEAT") reject("LEGAL_SEAT_REVIEW");
    for (const field of changed) if (actor === "IMPORT" && current.fields[field] !== null) reject("EXISTING_VALUE", field);
    // Partial provider proposals must not silently combine an old street with a new locality.
    const hierarchyChanged = changed.some((field) => ["region", "district", "city"].includes(field));
    const streetChanged = changed.includes("street");
    if (hierarchyChanged || streetChanged) {
      const dependents: AddressField[] = hierarchyChanged ? ["postalCode", "street", "houseNumber", "editorialAddress"] : ["houseNumber", "editorialAddress"];
      if (dependents.some((field) => current.fields[field] !== null && !touched.includes(field))) reject("PARTIAL_RELOCATION");
    }
    for (const issue of normalized.issues) reject(issue.code, addressFieldKeys.includes(issue.field as AddressField) ? issue.field as AddressField : undefined);
  }
  return { status: conflicts.length ? "CONFLICT" as const : changed.length ? "READY" as const : "NOOP" as const,
    fields: conflicts.length ? current.fields : normalized.fields, conflicts, changed };
}
