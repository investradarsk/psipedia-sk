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

type GeoapifyResponse = { results?: GeoapifyResult[] };

const GEOAPIFY_ENDPOINT = "https://api.geoapify.com/v1/geocode/search";
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
    city: result.city ?? "",
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
    url.searchParams.set("text", query);
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
      return (body.results ?? []).map(normalizeResult).filter((item): item is NormalizedGeocoderResult => item !== null);
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
}
