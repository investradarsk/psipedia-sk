import { normalizeGeoText } from "@/lib/geo";
import { GeoapifyGeocoder } from "@/lib/geoapify-geocoder";
import { type NormalizedGeocoderResult } from "@/lib/geo-provider";
import { normalizeSlovakPostalCode } from "@/lib/directory-service-address";
import { resolveSlovakLocation } from "@/lib/slovakia-locations";

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

export type ExternalDirectoryAddressVerification = {
  status: "VERIFIED_EXACT" | "NEEDS_REVIEW";
  verified: VerifiedDirectoryAddress | null;
};

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
    if (!parsed) return { status: "NEEDS_REVIEW", verified: null };

    const verified = await verifyDirectoryCanonicalAddress({
      ...locality,
      street: parsed.municipalityNumber ? "" : parsed.locationOrStreet,
      houseNumber: parsed.houseNumber,
      addressFormat: parsed.municipalityNumber ? "MUNICIPALITY_NUMBER" : "STREET",
      provider: input.provider,
      signal: input.signal,
    });
    return { status: "VERIFIED_EXACT", verified };
  } catch {
    return { status: "NEEDS_REVIEW", verified: null };
  }
}
