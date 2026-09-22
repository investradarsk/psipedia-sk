import { eventTypes, slovakRegions, type EventType } from "./events";

export const mapCategories = ["services", "organizations", "events"] as const;
export type MapCategory = (typeof mapCategories)[number];

export const mapEntityTypes = ["service", "organization", "event"] as const;
export type MapEntityType = (typeof mapEntityTypes)[number];

export const mapEventTimings = ["active", "current", "upcoming"] as const;
export type MapEventTiming = (typeof mapEventTimings)[number];

export const mapResponseModes = ["items", "clusters"] as const;
export type MapResponseMode = (typeof mapResponseModes)[number];

export type MapBbox = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type MapItem = {
  id: string;
  entityType: MapEntityType;
  entityId: number;
  name: string;
  category: MapCategory;
  subcategory?: string;
  href: string;
  latitude: number;
  longitude: number;
  precision: "EXACT" | "NEIGHBORHOOD" | "MUNICIPALITY" | "SERVICE_AREA" | "APPROXIMATE";
  displayLocation?: string;
  city?: string;
  district?: string;
  region?: string;
  verified?: boolean;
  featured?: boolean;
  eventStart?: string;
  eventEnd?: string;
  locationRole?: "SITE" | "SERVICE_AREA" | "LEGAL_SEAT" | "UNSPECIFIED";
};

export type MapCluster = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  categoryCounts: {
    services: number;
    organizations: number;
    events: number;
  };
};

export type MapResponseMeta = {
  count: number;
  matched: number;
  truncated: boolean;
  bbox: MapBbox;
  zoom: number;
  cacheTtlSeconds: number;
  attribution?: Array<{ label: string; url?: string }>;
};

export type MapItemsResponse = {
  mode: "items";
  items: MapItem[];
  meta: MapResponseMeta;
};

export type MapClustersResponse = {
  mode: "clusters";
  clusters: MapCluster[];
  meta: MapResponseMeta;
};

export type MapResponse = MapItemsResponse | MapClustersResponse;

export type MapQueryInput = {
  bbox: MapBbox;
  zoom: number;
  category?: MapCategory;
  subcategory?: string;
  region?: string;
  district?: string;
  city?: string;
  search?: string;
  eventType?: EventType;
  eventTiming: MapEventTiming;
  limit: number;
};

export const MAP_CACHE_TTL_SECONDS = 30;
export const MAP_CACHE_STALE_SECONDS = 60;
export const MAP_DEFAULT_ITEM_LIMIT = 300;
export const MAP_MAX_ITEMS = 500;
export const MAP_MAX_CLUSTERS = 250;
export const MAP_INTERNAL_ROW_LIMIT = 5001;

const allowedParams = new Set([
  "north", "south", "east", "west", "zoom", "category", "subcategory",
  "region", "district", "city", "search", "eventType", "eventTiming", "limit",
]);

export class MapQueryValidationError extends Error {
  readonly code = "MAP_INVALID_QUERY";
}

function finiteNumber(params: URLSearchParams, key: string) {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") throw new MapQueryValidationError(`Missing ${key}.`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new MapQueryValidationError(`Invalid ${key}.`);
  return value;
}

function boundedText(params: URLSearchParams, key: string, max: number) {
  const value = params.get(key)?.trim() ?? "";
  if (!value) return undefined;
  if (value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new MapQueryValidationError(`Invalid ${key}.`);
  }
  return value;
}

export function bboxWidth(bbox: MapBbox) {
  return bbox.west <= bbox.east ? bbox.east - bbox.west : 180 - bbox.west + (bbox.east + 180);
}

export function bboxArea(bbox: MapBbox) {
  return Math.max(0, bbox.north - bbox.south) * bboxWidth(bbox);
}

export function bboxContains(bbox: MapBbox, latitude: number, longitude: number) {
  if (latitude < bbox.south || latitude > bbox.north) return false;
  return bbox.west <= bbox.east
    ? longitude >= bbox.west && longitude <= bbox.east
    : longitude >= bbox.west || longitude <= bbox.east;
}

export function mapResponseMode(query: Pick<MapQueryInput, "bbox" | "zoom">): MapResponseMode {
  const width = bboxWidth(query.bbox);
  const height = query.bbox.north - query.bbox.south;
  if (query.zoom <= 10 || width > 12 || height > 10 || bboxArea(query.bbox) > 30) return "clusters";
  return "items";
}

export function mapClusterGridSize(zoom: number) {
  if (zoom <= 6) return 1;
  if (zoom <= 8) return 0.5;
  if (zoom <= 10) return 0.2;
  return 0.1;
}

export function parseMapQuery(params: URLSearchParams): MapQueryInput {
  for (const key of params.keys()) {
    if (!allowedParams.has(key)) throw new MapQueryValidationError(`Unknown parameter: ${key}.`);
  }

  const north = finiteNumber(params, "north");
  const south = finiteNumber(params, "south");
  const east = finiteNumber(params, "east");
  const west = finiteNumber(params, "west");
  if (north < -90 || north > 90 || south < -90 || south > 90 || north <= south) {
    throw new MapQueryValidationError("Invalid latitude bounds.");
  }
  if (east < -180 || east > 180 || west < -180 || west > 180 || east === west) {
    throw new MapQueryValidationError("Invalid longitude bounds.");
  }

  const zoom = finiteNumber(params, "zoom");
  if (zoom < 3 || zoom > 20) throw new MapQueryValidationError("Invalid zoom.");

  const categoryRaw = boundedText(params, "category", 32);
  const category = categoryRaw
    ? mapCategories.find((value) => value === categoryRaw)
    : undefined;
  if (categoryRaw && !category) throw new MapQueryValidationError("Invalid category.");

  const region = boundedText(params, "region", 80);
  if (region && !(slovakRegions as readonly string[]).includes(region)) {
    throw new MapQueryValidationError("Invalid region.");
  }
  if (region === "Online") throw new MapQueryValidationError("Online is not a map region.");

  const eventTypeRaw = boundedText(params, "eventType", 80);
  const eventType = eventTypeRaw
    ? (eventTypes as readonly string[]).includes(eventTypeRaw) ? eventTypeRaw as EventType : undefined
    : undefined;
  if (eventTypeRaw && !eventType) throw new MapQueryValidationError("Invalid eventType.");

  const eventTimingRaw = boundedText(params, "eventTiming", 24) ?? "active";
  const eventTiming = mapEventTimings.find((value) => value === eventTimingRaw);
  if (!eventTiming) throw new MapQueryValidationError("Invalid eventTiming.");

  const search = boundedText(params, "search", 80);
  if (search && search.length < 2) throw new MapQueryValidationError("Search must contain at least 2 characters.");

  const limitRaw = params.get("limit");
  const limit = limitRaw === null || limitRaw.trim() === "" ? MAP_DEFAULT_ITEM_LIMIT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAP_MAX_ITEMS) {
    throw new MapQueryValidationError(`limit must be between 1 and ${MAP_MAX_ITEMS}.`);
  }

  return {
    bbox: { north, south, east, west },
    zoom,
    category,
    subcategory: boundedText(params, "subcategory", 80),
    region,
    district: boundedText(params, "district", 100),
    city: boundedText(params, "city", 100),
    search,
    eventType,
    eventTiming,
    limit,
  };
}
