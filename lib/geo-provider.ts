import type { GeoPublicPrecision } from "./geo";

export type NormalizedGeocoderResult = {
  latitude: number;
  longitude: number;
  country: string;
  countryCode: string;
  region: string;
  district: string;
  city: string;
  resultType: string;
  confidence: number | null;
  cityConfidence: number | null;
  streetConfidence: number | null;
  buildingConfidence: number | null;
  matchType: string | null;
  provider: string;
  provenance: string;
  sourceLicense: string;
  providerResultId: string | null;
  street: string;
  housenumber: string;
  postcode: string;
  formatted: string;
  addressLine1: string;
  addressLine2: string;
};

export type StructuredGeocodeAddress = {
  housenumber: string;
  street: string;
  postcode?: string;
  city?: string;
  state?: string;
  country?: string;
};

export type GeocodeRequest = {
  query: string;
  precision: GeoPublicPrecision;
  countryCode?: string;
  structuredAddress?: StructuredGeocodeAddress;
  signal?: AbortSignal;
};

export interface GeocoderProvider {
  readonly name: string;
  isConfigured(): boolean;
  geocodeExact(request: GeocodeRequest): Promise<NormalizedGeocoderResult[]>;
  geocodeApproximate(request: GeocodeRequest): Promise<NormalizedGeocoderResult[]>;
}

export class GeocoderProviderError extends Error {
  readonly code: "DISABLED" | "RATE_LIMITED" | "PROVIDER_ERROR" | "INVALID_INPUT";
  readonly retryable: boolean;
  readonly httpStatus: number | null;

  constructor(code: GeocoderProviderError["code"], message: string, options: { retryable?: boolean; httpStatus?: number | null } = {}) {
    super(message);
    this.name = "GeocoderProviderError";
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.httpStatus = options.httpStatus ?? null;
  }
}
