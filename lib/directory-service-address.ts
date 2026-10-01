import { resolveSlovakLocation } from "@/lib/slovakia-locations";

export const directoryAddressFormats = ["STREET", "MUNICIPALITY_NUMBER"] as const;
export type DirectoryAddressFormat = (typeof directoryAddressFormats)[number];

export const directoryServiceAddressConfirmations = [
  "CONFIRMED_SERVICE_LOCATION",
  "LEGACY_UNCONFIRMED",
] as const;
export type DirectoryServiceAddressConfirmation = (typeof directoryServiceAddressConfirmations)[number];

export const directoryServiceAddressStates = ["COMPLETE", "INCOMPLETE", "MISSING", "NEEDS_REVIEW"] as const;
export type DirectoryServiceAddressState = (typeof directoryServiceAddressStates)[number];

export type DirectoryServiceAddress = {
  region: string;
  district: string;
  city: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: DirectoryAddressFormat | "";
  serviceAddressConfirmation: DirectoryServiceAddressConfirmation;
  online?: boolean;
};

export type DirectoryServiceAddressEvaluation = {
  state: DirectoryServiceAddressState;
  reason:
    | "COMPLETE"
    | "MISSING"
    | "LOCALITY_INCOMPLETE"
    | "LOCALITY_INVALID"
    | "POSTAL_CODE_MISSING"
    | "POSTAL_CODE_INVALID"
    | "ADDRESS_FORMAT_MISSING"
    | "STREET_MISSING"
    | "HOUSE_NUMBER_MISSING"
    | "NUMBERLESS_PLACE"
    | "STREET_NOT_ALLOWED"
    | "LEGACY_UNCONFIRMED"
    | "ONLINE_ONLY"
    | "ONLINE_SENTINEL_CONFLICT";
  normalizedPostalCode: string;
  formattedAddress: string | null;
};

const ONLINE_SENTINEL = /^online$/i;
const SK_POSTAL_CODE = /^\d{3}\s?\d{2}$/;

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeSemanticText(value: string | null | undefined) {
  return clean(value).replace(/\s+/g, " ").toLocaleLowerCase("sk-SK");
}

export function directoryAddressTextSemanticallyEqual(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return normalizeSemanticText(left) === normalizeSemanticText(right);
}

type DirectoryCanonicalAddressFields = Pick<
  DirectoryServiceAddress,
  "region" | "district" | "city" | "postalCode" | "street" | "houseNumber" | "addressFormat"
>;

export function directoryCanonicalAddressSemanticallyEqual(
  current: DirectoryCanonicalAddressFields,
  persisted: DirectoryCanonicalAddressFields,
) {
  return directoryAddressTextSemanticallyEqual(current.region, persisted.region)
    && directoryAddressTextSemanticallyEqual(current.district, persisted.district)
    && directoryAddressTextSemanticallyEqual(current.city, persisted.city)
    && normalizeSlovakPostalCode(current.postalCode) === normalizeSlovakPostalCode(persisted.postalCode)
    && directoryAddressTextSemanticallyEqual(current.street, persisted.street)
    && directoryAddressTextSemanticallyEqual(current.houseNumber, persisted.houseNumber)
    && current.addressFormat === persisted.addressFormat;
}

export function applyDirectoryStreetSelection(
  current: DirectoryCanonicalAddressFields,
  suggestion: {
    providerResultId: string;
    street: string;
    city: string;
    district: string;
    region: string;
  },
) {
  const sameLocality = directoryAddressTextSemanticallyEqual(current.region, suggestion.region || current.region)
    && directoryAddressTextSemanticallyEqual(current.district, suggestion.district || current.district)
    && directoryAddressTextSemanticallyEqual(current.city, suggestion.city || current.city);
  const sameStreet = sameLocality && directoryAddressTextSemanticallyEqual(current.street, suggestion.street);

  return {
    addressProviderResultId: suggestion.providerResultId,
    postalCode: sameStreet ? current.postalCode : "",
    street: suggestion.street.trim(),
    houseNumber: sameStreet ? current.houseNumber : "",
    addressFormat: sameStreet ? current.addressFormat : "STREET" as const,
    sameStreet,
  };
}

function isOnlineSentinel(value: string | null | undefined) {
  return ONLINE_SENTINEL.test(clean(value));
}

export function normalizeSlovakPostalCode(value: string | null | undefined) {
  const compact = clean(value).replace(/\s+/g, "");
  return /^\d{5}$/.test(compact) ? `${compact.slice(0, 3)} ${compact.slice(3)}` : clean(value);
}

export function formatDirectoryServiceAddress(input: Pick<
  DirectoryServiceAddress,
  "city" | "postalCode" | "street" | "houseNumber" | "addressFormat"
>) {
  const city = clean(input.city);
  const postalCode = normalizeSlovakPostalCode(input.postalCode);
  const street = clean(input.street);
  const houseNumber = clean(input.houseNumber);
  if (!city || !postalCode || !input.addressFormat) return null;
  if (input.addressFormat === "STREET" && !street) return null;
  if (input.addressFormat === "MUNICIPALITY_NUMBER" && !houseNumber) return null;

  const firstLine = input.addressFormat === "STREET"
    ? [street, houseNumber].filter(Boolean).join(" ")
    : [city, houseNumber].filter(Boolean).join(" ");
  if (!firstLine) return null;
  return `${firstLine}\n${postalCode} ${city}`;
}

export function evaluateDirectoryServiceAddress(input: DirectoryServiceAddress): DirectoryServiceAddressEvaluation {
  const region = clean(input.region);
  const district = clean(input.district);
  const city = clean(input.city);
  const postalCode = clean(input.postalCode);
  const street = clean(input.street);
  const houseNumber = clean(input.houseNumber);
  const addressFormat = input.addressFormat;
  const confirmation = input.serviceAddressConfirmation;

  const locationValues = [region, district, city, postalCode, street, houseNumber];
  const hasPhysicalAddressData = locationValues.some(Boolean);
  const hasOnlineSentinel = [region, district, city, street, houseNumber].some(isOnlineSentinel);
  const nonOnlinePhysicalValues = locationValues.filter((value) => value && !isOnlineSentinel(value));

  if (hasOnlineSentinel && nonOnlinePhysicalValues.length > 0) {
    return { state: "NEEDS_REVIEW", reason: "ONLINE_SENTINEL_CONFLICT", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  if ((input.online || hasOnlineSentinel) && nonOnlinePhysicalValues.length === 0) {
    return { state: "MISSING", reason: "ONLINE_ONLY", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  if (!hasPhysicalAddressData && !addressFormat) {
    return { state: "MISSING", reason: input.online ? "ONLINE_ONLY" : "MISSING", normalizedPostalCode: "", formattedAddress: null };
  }

  if (!region || !district || !city) {
    return { state: "INCOMPLETE", reason: "LOCALITY_INCOMPLETE", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  if (!resolveSlovakLocation({ region, district, city })) {
    return { state: "NEEDS_REVIEW", reason: "LOCALITY_INVALID", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  if (confirmation !== "CONFIRMED_SERVICE_LOCATION") {
    return { state: "NEEDS_REVIEW", reason: "LEGACY_UNCONFIRMED", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  if (!postalCode) {
    return { state: "INCOMPLETE", reason: "POSTAL_CODE_MISSING", normalizedPostalCode: "", formattedAddress: null };
  }
  if (!SK_POSTAL_CODE.test(postalCode)) {
    return { state: "NEEDS_REVIEW", reason: "POSTAL_CODE_INVALID", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  if (!addressFormat) {
    return { state: "INCOMPLETE", reason: "ADDRESS_FORMAT_MISSING", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  if (addressFormat === "STREET" && !street) {
    return { state: "INCOMPLETE", reason: "STREET_MISSING", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  if (addressFormat === "MUNICIPALITY_NUMBER" && street) {
    return { state: "NEEDS_REVIEW", reason: "STREET_NOT_ALLOWED", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  if (addressFormat === "MUNICIPALITY_NUMBER" && !houseNumber) {
    return { state: "INCOMPLETE", reason: "HOUSE_NUMBER_MISSING", normalizedPostalCode: normalizeSlovakPostalCode(postalCode), formattedAddress: null };
  }

  const normalizedPostalCode = normalizeSlovakPostalCode(postalCode);
  const formattedAddress = formatDirectoryServiceAddress({
    city,
    postalCode: normalizedPostalCode,
    street,
    houseNumber,
    addressFormat,
  });
  if (!formattedAddress) {
    return { state: "INCOMPLETE", reason: "HOUSE_NUMBER_MISSING", normalizedPostalCode, formattedAddress: null };
  }
  if (addressFormat === "STREET" && !houseNumber) {
    return { state: "COMPLETE", reason: "NUMBERLESS_PLACE", normalizedPostalCode, formattedAddress };
  }
  return { state: "COMPLETE", reason: "COMPLETE", normalizedPostalCode, formattedAddress };
}

export function directoryAddressQualityWarning(
  input: DirectoryServiceAddress,
  publicAddress = "",
) {
  const evaluation = evaluateDirectoryServiceAddress(input);
  const hasEditorialAddress = Boolean(publicAddress.trim());

  if (evaluation.reason === "COMPLETE") return null;
  if (evaluation.reason === "NUMBERLESS_PLACE") {
    return "Presná mapa zatiaľ nie je potvrdená.";
  }
  if (evaluation.reason === "LOCALITY_INVALID") {
    return "Lokalita nie je v našom zozname.";
  }
  if (evaluation.reason === "LOCALITY_INCOMPLETE") {
    return hasEditorialAddress ? "Adresa nie je technicky potvrdená." : "Lokalita nie je kompletná.";
  }
  if (evaluation.reason === "POSTAL_CODE_MISSING") {
    return "PSČ nie je vyplnené.";
  }
  if (evaluation.reason === "POSTAL_CODE_INVALID") {
    return "PSČ sa nepodarilo potvrdiť.";
  }
  if (evaluation.reason === "ADDRESS_FORMAT_MISSING") {
    return "Formát adresy nie je technicky potvrdený.";
  }
  if (evaluation.reason === "STREET_MISSING") {
    return "Ulica nie je technicky potvrdená.";
  }
  if (evaluation.reason === "HOUSE_NUMBER_MISSING") {
    return "Číslo domu nie je technicky potvrdené.";
  }
  if (evaluation.reason === "STREET_NOT_ALLOWED") {
    return "Ulica nebola potvrdená providerom.";
  }
  if (evaluation.reason === "LEGACY_UNCONFIRMED") {
    return "Adresa nie je potvrdená.";
  }
  if (evaluation.reason === "ONLINE_SENTINEL_CONFLICT") {
    return "Lokalita obsahuje konflikt s online označením.";
  }
  if (evaluation.reason === "ONLINE_ONLY") {
    return hasEditorialAddress ? "Adresa nie je technicky potvrdená." : null;
  }
  if (evaluation.reason === "MISSING") {
    return hasEditorialAddress ? "Adresa nie je technicky potvrdená." : "Chýbajú technické lokalizačné údaje.";
  }
  return "Adresa nie je technicky potvrdená.";
}

export function directoryCanonicalPublicAddress(input: DirectoryServiceAddress) {
  const evaluation = evaluateDirectoryServiceAddress(input);
  return evaluation.state === "COMPLETE" ? evaluation.formattedAddress : null;
}

export function directoryNumberlessPlaceCandidate(input: DirectoryServiceAddress) {
  const evaluation = evaluateDirectoryServiceAddress(input);
  return evaluation.state === "COMPLETE" && evaluation.reason === "NUMBERLESS_PLACE"
    ? {
        publicVisibility: "EXACT_PUBLIC" as const,
        publicPrecision: "EXACT" as const,
        formattedAddress: evaluation.formattedAddress!,
      }
    : null;
}

export function directoryExactGeoCandidate(input: DirectoryServiceAddress) {
  const evaluation = evaluateDirectoryServiceAddress(input);
  return evaluation.state === "COMPLETE" && evaluation.reason === "COMPLETE"
    ? {
        publicVisibility: "EXACT_PUBLIC" as const,
        publicPrecision: "EXACT" as const,
        formattedAddress: evaluation.formattedAddress!,
      }
    : null;
}
