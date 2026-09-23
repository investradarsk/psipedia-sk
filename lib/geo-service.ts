import { env } from "cloudflare:workers";
import {
  buildGeoQuery,
  normalizeGeoText,
  safeGeoErrorStatus,
  type GeoErrorCode,
  type GeoPublicPrecision,
  type GeoSourceLocation,
  type GeoTargetType,
} from "./geo";
import { GeoapifyGeocoder } from "./geoapify-geocoder";
import { GeocoderProviderError, type GeocodeRequest, type GeocoderProvider, type NormalizedGeocoderResult, type StructuredGeocodeAddress } from "./geo-provider";
import {
  applyGeocoderResolution,
  getGeoPointForTarget,
  getGeoSourceLocation,
  recordGeocoderFailure,
  type GeoD1Database,
} from "./geo-store";

type GeoThresholdBindings = {
  GEO_EXACT_CONFIDENCE_THRESHOLD?: string;
  GEO_CITY_CONFIDENCE_THRESHOLD?: string;
};

export type GeoAcceptanceConfig = {
  exactConfidence: number;
  cityConfidence: number;
  ambiguityDelta: number;
};

function boundedThreshold(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function geoAcceptanceConfig(bindings?: GeoThresholdBindings): GeoAcceptanceConfig {
  const runtime = bindings ?? (env as unknown as GeoThresholdBindings);
  return {
    exactConfidence: boundedThreshold(runtime.GEO_EXACT_CONFIDENCE_THRESHOLD, 0.95),
    cityConfidence: boundedThreshold(runtime.GEO_CITY_CONFIDENCE_THRESHOLD, 0.9),
    ambiguityDelta: 0.03,
  };
}

function samePlace(expected: string | undefined, actual: string) {
  const left = normalizeGeoText(expected);
  if (!left) return true;
  const right = normalizeGeoText(actual);
  return right === left || right.includes(left) || left.includes(right);
}

function score(result: NormalizedGeocoderResult) {
  return result.confidence ?? result.cityConfidence ?? 0;
}

export function chooseGeocoderResult(input: {
  results: NormalizedGeocoderResult[];
  sourceCity?: string;
  precision: GeoPublicPrecision;
  config?: GeoAcceptanceConfig;
}): { result: NormalizedGeocoderResult | null; errorCode: GeoErrorCode | null } {
  const config = input.config ?? geoAcceptanceConfig();
  const candidates = input.results.filter((result) => result.countryCode === "SK");
  if (!candidates.length) return { result: null, errorCode: "NO_MATCH" };

  const ordered = [...candidates].sort((a, b) => score(b) - score(a));
  const first = ordered[0];
  const second = ordered[1];

  if (!samePlace(input.sourceCity, first.city || first.district)) {
    return { result: null, errorCode: "LOW_CONFIDENCE" };
  }

  if (second && Math.abs(score(first) - score(second)) <= config.ambiguityDelta) {
    const distinct = Math.abs(first.latitude - second.latitude) > 0.002 || Math.abs(first.longitude - second.longitude) > 0.002;
    if (distinct) return { result: null, errorCode: "AMBIGUOUS" };
  }

  if (input.precision === "EXACT") {
    const exactTypes = new Set(["building", "amenity", "street"]);
    if (!exactTypes.has(first.resultType)) return { result: null, errorCode: "LOW_CONFIDENCE" };
    if ((first.confidence ?? 0) < config.exactConfidence || (first.cityConfidence ?? first.confidence ?? 0) < config.cityConfidence) {
      return { result: null, errorCode: "LOW_CONFIDENCE" };
    }
  } else {
    const approximateTypes = new Set(["city", "district", "suburb", "locality", "postcode"]);
    if (!approximateTypes.has(first.resultType)) return { result: null, errorCode: "LOW_CONFIDENCE" };
    if ((first.cityConfidence ?? first.confidence ?? 0) < config.cityConfidence) {
      return { result: null, errorCode: "LOW_CONFIDENCE" };
    }
  }

  return { result: first, errorCode: null };
}

function providerErrorCode(error: unknown): GeoErrorCode {
  if (error instanceof GeocoderProviderError) return error.code;
  return "PROVIDER_ERROR";
}

function municipalityName(value: string | null | undefined) {
  const city = value?.trim() ?? "";
  if (!city) return "";
  return city.split(/\s+[–—-]\s+/, 1)[0]?.trim() ?? city;
}

function postalCodeFromAddress(value: string | null | undefined) {
  const match = (value ?? "").match(/\b(\d{3})\s?(\d{2})\b/);
  return match ? `${match[1]} ${match[2]}` : "";
}

export function buildStructuredExactAddress(source: GeoSourceLocation): StructuredGeocodeAddress | null {
  const raw = (source.address || source.venue || "").trim();
  if (!raw) return null;
  const firstLine = raw.split(",", 1)[0]?.trim() ?? "";
  const match = firstLine.match(/^(.+?)\s+(\d+\p{L}?(?:\/\d+\p{L}?)?)$/u);
  if (!match) return null;
  const street = match[1]?.trim() ?? "";
  const housenumber = match[2]?.trim() ?? "";
  if (!street || !housenumber) return null;

  const countryCode = (source.countryCode || "SK").toUpperCase();
  const structured: StructuredGeocodeAddress = {
    street,
    housenumber,
    city: municipalityName(source.city) || undefined,
    state: source.region?.trim() || undefined,
    country: countryCode === "SK" ? "Slovakia" : countryCode,
  };
  const postcode = source.postalCode?.trim() || postalCodeFromAddress(raw);
  if (postcode) structured.postcode = postcode;
  return structured;
}

function geocodeRequest(source: GeoSourceLocation, query: string, precision: GeoPublicPrecision): GeocodeRequest {
  return {
    query,
    precision,
    countryCode: source.countryCode ?? "SK",
    structuredAddress: precision === "EXACT" ? buildStructuredExactAddress(source) ?? undefined : undefined,
  };
}

export function summarizeGeoDiagnosticResults(results: NormalizedGeocoderResult[]) {
  return results.slice(0, 3).map((result) => ({
    resultType: result.resultType,
    confidence: result.confidence,
    cityConfidence: result.cityConfidence,
    streetConfidence: result.streetConfidence,
    buildingConfidence: result.buildingConfidence,
    matchType: result.matchType,
    countryCode: result.countryCode,
    region: result.region,
    district: result.district,
    city: result.city,
  }));
}

export async function diagnoseGeoTarget(input: {
  targetType: GeoTargetType;
  targetId: number;
  provider?: GeocoderProvider;
  database?: GeoD1Database;
  config?: GeoAcceptanceConfig;
}) {
  const point = await getGeoPointForTarget(input.targetType, input.targetId, input.database);
  if (!point) throw new Error("Geo point neexistuje. Najprv ho inicializuj.");
  if (!point.publicVisibility || point.publicVisibility === "HIDDEN" || !point.publicPrecision) {
    throw new Error("Diagnostika vyžaduje schválenú verejnú geo klasifikáciu.");
  }
  const source = await getGeoSourceLocation(input.targetType, input.targetId, input.database);
  if (!source) throw new Error("Canonical target neexistuje.");
  const query = buildGeoQuery(source, point.publicVisibility, point.publicPrecision);
  if (!query) throw new Error("Geo query nie je dostupná.");

  const provider = input.provider ?? new GeoapifyGeocoder();
  const request = geocodeRequest(source, query, point.publicPrecision);
  const results = point.publicVisibility === "EXACT_PUBLIC"
    ? await provider.geocodeExact(request)
    : await provider.geocodeApproximate(request);
  const decision = chooseGeocoderResult({
    results,
    sourceCity: source.city,
    precision: point.publicPrecision,
    config: input.config,
  });
  return {
    query,
    requestMode: request.structuredAddress ? "structured" : "freeform",
    structuredAddress: request.structuredAddress ?? null,
    resultCount: results.length,
    accepted: Boolean(decision.result && !decision.errorCode),
    errorCode: decision.errorCode,
    thresholds: input.config ?? geoAcceptanceConfig(),
    candidates: summarizeGeoDiagnosticResults(results),
  };
}

export async function resolveGeoTarget(input: {
  targetType: GeoTargetType;
  targetId: number;
  provider?: GeocoderProvider;
  database?: GeoD1Database;
  config?: GeoAcceptanceConfig;
}) {
  const point = await getGeoPointForTarget(input.targetType, input.targetId, input.database);
  if (!point) throw new Error("Geo point neexistuje. Najprv ho inicializuj.");
  if (point.manualOverride) throw new Error("Manual override chráni marker pred automatickým geocoderom.");
  if (!point.publicVisibility) throw new Error("Poloha nemá schválenú privacy klasifikáciu.");
  if (point.publicVisibility === "HIDDEN") throw new Error("Skrytá poloha sa nesmie geokódovať.");
  if (!point.publicPrecision) throw new Error("Poloha nemá public precision.");

  const source = await getGeoSourceLocation(input.targetType, input.targetId, input.database);
  if (!source) throw new Error("Canonical target neexistuje.");
  const query = buildGeoQuery(source, point.publicVisibility, point.publicPrecision);
  if (!query) {
    return recordGeocoderFailure({
      targetType: input.targetType, targetId: input.targetId,
      errorCode: "SOURCE_INCOMPLETE", status: "NEEDS_REVIEW",
    }, input.database);
  }

  const provider = input.provider ?? new GeoapifyGeocoder();
  try {
    const request = geocodeRequest(source, query, point.publicPrecision);
    const results = point.publicVisibility === "EXACT_PUBLIC"
      ? await provider.geocodeExact(request)
      : await provider.geocodeApproximate(request);
    const decision = chooseGeocoderResult({
      results, sourceCity: source.city, precision: point.publicPrecision, config: input.config,
    });
    if (!decision.result || decision.errorCode) {
      const errorCode = decision.errorCode ?? "NO_MATCH";
      return recordGeocoderFailure({
        targetType: input.targetType, targetId: input.targetId,
        errorCode, status: safeGeoErrorStatus(errorCode, point.attemptCount + 1),
      }, input.database);
    }
    return applyGeocoderResolution({
      targetType: input.targetType,
      targetId: input.targetId,
      result: decision.result,
      method: point.publicVisibility === "APPROXIMATE_PUBLIC" ? "LOCALITY" : "GEOCODER",
    }, input.database);
  } catch (error) {
    const errorCode = providerErrorCode(error);
    const attempt = point.attemptCount + 1;
    const retryAfterAt = errorCode === "RATE_LIMITED"
      ? new Date(Date.now() + Math.min(60, 5 * attempt) * 60_000).toISOString()
      : errorCode === "PROVIDER_ERROR"
        ? new Date(Date.now() + Math.min(30, 2 ** attempt) * 60_000).toISOString()
        : null;
    return recordGeocoderFailure({
      targetType: input.targetType,
      targetId: input.targetId,
      errorCode,
      status: safeGeoErrorStatus(errorCode, attempt),
      retryAfterAt,
    }, input.database);
  }
}
