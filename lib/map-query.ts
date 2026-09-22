import { env } from "cloudflare:workers";
import { bratislavaDateKey, eventDateTimeIso } from "./events";
import { isGeoSchemaAvailable } from "./geo-store";
import { normalizeDirectorySearchText, sqlNormalizedExpression } from "./directory-store";
import {
  MAP_CACHE_TTL_SECONDS,
  MAP_INTERNAL_ROW_LIMIT,
  MAP_MAX_CLUSTERS,
  bboxContains,
  mapClusterGridSize,
  mapResponseMode,
  type MapCategory,
  type MapCluster,
  type MapItem,
  type MapQueryInput,
  type MapResponse,
} from "./map-contract";

type MapBindings = { DB?: D1Database };
export type MapD1Database = Pick<D1Database, "prepare">;

export class MapGeoUnavailableError extends Error {
  readonly code = "MAP_GEO_UNAVAILABLE";
}

export type MapCandidate = {
  geoPointId: number;
  entityType: "service" | "organization" | "event";
  entityId: number;
  organizationLocationId: number | null;
  linkedDirectoryProfileId: number | null;
  name: string;
  slug: string;
  subcategory: string;
  latitude: number;
  longitude: number;
  precision: MapItem["precision"];
  publicVisibility: string | null;
  geocodeStatus: string;
  sourceFingerprint: string;
  resolvedSourceFingerprint: string | null;
  city: string;
  district: string;
  region: string;
  address: string;
  searchText: string;
  verified: boolean;
  featured: boolean;
  locationRole: MapItem["locationRole"] | null;
  eventStartDate: string | null;
  eventStartTime: string | null;
  eventEndDate: string | null;
  eventEndTime: string | null;
  canonicalStatus: string;
  archivedAt: string | null;
  cancelled: boolean;
  online: boolean;
  provider: string | null;
};

type CandidateRow = {
  geo_point_id: number;
  entity_type: MapCandidate["entityType"];
  entity_id: number;
  organization_location_id: number | null;
  linked_directory_profile_id: number | null;
  name: string;
  slug: string;
  subcategory: string;
  latitude: number;
  longitude: number;
  precision: MapItem["precision"];
  public_visibility: string | null;
  geocode_status: string;
  source_fingerprint: string;
  resolved_source_fingerprint: string | null;
  city: string;
  district: string;
  region: string;
  address: string;
  search_text: string;
  verified: number;
  featured: number;
  location_role: MapItem["locationRole"] | null;
  event_start_date: string | null;
  event_start_time: string | null;
  event_end_date: string | null;
  event_end_time: string | null;
  canonical_status: string;
  archived_at: string | null;
  cancelled: number;
  online: number;
  provider: string | null;
};

function getMapDb(database?: MapD1Database) {
  if (database && typeof database.prepare === "function") return database;
  const bound = (env as unknown as MapBindings).DB;
  return bound && typeof bound.prepare === "function" ? bound : null;
}

function rowToCandidate(row: CandidateRow): MapCandidate {
  return {
    geoPointId: Number(row.geo_point_id),
    entityType: row.entity_type,
    entityId: Number(row.entity_id),
    organizationLocationId: row.organization_location_id === null ? null : Number(row.organization_location_id),
    linkedDirectoryProfileId: row.linked_directory_profile_id === null ? null : Number(row.linked_directory_profile_id),
    name: row.name,
    slug: row.slug,
    subcategory: row.subcategory,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    precision: row.precision,
    publicVisibility: row.public_visibility,
    geocodeStatus: row.geocode_status,
    sourceFingerprint: row.source_fingerprint,
    resolvedSourceFingerprint: row.resolved_source_fingerprint,
    city: row.city,
    district: row.district,
    region: row.region,
    address: row.address,
    searchText: row.search_text,
    verified: Boolean(row.verified),
    featured: Boolean(row.featured),
    locationRole: row.location_role,
    eventStartDate: row.event_start_date,
    eventStartTime: row.event_start_time,
    eventEndDate: row.event_end_date,
    eventEndTime: row.event_end_time,
    canonicalStatus: row.canonical_status,
    archivedAt: row.archived_at,
    cancelled: Boolean(row.cancelled),
    online: Boolean(row.online),
    provider: row.provider,
  };
}

function bboxSql(query: MapQueryInput) {
  const { south, north, west, east } = query.bbox;
  if (west <= east) {
    return {
      sql: "g.latitude >= ? AND g.latitude <= ? AND g.longitude >= ? AND g.longitude <= ?",
      bindings: [south, north, west, east] as unknown[],
    };
  }
  return {
    sql: "g.latitude >= ? AND g.latitude <= ? AND (g.longitude >= ? OR g.longitude <= ?)",
    bindings: [south, north, west, east] as unknown[],
  };
}

const GEO_PUBLIC_WHERE = `
  g.public_visibility IN ('EXACT_PUBLIC', 'APPROXIMATE_PUBLIC')
  AND g.geocode_status = 'RESOLVED'
  AND g.latitude IS NOT NULL
  AND g.longitude IS NOT NULL
  AND g.resolved_source_fingerprint IS NOT NULL
  AND g.source_fingerprint = g.resolved_source_fingerprint
`;

function parameterizedSearch(query: MapQueryInput, expression: string) {
  if (!query.search) return { sql: "", bindings: [] as unknown[] };
  return {
    sql: ` AND ${sqlNormalizedExpression(expression)} LIKE ?`,
    bindings: [`%${normalizeDirectorySearchText(query.search)}%`] as unknown[],
  };
}

function serviceStatement(query: MapQueryInput, db: MapD1Database) {
  const bbox = bboxSql(query);
  const search = parameterizedSearch(query, `
    coalesce(d.name, '') || ' ' || coalesce(d.excerpt, '') || ' ' || coalesce(d.description, '') || ' ' ||
    coalesce(d.services_json, '') || ' ' || coalesce(d.city, '') || ' ' || coalesce(d.district, '') || ' ' ||
    coalesce(d.region, '')
  `);
  return db.prepare(`
    SELECT
      g.id AS geo_point_id, 'service' AS entity_type, d.id AS entity_id,
      NULL AS organization_location_id, NULL AS linked_directory_profile_id,
      d.name, d.slug, d.category AS subcategory,
      g.latitude, g.longitude, g.public_precision AS precision,
      g.public_visibility, g.geocode_status, g.source_fingerprint, g.resolved_source_fingerprint,
      d.city, d.district, d.region, d.address,
      (d.name || ' ' || d.excerpt || ' ' || d.description || ' ' || d.services_json || ' ' ||
        d.city || ' ' || d.district || ' ' || d.region) AS search_text,
      d.verified, d.featured, NULL AS location_role,
      NULL AS event_start_date, NULL AS event_start_time, NULL AS event_end_date, NULL AS event_end_time,
      d.status AS canonical_status, d.archived_at, 0 AS cancelled, d.online,
      g.provider
    FROM geo_points g
    JOIN directory_profiles d ON d.id = g.directory_profile_id
    WHERE g.target_type = 'DIRECTORY_PROFILE'
      AND ${GEO_PUBLIC_WHERE}
      AND d.status = 'published'
      AND d.archived_at IS NULL
      AND d.online = 0
      AND ${bbox.sql}
      ${search.sql}
    ORDER BY g.id ASC
    LIMIT ?
  `).bind(...bbox.bindings, ...search.bindings, MAP_INTERNAL_ROW_LIMIT);
}

function organizationStatement(query: MapQueryInput, db: MapD1Database) {
  const bbox = bboxSql(query);
  const search = parameterizedSearch(query, `
    coalesce(o.name, '') || ' ' || coalesce(o.short_description, '') || ' ' || coalesce(o.description, '') || ' ' ||
    coalesce(l.label, '') || ' ' || coalesce(l.city, '') || ' ' || coalesce(l.district, '') || ' ' || coalesce(l.region, '')
  `);
  return db.prepare(`
    SELECT
      g.id AS geo_point_id, 'organization' AS entity_type, o.id AS entity_id,
      l.id AS organization_location_id, o.directory_profile_id AS linked_directory_profile_id,
      o.name, o.slug, o.type AS subcategory,
      g.latitude, g.longitude, g.public_precision AS precision,
      g.public_visibility, g.geocode_status, g.source_fingerprint, g.resolved_source_fingerprint,
      l.city, l.district, l.region, l.address,
      (o.name || ' ' || o.short_description || ' ' || o.description || ' ' ||
        l.label || ' ' || l.city || ' ' || l.district || ' ' || l.region) AS search_text,
      0 AS verified, 0 AS featured, l.role AS location_role,
      NULL AS event_start_date, NULL AS event_start_time, NULL AS event_end_date, NULL AS event_end_time,
      o.status AS canonical_status, o.archived_at, 0 AS cancelled, 0 AS online,
      g.provider
    FROM geo_points g
    JOIN organization_locations l ON l.id = g.organization_location_id
    JOIN help_organizations o ON o.id = l.organization_id
    WHERE g.target_type = 'ORGANIZATION_LOCATION'
      AND ${GEO_PUBLIC_WHERE}
      AND o.status = 'PUBLISHED'
      AND o.archived_at IS NULL
      AND ${bbox.sql}
      ${search.sql}
    ORDER BY g.id ASC
    LIMIT ?
  `).bind(...bbox.bindings, ...search.bindings, MAP_INTERNAL_ROW_LIMIT);
}

function eventStatement(query: MapQueryInput, db: MapD1Database, today: string) {
  const bbox = bboxSql(query);
  const search = parameterizedSearch(query, `
    coalesce(e.title, '') || ' ' || coalesce(e.excerpt, '') || ' ' || coalesce(e.organizer, '') || ' ' ||
    coalesce(e.venue, '') || ' ' || coalesce(e.event_type, '') || ' ' || coalesce(e.city, '') || ' ' || coalesce(e.region, '')
  `);
  const timing = query.eventTiming === "current"
    ? "e.start_date <= ? AND COALESCE(e.end_date, e.start_date) >= ?"
    : query.eventTiming === "upcoming"
      ? "e.start_date > ?"
      : "COALESCE(e.end_date, e.start_date) >= ?";
  const timingBindings = query.eventTiming === "current" ? [today, today] : [today];

  return db.prepare(`
    SELECT
      g.id AS geo_point_id, 'event' AS entity_type, e.id AS entity_id,
      NULL AS organization_location_id, NULL AS linked_directory_profile_id,
      e.title AS name, e.slug, e.event_type AS subcategory,
      g.latitude, g.longitude, g.public_precision AS precision,
      g.public_visibility, g.geocode_status, g.source_fingerprint, g.resolved_source_fingerprint,
      e.city, '' AS district, e.region, e.address,
      (e.title || ' ' || e.excerpt || ' ' || e.organizer || ' ' || e.venue || ' ' ||
        e.event_type || ' ' || e.city || ' ' || e.region) AS search_text,
      0 AS verified, 0 AS featured, NULL AS location_role,
      e.start_date AS event_start_date, e.start_time AS event_start_time,
      e.end_date AS event_end_date, e.end_time AS event_end_time,
      e.status AS canonical_status, NULL AS archived_at, e.cancelled, 0 AS online,
      g.provider
    FROM geo_points g
    JOIN managed_events e ON e.id = g.managed_event_id
    WHERE g.target_type = 'MANAGED_EVENT'
      AND ${GEO_PUBLIC_WHERE}
      AND e.status = 'published'
      AND e.cancelled = 0
      AND e.region <> 'Online'
      AND ${timing}
      AND ${bbox.sql}
      ${search.sql}
    ORDER BY e.start_date ASC, e.start_time ASC, g.id ASC
    LIMIT ?
  `).bind(...timingBindings, ...bbox.bindings, ...search.bindings, MAP_INTERNAL_ROW_LIMIT);
}

export function isPublicMapCandidate(candidate: MapCandidate, today = bratislavaDateKey()) {
  if (candidate.publicVisibility !== "EXACT_PUBLIC" && candidate.publicVisibility !== "APPROXIMATE_PUBLIC") return false;
  if (candidate.geocodeStatus !== "RESOLVED") return false;
  if (!candidate.resolvedSourceFingerprint || candidate.sourceFingerprint !== candidate.resolvedSourceFingerprint) return false;
  if (!Number.isFinite(candidate.latitude) || !Number.isFinite(candidate.longitude)) return false;
  if (candidate.latitude < -90 || candidate.latitude > 90 || candidate.longitude < -180 || candidate.longitude > 180) return false;

  if (candidate.entityType === "service") {
    return candidate.canonicalStatus === "published" && candidate.archivedAt === null && !candidate.online;
  }
  if (candidate.entityType === "organization") {
    return candidate.canonicalStatus === "PUBLISHED" && candidate.archivedAt === null;
  }
  const lastDate = candidate.eventEndDate || candidate.eventStartDate || "";
  return candidate.canonicalStatus === "published"
    && !candidate.cancelled
    && candidate.region !== "Online"
    && Boolean(candidate.eventStartDate)
    && lastDate >= today;
}

function sameText(left: string, right: string) {
  return normalizeDirectorySearchText(left) === normalizeDirectorySearchText(right);
}

function candidateMatchesQuery(candidate: MapCandidate, query: MapQueryInput, today: string) {
  if (!bboxContains(query.bbox, candidate.latitude, candidate.longitude)) return false;
  const category: MapCategory = candidate.entityType === "service"
    ? "services"
    : candidate.entityType === "organization" ? "organizations" : "events";
  if (query.category && query.category !== category) return false;
  if (query.subcategory && !sameText(candidate.subcategory, query.subcategory)) return false;
  if (query.region && !sameText(candidate.region, query.region)) return false;
  if (query.district && !sameText(candidate.district, query.district)) return false;
  if (query.city && !sameText(candidate.city, query.city)) return false;

  if (query.eventType && candidate.entityType !== "event") return false;
  if (query.eventType && candidate.subcategory !== query.eventType) return false;

  if (candidate.entityType === "event") {
    const start = candidate.eventStartDate || "";
    const end = candidate.eventEndDate || start;
    if (query.eventTiming === "current" && !(start <= today && end >= today)) return false;
    if (query.eventTiming === "upcoming" && !(start > today)) return false;
    if (query.eventTiming === "active" && !(end >= today)) return false;
  }

  if (query.search) {
    const needle = normalizeDirectorySearchText(query.search);
    const haystack = normalizeDirectorySearchText(candidate.searchText);
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function sameCoordinate(left: MapCandidate, right: MapCandidate) {
  return Math.abs(left.latitude - right.latitude) < 1e-8 && Math.abs(left.longitude - right.longitude) < 1e-8;
}

export function deduplicateLinkedOrganizationDirectory(candidates: MapCandidate[], preferOrganizations = true) {
  if (!preferOrganizations) return candidates;
  const organizationLinks = candidates.filter((item) => item.entityType === "organization" && item.linkedDirectoryProfileId);
  if (!organizationLinks.length) return candidates;
  return candidates.filter((item) => {
    if (item.entityType !== "service") return true;
    return !organizationLinks.some((organization) =>
      organization.linkedDirectoryProfileId === item.entityId && sameCoordinate(organization, item));
  });
}

function uniqueLocationParts(values: string[]) {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    if (!value) return false;
    const key = normalizeDirectorySearchText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function publicDisplayLocation(candidate: Pick<MapCandidate, "publicVisibility" | "address" | "city" | "district" | "region">) {
  const values = candidate.publicVisibility === "EXACT_PUBLIC"
    ? [candidate.address, candidate.city, candidate.district, candidate.region]
    : [candidate.city, candidate.district, candidate.region];
  return uniqueLocationParts(values).join(" · ") || undefined;
}

export function mapCandidateToItem(candidate: MapCandidate): MapItem {
  const category: MapCategory = candidate.entityType === "service"
    ? "services"
    : candidate.entityType === "organization" ? "organizations" : "events";
  const id = candidate.entityType === "organization"
    ? `organization:${candidate.entityId}:location:${candidate.organizationLocationId ?? candidate.geoPointId}`
    : `${candidate.entityType}:${candidate.entityId}`;
  const href = candidate.entityType === "service"
    ? `/adresar/${candidate.subcategory}/${candidate.slug}`
    : candidate.entityType === "organization"
      ? `/organizacie/${candidate.slug}`
      : `/podujatia/${candidate.slug}`;

  const item: MapItem = {
    id,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    name: candidate.name,
    category,
    subcategory: candidate.subcategory || undefined,
    href,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    precision: candidate.precision,
    displayLocation: publicDisplayLocation(candidate),
    city: candidate.city || undefined,
    district: candidate.district || undefined,
    region: candidate.region || undefined,
  };

  if (candidate.entityType === "service") {
    item.verified = candidate.verified;
    item.featured = candidate.featured;
  }
  if (candidate.entityType === "organization" && candidate.locationRole) {
    item.locationRole = candidate.locationRole;
  }
  if (candidate.entityType === "event" && candidate.eventStartDate) {
    item.eventStart = eventDateTimeIso(candidate.eventStartDate, candidate.eventStartTime);
    if (candidate.eventEndDate) item.eventEnd = eventDateTimeIso(candidate.eventEndDate, candidate.eventEndTime);
  }
  return item;
}

export function clusterMapItems(items: MapItem[], zoom: number, limit = MAP_MAX_CLUSTERS): MapCluster[] {
  const grid = mapClusterGridSize(zoom);
  const buckets = new Map<string, { lat: number; lng: number; count: number; services: number; organizations: number; events: number; x: number; y: number }>();
  for (const item of items) {
    const x = Math.floor((item.longitude + 180) / grid);
    const y = Math.floor((item.latitude + 90) / grid);
    const key = `${x}:${y}`;
    const bucket = buckets.get(key) ?? { lat: 0, lng: 0, count: 0, services: 0, organizations: 0, events: 0, x, y };
    bucket.lat += item.latitude;
    bucket.lng += item.longitude;
    bucket.count += 1;
    if (item.category === "services") bucket.services += 1;
    else if (item.category === "organizations") bucket.organizations += 1;
    else bucket.events += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({
      id: `cluster:z${zoom <= 6 ? 6 : zoom <= 8 ? 8 : zoom <= 10 ? 10 : 11}:g${grid}:x${bucket.x}:y${bucket.y}`,
      latitude: bucket.lat / bucket.count,
      longitude: bucket.lng / bucket.count,
      count: bucket.count,
      categoryCounts: {
        services: bucket.services,
        organizations: bucket.organizations,
        events: bucket.events,
      },
    }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
    .slice(0, Math.max(1, Math.min(MAP_MAX_CLUSTERS, limit)));
}

async function loadCandidates(query: MapQueryInput, db: MapD1Database, today: string) {
  const statements: Array<Promise<D1Result<CandidateRow>>> = [];
  const eventOnly = Boolean(query.eventType);
  if (!eventOnly && (!query.category || query.category === "services")) statements.push(serviceStatement(query, db).all<CandidateRow>());
  if (!eventOnly && (!query.category || query.category === "organizations")) statements.push(organizationStatement(query, db).all<CandidateRow>());
  if (eventOnly || !query.category || query.category === "events") statements.push(eventStatement(query, db, today).all<CandidateRow>());
  const results = await Promise.all(statements);
  return {
    candidates: results.flatMap((result) => result.results.map(rowToCandidate)),
    sourceTruncated: results.some((result) => result.results.length >= MAP_INTERNAL_ROW_LIMIT),
  };
}

export async function queryPublicMap(
  query: MapQueryInput,
  database?: MapD1Database,
  now = new Date(),
): Promise<MapResponse> {
  const db = getMapDb(database);
  if (!db) throw new MapGeoUnavailableError("Map database is unavailable.");
  let schemaReady = false;
  try {
    schemaReady = await isGeoSchemaAvailable(db as D1Database);
  } catch {
    schemaReady = false;
  }
  if (!schemaReady) throw new MapGeoUnavailableError("Geo foundation is unavailable.");

  const today = bratislavaDateKey(now);
  const loaded = await loadCandidates(query, db, today);
  const eligible = loaded.candidates.filter((candidate) => isPublicMapCandidate(candidate, today));
  const deduped = deduplicateLinkedOrganizationDirectory(eligible, query.category !== "services");
  const filtered = deduped.filter((candidate) => candidateMatchesQuery(candidate, query, today));
  const matched = filtered.length;
  const items = filtered.map(mapCandidateToItem);
  const hasGeoapify = filtered.some((candidate) => candidate.provider?.toLowerCase() === "geoapify");
  const attribution = hasGeoapify ? [{ label: "Geoapify", url: "https://www.geoapify.com/" }] : undefined;
  const mode = mapResponseMode(query);

  if (mode === "clusters") {
    const clusters = clusterMapItems(items, query.zoom);
    return {
      mode,
      clusters,
      meta: {
        count: clusters.length,
        matched,
        truncated: loaded.sourceTruncated || clusters.length >= MAP_MAX_CLUSTERS,
        bbox: query.bbox,
        zoom: query.zoom,
        cacheTtlSeconds: MAP_CACHE_TTL_SECONDS,
        attribution,
      },
    };
  }

  const limited = items.slice(0, query.limit);
  return {
    mode,
    items: limited,
    meta: {
      count: limited.length,
      matched,
      truncated: loaded.sourceTruncated || matched > limited.length,
      bbox: query.bbox,
      zoom: query.zoom,
      cacheTtlSeconds: MAP_CACHE_TTL_SECONDS,
      attribution,
    },
  };
}
