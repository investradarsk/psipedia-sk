import { env } from "cloudflare:workers";
import {
  geoAdminGenericOperatorState,
  geoAdminOperatorState,
  geoAdminOperatorStateLabels,
  type GeoAdminOperatorState,
} from "@/lib/geo-admin-operator-state";
import { getDirectoryCategory } from "@/lib/directory";
import {
  directoryAddressQualityWarning,
  evaluateDirectoryServiceAddress,
  type DirectoryServiceAddressEvaluation,
} from "@/lib/directory-service-address";
import { googlePlaceActionForSource } from "@/lib/google-place-target-discovery";
import type { GeoSourceLocation, GeoTargetType } from "@/lib/geo";

type RuntimeBindings = { DB?: D1Database };
export type GeoAdminOperatorGroup = "SERVICES" | "HELP" | "EVENTS";
export type GeoAdminOperatorGroupFilter = "ALL" | GeoAdminOperatorGroup;
export type GeoAdminOperatorFilter = "ALL" | "ERRORS" | GeoAdminOperatorState;
export type GeoAdminGoogleFilter = "ALL" | "PLACE" | "COORDINATES" | "NOT_REQUIRED" | "UNRESOLVED";
export type GeoAdminGoogleState = Exclude<GeoAdminGoogleFilter, "ALL">;
export type GeoAdminOperatorAddressState = DirectoryServiceAddressEvaluation["state"] | "AVAILABLE";

export const GEO_ADMIN_DEFAULT_PAGE_SIZE = 50;
export const GEO_ADMIN_PAGE_SIZES = [25, 50, 100] as const;
export const GEO_ADMIN_MAX_PAGE_SIZE = 100;

export type GeoAdminOperatorQuery = {
  group: GeoAdminOperatorGroupFilter;
  category: string;
  operator: GeoAdminOperatorFilter;
  google: GeoAdminGoogleFilter;
  query: string;
  page: number;
  pageSize: number;
};

export type GeoAdminOperatorRow = {
  key: string;
  id: number;
  targetType: GeoTargetType;
  targetId: number;
  group: GeoAdminOperatorGroup;
  groupLabel: string;
  name: string;
  category: string;
  categoryLabel: string;
  city: string;
  district: string;
  region: string;
  formattedAddress: string | null;
  publicAddress: string;
  legacyAddress: string;
  addressWarning: string | null;
  addressState: GeoAdminOperatorAddressState;
  addressReason: string;
  operatorState: GeoAdminOperatorState;
  operatorReason: string;
  editorHref: string;
  attentionHref: string;
  geoPointId: number | null;
  geocodeStatus: string | null;
  publicVisibility: string | null;
  publicPrecision: string | null;
  provider: string | null;
  normalizedQuery: string | null;
  sourceFingerprint: string | null;
  resolvedSourceFingerprint: string | null;
  googlePlaceId: string | null;
  googlePlaceSourceFingerprint: string | null;
  googleMapsTarget: GeoAdminGoogleState;
  googleMapsNotRequiredSystemDerived: boolean;
  latitude: number | null;
  longitude: number | null;
  errorCode: string | null;
  manualOverride: boolean;
  explicitPrivate: boolean;
  updatedAt: string | null;
  googlePickerAvailable: boolean;
  googlePickerUnavailableReason: string | null;
};

export type GeoAdminOperatorSummary = Record<GeoAdminOperatorState, number>;

export type GeoAdminOperatorCounts = {
  total: number;
  groups: Record<GeoAdminOperatorGroup, number>;
  google: Record<GeoAdminGoogleState, number>;
  operators: GeoAdminOperatorSummary;
};

export type GeoAdminOperatorCategory = {
  value: string;
  label: string;
  count: number;
};

export type GeoAdminOperatorPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  from: number;
  to: number;
};

export type GeoAdminOperatorData = {
  items: GeoAdminOperatorRow[];
  counts: GeoAdminOperatorCounts;
  summary: GeoAdminOperatorSummary;
  categories: GeoAdminOperatorCategory[];
  pagination: GeoAdminOperatorPagination;
  filters: GeoAdminOperatorQuery;
  total: number;
};

type DbRow = Record<string, unknown>;

const organizationTypeLabels: Record<string, string> = {
  SHELTER: "Útulok",
  CIVIC_ASSOCIATION: "Občianske združenie",
  RESCUE_ORGANIZATION: "Záchranná organizácia",
  MUNICIPAL_ORGANIZATION: "Mestská / obecná organizácia",
  NONPROFIT: "Nezisková organizácia",
  OTHER: "Iné",
};

const validGroups = new Set<GeoAdminOperatorGroupFilter>(["ALL", "SERVICES", "HELP", "EVENTS"]);
const validOperators = new Set<GeoAdminOperatorFilter>([
  "ALL",
  "ERRORS",
  ...Object.keys(geoAdminOperatorStateLabels) as GeoAdminOperatorState[],
]);
const validGoogle = new Set<GeoAdminGoogleFilter>(["ALL", "PLACE", "COORDINATES", "NOT_REQUIRED", "UNRESOLVED"]);

function value(row: DbRow, key: string) {
  return String(row[key] ?? "").trim();
}

function nullable(row: DbRow, key: string) {
  const raw = row[key];
  return raw === null || raw === undefined || raw === "" ? null : String(raw);
}

function numberOrNull(row: DbRow, key: string) {
  const raw = row[key];
  return raw === null || raw === undefined ? null : Number(raw);
}

function truthy(row: DbRow, key: string) {
  return Boolean(Number(row[key] ?? 0));
}

function requireDb() {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Geo databáza zatiaľ nie je pripojená.");
  return db;
}

function displayAddress(...parts: Array<string | null | undefined>) {
  const values = parts.map((part) => part?.trim() ?? "").filter(Boolean);
  return values.length ? values.join(", ") : null;
}

function safePage(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizeGeoAdminPageSize(value: unknown) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > GEO_ADMIN_MAX_PAGE_SIZE) return GEO_ADMIN_MAX_PAGE_SIZE;
  return (GEO_ADMIN_PAGE_SIZES as readonly number[]).includes(parsed)
    ? parsed
    : GEO_ADMIN_DEFAULT_PAGE_SIZE;
}

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeGeoAdminOperatorQuery(
  input: Partial<Record<keyof GeoAdminOperatorQuery, unknown>> = {},
): GeoAdminOperatorQuery {
  const groupRaw = boundedText(input.group, 20).toUpperCase() as GeoAdminOperatorGroupFilter;
  const operatorRaw = boundedText(input.operator, 30).toUpperCase() as GeoAdminOperatorFilter;
  const googleRaw = boundedText(input.google, 30).toUpperCase() as GeoAdminGoogleFilter;
  return {
    group: validGroups.has(groupRaw) ? groupRaw : "ALL",
    category: boundedText(input.category, 100),
    operator: validOperators.has(operatorRaw) ? operatorRaw : "ALL",
    google: validGoogle.has(googleRaw) ? googleRaw : "ALL",
    query: boundedText(input.query, 160),
    page: safePage(input.page),
    pageSize: normalizeGeoAdminPageSize(input.pageSize),
  };
}

const GEO_BASE_CTE = `
WITH
explicit_private AS (
  SELECT DISTINCT subject_id
  FROM moderation_events
  WHERE resource_type = 'GEO_POINT'
    AND action = 'GEO_VISIBILITY_CHANGED'
    AND actor_type = 'ADMIN'
    AND to_status = 'SKIPPED'
),
map_review_ranked AS (
  SELECT
    subject_id,
    action,
    ROW_NUMBER() OVER (
      PARTITION BY subject_id
      ORDER BY created_at DESC, id DESC
    ) AS row_number
  FROM moderation_events
  WHERE resource_type = 'GEO_POINT'
    AND action IN ('GOOGLE_MAPS_NOT_REQUIRED', 'GOOGLE_MAPS_REQUIRED_AGAIN')
),
map_review AS (
  SELECT subject_id, action
  FROM map_review_ranked
  WHERE row_number = 1
),
raw AS (
  SELECT
    'SERVICES' AS group_key,
    'DIRECTORY_PROFILE' AS target_type,
    d.id AS target_id,
    d.id AS id,
    NULL AS organization_id,
    d.name AS name,
    d.category AS category,
    '' AS location_role,
    '' AS location_label,
    '' AS venue,
    COALESCE(d.address, '') AS address,
    COALESCE(d.address, '') AS public_address,
    COALESCE(d.city, '') AS city,
    COALESCE(d.district, '') AS district,
    COALESCE(d.region, '') AS region,
    COALESCE(d.postal_code, '') AS postal_code,
    COALESCE(d.street, '') AS street,
    COALESCE(d.house_number, '') AS house_number,
    COALESCE(d.address_format, '') AS address_format,
    COALESCE(d.service_address_confirmation, '') AS service_address_confirmation,
    'SK' AS country_code,
    0 AS online,
    g.id AS geo_point_id,
    g.geocode_status,
    g.public_visibility,
    g.public_precision,
    g.provider,
    g.normalized_query,
    g.source_fingerprint,
    g.resolved_source_fingerprint,
    g.google_place_id,
    g.google_place_source_fingerprint,
    g.latitude,
    g.longitude,
    g.last_error_code,
    g.manual_override,
    g.updated_at AS geo_updated_at,
    CASE WHEN ep.subject_id IS NULL THEN 0 ELSE 1 END AS explicit_private,
    mr.action AS map_review_action
  FROM directory_profiles d
  LEFT JOIN geo_points g
    ON g.directory_profile_id = d.id
    AND g.target_type = 'DIRECTORY_PROFILE'
  LEFT JOIN explicit_private ep ON ep.subject_id = CAST(g.id AS TEXT)
  LEFT JOIN map_review mr ON mr.subject_id = CAST(g.id AS TEXT)
  WHERE d.status = 'published' AND d.archived_at IS NULL

  UNION ALL

  SELECT
    'HELP' AS group_key,
    'ORGANIZATION_LOCATION' AS target_type,
    l.id AS target_id,
    l.id AS id,
    l.organization_id AS organization_id,
    CASE
      WHEN trim(COALESCE(l.label, '')) <> '' AND trim(COALESCE(l.label, '')) <> trim(COALESCE(o.name, ''))
        THEN trim(COALESCE(o.name, '')) || ' — ' || trim(COALESCE(l.label, ''))
      ELSE COALESCE(NULLIF(trim(COALESCE(o.name, '')), ''), trim(COALESCE(l.label, '')))
    END AS name,
    COALESCE(o.type, 'OTHER') AS category,
    COALESCE(l.role, 'UNSPECIFIED') AS location_role,
    COALESCE(l.label, '') AS location_label,
    '' AS venue,
    COALESCE(l.address, '') AS address,
    '' AS public_address,
    COALESCE(l.city, '') AS city,
    COALESCE(l.district, '') AS district,
    COALESCE(l.region, '') AS region,
    '' AS postal_code,
    '' AS street,
    '' AS house_number,
    '' AS address_format,
    '' AS service_address_confirmation,
    COALESCE(l.country_code, 'SK') AS country_code,
    0 AS online,
    g.id AS geo_point_id,
    g.geocode_status,
    g.public_visibility,
    g.public_precision,
    g.provider,
    g.normalized_query,
    g.source_fingerprint,
    g.resolved_source_fingerprint,
    g.google_place_id,
    g.google_place_source_fingerprint,
    g.latitude,
    g.longitude,
    g.last_error_code,
    g.manual_override,
    g.updated_at AS geo_updated_at,
    CASE WHEN ep.subject_id IS NULL THEN 0 ELSE 1 END AS explicit_private,
    mr.action AS map_review_action
  FROM organization_locations l
  JOIN help_organizations o ON o.id = l.organization_id
  LEFT JOIN geo_points g
    ON g.organization_location_id = l.id
    AND g.target_type = 'ORGANIZATION_LOCATION'
  LEFT JOIN explicit_private ep ON ep.subject_id = CAST(g.id AS TEXT)
  LEFT JOIN map_review mr ON mr.subject_id = CAST(g.id AS TEXT)
  WHERE o.status = 'PUBLISHED' AND o.archived_at IS NULL

  UNION ALL

  SELECT
    'EVENTS' AS group_key,
    'MANAGED_EVENT' AS target_type,
    e.id AS target_id,
    e.id AS id,
    NULL AS organization_id,
    e.title AS name,
    COALESCE(e.event_type, 'Iné') AS category,
    '' AS location_role,
    '' AS location_label,
    COALESCE(e.venue, '') AS venue,
    COALESCE(e.address, '') AS address,
    '' AS public_address,
    COALESCE(e.city, '') AS city,
    '' AS district,
    COALESCE(e.region, '') AS region,
    '' AS postal_code,
    '' AS street,
    '' AS house_number,
    '' AS address_format,
    '' AS service_address_confirmation,
    'SK' AS country_code,
    CASE
      WHEN lower(trim(COALESCE(e.city, ''))) = 'online'
        OR lower(trim(COALESCE(e.region, ''))) = 'online'
        OR lower(trim(COALESCE(e.venue, ''))) = 'online'
      THEN 1 ELSE 0
    END AS online,
    g.id AS geo_point_id,
    g.geocode_status,
    g.public_visibility,
    g.public_precision,
    g.provider,
    g.normalized_query,
    g.source_fingerprint,
    g.resolved_source_fingerprint,
    g.google_place_id,
    g.google_place_source_fingerprint,
    g.latitude,
    g.longitude,
    g.last_error_code,
    g.manual_override,
    g.updated_at AS geo_updated_at,
    CASE WHEN ep.subject_id IS NULL THEN 0 ELSE 1 END AS explicit_private,
    mr.action AS map_review_action
  FROM managed_events e
  LEFT JOIN geo_points g
    ON g.managed_event_id = e.id
    AND g.target_type = 'MANAGED_EVENT'
  LEFT JOIN explicit_private ep ON ep.subject_id = CAST(g.id AS TEXT)
  LEFT JOIN map_review mr ON mr.subject_id = CAST(g.id AS TEXT)
  WHERE e.status = 'published' AND e.cancelled = 0
),
base AS (
  SELECT
    raw.*,
    CASE
      WHEN online = 1 THEN 'NOT_REQUIRED'
      WHEN map_review_action = 'GOOGLE_MAPS_NOT_REQUIRED' THEN 'NOT_REQUIRED'
      WHEN trim(COALESCE(google_place_id, '')) <> ''
        AND trim(COALESCE(google_place_source_fingerprint, '')) <> ''
        AND google_place_source_fingerprint = source_fingerprint
        THEN 'PLACE'
      WHEN latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND COALESCE(public_visibility, '') <> 'HIDDEN'
        AND trim(COALESCE(source_fingerprint, '')) <> ''
        AND resolved_source_fingerprint = source_fingerprint
        THEN 'COORDINATES'
      ELSE 'UNRESOLVED'
    END AS google_state,
    CASE
      WHEN target_type = 'DIRECTORY_PROFILE' THEN
        CASE
          WHEN trim(public_address) <> '' AND NOT (
            trim(region) <> ''
            AND trim(district) <> ''
            AND trim(city) <> ''
            AND service_address_confirmation = 'CONFIRMED_SERVICE_LOCATION'
            AND length(replace(trim(postal_code), ' ', '')) = 5
            AND replace(trim(postal_code), ' ', '') GLOB '[0-9][0-9][0-9][0-9][0-9]'
            AND (
              (address_format = 'STREET' AND trim(street) <> '')
              OR (
                address_format = 'MUNICIPALITY_NUMBER'
                AND trim(house_number) <> ''
                AND trim(street) = ''
              )
            )
          ) THEN 'NEEDS_REVIEW'
          WHEN trim(region) = ''
            AND trim(district) = ''
            AND trim(city) = ''
            AND trim(postal_code) = ''
            AND trim(street) = ''
            AND trim(house_number) = ''
            AND trim(address_format) = ''
            THEN 'MISSING_ADDRESS'
          WHEN trim(region) = '' OR trim(district) = '' OR trim(city) = ''
            THEN 'INCOMPLETE_ADDRESS'
          WHEN service_address_confirmation <> 'CONFIRMED_SERVICE_LOCATION'
            THEN 'NEEDS_REVIEW'
          WHEN trim(postal_code) = '' OR trim(address_format) = ''
            THEN 'INCOMPLETE_ADDRESS'
          WHEN length(replace(trim(postal_code), ' ', '')) <> 5
            OR replace(trim(postal_code), ' ', '') NOT GLOB '[0-9][0-9][0-9][0-9][0-9]'
            OR (address_format = 'MUNICIPALITY_NUMBER' AND trim(street) <> '')
            THEN 'INVALID_ADDRESS'
          WHEN address_format = 'STREET' AND trim(street) = ''
            THEN 'INCOMPLETE_ADDRESS'
          WHEN address_format = 'MUNICIPALITY_NUMBER' AND trim(house_number) = ''
            THEN 'INCOMPLETE_ADDRESS'
          WHEN geocode_status = 'FAILED'
            THEN 'FAILED'
          WHEN COALESCE(manual_override, 0) = 1
            THEN 'NEEDS_REVIEW'
          WHEN public_visibility = 'HIDDEN' OR geocode_status = 'SKIPPED'
            THEN 'NOT_PUBLIC'
          WHEN geocode_status IN ('NEEDS_REVIEW', 'STALE')
            THEN 'NEEDS_REVIEW'
          WHEN geocode_status IS NULL OR geocode_status = 'PENDING'
            THEN 'PENDING'
          WHEN geocode_status = 'RESOLVED'
            AND public_visibility = 'EXACT_PUBLIC'
            AND public_precision = 'EXACT'
            AND latitude IS NOT NULL
            AND longitude IS NOT NULL
            AND trim(COALESCE(source_fingerprint, '')) <> ''
            AND resolved_source_fingerprint = source_fingerprint
            THEN 'ON_MAP'
          ELSE 'NEEDS_REVIEW'
        END
      ELSE
        CASE
          WHEN online = 1 THEN 'NOT_PUBLIC'
          WHEN trim(address) = ''
            AND trim(location_label) = ''
            AND trim(venue) = ''
            AND trim(city) = ''
            AND trim(district) = ''
            AND trim(region) = ''
            THEN 'MISSING_ADDRESS'
          WHEN geocode_status = 'FAILED'
            THEN 'FAILED'
          WHEN COALESCE(manual_override, 0) = 1
            THEN 'NEEDS_REVIEW'
          WHEN public_visibility = 'HIDDEN' OR geocode_status = 'SKIPPED'
            THEN 'NOT_PUBLIC'
          WHEN geocode_status IN ('NEEDS_REVIEW', 'STALE')
            THEN 'NEEDS_REVIEW'
          WHEN geocode_status IS NULL OR geocode_status = 'PENDING'
            THEN 'PENDING'
          WHEN geocode_status = 'RESOLVED'
            AND public_visibility IS NOT NULL
            AND public_visibility <> 'HIDDEN'
            AND public_precision IS NOT NULL
            AND latitude IS NOT NULL
            AND longitude IS NOT NULL
            AND trim(COALESCE(source_fingerprint, '')) <> ''
            AND resolved_source_fingerprint = source_fingerprint
            THEN 'ON_MAP'
          ELSE 'NEEDS_REVIEW'
        END
    END AS operator_state,
    trim(
      COALESCE(name, '') || ' ' ||
      COALESCE(category, '') || ' ' ||
      COALESCE(city, '') || ' ' ||
      COALESCE(district, '') || ' ' ||
      COALESCE(region, '') || ' ' ||
      COALESCE(address, '') || ' ' ||
      COALESCE(public_address, '') || ' ' ||
      COALESCE(location_label, '') || ' ' ||
      COALESCE(venue, '')
    ) AS search_text
  FROM raw
)
`;

function filterSql(filters: GeoAdminOperatorQuery, options: { includeCategory?: boolean } = {}) {
  const clauses: string[] = [];
  const bindings: Array<string | number> = [];
  if (filters.group !== "ALL") {
    clauses.push("group_key = ?");
    bindings.push(filters.group);
  }
  if (options.includeCategory !== false && filters.category) {
    clauses.push("category = ?");
    bindings.push(filters.category);
  }
  if (filters.operator === "ERRORS") {
    clauses.push("operator_state IN ('INCOMPLETE_ADDRESS', 'INVALID_ADDRESS', 'FAILED')");
  } else if (filters.operator !== "ALL") {
    clauses.push("operator_state = ?");
    bindings.push(filters.operator);
  }
  if (filters.google !== "ALL") {
    clauses.push("google_state = ?");
    bindings.push(filters.google);
  }
  if (filters.query) {
    clauses.push("search_text LIKE ? COLLATE NOCASE");
    bindings.push(`%${filters.query}%`);
  }
  return {
    clause: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    bindings,
  };
}

function commonGeo(row: DbRow) {
  return {
    geoPointId: numberOrNull(row, "geo_point_id"),
    geocodeStatus: nullable(row, "geocode_status"),
    publicVisibility: nullable(row, "public_visibility"),
    publicPrecision: nullable(row, "public_precision"),
    provider: nullable(row, "provider"),
    normalizedQuery: nullable(row, "normalized_query"),
    sourceFingerprint: nullable(row, "source_fingerprint"),
    resolvedSourceFingerprint: nullable(row, "resolved_source_fingerprint"),
    googlePlaceId: nullable(row, "google_place_id"),
    googlePlaceSourceFingerprint: nullable(row, "google_place_source_fingerprint"),
    latitude: numberOrNull(row, "latitude"),
    longitude: numberOrNull(row, "longitude"),
    errorCode: nullable(row, "last_error_code"),
    manualOverride: truthy(row, "manual_override"),
    explicitPrivate: truthy(row, "explicit_private"),
    updatedAt: nullable(row, "geo_updated_at"),
  };
}

function pickerAvailability(source: GeoSourceLocation, geo: ReturnType<typeof commonGeo>) {
  const policy = googlePlaceActionForSource(source);
  if (!policy.available) return policy;
  if (geo.manualOverride) {
    return { available: false, reason: "Poloha má manuálny GEO override; Google Place ho nesmie prepísať." };
  }
  if (geo.explicitPrivate && geo.publicVisibility === "HIDDEN") {
    return {
      available: false,
      reason: "Poloha bola explicitne nastavená ako neverejná. Zmenu urob priamo v editore položky.",
    };
  }
  return { available: true, reason: "" };
}

function directoryRow(row: DbRow): GeoAdminOperatorRow {
  const evaluation = evaluateDirectoryServiceAddress({
    region: value(row, "region"),
    district: value(row, "district"),
    city: value(row, "city"),
    postalCode: value(row, "postal_code"),
    street: value(row, "street"),
    houseNumber: value(row, "house_number"),
    addressFormat: (row.address_format === "STREET" || row.address_format === "MUNICIPALITY_NUMBER") ? row.address_format : "",
    serviceAddressConfirmation: row.service_address_confirmation === "CONFIRMED_SERVICE_LOCATION"
      ? "CONFIRMED_SERVICE_LOCATION"
      : "LEGACY_UNCONFIRMED",
  });
  const publicAddress = value(row, "public_address");
  const addressWarning = directoryAddressQualityWarning({
    region: value(row, "region"),
    district: value(row, "district"),
    city: value(row, "city"),
    postalCode: value(row, "postal_code"),
    street: value(row, "street"),
    houseNumber: value(row, "house_number"),
    addressFormat: (row.address_format === "STREET" || row.address_format === "MUNICIPALITY_NUMBER") ? row.address_format : "",
    serviceAddressConfirmation: row.service_address_confirmation === "CONFIRMED_SERVICE_LOCATION"
      ? "CONFIRMED_SERVICE_LOCATION"
      : "LEGACY_UNCONFIRMED",
  }, publicAddress);
  const effectiveAddressState: DirectoryServiceAddressEvaluation["state"] =
    publicAddress && evaluation.state !== "COMPLETE" ? "NEEDS_REVIEW" : evaluation.state;
  const geo = commonGeo(row);
  const state = geoAdminOperatorState({
    addressState: effectiveAddressState,
    addressReason: evaluation.reason,
    geocodeStatus: geo.geocodeStatus,
    publicVisibility: geo.publicVisibility,
    publicPrecision: geo.publicPrecision,
    latitude: geo.latitude,
    longitude: geo.longitude,
    sourceFingerprint: geo.sourceFingerprint,
    resolvedSourceFingerprint: geo.resolvedSourceFingerprint,
    manualOverride: geo.manualOverride,
  });
  const id = Number(row.id);
  const category = value(row, "category");
  const source: GeoSourceLocation = {
    targetType: "DIRECTORY_PROFILE",
    targetId: id,
    label: value(row, "name"),
    category,
    address: value(row, "address"),
    city: value(row, "city"),
    district: value(row, "district"),
    region: value(row, "region"),
    postalCode: value(row, "postal_code"),
    street: value(row, "street"),
    houseNumber: value(row, "house_number"),
    published: true,
  };
  const picker = pickerAvailability(source, geo);
  const operatorState = value(row, "operator_state") as GeoAdminOperatorState;

  return {
    key: `DIRECTORY_PROFILE:${id}`,
    id,
    targetType: "DIRECTORY_PROFILE",
    targetId: id,
    group: "SERVICES",
    groupLabel: "Služby",
    name: value(row, "name"),
    category,
    categoryLabel: getDirectoryCategory(category)?.singular ?? category,
    city: value(row, "city"),
    district: value(row, "district"),
    region: value(row, "region"),
    formattedAddress: evaluation.formattedAddress,
    publicAddress,
    legacyAddress: publicAddress,
    addressWarning,
    addressState: effectiveAddressState,
    addressReason: evaluation.reason,
    operatorState,
    operatorReason: operatorState === state.state ? state.reason : "Položka zodpovedá zvolenému serverovému operator filtru.",
    editorHref: `/admin/adresar/${id}#service-address`,
    attentionHref: "/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti",
    ...geo,
    googleMapsTarget: value(row, "google_state") as GeoAdminGoogleState,
    googleMapsNotRequiredSystemDerived: false,
    googlePickerAvailable: picker.available,
    googlePickerUnavailableReason: picker.reason || null,
  };
}

function organizationRow(row: DbRow): GeoAdminOperatorRow {
  const id = Number(row.id);
  const organizationId = Number(row.organization_id);
  const role = value(row, "location_role") || "UNSPECIFIED";
  const organizationName = value(row, "organization_name") || value(row, "name").split(" — ")[0];
  const locationLabel = value(row, "location_label");
  const category = value(row, "category") || "OTHER";
  const geo = commonGeo(row);
  const hasLocationSource = Boolean(value(row, "address") || value(row, "city") || value(row, "district") || value(row, "region"));
  const state = geoAdminGenericOperatorState({
    hasLocationSource,
    missingReason: "Lokalita organizácie nemá použiteľnú adresu ani mesto.",
    geocodeStatus: geo.geocodeStatus,
    publicVisibility: geo.publicVisibility,
    publicPrecision: geo.publicPrecision,
    latitude: geo.latitude,
    longitude: geo.longitude,
    sourceFingerprint: geo.sourceFingerprint,
    resolvedSourceFingerprint: geo.resolvedSourceFingerprint,
    manualOverride: geo.manualOverride,
  });
  const source: GeoSourceLocation = {
    targetType: "ORGANIZATION_LOCATION",
    targetId: id,
    organizationId,
    label: locationLabel || organizationName,
    organizationName,
    category,
    locationRole: role,
    address: value(row, "address"),
    city: value(row, "city"),
    district: value(row, "district"),
    region: value(row, "region"),
    countryCode: value(row, "country_code") || "SK",
    published: true,
  };
  const picker = pickerAvailability(source, geo);
  const operatorState = value(row, "operator_state") as GeoAdminOperatorState;

  return {
    key: `ORGANIZATION_LOCATION:${id}`,
    id,
    targetType: "ORGANIZATION_LOCATION",
    targetId: id,
    group: "HELP",
    groupLabel: "Pomoc psom",
    name: value(row, "name"),
    category,
    categoryLabel: organizationTypeLabels[category] ?? category,
    city: value(row, "city"),
    district: value(row, "district"),
    region: value(row, "region"),
    formattedAddress: displayAddress(value(row, "address"), value(row, "city"), value(row, "district"), value(row, "region")),
    publicAddress: "",
    legacyAddress: "",
    addressWarning: null,
    addressState: hasLocationSource ? "AVAILABLE" : "MISSING",
    addressReason: hasLocationSource ? role : "MISSING",
    operatorState,
    operatorReason: operatorState === state.state ? state.reason : "Položka zodpovedá zvolenému serverovému operator filtru.",
    editorHref: `/admin/organizacie/${organizationId}#locations`,
    attentionHref: "/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti",
    ...geo,
    googleMapsTarget: value(row, "google_state") as GeoAdminGoogleState,
    googleMapsNotRequiredSystemDerived: false,
    googlePickerAvailable: picker.available,
    googlePickerUnavailableReason: picker.reason || null,
  };
}

function eventRow(row: DbRow): GeoAdminOperatorRow {
  const id = Number(row.id);
  const category = value(row, "category") || "Iné";
  const city = value(row, "city");
  const region = value(row, "region");
  const venue = value(row, "venue");
  const online = truthy(row, "online");
  const geo = commonGeo(row);
  const hasLocationSource = Boolean(value(row, "address") || venue || city);
  const state = online
    ? { state: "NOT_PUBLIC" as const, reason: "Online podujatie nemá fyzický Google Maps bod." }
    : geoAdminGenericOperatorState({
        hasLocationSource,
        missingReason: "Podujatie nemá použiteľné fyzické miesto.",
        geocodeStatus: geo.geocodeStatus,
        publicVisibility: geo.publicVisibility,
        publicPrecision: geo.publicPrecision,
        latitude: geo.latitude,
        longitude: geo.longitude,
        sourceFingerprint: geo.sourceFingerprint,
        resolvedSourceFingerprint: geo.resolvedSourceFingerprint,
        manualOverride: geo.manualOverride,
      });
  const source: GeoSourceLocation = {
    targetType: "MANAGED_EVENT",
    targetId: id,
    label: value(row, "name"),
    category,
    venue,
    address: value(row, "address"),
    city,
    region,
    countryCode: "SK",
    online,
    published: true,
  };
  const picker = pickerAvailability(source, geo);
  const operatorState = value(row, "operator_state") as GeoAdminOperatorState;

  return {
    key: `MANAGED_EVENT:${id}`,
    id,
    targetType: "MANAGED_EVENT",
    targetId: id,
    group: "EVENTS",
    groupLabel: "Podujatia",
    name: value(row, "name"),
    category,
    categoryLabel: category,
    city,
    district: "",
    region,
    formattedAddress: displayAddress(venue, value(row, "address"), city, region),
    publicAddress: "",
    legacyAddress: "",
    addressWarning: null,
    addressState: hasLocationSource ? "AVAILABLE" : "MISSING",
    addressReason: online ? "ONLINE_ONLY" : hasLocationSource ? "AVAILABLE" : "MISSING",
    operatorState,
    operatorReason: operatorState === state.state ? state.reason : "Položka zodpovedá zvolenému serverovému operator filtru.",
    editorHref: `/admin/podujatia/${id}`,
    attentionHref: "/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti",
    ...geo,
    googleMapsTarget: value(row, "google_state") as GeoAdminGoogleState,
    googleMapsNotRequiredSystemDerived: online,
    googlePickerAvailable: picker.available,
    googlePickerUnavailableReason: picker.reason || null,
  };
}

function mapRow(row: DbRow) {
  const targetType = value(row, "target_type");
  if (targetType === "DIRECTORY_PROFILE") return directoryRow(row);
  if (targetType === "ORGANIZATION_LOCATION") return organizationRow(row);
  return eventRow(row);
}

function integer(row: DbRow | null, key: string) {
  return Number(row?.[key] ?? 0);
}

function categoryLabel(group: string, category: string) {
  if (group === "SERVICES") return getDirectoryCategory(category)?.singular ?? category;
  if (group === "HELP") return organizationTypeLabels[category] ?? category;
  return category || "Iné";
}

function pagination(page: number, pageSize: number, totalItems: number): GeoAdminOperatorPagination {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const boundedPage = Math.min(Math.max(1, page), totalPages);
  return {
    page: boundedPage,
    pageSize,
    totalItems,
    totalPages,
    from: totalItems ? ((boundedPage - 1) * pageSize) + 1 : 0,
    to: totalItems ? Math.min(totalItems, boundedPage * pageSize) : 0,
  };
}

export async function loadGeoAdminOperatorProfiles(
  input: Partial<Record<keyof GeoAdminOperatorQuery, unknown>> = {},
): Promise<GeoAdminOperatorData> {
  const db = requireDb();
  const filters = normalizeGeoAdminOperatorQuery(input);
  const filtered = filterSql(filters);
  const categoryFilter = filterSql(filters, { includeCategory: false });

  const [countRow, categoryRows] = await Promise.all([
    db.prepare(`
      ${GEO_BASE_CTE}
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN group_key = 'SERVICES' THEN 1 ELSE 0 END) AS services,
        SUM(CASE WHEN group_key = 'HELP' THEN 1 ELSE 0 END) AS help,
        SUM(CASE WHEN group_key = 'EVENTS' THEN 1 ELSE 0 END) AS events,
        SUM(CASE WHEN google_state = 'PLACE' THEN 1 ELSE 0 END) AS google_place,
        SUM(CASE WHEN google_state = 'COORDINATES' THEN 1 ELSE 0 END) AS google_coordinates,
        SUM(CASE WHEN google_state = 'NOT_REQUIRED' THEN 1 ELSE 0 END) AS google_not_required,
        SUM(CASE WHEN google_state = 'UNRESOLVED' THEN 1 ELSE 0 END) AS google_unresolved,
        SUM(CASE WHEN operator_state = 'ON_MAP' THEN 1 ELSE 0 END) AS op_on_map,
        SUM(CASE WHEN operator_state = 'PENDING' THEN 1 ELSE 0 END) AS op_pending,
        SUM(CASE WHEN operator_state = 'NEEDS_REVIEW' THEN 1 ELSE 0 END) AS op_needs_review,
        SUM(CASE WHEN operator_state = 'MISSING_ADDRESS' THEN 1 ELSE 0 END) AS op_missing_address,
        SUM(CASE WHEN operator_state = 'INCOMPLETE_ADDRESS' THEN 1 ELSE 0 END) AS op_incomplete_address,
        SUM(CASE WHEN operator_state = 'INVALID_ADDRESS' THEN 1 ELSE 0 END) AS op_invalid_address,
        SUM(CASE WHEN operator_state = 'FAILED' THEN 1 ELSE 0 END) AS op_failed,
        SUM(CASE WHEN operator_state = 'NOT_PUBLIC' THEN 1 ELSE 0 END) AS op_not_public
      FROM base
      ${filtered.clause}
    `).bind(...filtered.bindings).first<DbRow>(),
    db.prepare(`
      ${GEO_BASE_CTE}
      SELECT group_key, category, COUNT(*) AS count
      FROM base
      ${categoryFilter.clause}
      GROUP BY group_key, category
      ORDER BY group_key ASC, category COLLATE NOCASE ASC
    `).bind(...categoryFilter.bindings).all<DbRow>(),
  ]);

  const total = integer(countRow, "total");
  const paging = pagination(filters.page, filters.pageSize, total);
  const offset = (paging.page - 1) * paging.pageSize;
  const pageRows = await db.prepare(`
    ${GEO_BASE_CTE}
    SELECT *
    FROM base
    ${filtered.clause}
    ORDER BY name COLLATE NOCASE ASC, target_type ASC, target_id ASC
    LIMIT ? OFFSET ?
  `).bind(...filtered.bindings, paging.pageSize, offset).all<DbRow>();

  const operators: GeoAdminOperatorSummary = {
    ON_MAP: integer(countRow, "op_on_map"),
    PENDING: integer(countRow, "op_pending"),
    NEEDS_REVIEW: integer(countRow, "op_needs_review"),
    MISSING_ADDRESS: integer(countRow, "op_missing_address"),
    INCOMPLETE_ADDRESS: integer(countRow, "op_incomplete_address"),
    INVALID_ADDRESS: integer(countRow, "op_invalid_address"),
    FAILED: integer(countRow, "op_failed"),
    NOT_PUBLIC: integer(countRow, "op_not_public"),
  };
  const counts: GeoAdminOperatorCounts = {
    total,
    groups: {
      SERVICES: integer(countRow, "services"),
      HELP: integer(countRow, "help"),
      EVENTS: integer(countRow, "events"),
    },
    google: {
      PLACE: integer(countRow, "google_place"),
      COORDINATES: integer(countRow, "google_coordinates"),
      NOT_REQUIRED: integer(countRow, "google_not_required"),
      UNRESOLVED: integer(countRow, "google_unresolved"),
    },
    operators,
  };
  const categoryMap = new Map<string, GeoAdminOperatorCategory>();
  for (const row of categoryRows.results ?? []) {
    const categoryValue = value(row, "category");
    if (!categoryValue) continue;
    const existing = categoryMap.get(categoryValue);
    categoryMap.set(categoryValue, {
      value: categoryValue,
      label: existing?.label ?? categoryLabel(value(row, "group_key"), categoryValue),
      count: (existing?.count ?? 0) + Number(row.count ?? 0),
    });
  }
  const categories = [...categoryMap.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "sk", { sensitivity: "base" }),
  );

  return {
    items: (pageRows.results ?? []).map(mapRow),
    counts,
    summary: operators,
    categories,
    pagination: paging,
    filters: { ...filters, page: paging.page },
    total,
  };
}
