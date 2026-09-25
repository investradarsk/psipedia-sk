import { normalizeGeoText } from "@/lib/geo";
import { GeoapifyGeocoder } from "@/lib/geoapify-geocoder";
import { GeocoderProviderError, type NormalizedGeocoderResult } from "@/lib/geo-provider";
import { normalizeSlovakPostalCode } from "@/lib/directory-service-address";
import { resolveSlovakLocation } from "@/lib/slovakia-locations";

const SK_POSTCODE = /^\d{3}\s?\d{2}$/;

export type DirectoryAddressSuggestion = {
  providerResultId: string;
  formatted: string;
  addressLine1: string;
  addressLine2: string;
  street: string;
  houseNumber: string;
  postalCode: string;
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

function safeSuggestion(result: NormalizedGeocoderResult): DirectoryAddressSuggestion | null {
  if (!result.providerResultId || result.countryCode !== "SK") return null;
  return {
    providerResultId: result.providerResultId,
    formatted: result.formatted ?? "",
    addressLine1: result.addressLine1 ?? "",
    addressLine2: result.addressLine2 ?? "",
    street: result.street ?? "",
    houseNumber: result.housenumber ?? "",
    postalCode: normalizeSlovakPostalCode(result.postcode),
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
  if (query.length < 3) throw new Error("Napíš aspoň 3 znaky adresy.");
  if (query.length > 160) throw new Error("Adresa je príliš dlhá.");
  const provider = input.provider ?? new GeoapifyGeocoder();
  const results = await provider.autocomplete({ ...locality, query, signal: input.signal });
  return results
    .filter((result) => result.countryCode === "SK")
    .filter((result) => localityMatches(locality.city, result.city || result.district))
    .filter((result) => !result.region || localityMatches(locality.region, result.region))
    .filter((result) => !result.district || localityMatches(locality.district, result.district))
    .map(safeSuggestion)
    .filter((item): item is DirectoryAddressSuggestion => Boolean(item))
    .slice(0, 5);
}

export function verifyDirectoryExactCandidates(input: {
  region: string;
  district: string;
  city: string;
  results: NormalizedGeocoderResult[];
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
    return buildingType && Boolean(result.housenumber) && validPostcode
      && cityOk && regionOk && districtOk && confidenceOk && streetOk;
  });

  if (!accepted.length) throw new Error("Geoapify nepotvrdil presnú adresu domu s dostatočnou istotou.");
  if (accepted.length > 1) {
    const first = accepted[0];
    const ambiguous = accepted.slice(1).some((item) =>
      item.providerResultId !== first.providerResultId
      && (Math.abs(item.latitude - first.latitude) > 0.0002 || Math.abs(item.longitude - first.longitude) > 0.0002),
    );
    if (ambiguous) throw new Error("Adresa je nejednoznačná. Vyber presnejší návrh.");
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

export async function verifyDirectoryAddressSelection(input: {
  region: string;
  district: string;
  city: string;
  providerResultId: string;
  provider?: GeoapifyGeocoder;
  signal?: AbortSignal;
}) {
  const providerResultId = input.providerResultId.trim();
  if (!providerResultId) throw new Error("Vyber konkrétnu adresu z návrhov.");
  const provider = input.provider ?? new GeoapifyGeocoder();
  try {
    const details = await provider.lookupPlace(providerResultId, input.signal);
    const selected = details.find((result) => result.providerResultId === providerResultId) ?? null;
    if (!selected || !selected.housenumber || !selected.postcode) {
      throw new Error("Vybraný Geoapify výsledok nemá kompletnú adresu domu.");
    }
    const query = selected.formatted || [selected.street, selected.housenumber, input.city].filter(Boolean).join(" ");
    const results = await provider.geocodeExact({
      query,
      precision: "EXACT",
      countryCode: "SK",
      structuredAddress: {
        housenumber: selected.housenumber ?? "",
        street: selected.street ?? "",
        postcode: selected.postcode,
        city: input.city,
        state: input.region,
        country: "Slovakia",
      },
      signal: input.signal,
    });
    const selectedResults = results.filter((result) => result.providerResultId === providerResultId);
    const verified = verifyDirectoryExactCandidates({
      ...input,
      results: selectedResults.length ? selectedResults : results,
    });
    if (verified.providerResult.providerResultId !== providerResultId) {
      throw new Error("Vybraný Geoapify výsledok sa pri serverovom overení zmenil. Vyber adresu znovu.");
    }
    return verified;
  } catch (error) {
    if (error instanceof GeocoderProviderError) throw error;
    throw error;
  }
}
