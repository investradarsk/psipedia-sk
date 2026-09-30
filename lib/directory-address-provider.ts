import { normalizeGeoText } from "@/lib/geo";
import { GeoapifyGeocoder } from "@/lib/geoapify-geocoder";
import { GeocoderProviderError, type GeocoderProvider, type NormalizedGeocoderResult } from "@/lib/geo-provider";
import { normalizeSlovakPostalCode } from "@/lib/directory-service-address";
import {
  SLOVAK_DISTRICTS_BY_REGION,
  getSlovakMunicipalities,
  normalizeSlovakLocationSearch,
  resolveSlovakLocation,
} from "@/lib/slovakia-locations";

const SK_POSTCODE = /^\d{3}\s?\d{2}$/;

export type DirectoryAddressSuggestion = {
  providerResultId: string;
  formatted: string;
  addressLine1: string;
  addressLine2: string;
  street: string;
  city: string;
  district: string;
  region: string;
  resultType: string;
};

export type VerifiedDirectoryAddress = {
  region: string;
  district: string;
  city: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: "STREET" | "MUNICIPALITY_NUMBER";
  providerResult: NormalizedGeocoderResult;
};

function localityMatches(expected: string, actual: string) {
  const left = normalizeGeoText(expected);
  const right = normalizeGeoText(actual);
  if (!left || !right) return false;
  return left === right || right.includes(left) || left.includes(right);
}

function requireLocality(region: string, district: string, city: string) {
  const clean = { region: region.trim(), district: district.trim(), city: city.trim() };
  if (!resolveSlovakLocation(clean)) throw new Error("Najprv vyber platný kraj, okres a obec / mesto.");
  return clean;
}


type ParsedHouseNumber = {
  full: string;
  conscription: string | null;
  orientation: string;
};

function normalizeHouseNumberToken(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function parseSlovakHouseNumber(value: string): ParsedHouseNumber | null {
  const normalized = normalizeHouseNumberToken(value);
  const fullMatch = /^(\d+)\/(\d+[A-Z]?)$/.exec(normalized);
  if (fullMatch) {
    return {
      full: normalized,
      conscription: fullMatch[1],
      orientation: fullMatch[2],
    };
  }
  const singleMatch = /^(\d+[A-Z]?)$/.exec(normalized);
  if (!singleMatch) return null;
  return {
    full: normalized,
    conscription: null,
    orientation: singleMatch[1],
  };
}

export function houseNumberMatchesUserInput(input: {
  userHouseNumber: string;
  providerHouseNumber: string;
  addressFormat: "STREET" | "MUNICIPALITY_NUMBER";
}) {
  const user = parseSlovakHouseNumber(input.userHouseNumber);
  const provider = parseSlovakHouseNumber(input.providerHouseNumber);
  if (!user || !provider) return false;

  if (user.full === provider.full) return true;
  if (input.addressFormat !== "STREET") return false;

  return user.conscription === null
    && provider.conscription !== null
    && user.orientation === provider.orientation;
}

function safeStreetSuggestion(result: NormalizedGeocoderResult): DirectoryAddressSuggestion | null {
  const street = (result.street ?? "").trim();
  if (!result.providerResultId || result.countryCode !== "SK" || !street) return null;
  return {
    providerResultId: result.providerResultId,
    formatted: result.formatted ?? "",
    addressLine1: result.addressLine1 ?? "",
    addressLine2: result.addressLine2 ?? "",
    street,
    city: result.city,
    district: result.district,
    region: result.region,
    resultType: result.resultType,
  };
}

export async function autocompleteDirectoryAddress(input: {
  region: string;
  district: string;
  city: string;
  query: string;
  provider?: GeoapifyGeocoder;
  signal?: AbortSignal;
}) {
  const locality = requireLocality(input.region, input.district, input.city);
  const query = input.query.trim();
  if (query.length < 3) throw new Error("Napíš aspoň 3 znaky názvu ulice.");
  if (query.length > 160) throw new Error("Názov ulice je príliš dlhý.");
  const provider = input.provider ?? new GeoapifyGeocoder();
  const results = await provider.autocomplete({ ...locality, query, signal: input.signal });
  const seen = new Set<string>();
  return results
    .filter((result) => result.countryCode === "SK")
    .filter((result) => localityMatches(locality.city, result.city || result.district))
    .filter((result) => !result.region || localityMatches(locality.region, result.region))
    .filter((result) => !result.district || localityMatches(locality.district, result.district))
    .map(safeStreetSuggestion)
    .filter((item): item is DirectoryAddressSuggestion => Boolean(item))
    .filter((item) => {
      const key = normalizeGeoText(item.street);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

export function verifyDirectoryExactCandidates(input: {
  region: string;
  district: string;
  city: string;
  results: NormalizedGeocoderResult[];
  userHouseNumber?: string;
  expectedAddressFormat?: "STREET" | "MUNICIPALITY_NUMBER";
  expectedStreet?: string;
}): VerifiedDirectoryAddress {
  const locality = requireLocality(input.region, input.district, input.city);
  const candidates = input.results.filter((result) => result.countryCode === "SK");
  if (!candidates.length) throw new Error("Vybranú adresu sa nepodarilo znovu overiť.");

  const accepted = candidates.filter((result) => {
    const buildingType = result.resultType === "building"
      || (result.resultType === "amenity" && Boolean(result.housenumber) && Boolean(result.postcode));
    const validPostcode = SK_POSTCODE.test(result.postcode ?? "");
    const cityOk = localityMatches(locality.city, result.city || result.district);
    const regionOk = !result.region || localityMatches(locality.region, result.region);
    const districtOk = !result.district || localityMatches(locality.district, result.district);
    const confidenceOk = (result.confidence ?? 0) >= 0.95
      && (result.cityConfidence ?? result.confidence ?? 0) >= 0.90
      && (result.buildingConfidence ?? result.confidence ?? 0) >= 0.95;
    const streetOk = result.street
      ? (result.streetConfidence ?? result.confidence ?? 0) >= 0.95
      : true;
    const expectedStreetOk = !input.expectedStreet
      || (Boolean(result.street) && localityMatches(input.expectedStreet, result.street ?? ""));
    const resultAddressFormat = result.street ? "STREET" : "MUNICIPALITY_NUMBER";
    const formatOk = !input.expectedAddressFormat || input.expectedAddressFormat === resultAddressFormat;
    const houseNumberOk = !input.userHouseNumber || houseNumberMatchesUserInput({
      userHouseNumber: input.userHouseNumber,
      providerHouseNumber: result.housenumber ?? "",
      addressFormat: input.expectedAddressFormat ?? resultAddressFormat,
    });
    return buildingType && Boolean(result.housenumber) && validPostcode
      && cityOk && regionOk && districtOk && confidenceOk && streetOk && expectedStreetOk && formatOk && houseNumberOk;
  });

  if (!accepted.length) {
    throw new Error("Adresu sa nepodarilo jednoznačne overiť. Skús zadať celé číslo domu (napr. súpisné/orientačné).");
  }
  if (accepted.length > 1) {
    const first = accepted[0];
    const ambiguous = accepted.slice(1).some((item) =>
      item.providerResultId !== first.providerResultId
      && (Math.abs(item.latitude - first.latitude) > 0.0002 || Math.abs(item.longitude - first.longitude) > 0.0002),
    );
    if (ambiguous) throw new Error("Adresa je nejednoznačná. Skontroluj ulicu a číslo domu.");
  }

  const result = accepted[0];
  const street = (result.street ?? "").trim();
  return {
    region: locality.region,
    district: locality.district,
    city: locality.city,
    postalCode: normalizeSlovakPostalCode(result.postcode),
    street,
    houseNumber: (result.housenumber ?? "").trim(),
    addressFormat: street ? "STREET" : "MUNICIPALITY_NUMBER",
    providerResult: result,
  };
}

export async function revalidateDirectoryStreet(input: {
  region: string;
  district: string;
  city: string;
  street: string;
  providerResultId?: string;
  provider?: GeoapifyGeocoder;
  signal?: AbortSignal;
}) {
  const locality = requireLocality(input.region, input.district, input.city);
  const street = input.street.trim();
  if (street.length < 3) throw new Error("Vybraný názov ulice je neplatný.");

  const provider = input.provider ?? new GeoapifyGeocoder();
  const candidates = await provider.autocomplete({
    ...locality,
    query: street,
    signal: input.signal,
  });
  const localityCandidates = candidates.filter((result) => {
    const cityOk = localityMatches(locality.city, result.city || result.district);
    const regionOk = !result.region || localityMatches(locality.region, result.region);
    const districtOk = !result.district || localityMatches(locality.district, result.district);
    return result.countryCode === "SK" && Boolean(result.street) && cityOk && regionOk && districtOk;
  });

  if (input.providerResultId) {
    const selected = localityCandidates.find((result) => result.providerResultId === input.providerResultId) ?? null;
    if (!selected?.street || !localityMatches(street, selected.street)) {
      throw new Error("Vybranú ulicu sa nepodarilo znovu overiť.");
    }
    return selected.street.trim();
  }

  const normalizedStreet = normalizeGeoText(street);
  const selected = localityCandidates.find((result) => normalizeGeoText(result.street) === normalizedStreet) ?? null;
  if (!selected?.street) throw new Error("Vybranú ulicu sa nepodarilo znovu overiť.");
  return selected.street.trim();
}

export async function verifyDirectoryCanonicalAddress(input: {
  region: string;
  district: string;
  city: string;
  street: string;
  houseNumber: string;
  addressFormat: "STREET" | "MUNICIPALITY_NUMBER";
  revalidateStreet?: boolean;
  streetProviderResultId?: string;
  provider?: GeoapifyGeocoder;
  signal?: AbortSignal;
}) {
  const locality = requireLocality(input.region, input.district, input.city);
  const requestedStreet = input.street.trim();
  const houseNumber = input.houseNumber.trim();
  if (!houseNumber) throw new Error("Doplň číslo domu.");
  if (houseNumber.length > 40) throw new Error("Číslo domu je príliš dlhé.");
  if (input.addressFormat === "STREET" && requestedStreet.length < 3) {
    throw new Error("Vybraný názov ulice je neplatný.");
  }

  const provider = input.provider ?? new GeoapifyGeocoder();
  const street = input.addressFormat === "STREET" && input.revalidateStreet
    ? await revalidateDirectoryStreet({
        ...locality,
        street: requestedStreet,
        providerResultId: input.streetProviderResultId,
        provider,
        signal: input.signal,
      })
    : requestedStreet;
  const locationOrStreet = input.addressFormat === "STREET" ? street : locality.city;
  const query = [locationOrStreet, houseNumber, locality.city, locality.district, locality.region, "Slovensko"]
    .filter(Boolean).join(", ");
  const verifyResults = (results: NormalizedGeocoderResult[]) => verifyDirectoryExactCandidates({
    ...locality,
    results,
    userHouseNumber: houseNumber,
    expectedAddressFormat: input.addressFormat,
    expectedStreet: input.addressFormat === "STREET" ? street : undefined,
  });

  const primaryResults = await provider.geocodeExact({
    query,
    precision: "EXACT",
    countryCode: "SK",
    structuredAddress: input.addressFormat === "STREET"
      ? {
          housenumber: houseNumber,
          street,
          city: locality.city,
          state: locality.region,
          country: "Slovakia",
        }
      : undefined,
    signal: input.signal,
  });

  try {
    return verifyResults(primaryResults);
  } catch (primaryVerificationError) {
    if (input.addressFormat !== "STREET") throw primaryVerificationError;
    const secondaryResults = await provider.geocodeApproximate({
      query,
      precision: "EXACT",
      countryCode: "SK",
      signal: input.signal,
    });
    return verifyResults(secondaryResults);
  }
}

export async function verifyDirectoryAddressSelection(input: {
  region: string;
  district: string;
  city: string;
  providerResultId: string;
  street: string;
  houseNumber: string;
  provider?: GeoapifyGeocoder;
  signal?: AbortSignal;
}) {
  const providerResultId = input.providerResultId.trim();
  if (!providerResultId) throw new Error("Vyber ulicu z Geoapify návrhov.");

  return verifyDirectoryCanonicalAddress({
    region: input.region,
    district: input.district,
    city: input.city,
    street: input.street,
    houseNumber: input.houseNumber,
    addressFormat: "STREET",
    revalidateStreet: true,
    streetProviderResultId: providerResultId,
    provider: input.provider,
    signal: input.signal,
  });
}

export type VerifiedDirectoryNumberlessAddress = {
  region: string;
  district: string;
  city: string;
  postalCode: string;
  street: string;
  houseNumber: "";
  addressFormat: "STREET";
};

export async function verifyDirectoryNumberlessAddressSelection(input: {
  region: string;
  district: string;
  city: string;
  postalCode: string;
  providerResultId: string;
  street: string;
  provider?: GeoapifyGeocoder;
  signal?: AbortSignal;
}): Promise<VerifiedDirectoryNumberlessAddress> {
  const locality = requireLocality(input.region, input.district, input.city);
  const providerResultId = input.providerResultId.trim();
  if (!providerResultId) throw new Error("Vyber ulicu z Geoapify návrhov.");

  const postalCode = normalizeSlovakPostalCode(input.postalCode);
  if (!SK_POSTCODE.test(postalCode)) throw new Error("Doplň platné PSČ pre miesto bez čísla domu.");

  const street = await revalidateDirectoryStreet({
    ...locality,
    street: input.street,
    providerResultId,
    provider: input.provider,
    signal: input.signal,
  });

  return {
    ...locality,
    postalCode,
    street,
    houseNumber: "",
    addressFormat: "STREET",
  };
}

export type DirectoryAddressReviewReason = "MULTIPLE_EXACT_CANDIDATES";

export type DirectoryAddressReviewCandidate = {
  provider: string;
  providerResultId: string | null;
  formattedAddress: string;
  region: string;
  district: string;
  city: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: "STREET" | "MUNICIPALITY_NUMBER";
  latitude: number;
  longitude: number;
};

export type ExternalDirectoryAddressVerification = {
  status: "VERIFIED_EXACT" | "NEEDS_REVIEW";
  verified: VerifiedDirectoryAddress | null;
  reviewReason: DirectoryAddressReviewReason | null;
  reviewCandidates: DirectoryAddressReviewCandidate[];
};

function normalizedProviderAdminName(value: string) {
  return normalizeSlovakLocationSearch(value)
    .replace(/\b(?:okres|district|county|region|kraj)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function providerCanonicalDistrict(result: NormalizedGeocoderResult) {
  const candidates = [result.district, result.cityDistrict ?? ""]
    .map(normalizedProviderAdminName)
    .filter(Boolean);
  for (const [region, districts] of Object.entries(SLOVAK_DISTRICTS_BY_REGION)) {
    for (const district of districts) {
      const canonical = normalizedProviderAdminName(district);
      if (candidates.some((candidate) => candidate === canonical)) {
        return { region, district };
      }
    }
  }
  return null;
}

function providerCanonicalCity(
  district: string,
  result: NormalizedGeocoderResult,
) {
  const municipalities = getSlovakMunicipalities(district);
  if (!municipalities.length) return null;
  const directCandidates = [result.city, result.cityDistrict ?? "", result.suburb ?? ""]
    .map((value) => value.trim())
    .filter(Boolean);
  for (const candidate of directCandidates) {
    const normalized = normalizeSlovakLocationSearch(candidate);
    const exact = municipalities.find((municipality) =>
      normalizeSlovakLocationSearch(municipality) === normalized
    );
    if (exact) return exact;
  }

  const baseCity = result.city.trim();
  for (const detail of [result.cityDistrict ?? "", result.suburb ?? ""]) {
    const cleanDetail = detail.trim();
    if (!baseCity || !cleanDetail) continue;
    const escapedBaseCity = baseCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const detailWithoutCity = cleanDetail
      .replace(new RegExp("^" + escapedBaseCity + "\\s*[-–—]?\\s*", "i"), "")
      .trim();
    for (const candidate of [
      cleanDetail,
      detailWithoutCity ? baseCity + " - " + detailWithoutCity : "",
    ]) {
      if (!candidate) continue;
      const normalized = normalizeSlovakLocationSearch(candidate);
      const exact = municipalities.find((municipality) =>
        normalizeSlovakLocationSearch(municipality) === normalized
      );
      if (exact) return exact;
    }
  }

  const providerText = normalizeSlovakLocationSearch([
    result.formatted ?? "",
    result.addressLine2 ?? "",
    result.cityDistrict ?? "",
    result.suburb ?? "",
  ].join(" "));
  const contained = municipalities.filter((municipality) => {
    const normalized = normalizeSlovakLocationSearch(municipality);
    return normalized.length >= 4 && providerText.includes(normalized);
  });
  return contained.length === 1 ? contained[0] : null;
}

export function resolveGeoapifyDirectoryLocality(result: NormalizedGeocoderResult) {
  const district = providerCanonicalDistrict(result);
  if (!district) return null;
  const city = providerCanonicalCity(district.district, result);
  if (!city) return null;
  return resolveSlovakLocation({
    region: district.region,
    district: district.district,
    city,
  });
}

function exactExternalAddressCandidate(input: {
  result: NormalizedGeocoderResult;
  expectedStreet?: string;
  expectedHouseNumber?: string;
  expectedPostalCode?: string;
  expectedCity?: string;
}) {
  const result = input.result;
  const buildingType = result.resultType === "building"
    || (result.resultType === "amenity" && Boolean(result.housenumber) && Boolean(result.postcode));
  if (result.countryCode !== "SK" || !buildingType || !result.housenumber || !SK_POSTCODE.test(result.postcode ?? "")) {
    return null;
  }
  const confidenceOk = (result.confidence ?? 0) >= 0.95
    && (result.cityConfidence ?? result.confidence ?? 0) >= 0.90
    && (result.buildingConfidence ?? result.confidence ?? 0) >= 0.95;
  const streetOk = result.street
    ? (result.streetConfidence ?? result.confidence ?? 0) >= 0.95
    : true;
  if (!confidenceOk || !streetOk) return null;

  const addressFormat = result.street ? "STREET" as const : "MUNICIPALITY_NUMBER" as const;
  if (input.expectedStreet?.trim()
    && (!result.street || !localityMatches(input.expectedStreet, result.street))) return null;
  if (input.expectedHouseNumber?.trim() && !houseNumberMatchesUserInput({
    userHouseNumber: input.expectedHouseNumber,
    providerHouseNumber: result.housenumber,
    addressFormat,
  })) return null;
  if (input.expectedPostalCode?.trim()
    && normalizeSlovakPostalCode(input.expectedPostalCode) !== normalizeSlovakPostalCode(result.postcode)) return null;

  const locality = resolveGeoapifyDirectoryLocality(result);
  if (!locality) return null;
  if (input.expectedCity?.trim()) {
    const cityEvidence = localityMatches(input.expectedCity, locality.city)
      || [result.city, result.cityDistrict ?? "", result.suburb ?? "", result.formatted ?? ""]
        .some((value) => value && localityMatches(input.expectedCity!, value));
    if (!cityEvidence) return null;
  }
  return {
    region: locality.region,
    district: locality.district,
    city: locality.city,
    postalCode: normalizeSlovakPostalCode(result.postcode),
    street: (result.street ?? "").trim(),
    houseNumber: result.housenumber.trim(),
    addressFormat,
    providerResult: result,
  } satisfies VerifiedDirectoryAddress;
}

function reviewCandidateFromVerified(verified: VerifiedDirectoryAddress): DirectoryAddressReviewCandidate {
  const result = verified.providerResult;
  const firstLine = verified.addressFormat === "STREET"
    ? [verified.street, verified.houseNumber].filter(Boolean).join(" ")
    : [verified.city, verified.houseNumber].filter(Boolean).join(" ");
  return {
    provider: result.provider,
    providerResultId: result.providerResultId,
    formattedAddress: result.formatted?.trim()
      || [firstLine, [verified.postalCode, verified.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    region: verified.region,
    district: verified.district,
    city: verified.city,
    postalCode: verified.postalCode,
    street: verified.street,
    houseNumber: verified.houseNumber,
    addressFormat: verified.addressFormat,
    latitude: result.latitude,
    longitude: result.longitude,
  };
}

function boundedReviewCandidates(accepted: VerifiedDirectoryAddress[]) {
  const seen = new Set<string>();
  const candidates: DirectoryAddressReviewCandidate[] = [];
  for (const verified of accepted) {
    const candidate = reviewCandidateFromVerified(verified);
    const key = [
      candidate.provider,
      candidate.providerResultId ?? "",
      normalizeGeoText(candidate.region),
      normalizeGeoText(candidate.district),
      normalizeGeoText(candidate.city),
      normalizeSlovakPostalCode(candidate.postalCode),
      normalizeGeoText(candidate.street),
      candidate.houseNumber.trim().toUpperCase(),
      candidate.addressFormat,
      candidate.latitude.toFixed(6),
      candidate.longitude.toFixed(6),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= 5) break;
  }
  return candidates;
}

function needsExternalAddressReview(
  reviewReason: DirectoryAddressReviewReason | null = null,
  reviewCandidates: DirectoryAddressReviewCandidate[] = [],
): ExternalDirectoryAddressVerification {
  return { status: "NEEDS_REVIEW", verified: null, reviewReason, reviewCandidates };
}

export async function verifyExternalDirectoryAddressEvidenceBestEffort(input: {
  evidence: string;
  expectedStreet?: string;
  expectedHouseNumber?: string;
  expectedPostalCode?: string;
  expectedCity?: string;
  provider?: GeocoderProvider;
  signal?: AbortSignal;
}): Promise<ExternalDirectoryAddressVerification> {
  const evidence = input.evidence.trim().replace(/\s+/g, " ").slice(0, 320);
  if (evidence.length < 5) return needsExternalAddressReview();
  try {
    const provider = input.provider ?? new GeoapifyGeocoder();
    if (!provider.isConfigured()) return needsExternalAddressReview();
    const results = await provider.geocodeExact({
      query: evidence + (/(?:slovensko|slovakia)/i.test(evidence) ? "" : ", Slovensko"),
      precision: "EXACT",
      countryCode: "SK",
      signal: input.signal,
    });
    const accepted = results
      .map((result) => exactExternalAddressCandidate({
        result,
        expectedStreet: input.expectedStreet,
        expectedHouseNumber: input.expectedHouseNumber,
        expectedPostalCode: input.expectedPostalCode,
        expectedCity: input.expectedCity,
      }))
      .filter((item): item is VerifiedDirectoryAddress => Boolean(item));
    if (!accepted.length) return needsExternalAddressReview();

    const first = accepted[0];
    const ambiguous = accepted.slice(1).some((item) =>
      item.providerResult.providerResultId !== first.providerResult.providerResultId
      && (
        Math.abs(item.providerResult.latitude - first.providerResult.latitude) > 0.0002
        || Math.abs(item.providerResult.longitude - first.providerResult.longitude) > 0.0002
      )
    );
    return ambiguous
      ? needsExternalAddressReview("MULTIPLE_EXACT_CANDIDATES", boundedReviewCandidates(accepted))
      : {
          status: "VERIFIED_EXACT",
          verified: first,
          reviewReason: null,
          reviewCandidates: [],
        };
  } catch {
    return needsExternalAddressReview();
  }
}

function reviewSelectionMatches(
  selected: DirectoryAddressReviewCandidate,
  verified: VerifiedDirectoryAddress,
) {
  return selected.addressFormat === verified.addressFormat
    && normalizeGeoText(selected.region) === normalizeGeoText(verified.region)
    && normalizeGeoText(selected.district) === normalizeGeoText(verified.district)
    && normalizeGeoText(selected.city) === normalizeGeoText(verified.city)
    && normalizeSlovakPostalCode(selected.postalCode) === normalizeSlovakPostalCode(verified.postalCode)
    && normalizeGeoText(selected.street) === normalizeGeoText(verified.street)
    && normalizeHouseNumberToken(selected.houseNumber) === normalizeHouseNumberToken(verified.houseNumber);
}

export async function verifyAutomationAddressReviewSelection(input: {
  candidate: DirectoryAddressReviewCandidate;
  provider?: GeocoderProvider;
  signal?: AbortSignal;
}) {
  const provider = input.provider ?? new GeoapifyGeocoder();
  if (!provider.isConfigured()) {
    throw new GeocoderProviderError("DISABLED", "Adresu sa teraz nepodarilo znovu overiť.");
  }
  const candidate = input.candidate;
  const locationOrStreet = candidate.addressFormat === "STREET" ? candidate.street : candidate.city;
  const query = [
    locationOrStreet,
    candidate.houseNumber,
    candidate.postalCode,
    candidate.city,
    candidate.district,
    candidate.region,
    "Slovensko",
  ].filter(Boolean).join(", ");
  const results = await provider.geocodeExact({
    query,
    precision: "EXACT",
    countryCode: "SK",
    structuredAddress: candidate.addressFormat === "STREET"
      ? {
          housenumber: candidate.houseNumber,
          street: candidate.street,
          postcode: candidate.postalCode,
          city: candidate.city,
          state: candidate.region,
          country: "Slovakia",
        }
      : undefined,
    signal: input.signal,
  });
  const verified = results
    .map((result) => exactExternalAddressCandidate({
      result,
      expectedStreet: candidate.addressFormat === "STREET" ? candidate.street : undefined,
      expectedHouseNumber: candidate.houseNumber,
      expectedPostalCode: candidate.postalCode,
      expectedCity: candidate.city,
    }))
    .filter((item): item is VerifiedDirectoryAddress => Boolean(item))
    .find((item) => reviewSelectionMatches(candidate, item));
  if (!verified) {
    throw new Error("automation_address_review_revalidation_changed");
  }
  return verified;
}

function splitExternalAddress(address: string, city: string) {
  const match = /^(.+?)\s+(\d+(?:\/\d+[A-Za-z]?)?)$/.exec(address.trim());
  if (!match) return null;
  const locationOrStreet = match[1].trim();
  const houseNumber = match[2].trim();
  const municipalityNumber = normalizeGeoText(locationOrStreet) === normalizeGeoText(city);
  return { locationOrStreet, houseNumber, municipalityNumber };
}

export async function verifyExternalDirectoryAddressBestEffort(input: {
  region: string;
  district: string;
  city: string;
  address: string;
  provider?: GeoapifyGeocoder;
  signal?: AbortSignal;
}): Promise<ExternalDirectoryAddressVerification> {
  try {
    const locality = requireLocality(input.region, input.district, input.city);
    const parsed = splitExternalAddress(input.address, locality.city);
    if (!parsed) return needsExternalAddressReview();

    const verified = await verifyDirectoryCanonicalAddress({
      ...locality,
      street: parsed.municipalityNumber ? "" : parsed.locationOrStreet,
      houseNumber: parsed.houseNumber,
      addressFormat: parsed.municipalityNumber ? "MUNICIPALITY_NUMBER" : "STREET",
      provider: input.provider,
      signal: input.signal,
    });
    return { status: "VERIFIED_EXACT", verified, reviewReason: null, reviewCandidates: [] };
  } catch {
    return needsExternalAddressReview();
  }
}
