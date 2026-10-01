import { env } from "cloudflare:workers";
import type { GooglePlaceCandidate } from "@/lib/google-place-matching";

type GooglePlacesBindings = { GOOGLE_PLACES_API_KEY?: string };

export const GOOGLE_PLACES_TEXT_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
export const GOOGLE_PLACES_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents";

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlacesResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    addressComponents?: GoogleAddressComponent[];
  }>;
};

export class GooglePlacesProviderError extends Error {
  readonly code: "DISABLED" | "RATE_LIMITED" | "PROVIDER_ERROR" | "AUTH" | "INVALID_RESPONSE";
  readonly httpStatus?: number;

  constructor(
    code: "DISABLED" | "RATE_LIMITED" | "PROVIDER_ERROR" | "AUTH" | "INVALID_RESPONSE",
    message: string,
    httpStatus?: number,
  ) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function googlePlacesApiKey(bindings?: GooglePlacesBindings) {
  return bindings?.GOOGLE_PLACES_API_KEY ?? (env as unknown as GooglePlacesBindings).GOOGLE_PLACES_API_KEY ?? "";
}

export function validGooglePlaceId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = value.trim();
  return id.length > 0 && id.length <= 255 && !/[\u0000-\u001f\u007f]/.test(id);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addressComponent(
  components: GoogleAddressComponent[] | undefined,
  ...types: string[]
) {
  const items = Array.isArray(components) ? components : [];
  for (const type of types) {
    const match = items.find((item) => Array.isArray(item?.types) && item.types.includes(type));
    if (match?.longText?.trim() || match?.shortText?.trim()) return match;
  }
  return undefined;
}

function structuredAddress(place: NonNullable<GooglePlacesResponse["places"]>[number]) {
  const components = place.addressComponents;
  const country = addressComponent(components, "country");
  return {
    street: addressComponent(components, "route")?.longText?.trim() ?? "",
    houseNumber: addressComponent(components, "street_number")?.longText?.trim() ?? "",
    postalCode: addressComponent(components, "postal_code")?.longText?.trim() ?? "",
    locality: addressComponent(components, "locality", "postal_town")?.longText?.trim() ?? "",
    sublocality: addressComponent(components, "sublocality_level_1", "sublocality")?.longText?.trim() ?? "",
    district: addressComponent(components, "administrative_area_level_2")?.longText?.trim() ?? "",
    region: addressComponent(components, "administrative_area_level_1")?.longText?.trim() ?? "",
    countryCode: country?.shortText?.trim().toUpperCase() ?? "",
  };
}

export async function searchGooglePlacesText(input: {
  query: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const query = input.query.trim();
  if (!query || query.length > 500) throw new GooglePlacesProviderError("INVALID_RESPONSE", "Google Places query je neplatný.");
  const apiKey = input.apiKey ?? googlePlacesApiKey();
  if (!apiKey) throw new GooglePlacesProviderError("DISABLED", "GOOGLE_PLACES_API_KEY nie je nakonfigurovaný.");
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1_000, Math.min(12_000, input.timeoutMs ?? 7_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(GOOGLE_PLACES_TEXT_SEARCH_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
        },
        body: JSON.stringify({ textQuery: query, languageCode: "sk", regionCode: "SK", maxResultCount: 5 }),
      });
    } catch (error) {
      throw new GooglePlacesProviderError("PROVIDER_ERROR", controller.signal.aborted ? "Google Places request vypršal." : (error instanceof Error ? error.message : "Google Places request zlyhal."));
    }
    if (response.status === 429) throw new GooglePlacesProviderError("RATE_LIMITED", "Google Places rate limit.", 429);
    if (response.status === 401 || response.status === 403) throw new GooglePlacesProviderError("AUTH", "Google Places autorizácia zlyhala.", response.status);
    if (response.status >= 500) throw new GooglePlacesProviderError("PROVIDER_ERROR", "Google Places je dočasne nedostupný.", response.status);
    if (!response.ok) throw new GooglePlacesProviderError("INVALID_RESPONSE", `Google Places odmietol request HTTP ${response.status}.`, response.status);

    const body = await response.json() as GooglePlacesResponse;
    const candidates: GooglePlaceCandidate[] = [];
    for (const place of body.places ?? []) {
      if (!validGooglePlaceId(place.id) || !finite(place.location?.latitude) || !finite(place.location?.longitude)) continue;
      candidates.push({
        id: place.id.trim(),
        displayName: place.displayName?.text?.trim() ?? "",
        formattedAddress: place.formattedAddress?.trim() ?? "",
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        address: structuredAddress(place),
      });
    }
    return candidates.slice(0, 5);
  } finally {
    clearTimeout(timeout);
  }
}
