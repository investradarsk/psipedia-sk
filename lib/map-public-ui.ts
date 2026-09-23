import type {
  MapBbox,
  MapCategory,
  MapEventTiming,
  MapItem,
  MapQueryInput,
} from "./map-contract";

export const MAP_DEFAULT_CENTER = { lat: 48.669, lng: 19.699 } as const;
export const MAP_DEFAULT_ZOOM = 7;
export const MAP_DEFAULT_BBOX: MapBbox = {
  north: 49.62,
  south: 47.72,
  east: 22.57,
  west: 16.83,
};
export const MAP_FETCH_DEBOUNCE_MS = 280;

export type MapUiFilters = {
  category: MapCategory | "";
  subcategory: string;
  region: string;
  district: string;
  city: string;
  search: string;
  eventType: string;
  eventTiming: MapEventTiming;
};

export type MapViewport = {
  bbox: MapBbox;
  zoom: number;
  center: { lat: number; lng: number };
};

export const EMPTY_MAP_FILTERS: MapUiFilters = {
  category: "",
  subcategory: "",
  region: "",
  district: "",
  city: "",
  search: "",
  eventType: "",
  eventTiming: "active",
};

const shareableKeys = [
  "category",
  "subcategory",
  "region",
  "district",
  "city",
  "search",
  "eventType",
  "eventTiming",
] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validCategory(value: string): MapUiFilters["category"] {
  return value === "services" || value === "organizations" || value === "events" ? value : "";
}

function validTiming(value: string): MapEventTiming {
  return value === "current" || value === "upcoming" ? value : "active";
}

export function parseMapUiFilters(
  params: Record<string, string | string[] | undefined>,
): MapUiFilters {
  return {
    category: validCategory(first(params.category)),
    subcategory: first(params.subcategory).slice(0, 80),
    region: first(params.region).slice(0, 80),
    district: first(params.district).slice(0, 100),
    city: first(params.city).slice(0, 100),
    search: first(params.search).slice(0, 80),
    eventType: first(params.eventType).slice(0, 80),
    eventTiming: validTiming(first(params.eventTiming)),
  };
}

export function serializeMapUiFilters(filters: MapUiFilters) {
  const params = new URLSearchParams();
  for (const key of shareableKeys) {
    const value = filters[key];
    if (!value) continue;
    if (key === "eventTiming" && value === "active") continue;
    params.set(key, value);
  }
  return params;
}

export function mapFiltersFromSearchParams(searchParams: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const key of shareableKeys) {
    const value = searchParams.get(key);
    if (value) raw[key] = value;
  }
  return parseMapUiFilters(raw);
}

export function mapFiltersForCategory(filters: MapUiFilters, category: MapUiFilters["category"]) {
  return {
    ...filters,
    category,
    subcategory: category === "services" ? filters.subcategory : "",
    eventType: category === "events" ? filters.eventType : "",
    eventTiming: category === "events" ? filters.eventTiming : "active",
  } satisfies MapUiFilters;
}

export function mapFiltersForRegion(filters: MapUiFilters, region: string) {
  return { ...filters, region, district: "", city: "" };
}

export function mapFiltersForDistrict(filters: MapUiFilters, district: string) {
  return { ...filters, district, city: "" };
}

export function buildMapApiUrl(viewport: Pick<MapViewport, "bbox" | "zoom">, filters: MapUiFilters) {
  const params = new URLSearchParams({
    north: String(viewport.bbox.north),
    south: String(viewport.bbox.south),
    east: String(viewport.bbox.east),
    west: String(viewport.bbox.west),
    zoom: String(viewport.zoom),
  });
  if (filters.category) params.set("category", filters.category);
  if (filters.subcategory) params.set("subcategory", filters.subcategory);
  if (filters.region) params.set("region", filters.region);
  if (filters.district) params.set("district", filters.district);
  if (filters.city) params.set("city", filters.city);
  if (filters.search.trim().length >= 2) params.set("search", filters.search.trim());
  if (filters.eventType) params.set("eventType", filters.eventType);
  if (filters.eventTiming !== "active") params.set("eventTiming", filters.eventTiming);
  return `/api/map?${params.toString()}`;
}

export function isApproximateMapItem(item: Pick<MapItem, "precision">) {
  return item.precision !== "EXACT";
}

export function mapItemTypeLabel(item: Pick<MapItem, "entityType" | "subcategory">) {
  if (item.entityType === "event") return item.subcategory || "Podujatie";
  if (item.entityType === "organization") return "Organizácia";
  return item.subcategory || "Služba";
}

export function mapResultLabel(count: number) {
  if (count === 1) return "1 výsledok";
  if (count >= 2 && count <= 4) return `${count} výsledky`;
  return `${count} výsledkov`;
}

export function normalizeMapViewport(input: Partial<MapViewport>): MapViewport {
  const zoom = Number.isFinite(input.zoom) ? Math.max(3, Math.min(20, Math.round(input.zoom!))) : MAP_DEFAULT_ZOOM;
  const center = input.center && Number.isFinite(input.center.lat) && Number.isFinite(input.center.lng)
    ? input.center
    : MAP_DEFAULT_CENTER;
  const bbox = input.bbox && [input.bbox.north, input.bbox.south, input.bbox.east, input.bbox.west].every(Number.isFinite)
    ? input.bbox
    : MAP_DEFAULT_BBOX;
  return { zoom, center, bbox };
}

export function mapRequestSignature(viewport: Pick<MapViewport, "bbox" | "zoom">, filters: MapUiFilters) {
  return buildMapApiUrl(viewport, filters);
}

export function mapQueryInputPreview(viewport: Pick<MapViewport, "bbox" | "zoom">, filters: MapUiFilters): Partial<MapQueryInput> {
  return {
    bbox: viewport.bbox,
    zoom: viewport.zoom,
    category: filters.category || undefined,
    subcategory: filters.subcategory || undefined,
    region: filters.region || undefined,
    district: filters.district || undefined,
    city: filters.city || undefined,
    search: filters.search.trim().length >= 2 ? filters.search.trim() : undefined,
    eventType: filters.eventType as MapQueryInput["eventType"] || undefined,
    eventTiming: filters.eventTiming,
  };
}
