import { env } from "cloudflare:workers";
import type { GeocoderProvider, GeocodeRequest, NormalizedGeocoderResult } from "./geo-provider";
import { GeocoderProviderError } from "./geo-provider";

type GeoapifyBindings = { GEOAPIFY_API_KEY?: string };

type GeoapifyResult = {
  lat?: number;
  lon?: number;
  country?: string;
  country_code?: string;
  state?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  result_type?: string;
  place_id?: string;
  rank?: {
    confidence?: number;
    confidence_city_level?: number;
    confidence_street_level?: number;
    confidence_building_level?: number;
    match_type?: string;
  };
  datasource?: {
    sourcename?: string;
    attribution?: string;
    license?: string;
    url?: string;
  };
};

type GeoapifyResponse = {
  results?: GeoapifyResult[];
  features?: Array<{ properties?: GeoapifyResult }>;
};

const GEOAPIFY_ENDPOINT = "https://api.geoapify.com/v1/geocode/search";
const GEOAPIFY_AUTOCOMPLETE_ENDPOINT = "https://api.geoapify.com/v1/geocode/autocomplete";
const GEOAPIFY_PLACE_DETAILS_ENDPOINT = "https://api.geoapify.com/v2/place-details";
const DEFAULT_TIMEOUT_MS = 8_000;

export function geoapifyApiKey(bindings?: GeoapifyBindings) {
  return bindings?.GEOAPIFY_API_KEY ?? (env as unknown as GeoapifyBindings).GEOAPIFY_API_KEY ?? "";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeResult(result: GeoapifyResult): NormalizedGeocoderResult | null {
  if (!finite(result.lat) || !finite(result.lon)) return null;
  const datasource = result.datasource;
  return {
    latitude: result.lat,
    longitude: result.lon,
    country: result.country ?? "",
    countryCode: (result.country_code ?? "").toUpperCase(),
    region: result.state ?? "",
    district: result.county ?? "",
    city: result.city ?? result.town ?? result.village ?? result.municipality ?? "",
    street: result.street ?? "",
    housenumber: result.housenumber ?? "",
    postcode: result.postcode ?? "",
    formatted: result.formatted ?? "",
    addressLine1: result.address_line1 ?? "",
    addressLine2: result.address_line2 ?? "",
    resultType: result.result_type ?? "unknown",
    confidence: finite(result.rank?.confidence) ? result.rank!.confidence! : null,
    cityConfidence: finite(result.rank?.confidence_city_level) ? result.rank!.confidence_city_level! : null,
    streetConfidence: finite(result.rank?.confidence_street_level) ? result.rank!.confidence_street_level! : null,
    buildingConfidence: finite(result.rank?.confidence_building_level) ? result.rank!.confidence_building_level! : null,
    matchType: result.rank?.match_type ?? null,
    provider: "geoapify",
    provenance: datasource?.sourcename ?? "Geoapify Geocoding API",
    sourceLicense: [datasource?.attribution, datasource?.license, datasource?.url].filter(Boolean).join(" · "),
    providerResultId: result.place_id ?? null,
  };
}

export class GeoapifyGeocoder implements GeocoderProvider {
  readonly name = "geoapify";
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number; bindings?: GeoapifyBindings } = {}) {
    this.apiKey = options.apiKey ?? geoapifyApiKey(options.bindings);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1_000, Math.min(20_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  private async search(request: GeocodeRequest, approximate: boolean) {
    const query = request.query.trim();
    if (!query) throw new GeocoderProviderError("INVALID_INPUT", "Geocoding query is empty.");
    if (!this.apiKey) throw new GeocoderProviderError("DISABLED", "Geoapify provider is not configured.");

    const url = new URL(GEOAPIFY_ENDPOINT);
    const structured = !approximate ? request.structuredAddress : undefined;
    if (structured?.street && structured.housenumber) {
      url.searchParams.set("housenumber", structured.housenumber);
      url.searchParams.set("street", structured.street);
      if (structured.postcode) url.searchParams.set("postcode", structured.postcode);
      if (structured.city) url.searchParams.set("city", structured.city);
      if (structured.state) url.searchParams.set("state", structured.state);
      if (structured.country) url.searchParams.set("country", structured.country);
    } else {
      url.searchParams.set("text", query);
    }
    url.searchParams.set("format", "json");
    url.searchParams.set("lang", "sk");
    url.searchParams.set("limit", "5");
    url.searchParams.set("filter", `countrycode:${(request.countryCode || "SK").toLowerCase()}`);
    if (approximate && (request.precision === "MUNICIPALITY" || request.precision === "SERVICE_AREA")) {
      url.searchParams.set("type", "city");
    }
    url.searchParams.set("apiKey", this.apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const relayAbort = () => controller.abort();
    request.signal?.addEventListener("abort", relayAbort, { once: true });
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method: "GET", signal: controller.signal, headers: { accept: "application/json" } });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new GeocoderProviderError("PROVIDER_ERROR", "Geoapify request timed out or was aborted.", { retryable: true });
        }
        throw new GeocoderProviderError("PROVIDER_ERROR", error instanceof Error ? error.message : "Geoapify request failed.", { retryable: true });
      }

      if (response.status === 429) {
        throw new GeocoderProviderError("RATE_LIMITED", "Geoapify rate limit reached.", { retryable: true, httpStatus: 429 });
      }
      if (response.status >= 500) {
        throw new GeocoderProviderError("PROVIDER_ERROR", "Geoapify is temporarily unavailable.", { retryable: true, httpStatus: response.status });
      }
      if (!response.ok) {
        throw new GeocoderProviderError("INVALID_INPUT", `Geoapify rejected the request with HTTP ${response.status}.`, { httpStatus: response.status });
      }

      const body = await response.json() as GeoapifyResponse;
      const rawResults = body.results ?? body.features?.map((feature) => feature.properties ?? {}) ?? [];
      return rawResults.map(normalizeResult).filter((item): item is NormalizedGeocoderResult => item !== null);
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", relayAbort);
    }
  }

  geocodeExact(request: GeocodeRequest) {
    return this.search(request, false);
  }

  geocodeApproximate(request: GeocodeRequest) {
    return this.search(request, true);
  }

  async autocomplete(input: { query: string; region: string; district: string; city: string; signal?: AbortSignal }) {
    const query = input.query.trim();
    if (query.length < 3 || query.length > 160) throw new GeocoderProviderError("INVALID_INPUT", "Autocomplete query must contain 3 to 160 characters.");
    if (!this.apiKey) throw new GeocoderProviderError("DISABLED", "Geoapify provider is not configured.");
    const url = new URL(GEOAPIFY_AUTOCOMPLETE_ENDPOINT);
    url.searchParams.set("text", `${query}, ${input.city}, ${input.district}, ${input.region}, Slovensko`);
    url.searchParams.set("format", "json");
    url.searchParams.set("lang", "sk");
    url.searchParams.set("limit", "5");
    url.searchParams.set("filter", "countrycode:sk");
    url.searchParams.set("apiKey", this.apiKey);
    return this.fetchResults(url, input.signal);
  }

  async lookupPlace(providerResultId: string, signal?: AbortSignal) {
    const id = providerResultId.trim();
    if (!id || id.length > 300) throw new GeocoderProviderError("INVALID_INPUT", "Geoapify place id is invalid.");
    if (!this.apiKey) throw new GeocoderProviderError("DISABLED", "Geoapify provider is not configured.");
    const url = new URL(GEOAPIFY_PLACE_DETAILS_ENDPOINT);
    url.searchParams.set("id", id);
    url.searchParams.set("features", "details");
    url.searchParams.set("lang", "sk");
    url.searchParams.set("apiKey", this.apiKey);
    return this.fetchResults(url, signal);
  }

  private async fetchResults(url: URL, signal?: AbortSignal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const relayAbort = () => controller.abort();
    signal?.addEventListener("abort", relayAbort, { once: true });
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method: "GET", signal: controller.signal, headers: { accept: "application/json" } });
      } catch (error) {
        if (controller.signal.aborted) throw new GeocoderProviderError("PROVIDER_ERROR", "Geoapify request timed out or was aborted.", { retryable: true });
        throw new GeocoderProviderError("PROVIDER_ERROR", error instanceof Error ? error.message : "Geoapify request failed.", { retryable: true });
      }
      if (response.status === 429) throw new GeocoderProviderError("RATE_LIMITED", "Geoapify rate limit reached.", { retryable: true, httpStatus: 429 });
      if (response.status >= 500) throw new GeocoderProviderError("PROVIDER_ERROR", "Geoapify is temporarily unavailable.", { retryable: true, httpStatus: response.status });
      if (!response.ok) throw new GeocoderProviderError("INVALID_INPUT", `Geoapify rejected the request with HTTP ${response.status}.`, { httpStatus: response.status });
      const body = await response.json() as GeoapifyResponse;
      return (body.results ?? []).map(normalizeResult).filter((item): item is NormalizedGeocoderResult => item !== null);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", relayAbort);
    }
  }
}
