import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organizationLocations } from "./help-organization-schema";
import { directoryProfiles, managedEvents } from "./schema";

export const geoPoints = sqliteTable(
  "geo_points",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetType: text("target_type").notNull(),
    directoryProfileId: integer("directory_profile_id").references(() => directoryProfiles.id, { onDelete: "cascade" }),
    organizationLocationId: integer("organization_location_id").references(() => organizationLocations.id, { onDelete: "cascade" }),
    managedEventId: integer("managed_event_id").references(() => managedEvents.id, { onDelete: "cascade" }),
    publicVisibility: text("public_visibility"),
    publicPrecision: text("public_precision"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    resolutionMethod: text("resolution_method"),
    provider: text("provider"),
    provenance: text("provenance"),
    sourceLicense: text("source_license"),
    normalizedQuery: text("normalized_query"),
    queryFingerprint: text("query_fingerprint"),
    sourceFingerprint: text("source_fingerprint").notNull(),
    resolvedSourceFingerprint: text("resolved_source_fingerprint"),
    geocodeStatus: text("geocode_status").notNull().default("PENDING"),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: text("last_error_at"),
    retryAfterAt: text("retry_after_at"),
    attemptCount: integer("attempt_count").notNull().default(0),
    manualOverride: integer("manual_override").notNull().default(0),
    manualUpdatedAt: text("manual_updated_at"),
    manualUpdatedBy: text("manual_updated_by"),
    lastGeocodedAt: text("last_geocoded_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("geo_points_target_type_check", sql`${table.targetType} IN ('DIRECTORY_PROFILE', 'ORGANIZATION_LOCATION', 'MANAGED_EVENT')`),
    check("geo_points_visibility_check", sql`${table.publicVisibility} IS NULL OR ${table.publicVisibility} IN ('EXACT_PUBLIC', 'APPROXIMATE_PUBLIC', 'HIDDEN')`),
    check("geo_points_precision_check", sql`${table.publicPrecision} IS NULL OR ${table.publicPrecision} IN ('EXACT', 'NEIGHBORHOOD', 'MUNICIPALITY', 'SERVICE_AREA', 'APPROXIMATE')`),
    check("geo_points_status_check", sql`${table.geocodeStatus} IN ('PENDING', 'RESOLVED', 'NEEDS_REVIEW', 'FAILED', 'STALE', 'SKIPPED')`),
    check("geo_points_resolution_method_check", sql`${table.resolutionMethod} IS NULL OR ${table.resolutionMethod} IN ('GEOCODER', 'LOCALITY', 'MANUAL', 'SOURCE_COORDINATES')`),
    check("geo_points_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check("geo_points_manual_override_check", sql`${table.manualOverride} IN (0, 1)`),
    check("geo_points_exactly_one_target_check", sql`
      (${table.targetType} = 'DIRECTORY_PROFILE' AND ${table.directoryProfileId} IS NOT NULL AND ${table.organizationLocationId} IS NULL AND ${table.managedEventId} IS NULL)
      OR (${table.targetType} = 'ORGANIZATION_LOCATION' AND ${table.directoryProfileId} IS NULL AND ${table.organizationLocationId} IS NOT NULL AND ${table.managedEventId} IS NULL)
      OR (${table.targetType} = 'MANAGED_EVENT' AND ${table.directoryProfileId} IS NULL AND ${table.organizationLocationId} IS NULL AND ${table.managedEventId} IS NOT NULL)
    `),
    check("geo_points_coordinate_pair_check", sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL)`),
    check("geo_points_latitude_check", sql`${table.latitude} IS NULL OR (${table.latitude} >= -90 AND ${table.latitude} <= 90)`),
    check("geo_points_longitude_check", sql`${table.longitude} IS NULL OR (${table.longitude} >= -180 AND ${table.longitude} <= 180)`),
    check("geo_points_unclassified_coordinates_check", sql`${table.publicVisibility} IS NOT NULL OR (${table.latitude} IS NULL AND ${table.longitude} IS NULL)`),
    check("geo_points_hidden_coordinates_check", sql`${table.publicVisibility} <> 'HIDDEN' OR (${table.latitude} IS NULL AND ${table.longitude} IS NULL)`),
    check("geo_points_resolved_contract_check", sql`
      ${table.geocodeStatus} <> 'RESOLVED'
      OR (
        ${table.publicVisibility} IN ('EXACT_PUBLIC', 'APPROXIMATE_PUBLIC')
        AND ${table.publicPrecision} IS NOT NULL
        AND ${table.latitude} IS NOT NULL
        AND ${table.longitude} IS NOT NULL
      )
    `),
    check("geo_points_manual_contract_check", sql`
      ${table.manualOverride} = 0
      OR (
        ${table.resolutionMethod} IS NOT NULL
        AND ${table.resolutionMethod} = 'MANUAL'
        AND ${table.latitude} IS NOT NULL
        AND ${table.longitude} IS NOT NULL
      )
    `),
    uniqueIndex("geo_points_directory_unique").on(table.directoryProfileId).where(sql`${table.directoryProfileId} IS NOT NULL`),
    uniqueIndex("geo_points_organization_location_unique").on(table.organizationLocationId).where(sql`${table.organizationLocationId} IS NOT NULL`),
    uniqueIndex("geo_points_event_unique").on(table.managedEventId).where(sql`${table.managedEventId} IS NOT NULL`),
    index("geo_points_status_updated_idx").on(table.geocodeStatus, table.updatedAt),
    index("geo_points_public_spatial_idx").on(table.publicVisibility, table.geocodeStatus, table.latitude, table.longitude),
    index("geo_points_provider_query_idx").on(table.provider, table.queryFingerprint, table.geocodeStatus),
  ],
);
