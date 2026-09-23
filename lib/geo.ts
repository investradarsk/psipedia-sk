export const geoTargetTypes = ["DIRECTORY_PROFILE", "ORGANIZATION_LOCATION", "MANAGED_EVENT"] as const;
export type GeoTargetType = (typeof geoTargetTypes)[number];

export const geoPublicVisibilities = ["EXACT_PUBLIC", "APPROXIMATE_PUBLIC", "HIDDEN"] as const;
export type GeoPublicVisibility = (typeof geoPublicVisibilities)[number];

export const geoPublicPrecisions = ["EXACT", "NEIGHBORHOOD", "MUNICIPALITY", "SERVICE_AREA", "APPROXIMATE"] as const;
export type GeoPublicPrecision = (typeof geoPublicPrecisions)[number];

export const geoStatuses = ["PENDING", "RESOLVED", "NEEDS_REVIEW", "FAILED", "STALE", "SKIPPED"] as const;
export type GeoStatus = (typeof geoStatuses)[number];

export const geoResolutionMethods = ["GEOCODER", "LOCALITY", "MANUAL", "SOURCE_COORDINATES"] as const;
export type GeoResolutionMethod = (typeof geoResolutionMethods)[number];

export const geoErrorCodes = [
  "NO_MATCH",
  "AMBIGUOUS",
  "LOW_CONFIDENCE",
  "INVALID_INPUT",
  "RATE_LIMITED",
  "PROVIDER_ERROR",
  "PRIVATE_HIDDEN",
  "ONLINE_ONLY",
  "DISABLED",
  "SOURCE_INCOMPLETE",
  "CONFLICTING_GEO",
  "CONFLICTING_PUBLIC_PRIVATE_LOCATION",
  "PRIVACY_CLASSIFICATION_MISSING",
  "MANUAL_REVIEW",
] as const;
export type GeoErrorCode = (typeof geoErrorCodes)[number];

export type GeoSourceLocation = {
  targetType: GeoTargetType;
  targetId: number;
  label: string;
  category?: string;
  locationRole?: string;
  address?: string;
  venue?: string;
  city?: string;
  district?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  online?: boolean;
  published?: boolean;
};

export type GeoClassification = {
  proposedVisibility: GeoPublicVisibility | null;
  proposedPrecision: GeoPublicPrecision | null;
  requiresReview: boolean;
  reasonCode: GeoErrorCode | null;
  explanation: string;
};

export type GeoFingerprintInput = {
  targetType: GeoTargetType;
  locationRole?: string | null;
  publicVisibility?: GeoPublicVisibility | null;
  publicPrecision?: GeoPublicPrecision | null;
  countryCode?: string | null;
  region?: string | null;
  district?: string | null;
  city?: string | null;
  postalCode?: string | null;
  sourceAddress?: string | null;
};

const exactCandidateCategories = new Set([
  "veterinari",
  "salony-a-sluzby",
  "fyzioterapia",
  "hotely-a-opatrovanie",
]);

const approximateDirectoryCategories = new Set([
  "treneri",
  "kynologicke-kluby",
  "chovatelske-kluby",
  "chovatelske-stanice",
  "vencenie",
]);

export function isGeoTargetType(value: string): value is GeoTargetType {
  return (geoTargetTypes as readonly string[]).includes(value);
}

export function isGeoPublicVisibility(value: unknown): value is GeoPublicVisibility {
  return typeof value === "string" && (geoPublicVisibilities as readonly string[]).includes(value);
}

export function isGeoPublicPrecision(value: unknown): value is GeoPublicPrecision {
  return typeof value === "string" && (geoPublicPrecisions as readonly string[]).includes(value);
}

export function normalizeGeoText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("sk");
}

export function normalizeGeoCountryCode(value: string | null | undefined) {
  return (value?.trim() || "SK").toUpperCase();
}

function isOnlineGeoMarker(value: string | null | undefined) {
  const normalized = normalizeGeoText(value);
  return normalized === "online" || normalized === "online-only" || normalized === "online only";
}

function nonEmpty(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim() ?? "").filter(Boolean);
}

function distinctGeoParts(...values: Array<string | null | undefined>) {
  const parts: string[] = [];
  const normalizedParts: string[] = [];
  for (const raw of values) {
    const value = raw?.trim() ?? "";
    if (!value) continue;
    const normalized = normalizeGeoText(value);
    const redundant = normalizedParts.some((existing) =>
      existing === normalized || existing.includes(normalized) || normalized.includes(existing),
    );
    if (redundant) continue;
    parts.push(value);
    normalizedParts.push(normalized);
  }
  return parts;
}

export function classifyGeoSource(source: GeoSourceLocation): GeoClassification {
  const city = source.city?.trim() ?? "";
  const address = source.address?.trim() ?? "";
  const venue = source.venue?.trim() ?? "";

  if (source.targetType === "MANAGED_EVENT") {
    if (source.online || normalizeGeoText(source.region) === "online" || normalizeGeoText(city) === "online" || normalizeGeoText(venue) === "online") {
      return { proposedVisibility: "HIDDEN", proposedPrecision: null, requiresReview: false, reasonCode: "ONLINE_ONLY", explanation: "Online podujatie nemá fyzický marker." };
    }
    if (address || venue) {
      return { proposedVisibility: "EXACT_PUBLIC", proposedPrecision: "EXACT", requiresReview: true, reasonCode: "PRIVACY_CLASSIFICATION_MISSING", explanation: "Verejné venue je exact kandidát, ale musí byť potvrdené pred geokódovaním." };
    }
    if (city) {
      return { proposedVisibility: "APPROXIMATE_PUBLIC", proposedPrecision: "MUNICIPALITY", requiresReview: false, reasonCode: null, explanation: "Podujatie má iba obec/mesto; používa sa približná verejná poloha." };
    }
    return { proposedVisibility: null, proposedPrecision: null, requiresReview: true, reasonCode: "SOURCE_INCOMPLETE", explanation: "Podujatie nemá dostatočný verejný location source." };
  }

  if (source.targetType === "ORGANIZATION_LOCATION") {
    if (source.locationRole === "SERVICE_AREA") {
      return city
        ? { proposedVisibility: "APPROXIMATE_PUBLIC", proposedPrecision: "SERVICE_AREA", requiresReview: false, reasonCode: null, explanation: "Service area sa zverejňuje iba približne." }
        : { proposedVisibility: null, proposedPrecision: null, requiresReview: true, reasonCode: "SOURCE_INCOMPLETE", explanation: "Service area nemá obec/mesto." };
    }
    if (source.locationRole === "LEGAL_SEAT") {
      return { proposedVisibility: null, proposedPrecision: null, requiresReview: true, reasonCode: "PRIVACY_CLASSIFICATION_MISSING", explanation: "Právne sídlo sa nikdy automaticky nepovažuje za verejnú prevádzku." };
    }
    if (source.locationRole === "UNSPECIFIED" || !source.locationRole) {
      return { proposedVisibility: null, proposedPrecision: null, requiresReview: true, reasonCode: "PRIVACY_CLASSIFICATION_MISSING", explanation: "Neurčená rola lokality vyžaduje manuálnu privacy klasifikáciu." };
    }
    if (source.locationRole === "SITE") {
      return address || city
        ? { proposedVisibility: "EXACT_PUBLIC", proposedPrecision: "EXACT", requiresReview: true, reasonCode: "PRIVACY_CLASSIFICATION_MISSING", explanation: "SITE je exact kandidát iba po potvrdení, že ide o verejne navštevované miesto." }
        : { proposedVisibility: null, proposedPrecision: null, requiresReview: true, reasonCode: "SOURCE_INCOMPLETE", explanation: "SITE nemá použiteľnú lokalitu." };
    }
  }

  if (source.targetType === "DIRECTORY_PROFILE") {
    const cityIsOnline = isOnlineGeoMarker(city);
    const addressIsOnline = isOnlineGeoMarker(address);
    const regionIsOnline = isOnlineGeoMarker(source.region);
    const hasPhysicalCity = Boolean(city && !cityIsOnline);
    const hasPhysicalAddress = Boolean(address && !addressIsOnline);
    const hasOnlineSentinel = cityIsOnline || addressIsOnline || regionIsOnline;

    if (hasOnlineSentinel && (hasPhysicalCity || hasPhysicalAddress)) {
      return { proposedVisibility: null, proposedPrecision: null, requiresReview: true, reasonCode: "CONFLICTING_GEO", explanation: "Profil kombinuje online sentinel s fyzickou lokalitou; pred geokódovaním vyžaduje manuálnu kontrolu." };
    }
    if (hasOnlineSentinel || (source.online && !hasPhysicalAddress && !hasPhysicalCity)) {
      return { proposedVisibility: "HIDDEN", proposedPrecision: null, requiresReview: false, reasonCode: "ONLINE_ONLY", explanation: "Online-only profil nemá fyzický marker." };
    }
    const category = source.category ?? "";
    if (approximateDirectoryCategories.has(category)) {
      return city
        ? { proposedVisibility: "APPROXIMATE_PUBLIC", proposedPrecision: "MUNICIPALITY", requiresReview: false, reasonCode: null, explanation: "Citlivejší typ služby sa predvolene zobrazuje iba na úrovni obce/mesta." }
        : { proposedVisibility: null, proposedPrecision: null, requiresReview: true, reasonCode: "SOURCE_INCOMPLETE", explanation: "Citlivejší profil nemá obec/mesto pre bezpečný približný marker." };
    }
    if (exactCandidateCategories.has(category) && (address || city)) {
      return { proposedVisibility: "EXACT_PUBLIC", proposedPrecision: "EXACT", requiresReview: true, reasonCode: "PRIVACY_CLASSIFICATION_MISSING", explanation: "Verejná prevádzka je exact kandidát, ale street address sama o sebe nie je súhlas na exact marker." };
    }
    if (city) {
      return { proposedVisibility: "APPROXIMATE_PUBLIC", proposedPrecision: "MUNICIPALITY", requiresReview: false, reasonCode: null, explanation: "Neštruktúrovaný typ služby sa bezpečne predvolí na municipality marker." };
    }
  }

  return { proposedVisibility: null, proposedPrecision: null, requiresReview: true, reasonCode: "SOURCE_INCOMPLETE", explanation: "Location source sa nedá bezpečne klasifikovať automaticky." };
}

export function buildGeoQuery(
  source: GeoSourceLocation,
  visibility: GeoPublicVisibility,
  precision: GeoPublicPrecision | null,
) {
  if (visibility === "HIDDEN") return null;
  const country = normalizeGeoCountryCode(source.countryCode) === "SK" ? "Slovakia" : normalizeGeoCountryCode(source.countryCode);

  if (visibility === "APPROXIMATE_PUBLIC") {
    if (precision === "NEIGHBORHOOD") {
      return nonEmpty(source.venue, source.city, country).join(", ") || null;
    }
    return nonEmpty(source.city, source.district, source.region, country).join(", ") || null;
  }

  return distinctGeoParts(
    source.address || source.venue,
    source.city,
    source.district,
    source.region,
    country,
  ).join(", ") || null;
}

function fingerprintPayload(input: GeoFingerprintInput) {
  return JSON.stringify([
    "map-location:v1",
    input.targetType,
    normalizeGeoText(input.locationRole),
    input.publicVisibility ?? "",
    input.publicPrecision ?? "",
    normalizeGeoCountryCode(input.countryCode),
    normalizeGeoText(input.region),
    normalizeGeoText(input.district),
    normalizeGeoText(input.city),
    normalizeGeoText(input.postalCode),
    normalizeGeoText(input.sourceAddress),
  ]);
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function sourceGeoFingerprint(input: GeoFingerprintInput) {
  return sha256Hex(fingerprintPayload(input));
}

export async function geoQueryFingerprint(query: string | null) {
  return query ? sha256Hex(normalizeGeoText(query)) : null;
}

export function geoFingerprintInput(
  source: GeoSourceLocation,
  visibility: GeoPublicVisibility | null,
  precision: GeoPublicPrecision | null,
): GeoFingerprintInput {
  const includeStreet = visibility === "EXACT_PUBLIC";
  return {
    targetType: source.targetType,
    locationRole: source.locationRole,
    publicVisibility: visibility,
    publicPrecision: precision,
    countryCode: source.countryCode,
    region: source.region,
    district: source.district,
    city: source.city,
    postalCode: source.postalCode,
    sourceAddress: includeStreet ? (source.address || source.venue) : null,
  };
}

export function isGeoRecordStale(sourceFingerprint: string, resolvedSourceFingerprint: string | null | undefined) {
  return Boolean(resolvedSourceFingerprint) && sourceFingerprint !== resolvedSourceFingerprint;
}

export function isRetryableGeoError(code: GeoErrorCode | null | undefined) {
  return code === "RATE_LIMITED" || code === "PROVIDER_ERROR";
}

export function safeGeoErrorStatus(code: GeoErrorCode, attemptCount: number, maxAttempts = 3): GeoStatus {
  if (code === "NO_MATCH" || code === "AMBIGUOUS" || code === "LOW_CONFIDENCE" || code === "SOURCE_INCOMPLETE" || code === "PRIVACY_CLASSIFICATION_MISSING" || code === "CONFLICTING_GEO" || code === "CONFLICTING_PUBLIC_PRIVATE_LOCATION" || code === "MANUAL_REVIEW") {
    return "NEEDS_REVIEW";
  }
  if (code === "PRIVATE_HIDDEN" || code === "ONLINE_ONLY" || code === "DISABLED") return "SKIPPED";
  return isRetryableGeoError(code) && attemptCount < maxAttempts ? "PENDING" : "FAILED";
}

export function geoSensitiveDirectoryCategory(category: string | null | undefined) {
  return ["chovatelske-stanice", "chovatelske-kluby", "treneri", "vencenie", "kynologicke-kluby"].includes(category ?? "");
}
