import { env } from "cloudflare:workers";
import { geoAdminOperatorState, geoAdminOperatorStateLabels, type GeoAdminOperatorState } from "@/lib/geo-admin-operator-state";
import { getDirectoryCategory } from "@/lib/directory";
import {
  evaluateDirectoryServiceAddress,
  type DirectoryServiceAddressEvaluation,
} from "@/lib/directory-service-address";

type RuntimeBindings = { DB?: D1Database };
export type GeoAdminOperatorRow = {
  id: number;
  name: string;
  category: string;
  categoryLabel: string;
  city: string;
  district: string;
  region: string;
  formattedAddress: string | null;
  legacyAddress: string;
  addressState: DirectoryServiceAddressEvaluation["state"];
  addressReason: DirectoryServiceAddressEvaluation["reason"];
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
  latitude: number | null;
  longitude: number | null;
  errorCode: string | null;
  manualOverride: boolean;
  updatedAt: string | null;
};

export type GeoAdminOperatorSummary = Record<GeoAdminOperatorState, number>;

type DbRow = Record<string, unknown>;

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

function requireDb() {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Geo databáza zatiaľ nie je pripojená.");
  return db;
}

export async function loadGeoAdminOperatorProfiles() {
  const db = requireDb();
  const result = await db.prepare(`
    SELECT
      d.id, d.name, d.category, d.address, d.city, d.district, d.region, d.postal_code,
      d.street, d.house_number, d.address_format, d.service_address_confirmation, d.online,
      g.id AS geo_point_id, g.geocode_status, g.public_visibility, g.public_precision,
      g.provider, g.normalized_query, g.source_fingerprint, g.resolved_source_fingerprint,
      g.latitude, g.longitude, g.last_error_code, g.manual_override, g.updated_at AS geo_updated_at
    FROM directory_profiles d
    LEFT JOIN geo_points g ON g.directory_profile_id = d.id
    WHERE d.status = 'published'
    ORDER BY d.name COLLATE NOCASE ASC, d.id ASC
    LIMIT 2000
  `).all<DbRow>();

  const items: GeoAdminOperatorRow[] = result.results.map((row) => {
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
      online: Boolean(row.online),
    });

    const state = geoAdminOperatorState({
      addressState: evaluation.state,
      addressReason: evaluation.reason,
      geocodeStatus: nullable(row, "geocode_status"),
      publicVisibility: nullable(row, "public_visibility"),
      publicPrecision: nullable(row, "public_precision"),
      latitude: numberOrNull(row, "latitude"),
      longitude: numberOrNull(row, "longitude"),
      sourceFingerprint: nullable(row, "source_fingerprint"),
      resolvedSourceFingerprint: nullable(row, "resolved_source_fingerprint"),
      manualOverride: Boolean(row.manual_override),
    });
    const id = Number(row.id);
    const category = value(row, "category");

    return {
      id,
      name: value(row, "name"),
      category,
      categoryLabel: getDirectoryCategory(category)?.singular ?? category,
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
      attentionHref: `/admin/operations?source=GEO_LOCATION_ISSUE&view=active#centrum-pozornosti`,
      geoPointId: numberOrNull(row, "geo_point_id"),
      geocodeStatus: nullable(row, "geocode_status"),
      publicVisibility: nullable(row, "public_visibility"),
      publicPrecision: nullable(row, "public_precision"),
      provider: nullable(row, "provider"),
      normalizedQuery: nullable(row, "normalized_query"),
      sourceFingerprint: nullable(row, "source_fingerprint"),
      resolvedSourceFingerprint: nullable(row, "resolved_source_fingerprint"),
      latitude: numberOrNull(row, "latitude"),
      longitude: numberOrNull(row, "longitude"),
      errorCode: nullable(row, "last_error_code"),
      manualOverride: Boolean(row.manual_override),
      updatedAt: nullable(row, "geo_updated_at"),
    };
  });

  const summary = Object.fromEntries(
    (Object.keys(geoAdminOperatorStateLabels) as GeoAdminOperatorState[]).map((key) => [
      key,
      items.filter((item) => item.operatorState === key).length,
    ]),
  ) as GeoAdminOperatorSummary;

  return { items, summary, total: items.length };
}
