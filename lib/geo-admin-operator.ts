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
export type GeoAdminOperatorAddressState = DirectoryServiceAddressEvaluation["state"] | "AVAILABLE";

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
  googleMapsTarget: "PLACE" | "COORDINATES" | "NONE";
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

type DbRow = Record<string, unknown>;

const GEO_FIELDS = `
  g.id AS geo_point_id, g.geocode_status, g.public_visibility, g.public_precision,
  g.provider, g.normalized_query, g.source_fingerprint, g.resolved_source_fingerprint,
  g.google_place_id, g.google_place_source_fingerprint,
  g.latitude, g.longitude, g.last_error_code, g.manual_override, g.updated_at AS geo_updated_at,
  EXISTS (
    SELECT 1 FROM moderation_events m
    WHERE m.resource_type = 'GEO_POINT'
      AND m.subject_id = CAST(g.id AS TEXT)
      AND m.action = 'GEO_VISIBILITY_CHANGED'
      AND m.actor_type = 'ADMIN'
      AND m.to_status = 'SKIPPED'
  ) AS explicit_private
`;

const organizationTypeLabels: Record<string, string> = {
  SHELTER: "Útulok",
  CIVIC_ASSOCIATION: "Občianske združenie",
  RESCUE_ORGANIZATION: "Záchranná organizácia",
  MUNICIPAL_ORGANIZATION: "Mestská / obecná organizácia",
  NONPROFIT: "Nezisková organizácia",
  OTHER: "Iné",
};

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

function googleMapsTarget(
  state: GeoAdminOperatorState,
  geo: ReturnType<typeof commonGeo>,
): GeoAdminOperatorRow["googleMapsTarget"] {
  if (
    state !== "ON_MAP"
    || geo.publicVisibility === "HIDDEN"
    || geo.latitude === null
    || geo.longitude === null
  ) return "NONE";
  const currentPlace = Boolean(
    geo.googlePlaceId
    && geo.googlePlaceSourceFingerprint
    && geo.sourceFingerprint
    && geo.googlePlaceSourceFingerprint === geo.sourceFingerprint,
  );
  return currentPlace ? "PLACE" : "COORDINATES";
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
  const publicAddress = value(row, "address");
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
    operatorState: state.state,
    operatorReason: state.reason,
    editorHref: `/admin/adresar/${id}#service-address`,
    attentionHref: "/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti",
    ...geo,
    googleMapsTarget: googleMapsTarget(state.state, geo),
    googlePickerAvailable: picker.available,
    googlePickerUnavailableReason: picker.reason || null,
  };
}

function organizationRow(row: DbRow): GeoAdminOperatorRow {
  const id = Number(row.id);
  const organizationId = Number(row.organization_id);
  const role = value(row, "role") || "UNSPECIFIED";
  const organizationName = value(row, "organization_name");
  const locationLabel = value(row, "location_label");
  const name = locationLabel && locationLabel !== organizationName
    ? `${organizationName} — ${locationLabel}`
    : organizationName || locationLabel;
  const category = value(row, "organization_type") || "OTHER";
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

  return {
    key: `ORGANIZATION_LOCATION:${id}`,
    id,
    targetType: "ORGANIZATION_LOCATION",
    targetId: id,
    group: "HELP",
    groupLabel: "Pomoc psom",
    name,
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
    operatorState: state.state,
    operatorReason: state.reason,
    editorHref: `/admin/organizacie/${organizationId}#locations`,
    attentionHref: "/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti",
    ...geo,
    googleMapsTarget: googleMapsTarget(state.state, geo),
    googlePickerAvailable: picker.available,
    googlePickerUnavailableReason: picker.reason || null,
  };
}

function eventRow(row: DbRow): GeoAdminOperatorRow {
  const id = Number(row.id);
  const category = value(row, "event_type") || "Iné";
  const city = value(row, "city");
  const region = value(row, "region");
  const venue = value(row, "venue");
  const online = [city, region, venue].some((item) => item.toLocaleLowerCase("sk") === "online");
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
    label: value(row, "title"),
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

  return {
    key: `MANAGED_EVENT:${id}`,
    id,
    targetType: "MANAGED_EVENT",
    targetId: id,
    group: "EVENTS",
    groupLabel: "Podujatia",
    name: value(row, "title"),
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
    operatorState: state.state,
    operatorReason: state.reason,
    editorHref: `/admin/podujatia/${id}`,
    attentionHref: "/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti",
    ...geo,
    googleMapsTarget: googleMapsTarget(state.state, geo),
    googlePickerAvailable: picker.available,
    googlePickerUnavailableReason: picker.reason || null,
  };
}

export async function loadGeoAdminOperatorProfiles() {
  const db = requireDb();
  const [directories, organizations, events] = await Promise.all([
    db.prepare(`
      SELECT
        d.id, d.name, d.category, d.address, d.city, d.district, d.region, d.postal_code,
        d.street, d.house_number, d.address_format, d.service_address_confirmation,
        ${GEO_FIELDS}
      FROM directory_profiles d
      LEFT JOIN geo_points g ON g.directory_profile_id = d.id AND g.target_type = 'DIRECTORY_PROFILE'
      WHERE d.status = 'published' AND d.archived_at IS NULL
      ORDER BY d.name COLLATE NOCASE ASC, d.id ASC
      LIMIT 2000
    `).all<DbRow>(),
    db.prepare(`
      SELECT
        l.id, l.organization_id, l.role, l.label AS location_label, l.address, l.city, l.district, l.region, l.country_code,
        o.name AS organization_name, o.type AS organization_type,
        ${GEO_FIELDS}
      FROM organization_locations l
      JOIN help_organizations o ON o.id = l.organization_id
      LEFT JOIN geo_points g ON g.organization_location_id = l.id AND g.target_type = 'ORGANIZATION_LOCATION'
      WHERE o.status = 'PUBLISHED' AND o.archived_at IS NULL
      ORDER BY o.name COLLATE NOCASE ASC, l.sort_order ASC, l.id ASC
      LIMIT 2000
    `).all<DbRow>(),
    db.prepare(`
      SELECT
        e.id, e.title, e.event_type, e.venue, e.address, e.city, e.region,
        ${GEO_FIELDS}
      FROM managed_events e
      LEFT JOIN geo_points g ON g.managed_event_id = e.id AND g.target_type = 'MANAGED_EVENT'
      WHERE e.status = 'published' AND e.cancelled = 0
      ORDER BY e.start_date DESC, e.title COLLATE NOCASE ASC, e.id ASC
      LIMIT 2000
    `).all<DbRow>(),
  ]);

  const items: GeoAdminOperatorRow[] = [
    ...directories.results.map(directoryRow),
    ...organizations.results.map(organizationRow),
    ...events.results.map(eventRow),
  ];

  const summary = Object.fromEntries(
    (Object.keys(geoAdminOperatorStateLabels) as GeoAdminOperatorState[]).map((key) => [
      key,
      items.filter((item) => item.operatorState === key).length,
    ]),
  ) as GeoAdminOperatorSummary;

  return { items, summary, total: items.length };
}
