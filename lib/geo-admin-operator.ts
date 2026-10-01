import { env } from "cloudflare:workers";
import { getDirectoryCategory } from "@/lib/directory";
import {
  evaluateDirectoryServiceAddress,
  type DirectoryServiceAddressEvaluation,
} from "@/lib/directory-service-address";
import type { GeoTargetType } from "@/lib/geo";
import {
  geoAdminOperatorState,
  geoAdminOperatorStateLabels,
  type GeoAdminOperatorState,
} from "@/lib/geo-admin-operator-state";

type RuntimeBindings = { DB?: D1Database };

export type GeoAdminOperatorGroup = "DIRECTORY" | "HELP" | "EVENT";

export type GeoAdminOperatorRow = {
  key: string;
  targetType: GeoTargetType;
  group: GeoAdminOperatorGroup;
  groupLabel: string;
  id: number;
  parentId: number | null;
  name: string;
  category: string;
  categoryLabel: string;
  locationRole: string | null;
  city: string;
  district: string;
  region: string;
  formattedAddress: string | null;
  legacyAddress: string;
  addressState: DirectoryServiceAddressEvaluation["state"];
  addressReason: string;
  operatorState: GeoAdminOperatorState;
  operatorReason: string;
  editorHref: string;
  attentionHref: string;
  googlePlaceActionAvailable: boolean;
  googlePlaceActionReason: string | null;
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
  googleMapsTarget: "PLACE" | "COORDINATES" | null;
  latitude: number | null;
  longitude: number | null;
  errorCode: string | null;
  manualOverride: boolean;
  updatedAt: string | null;
};

export type GeoAdminOperatorSummary = Record<GeoAdminOperatorState, number>;

type DbRow = Record<string, unknown>;

const organizationTypeLabels: Record<string, string> = {
  SHELTER: "Útulok",
  CIVIC_ASSOCIATION: "Občianske združenie",
  RESCUE_ORGANIZATION: "Záchranná organizácia",
  MUNICIPAL_ORGANIZATION: "Mestská/obecná organizácia",
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
function bool(row: DbRow, key: string) {
  return Boolean(row[key]);
}

function requireDb() {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Geo databáza zatiaľ nie je pripojená.");
  return db;
}

function joinedAddress(...parts: Array<string | null | undefined>) {
  const values = parts.map((part) => part?.trim() ?? "").filter(Boolean);
  return values.length ? values.join(", ") : null;
}

function currentGoogleMapsTarget(row: DbRow, state: GeoAdminOperatorState) {
  if (state !== "ON_MAP") return null;
  const sourceFingerprint = nullable(row, "source_fingerprint");
  const googlePlaceId = nullable(row, "google_place_id");
  const googlePlaceSourceFingerprint = nullable(row, "google_place_source_fingerprint");
  return googlePlaceId
    && googlePlaceSourceFingerprint
    && sourceFingerprint
    && googlePlaceSourceFingerprint === sourceFingerprint
    ? "PLACE" as const
    : "COORDINATES" as const;
}

function operatorStateFor(
  targetType: GeoTargetType,
  row: DbRow,
  addressState: DirectoryServiceAddressEvaluation["state"],
  addressReason: string,
  fallback?: { geocodeStatus?: string | null; publicVisibility?: string | null },
) {
  return geoAdminOperatorState({
    targetType,
    addressState,
    addressReason,
    geocodeStatus: nullable(row, "geocode_status") ?? fallback?.geocodeStatus ?? null,
    publicVisibility: nullable(row, "public_visibility") ?? fallback?.publicVisibility ?? null,
    publicPrecision: nullable(row, "public_precision"),
    latitude: numberOrNull(row, "latitude"),
    longitude: numberOrNull(row, "longitude"),
    sourceFingerprint: nullable(row, "source_fingerprint"),
    resolvedSourceFingerprint: nullable(row, "resolved_source_fingerprint"),
    manualOverride: bool(row, "manual_override"),
  });
}

function geoFields(row: DbRow, state: GeoAdminOperatorState) {
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
    googleMapsTarget: currentGoogleMapsTarget(row, state),
    latitude: numberOrNull(row, "latitude"),
    longitude: numberOrNull(row, "longitude"),
    errorCode: nullable(row, "last_error_code"),
    manualOverride: bool(row, "manual_override"),
    updatedAt: nullable(row, "geo_updated_at"),
  };
}

async function loadDirectoryRows(db: D1Database): Promise<GeoAdminOperatorRow[]> {
  const result = await db.prepare(`
    SELECT
      d.id, d.name, d.category, d.address, d.city, d.district, d.region, d.postal_code,
      d.street, d.house_number, d.address_format, d.service_address_confirmation,
      g.id AS geo_point_id, g.geocode_status, g.public_visibility, g.public_precision,
      g.provider, g.normalized_query, g.source_fingerprint, g.resolved_source_fingerprint,
      g.google_place_id, g.google_place_source_fingerprint,
      g.latitude, g.longitude, g.last_error_code, g.manual_override, g.updated_at AS geo_updated_at
    FROM directory_profiles d
    LEFT JOIN geo_points g
      ON g.directory_profile_id = d.id
      AND g.target_type = 'DIRECTORY_PROFILE'
    WHERE d.status = 'published' AND d.archived_at IS NULL
    ORDER BY d.name COLLATE NOCASE ASC, d.id ASC
    LIMIT 2000
  `).all<DbRow>();

  return result.results.map((row) => {
    const evaluation = evaluateDirectoryServiceAddress({
      region: value(row, "region"),
      district: value(row, "district"),
      city: value(row, "city"),
      postalCode: value(row, "postal_code"),
      street: value(row, "street"),
      houseNumber: value(row, "house_number"),
      addressFormat: row.address_format === "STREET" || row.address_format === "MUNICIPALITY_NUMBER" ? row.address_format : "",
      serviceAddressConfirmation: row.service_address_confirmation === "CONFIRMED_SERVICE_LOCATION"
        ? "CONFIRMED_SERVICE_LOCATION"
        : "LEGACY_UNCONFIRMED",
      online: false,
    });
    const state = operatorStateFor("DIRECTORY_PROFILE", row, evaluation.state, evaluation.reason);
    const id = Number(row.id);
    const category = value(row, "category");
    return {
      key: `DIRECTORY_PROFILE:${id}`,
      targetType: "DIRECTORY_PROFILE",
      group: "DIRECTORY",
      groupLabel: "Služby",
      id,
      parentId: null,
      name: value(row, "name"),
      category,
      categoryLabel: getDirectoryCategory(category)?.singular ?? category,
      locationRole: null,
      city: value(row, "city"),
      district: value(row, "district"),
      region: value(row, "region"),
      formattedAddress: evaluation.formattedAddress,
      legacyAddress: value(row, "address"),
      addressState: evaluation.state,
      addressReason: evaluation.reason,
      operatorState: state.state,
      operatorReason: state.reason,
      editorHref: `/admin/adresar/${id}#service-address`,
      attentionHref: "/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti",
      googlePlaceActionAvailable: true,
      googlePlaceActionReason: null,
      ...geoFields(row, state.state),
    };
  });
}

async function loadOrganizationRows(db: D1Database): Promise<GeoAdminOperatorRow[]> {
  const result = await db.prepare(`
    SELECT
      l.id, l.organization_id, l.role, l.label, l.address, l.city, l.district, l.region, l.country_code,
      o.name AS organization_name, o.type AS organization_type,
      g.id AS geo_point_id, g.geocode_status, g.public_visibility, g.public_precision,
      g.provider, g.normalized_query, g.source_fingerprint, g.resolved_source_fingerprint,
      g.google_place_id, g.google_place_source_fingerprint,
      g.latitude, g.longitude, g.last_error_code, g.manual_override, g.updated_at AS geo_updated_at
    FROM organization_locations l
    JOIN help_organizations o ON o.id = l.organization_id
    LEFT JOIN geo_points g
      ON g.organization_location_id = l.id
      AND g.target_type = 'ORGANIZATION_LOCATION'
    WHERE o.status = 'PUBLISHED' AND o.archived_at IS NULL
    ORDER BY o.name COLLATE NOCASE ASC, l.sort_order ASC, l.id ASC
    LIMIT 2000
  `).all<DbRow>();

  return result.results.map((row) => {
    const id = Number(row.id);
    const organizationId = Number(row.organization_id);
    const role = value(row, "role") || "UNSPECIFIED";
    const address = value(row, "address");
    const city = value(row, "city");
    const hasLocation = Boolean(address || city);
    const addressState: DirectoryServiceAddressEvaluation["state"] = hasLocation ? "COMPLETE" : "MISSING";
    const addressReason = hasLocation ? "COMPLETE" : "MISSING";
    const fallbackStatus = role === "SERVICE_AREA"
      ? null
      : role === "SITE"
        ? "NEEDS_REVIEW"
        : "NEEDS_REVIEW";
    const state = operatorStateFor("ORGANIZATION_LOCATION", row, addressState, addressReason, {
      geocodeStatus: fallbackStatus,
    });
    const organizationName = value(row, "organization_name");
    const label = value(row, "label");
    const category = value(row, "organization_type") || "OTHER";
    const canGoogle = role === "SITE";
    return {
      key: `ORGANIZATION_LOCATION:${id}`,
      targetType: "ORGANIZATION_LOCATION",
      group: "HELP",
      groupLabel: "Pomoc psom",
      id,
      parentId: organizationId,
      name: label && label.toLocaleLowerCase("sk") !== organizationName.toLocaleLowerCase("sk")
        ? `${organizationName} — ${label}`
        : organizationName,
      category,
      categoryLabel: organizationTypeLabels[category] ?? category,
      locationRole: role,
      city,
      district: value(row, "district"),
      region: value(row, "region"),
      formattedAddress: joinedAddress(address, city, value(row, "district"), value(row, "region")),
      legacyAddress: address,
      addressState,
      addressReason,
      operatorState: state.state,
      operatorReason: state.reason,
      editorHref: `/admin/organizacie/${organizationId}#locations`,
      attentionHref: "/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti",
      googlePlaceActionAvailable: canGoogle,
      googlePlaceActionReason: canGoogle
        ? null
        : role === "SERVICE_AREA"
          ? "Service area zostáva približná; neukladá sa ako exact Google miesto."
          : role === "LEGAL_SEAT"
            ? "Právne sídlo sa nesmie automaticky zverejniť ako navštevované Google miesto."
            : "Najprv v profile označ lokalitu ako verejne navštevované SITE.",
      ...geoFields(row, state.state),
    };
  });
}

async function loadEventRows(db: D1Database): Promise<GeoAdminOperatorRow[]> {
  const result = await db.prepare(`
    SELECT
      e.id, e.title, e.event_type, e.venue, e.address, e.city, e.region,
      g.id AS geo_point_id, g.geocode_status, g.public_visibility, g.public_precision,
      g.provider, g.normalized_query, g.source_fingerprint, g.resolved_source_fingerprint,
      g.google_place_id, g.google_place_source_fingerprint,
      g.latitude, g.longitude, g.last_error_code, g.manual_override, g.updated_at AS geo_updated_at
    FROM managed_events e
    LEFT JOIN geo_points g
      ON g.managed_event_id = e.id
      AND g.target_type = 'MANAGED_EVENT'
    WHERE e.status = 'published' AND e.cancelled = 0
    ORDER BY e.start_date DESC, e.title COLLATE NOCASE ASC, e.id ASC
    LIMIT 2000
  `).all<DbRow>();

  return result.results.map((row) => {
    const id = Number(row.id);
    const venue = value(row, "venue");
    const address = value(row, "address");
    const city = value(row, "city");
    const region = value(row, "region");
    const online = region.toLocaleLowerCase("sk") === "online"
      || city.toLocaleLowerCase("sk") === "online"
      || venue.toLocaleLowerCase("sk") === "online";
    const hasLocation = Boolean(venue || address || city);
    const addressState: DirectoryServiceAddressEvaluation["state"] = hasLocation ? "COMPLETE" : "MISSING";
    const addressReason = online ? "ONLINE_ONLY" : hasLocation ? "COMPLETE" : "MISSING";
    const state = operatorStateFor("MANAGED_EVENT", row, addressState, addressReason, online
      ? { geocodeStatus: "SKIPPED", publicVisibility: "HIDDEN" }
      : undefined);
    return {
      key: `MANAGED_EVENT:${id}`,
      targetType: "MANAGED_EVENT",
      group: "EVENT",
      groupLabel: "Podujatia",
      id,
      parentId: null,
      name: value(row, "title"),
      category: value(row, "event_type"),
      categoryLabel: value(row, "event_type") || "Podujatie",
      locationRole: null,
      city,
      district: "",
      region,
      formattedAddress: joinedAddress(venue, address, city, region),
      legacyAddress: address,
      addressState,
      addressReason,
      operatorState: state.state,
      operatorReason: state.reason,
      editorHref: `/admin/podujatia/${id}#geo`,
      attentionHref: "/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti",
      googlePlaceActionAvailable: !online,
      googlePlaceActionReason: online ? "Online podujatie nemá fyzické Google Maps miesto." : null,
      ...geoFields(row, state.state),
    };
  });
}

export async function loadGeoAdminOperatorProfiles() {
  const db = requireDb();
  const [directory, help, events] = await Promise.all([
    loadDirectoryRows(db),
    loadOrganizationRows(db),
    loadEventRows(db),
  ]);
  const items = [...directory, ...help, ...events];

  const summary = Object.fromEntries(
    (Object.keys(geoAdminOperatorStateLabels) as GeoAdminOperatorState[]).map((key) => [
      key,
      items.filter((item) => item.operatorState === key).length,
    ]),
  ) as GeoAdminOperatorSummary;

  return {
    items,
    summary,
    total: items.length,
    totalsByGroup: {
      DIRECTORY: directory.length,
      HELP: help.length,
      EVENT: events.length,
    },
  };
}
