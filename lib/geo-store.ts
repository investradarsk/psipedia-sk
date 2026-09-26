import { env } from "cloudflare:workers";
import { adminNotificationAdminActorRef, enqueueAdminNotificationEvent } from "@/lib/admin-notifications";
import {
  buildGeoQuery,
  classifyGeoSource,
  geoFingerprintInput,
  geoQueryFingerprint,
  sourceGeoFingerprint,
  type GeoErrorCode,
  type GeoPublicPrecision,
  type GeoPublicVisibility,
  type GeoResolutionMethod,
  type GeoSourceLocation,
  type GeoStatus,
  type GeoTargetType,
} from "./geo";
import type { NormalizedGeocoderResult } from "./geo-provider";

type GeoBindings = { DB?: D1Database };
export type GeoD1Database = Pick<D1Database, "prepare" | "batch">;

type GeoPointRow = {
  id: number;
  target_type: string;
  directory_profile_id: number | null;
  organization_location_id: number | null;
  managed_event_id: number | null;
  public_visibility: string | null;
  public_precision: string | null;
  latitude: number | null;
  longitude: number | null;
  resolution_method: string | null;
  provider: string | null;
  provenance: string | null;
  source_license: string | null;
  normalized_query: string | null;
  query_fingerprint: string | null;
  source_fingerprint: string;
  resolved_source_fingerprint: string | null;
  geocode_status: string;
  last_error_code: string | null;
  last_error_at: string | null;
  retry_after_at: string | null;
  attempt_count: number;
  manual_override: number;
  manual_updated_at: string | null;
  manual_updated_by: string | null;
  last_geocoded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GeoPointRecord = {
  id: number;
  targetType: GeoTargetType;
  targetId: number;
  directoryProfileId: number | null;
  organizationLocationId: number | null;
  managedEventId: number | null;
  publicVisibility: GeoPublicVisibility | null;
  publicPrecision: GeoPublicPrecision | null;
  latitude: number | null;
  longitude: number | null;
  resolutionMethod: GeoResolutionMethod | null;
  provider: string | null;
  provenance: string | null;
  sourceLicense: string | null;
  normalizedQuery: string | null;
  queryFingerprint: string | null;
  sourceFingerprint: string;
  resolvedSourceFingerprint: string | null;
  geocodeStatus: GeoStatus;
  lastErrorCode: GeoErrorCode | null;
  lastErrorAt: string | null;
  retryAfterAt: string | null;
  attemptCount: number;
  manualOverride: boolean;
  manualUpdatedAt: string | null;
  manualUpdatedBy: string | null;
  lastGeocodedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const GEO_COLUMNS = `id, target_type, directory_profile_id, organization_location_id, managed_event_id,
  public_visibility, public_precision, latitude, longitude, resolution_method, provider, provenance,
  source_license, normalized_query, query_fingerprint, source_fingerprint, resolved_source_fingerprint,
  geocode_status, last_error_code, last_error_at, retry_after_at, attempt_count, manual_override,
  manual_updated_at, manual_updated_by, last_geocoded_at, created_at, updated_at`;

const targetColumns: Record<GeoTargetType, "directory_profile_id" | "organization_location_id" | "managed_event_id"> = {
  DIRECTORY_PROFILE: "directory_profile_id",
  ORGANIZATION_LOCATION: "organization_location_id",
  MANAGED_EVENT: "managed_event_id",
};

function geoAdminTargetUrl(targetType: GeoTargetType, targetIdValue: number) {
  if (targetType === "DIRECTORY_PROFILE") return `/admin/adresar/${targetIdValue}#geo`;
  if (targetType === "MANAGED_EVENT") return `/admin/podujatia/${targetIdValue}#geo`;
  return "/admin/operations/geo";
}

async function enqueueGeoAttentionEvent(input: {
  database: GeoD1Database;
  point: GeoPointRecord;
  label: string;
  actorType: "ADMIN" | "SYSTEM";
  actorRef?: string | null;
  activationKey: string;
  now: string;
}) {
  if (!["NEEDS_REVIEW", "STALE", "FAILED"].includes(input.point.geocodeStatus)) return;
  try {
    const actorRef = input.actorType === "ADMIN" && input.actorRef
      ? await adminNotificationAdminActorRef(input.actorRef)
      : input.actorRef ?? null;
    await enqueueAdminNotificationEvent(input.database, {
      eventType: "geo_actionable_state",
      sourceType: "GEO_LOCATION_ISSUE",
      resourceType: "geo_point",
      resourceRef: input.point.id,
      actorType: input.actorType,
      actorRef,
      targetUrl: geoAdminTargetUrl(input.point.targetType, input.point.targetId),
      title: "Mapa vyžaduje kontrolu",
      body: `Lokalita ${input.label || `#${input.point.targetId}`} potrebuje zásah.`,
      tag: `geo-location-${input.point.id}`,
      dedupeKey: `geo/${input.point.id}/${input.activationKey}/${input.point.geocodeStatus}/${input.point.lastErrorCode ?? "none"}`,
    }, input.now);
  } catch (error) {
    console.error(JSON.stringify({
      event: "geo_admin_push_enqueue",
      geoPointId: input.point.id,
      result: "failed",
      error: error instanceof Error ? error.message : "unknown",
    }));
  }
}


export function requireGeoD1(database?: GeoD1Database) {
  const bound = (env as unknown as GeoBindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Geo databáza zatiaľ nie je pripojená.");
  return resolved;
}

export async function isGeoSchemaAvailable(database?: GeoD1Database) {
  const db = requireGeoD1(database);
  try {
    await db.prepare("SELECT 1 FROM geo_points LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

export async function isGeoProviderResultIdSchemaAvailable(database?: GeoD1Database) {
  const db = requireGeoD1(database);
  try {
    const result = await db.prepare("PRAGMA table_info('geo_points')").all<{ name: string }>();
    return result.results.some((column) => column.name === "provider_result_id");
  } catch {
    return false;
  }
}

function targetId(row: GeoPointRow) {
  return Number(row.directory_profile_id ?? row.organization_location_id ?? row.managed_event_id);
}

function mapGeoPoint(row: GeoPointRow): GeoPointRecord {
  return {
    id: Number(row.id),
    targetType: row.target_type as GeoTargetType,
    targetId: targetId(row),
    directoryProfileId: row.directory_profile_id === null ? null : Number(row.directory_profile_id),
    organizationLocationId: row.organization_location_id === null ? null : Number(row.organization_location_id),
    managedEventId: row.managed_event_id === null ? null : Number(row.managed_event_id),
    publicVisibility: row.public_visibility as GeoPublicVisibility | null,
    publicPrecision: row.public_precision as GeoPublicPrecision | null,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    resolutionMethod: row.resolution_method as GeoResolutionMethod | null,
    provider: row.provider,
    provenance: row.provenance,
    sourceLicense: row.source_license,
    normalizedQuery: row.normalized_query,
    queryFingerprint: row.query_fingerprint,
    sourceFingerprint: row.source_fingerprint,
    resolvedSourceFingerprint: row.resolved_source_fingerprint,
    geocodeStatus: row.geocode_status as GeoStatus,
    lastErrorCode: row.last_error_code as GeoErrorCode | null,
    lastErrorAt: row.last_error_at,
    retryAfterAt: row.retry_after_at,
    attemptCount: Number(row.attempt_count),
    manualOverride: Boolean(row.manual_override),
    manualUpdatedAt: row.manual_updated_at,
    manualUpdatedBy: row.manual_updated_by,
    lastGeocodedAt: row.last_geocoded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getGeoPointForTarget(targetType: GeoTargetType, id: number, database?: GeoD1Database) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const db = requireGeoD1(database);
  const column = targetColumns[targetType];
  const row = await db.prepare(`SELECT ${GEO_COLUMNS} FROM geo_points WHERE ${column} = ? LIMIT 1`)
    .bind(id).first<GeoPointRow>();
  return row ? mapGeoPoint(row) : null;
}

export async function getGeoSourceLocation(targetType: GeoTargetType, id: number, database?: GeoD1Database): Promise<GeoSourceLocation | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const db = requireGeoD1(database);

  if (targetType === "DIRECTORY_PROFILE") {
    const row = await db.prepare("SELECT * FROM directory_profiles WHERE id = ? LIMIT 1")
      .bind(id).first<Record<string, unknown>>();
    if (!row) return null;
    const addressFormat = row.address_format === "STREET" || row.address_format === "MUNICIPALITY_NUMBER"
      ? row.address_format
      : "";
    return {
      targetType, targetId: Number(row.id), label: String(row.name ?? ""), category: String(row.category ?? ""),
      address: String(row.address ?? ""), city: String(row.city ?? ""), district: String(row.district ?? ""),
      region: String(row.region ?? ""), postalCode: String(row.postal_code ?? ""), street: String(row.street ?? ""),
      houseNumber: String(row.house_number ?? ""), addressFormat,
      serviceAddressConfirmation: row.service_address_confirmation === "CONFIRMED_SERVICE_LOCATION"
        ? "CONFIRMED_SERVICE_LOCATION"
        : "LEGACY_UNCONFIRMED",
      countryCode: "SK", online: Boolean(row.online),
      published: row.status === "published",
    };
  }

  if (targetType === "ORGANIZATION_LOCATION") {
    const row = await db.prepare(`
      SELECT l.id, l.role, l.label, l.address, l.city, l.district, l.region, l.country_code,
        o.name AS organization_name, o.status AS organization_status, o.archived_at
      FROM organization_locations l
      JOIN help_organizations o ON o.id = l.organization_id
      WHERE l.id = ? LIMIT 1
    `).bind(id).first<Record<string, unknown>>();
    if (!row) return null;
    return {
      targetType, targetId: Number(row.id),
      label: String(row.label || row.organization_name || ""),
      locationRole: String(row.role ?? "UNSPECIFIED"),
      address: String(row.address ?? ""), city: String(row.city ?? ""), district: String(row.district ?? ""),
      region: String(row.region ?? ""), countryCode: String(row.country_code ?? "SK"),
      published: row.organization_status === "PUBLISHED" && row.archived_at === null,
    };
  }

  const row = await db.prepare(`
    SELECT id, title, event_type, venue, address, city, region, status, cancelled
    FROM managed_events WHERE id = ? LIMIT 1
  `).bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    targetType, targetId: Number(row.id), label: String(row.title ?? ""), category: String(row.event_type ?? ""),
    venue: String(row.venue ?? ""), address: String(row.address ?? ""), city: String(row.city ?? ""),
    region: String(row.region ?? ""), countryCode: "SK",
    online: String(row.region ?? "").toLowerCase() === "online" || String(row.city ?? "").toLowerCase() === "online",
    published: row.status === "published" && !Boolean(row.cancelled),
  };
}

async function sourceState(
  source: GeoSourceLocation,
  visibility: GeoPublicVisibility | null,
  precision: GeoPublicPrecision | null,
) {
  const query = visibility ? buildGeoQuery(source, visibility, precision) : null;
  return {
    query,
    queryFingerprint: await geoQueryFingerprint(query),
    sourceFingerprint: await sourceGeoFingerprint(geoFingerprintInput(source, visibility, precision)),
  };
}

export async function writeGeoModerationEvent(input: {
  geoPointId: number;
  action: string;
  actorType: "ADMIN" | "SYSTEM";
  actorRef?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  reasonCode?: string | null;
  changedFields?: string[];
  requestId?: string | null;
}, database?: GeoD1Database) {
  const db = requireGeoD1(database);
  const id = globalThis.crypto.randomUUID();
  await db.prepare(`
    INSERT INTO moderation_events (
      id, submission_id, resource_type, subject_id, action, actor_type, actor_ref,
      from_status, to_status, reason_code, changed_fields_json, request_id, created_at
    ) VALUES (?, NULL, 'GEO_POINT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, String(input.geoPointId), input.action, input.actorType, input.actorRef ?? null,
    input.fromStatus ?? null, input.toStatus ?? null, input.reasonCode ?? null,
    JSON.stringify(input.changedFields ?? []), input.requestId ?? null, new Date().toISOString(),
  ).run();
  return id;
}

export async function initializeGeoPointForTarget(
  targetType: GeoTargetType,
  id: number,
  actorRef: string,
  database?: GeoD1Database,
  actorType: "ADMIN" | "SYSTEM" = "ADMIN",
) {
  const db = requireGeoD1(database);
  const existing = await getGeoPointForTarget(targetType, id, db);
  if (existing) return { point: existing, created: false };

  const source = await getGeoSourceLocation(targetType, id, db);
  if (!source) throw new Error("Canonical location target neexistuje.");
  const classification = classifyGeoSource(source);

  let visibility: GeoPublicVisibility | null = classification.proposedVisibility;
  let precision: GeoPublicPrecision | null = classification.proposedPrecision;
  let status: GeoStatus = "PENDING";
  let errorCode: GeoErrorCode | null = null;

  if (classification.proposedVisibility === "EXACT_PUBLIC" && classification.requiresReview) {
    visibility = null;
    precision = null;
    status = "NEEDS_REVIEW";
    errorCode = "PRIVACY_CLASSIFICATION_MISSING";
  } else if (classification.proposedVisibility === "HIDDEN") {
    status = "SKIPPED";
    errorCode = classification.reasonCode ?? "PRIVATE_HIDDEN";
  } else if (!classification.proposedVisibility) {
    status = "NEEDS_REVIEW";
    errorCode = classification.reasonCode ?? "PRIVACY_CLASSIFICATION_MISSING";
  }

  const state = await sourceState(source, visibility, precision);
  const now = new Date().toISOString();
  const targetValues = {
    DIRECTORY_PROFILE: [id, null, null],
    ORGANIZATION_LOCATION: [null, id, null],
    MANAGED_EVENT: [null, null, id],
  }[targetType];

  await db.prepare(`
    INSERT INTO geo_points (
      target_type, directory_profile_id, organization_location_id, managed_event_id,
      public_visibility, public_precision, latitude, longitude, resolution_method,
      provider, provenance, source_license, normalized_query, query_fingerprint,
      source_fingerprint, resolved_source_fingerprint, geocode_status,
      last_error_code, last_error_at, retry_after_at, attempt_count, manual_override,
      manual_updated_at, manual_updated_by, last_geocoded_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, ?, ?, ?, NULL, 0, 0, NULL, NULL, NULL, ?, ?)
  `).bind(
    targetType, ...targetValues, visibility, precision, state.query, state.queryFingerprint,
    state.sourceFingerprint, status, errorCode, errorCode ? now : null, now, now,
  ).run();

  const point = await getGeoPointForTarget(targetType, id, db);
  if (!point) throw new Error("Geo point sa po vytvorení nepodarilo načítať.");
  await writeGeoModerationEvent({
    geoPointId: point.id, action: "GEO_INITIALIZED", actorType, actorRef,
    toStatus: point.geocodeStatus, reasonCode: point.lastErrorCode, changedFields: ["target", "public_visibility", "public_precision", "source_fingerprint"],
  }, db);
  await enqueueGeoAttentionEvent({
    database: db, point, label: source.label, actorType, actorRef,
    activationKey: point.sourceFingerprint, now,
  });
  return { point, created: true };
}

function safeCoordinate(value: number, latitude: boolean) {
  if (!Number.isFinite(value)) throw new Error("Súradnica nie je platné číslo.");
  const min = latitude ? -90 : -180;
  const max = latitude ? 90 : 180;
  if (value < min || value > max) throw new Error("Súradnica je mimo povoleného rozsahu.");
  return value;
}

export async function setGeoVisibility(input: {
  targetType: GeoTargetType;
  targetId: number;
  visibility: GeoPublicVisibility;
  precision: GeoPublicPrecision | null;
  actorRef: string;
  actorType?: "ADMIN" | "SYSTEM";
  reason?: string;
}, database?: GeoD1Database) {
  const db = requireGeoD1(database);
  const current = await getGeoPointForTarget(input.targetType, input.targetId, db);
  if (!current) throw new Error("Geo point neexistuje. Najprv ho inicializuj.");
  const source = await getGeoSourceLocation(input.targetType, input.targetId, db);
  if (!source) throw new Error("Canonical location target neexistuje.");

  const precision = input.visibility === "HIDDEN" ? null : input.precision;
  if (input.visibility !== "HIDDEN" && !precision) throw new Error("Verejná poloha musí mať precision.");
  const state = await sourceState(source, input.visibility, precision);
  const now = new Date().toISOString();

  if (input.visibility === "HIDDEN") {
    await db.prepare(`
      UPDATE geo_points SET public_visibility='HIDDEN', public_precision=NULL,
        latitude=NULL, longitude=NULL, resolution_method=NULL, provider=NULL, provenance=NULL, source_license=NULL,
        normalized_query=NULL, query_fingerprint=NULL, source_fingerprint=?, resolved_source_fingerprint=NULL,
        geocode_status='SKIPPED', last_error_code='PRIVATE_HIDDEN', last_error_at=?, retry_after_at=NULL,
        manual_override=0, manual_updated_at=NULL, manual_updated_by=NULL, updated_at=?
      WHERE id=?
    `).bind(state.sourceFingerprint, now, now, current.id).run();
  } else if (current.manualOverride) {
    await db.prepare(`
      UPDATE geo_points SET public_visibility=?, public_precision=?, normalized_query=?, query_fingerprint=?,
        source_fingerprint=?, geocode_status='STALE', last_error_code='MANUAL_REVIEW', last_error_at=?,
        retry_after_at=NULL, updated_at=?
      WHERE id=?
    `).bind(input.visibility, precision, state.query, state.queryFingerprint, state.sourceFingerprint, now, now, current.id).run();
  } else {
    await db.prepare(`
      UPDATE geo_points SET public_visibility=?, public_precision=?, latitude=NULL, longitude=NULL,
        resolution_method=NULL, provider=NULL, provenance=NULL, source_license=NULL,
        normalized_query=?, query_fingerprint=?, source_fingerprint=?, resolved_source_fingerprint=NULL,
        geocode_status='PENDING', last_error_code=NULL, last_error_at=NULL, retry_after_at=NULL,
        attempt_count=0, last_geocoded_at=NULL, updated_at=?
      WHERE id=?
    `).bind(input.visibility, precision, state.query, state.queryFingerprint, state.sourceFingerprint, now, current.id).run();
  }

  const point = await getGeoPointForTarget(input.targetType, input.targetId, db);
  if (!point) throw new Error("Geo point sa po klasifikácii nepodarilo načítať.");
  await writeGeoModerationEvent({
    geoPointId: point.id, action: "GEO_VISIBILITY_CHANGED", actorType: input.actorType ?? "ADMIN", actorRef: input.actorRef,
    fromStatus: current.geocodeStatus, toStatus: point.geocodeStatus, reasonCode: input.reason ?? null,
    changedFields: ["public_visibility", "public_precision", "source_fingerprint", "geocode_status"],
  }, db);
  return point;
}

export async function setManualGeoCoordinates(input: {
  targetType: GeoTargetType;
  targetId: number;
  latitude: number;
  longitude: number;
  visibility: Exclude<GeoPublicVisibility, "HIDDEN">;
  precision: GeoPublicPrecision;
  actorRef: string;
  reason: string;
}, database?: GeoD1Database) {
  const db = requireGeoD1(database);
  const current = await getGeoPointForTarget(input.targetType, input.targetId, db);
  if (!current) throw new Error("Geo point neexistuje. Najprv ho inicializuj.");
  const source = await getGeoSourceLocation(input.targetType, input.targetId, db);
  if (!source) throw new Error("Canonical location target neexistuje.");
  const latitude = safeCoordinate(input.latitude, true);
  const longitude = safeCoordinate(input.longitude, false);
  const state = await sourceState(source, input.visibility, input.precision);
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE geo_points SET public_visibility=?, public_precision=?, latitude=?, longitude=?,
      resolution_method='MANUAL', provider='manual', provenance='admin manual override', source_license=NULL,
      normalized_query=?, query_fingerprint=?, source_fingerprint=?, resolved_source_fingerprint=?,
      geocode_status='RESOLVED', last_error_code=NULL, last_error_at=NULL, retry_after_at=NULL,
      manual_override=1, manual_updated_at=?, manual_updated_by=?, last_geocoded_at=NULL, updated_at=?
    WHERE id=?
  `).bind(
    input.visibility, input.precision, latitude, longitude, state.query, state.queryFingerprint,
    state.sourceFingerprint, state.sourceFingerprint, now, input.actorRef, now, current.id,
  ).run();

  const point = await getGeoPointForTarget(input.targetType, input.targetId, db);
  if (!point) throw new Error("Manual geo point sa nepodarilo načítať.");
  await writeGeoModerationEvent({
    geoPointId: point.id, action: current.manualOverride ? "GEO_MANUAL_MOVED" : "GEO_MANUAL_SET",
    actorType: "ADMIN", actorRef: input.actorRef, fromStatus: current.geocodeStatus, toStatus: "RESOLVED",
    reasonCode: input.reason, changedFields: ["latitude", "longitude", "public_visibility", "public_precision", "manual_override"],
  }, db);
  return point;
}

export async function resetManualGeoOverride(targetType: GeoTargetType, targetIdValue: number, actorRef: string, database?: GeoD1Database) {
  const db = requireGeoD1(database);
  const current = await getGeoPointForTarget(targetType, targetIdValue, db);
  if (!current) throw new Error("Geo point neexistuje.");
  if (!current.manualOverride) return current;
  const source = await getGeoSourceLocation(targetType, targetIdValue, db);
  if (!source) throw new Error("Canonical location target neexistuje.");
  const state = await sourceState(source, current.publicVisibility, current.publicPrecision);
  const now = new Date().toISOString();
  const status: GeoStatus = current.publicVisibility === "HIDDEN" ? "SKIPPED" : current.publicVisibility ? "PENDING" : "NEEDS_REVIEW";
  const error: GeoErrorCode | null = current.publicVisibility === "HIDDEN" ? "PRIVATE_HIDDEN" : current.publicVisibility ? null : "PRIVACY_CLASSIFICATION_MISSING";

  await db.prepare(`
    UPDATE geo_points SET latitude=NULL, longitude=NULL, resolution_method=NULL, provider=NULL, provenance=NULL,
      source_license=NULL, normalized_query=?, query_fingerprint=?, source_fingerprint=?, resolved_source_fingerprint=NULL,
      geocode_status=?, last_error_code=?, last_error_at=?, retry_after_at=NULL, attempt_count=0,
      manual_override=0, manual_updated_at=NULL, manual_updated_by=NULL, last_geocoded_at=NULL, updated_at=?
    WHERE id=?
  `).bind(state.query, state.queryFingerprint, state.sourceFingerprint, status, error, error ? now : null, now, current.id).run();

  const point = await getGeoPointForTarget(targetType, targetIdValue, db);
  if (!point) throw new Error("Geo point sa nepodarilo načítať.");
  await writeGeoModerationEvent({
    geoPointId: point.id, action: "GEO_MANUAL_RESET", actorType: "ADMIN", actorRef,
    fromStatus: current.geocodeStatus, toStatus: point.geocodeStatus, changedFields: ["latitude", "longitude", "manual_override", "geocode_status"],
  }, db);
  return point;
}

export async function syncGeoPointAfterSourceChange(targetType: GeoTargetType, targetIdValue: number, database?: GeoD1Database) {
  const db = requireGeoD1(database);
  const current = await getGeoPointForTarget(targetType, targetIdValue, db);
  if (!current) return null;
  const source = await getGeoSourceLocation(targetType, targetIdValue, db);
  if (!source) return null;
  const state = await sourceState(source, current.publicVisibility, current.publicPrecision);
  if (state.sourceFingerprint === current.sourceFingerprint) return current;

  const now = new Date().toISOString();
  const classification = classifyGeoSource(source);
  const exactNeedsPrivacyReview = current.publicVisibility === "EXACT_PUBLIC"
    && !current.manualOverride
    && classification.requiresReview;
  if (current.publicVisibility === "HIDDEN") {
    await db.prepare(`
      UPDATE geo_points SET source_fingerprint=?, normalized_query=NULL, query_fingerprint=NULL,
        latitude=NULL, longitude=NULL, geocode_status='SKIPPED', resolved_source_fingerprint=NULL,
        last_error_code='PRIVATE_HIDDEN', last_error_at=?, updated_at=? WHERE id=?
    `).bind(state.sourceFingerprint, now, now, current.id).run();
  } else if (exactNeedsPrivacyReview) {
    const reviewState = await sourceState(source, null, null);
    await db.prepare(`
      UPDATE geo_points SET public_visibility=NULL, public_precision=NULL,
        latitude=NULL, longitude=NULL, resolution_method=NULL, provider=NULL, provenance=NULL, source_license=NULL,
        normalized_query=NULL, query_fingerprint=NULL, source_fingerprint=?, resolved_source_fingerprint=NULL,
        geocode_status='NEEDS_REVIEW', last_error_code='PRIVACY_CLASSIFICATION_MISSING',
        last_error_at=?, retry_after_at=NULL, attempt_count=0, last_geocoded_at=NULL, updated_at=?
      WHERE id=?
    `).bind(reviewState.sourceFingerprint, now, now, current.id).run();
  } else {
    await db.prepare(`
      UPDATE geo_points SET source_fingerprint=?, normalized_query=?, query_fingerprint=?,
        geocode_status='STALE', last_error_code=?, last_error_at=?, updated_at=? WHERE id=?
    `).bind(
      state.sourceFingerprint, state.query, state.queryFingerprint,
      current.manualOverride ? "MANUAL_REVIEW" : null, current.manualOverride ? now : null, now, current.id,
    ).run();
  }
  const point = await getGeoPointForTarget(targetType, targetIdValue, db);
  if (point) {
    await writeGeoModerationEvent({
      geoPointId: point.id, action: "GEO_SOURCE_STALE", actorType: "SYSTEM",
      fromStatus: current.geocodeStatus, toStatus: point.geocodeStatus,
      reasonCode: exactNeedsPrivacyReview
        ? "PRIVACY_CLASSIFICATION_MISSING"
        : current.manualOverride ? "MANUAL_REVIEW" : null,
      changedFields: exactNeedsPrivacyReview
        ? ["public_visibility", "public_precision", "source_fingerprint", "geocode_status"]
        : ["source_fingerprint", "normalized_query", "query_fingerprint", "geocode_status"],
    }, db);
    await enqueueGeoAttentionEvent({
      database: db, point, label: source.label, actorType: "SYSTEM", actorRef: "geo-source-sync",
      activationKey: point.sourceFingerprint, now,
    });
  }
  return point;
}

export async function applyGeocoderResolution(input: {
  targetType: GeoTargetType;
  targetId: number;
  result: NormalizedGeocoderResult;
  method: "GEOCODER" | "LOCALITY";
}, database?: GeoD1Database) {
  const db = requireGeoD1(database);
  const current = await getGeoPointForTarget(input.targetType, input.targetId, db);
  if (!current) throw new Error("Geo point neexistuje.");
  if (current.manualOverride) throw new Error("Automatic geocoder nesmie prepísať manual override.");
  if (!current.publicVisibility || current.publicVisibility === "HIDDEN" || !current.publicPrecision) {
    throw new Error("Geo point nemá verejnú klasifikáciu vhodnú na geocoding.");
  }
  const now = new Date().toISOString();
  const providerResultIdSchema = await isGeoProviderResultIdSchemaAvailable(db);
  const statement = providerResultIdSchema
    ? db.prepare(`
        UPDATE geo_points SET latitude=?, longitude=?, resolution_method=?, provider=?, provenance=?, source_license=?, provider_result_id=?,
          resolved_source_fingerprint=source_fingerprint, geocode_status='RESOLVED',
          last_error_code=NULL, last_error_at=NULL, retry_after_at=NULL, attempt_count=attempt_count+1,
          last_geocoded_at=?, updated_at=? WHERE id=? AND manual_override=0
      `).bind(
        input.result.latitude, input.result.longitude, input.method, input.result.provider,
        input.result.provenance, input.result.sourceLicense, input.result.providerResultId, now, now, current.id,
      )
    : db.prepare(`
        UPDATE geo_points SET latitude=?, longitude=?, resolution_method=?, provider=?, provenance=?, source_license=?,
          resolved_source_fingerprint=source_fingerprint, geocode_status='RESOLVED',
          last_error_code=NULL, last_error_at=NULL, retry_after_at=NULL, attempt_count=attempt_count+1,
          last_geocoded_at=?, updated_at=? WHERE id=? AND manual_override=0
      `).bind(
        input.result.latitude, input.result.longitude, input.method, input.result.provider,
        input.result.provenance, input.result.sourceLicense, now, now, current.id,
      );
  await statement.run();
  return getGeoPointForTarget(input.targetType, input.targetId, db);
}

export async function recordGeocoderFailure(input: {
  targetType: GeoTargetType;
  targetId: number;
  errorCode: GeoErrorCode;
  status: GeoStatus;
  retryAfterAt?: string | null;
}, database?: GeoD1Database) {
  const db = requireGeoD1(database);
  const current = await getGeoPointForTarget(input.targetType, input.targetId, db);
  if (!current) throw new Error("Geo point neexistuje.");
  if (current.manualOverride) return current;
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE geo_points SET geocode_status=?, last_error_code=?, last_error_at=?, retry_after_at=?,
      attempt_count=attempt_count+1, updated_at=? WHERE id=? AND manual_override=0
  `).bind(input.status, input.errorCode, now, input.retryAfterAt ?? null, now, current.id).run();
  const point = await getGeoPointForTarget(input.targetType, input.targetId, db);
  if (point && (current.geocodeStatus !== point.geocodeStatus || current.lastErrorCode !== point.lastErrorCode)) {
    const source = await getGeoSourceLocation(input.targetType, input.targetId, db);
    await enqueueGeoAttentionEvent({
      database: db, point, label: source?.label ?? "", actorType: "SYSTEM", actorRef: "geo-geocoder",
      activationKey: `${point.sourceFingerprint}/${point.lastErrorAt ?? now}`, now,
    });
  }
  return point;
}

export async function listGeoCandidateSources(options: {
  limit?: number;
  targetType?: GeoTargetType | null;
  directoryCategory?: string | null;
  activeEventsFrom?: string | null;
} = {}, database?: GeoD1Database) {
  const db = requireGeoD1(database);
  const limit = Math.max(1, Math.min(500, Math.trunc(options.limit ?? 100)));
  const effectiveTarget = options.targetType ?? (options.directoryCategory ? "DIRECTORY_PROFILE" : null);
  const perTargetLimit = effectiveTarget ? limit : Math.max(1, Math.ceil(limit / 3));
  const result: GeoSourceLocation[] = [];

  if (!effectiveTarget || effectiveTarget === "DIRECTORY_PROFILE") {
    const categoryClause = options.directoryCategory ? "AND category = ?" : "";
    const bindings = options.directoryCategory ? [options.directoryCategory, perTargetLimit] : [perTargetLimit];
    const rows = await db.prepare(`
      SELECT id, name, category, address, city, district, region, online, status
      FROM directory_profiles
      WHERE status='published' ${categoryClause}
      ORDER BY category ASC, id ASC LIMIT ?
    `).bind(...bindings).all<Record<string, unknown>>();
    for (const row of rows.results) result.push({
      targetType: "DIRECTORY_PROFILE", targetId: Number(row.id), label: String(row.name ?? ""),
      category: String(row.category ?? ""), address: String(row.address ?? ""), city: String(row.city ?? ""),
      district: String(row.district ?? ""), region: String(row.region ?? ""), countryCode: "SK",
      online: Boolean(row.online), published: true,
    });
  }

  if (!effectiveTarget || effectiveTarget === "ORGANIZATION_LOCATION") {
    const rows = await db.prepare(`
      SELECT l.id, l.role, l.label, l.address, l.city, l.district, l.region, l.country_code, o.name
      FROM organization_locations l JOIN help_organizations o ON o.id=l.organization_id
      WHERE o.status='PUBLISHED' AND o.archived_at IS NULL
      ORDER BY o.id ASC, l.sort_order ASC, l.id ASC LIMIT ?
    `).bind(perTargetLimit).all<Record<string, unknown>>();
    for (const row of rows.results) result.push({
      targetType: "ORGANIZATION_LOCATION", targetId: Number(row.id), label: String(row.label || row.name || ""),
      locationRole: String(row.role ?? "UNSPECIFIED"), address: String(row.address ?? ""), city: String(row.city ?? ""),
      district: String(row.district ?? ""), region: String(row.region ?? ""), countryCode: String(row.country_code ?? "SK"),
      published: true,
    });
  }

  if (!effectiveTarget || effectiveTarget === "MANAGED_EVENT") {
    const dateClause = options.activeEventsFrom ? "AND COALESCE(end_date, start_date) >= ?" : "";
    const bindings = options.activeEventsFrom ? [options.activeEventsFrom, perTargetLimit] : [perTargetLimit];
    const rows = await db.prepare(`
      SELECT id, title, event_type, venue, address, city, region
      FROM managed_events
      WHERE status='published' AND cancelled=0 ${dateClause}
      ORDER BY start_date ASC, id ASC LIMIT ?
    `).bind(...bindings).all<Record<string, unknown>>();
    for (const row of rows.results) result.push({
      targetType: "MANAGED_EVENT", targetId: Number(row.id), label: String(row.title ?? ""),
      category: String(row.event_type ?? ""), venue: String(row.venue ?? ""), address: String(row.address ?? ""),
      city: String(row.city ?? ""), region: String(row.region ?? ""), countryCode: "SK",
      online: String(row.region ?? "").toLowerCase() === "online" || String(row.city ?? "").toLowerCase() === "online",
      published: true,
    });
  }

  return result.slice(0, limit);
}
