import { verifyDirectoryCanonicalAddress } from "./directory-address-provider";
import {
  directoryExactAddressFormat,
  directoryExactFailureStatus,
  directoryExactRetryAfter,
  directoryExactVerificationErrorCode,
  directoryExactSourceFingerprint,
} from "./directory-exact-geo-auto";
import { evaluateDirectoryServiceAddress } from "./directory-service-address";
import { GeoapifyGeocoder } from "./geoapify-geocoder";
import {
  applyGeocoderResolution,
  getGeoPointForTarget,
  getGeoSourceLocation,
  recordGeocoderFailure,
  requireGeoD1,
  setGeoVisibility,
  writeGeoModerationEvent,
  type GeoD1Database,
  type GeoPointRecord,
} from "./geo-store";
import type { GeoSourceLocation } from "./geo";

export const DIRECTORY_GEO_MIGRATION_CANARY_MAX = 5;
const DIRECTORY_GEO_MIGRATION_PREVIEW_MAX = 200;

export type DirectoryGeoMigrationEligibility = {
  action: "PROCESS" | "REVIEW" | "SKIP" | "OUT_OF_COHORT";
  reason: string;
};

function addressInput(source: GeoSourceLocation) {
  return {
    region: source.region ?? "",
    district: source.district ?? "",
    city: source.city ?? "",
    postalCode: source.postalCode ?? "",
    street: source.street ?? "",
    houseNumber: source.houseNumber ?? "",
    addressFormat: source.addressFormat ?? "",
    serviceAddressConfirmation: source.serviceAddressConfirmation ?? "LEGACY_UNCONFIRMED",
    online: false,
  };
}

export function isHistoricalDirectoryGeoMigrationPoint(point: GeoPointRecord | null) {
  if (!point || point.targetType !== "DIRECTORY_PROFILE") return false;
  return point.publicVisibility === "APPROXIMATE_PUBLIC"
    || point.publicPrecision === "MUNICIPALITY";
}

export function evaluateDirectoryGeoMigrationEligibility(input: {
  source: GeoSourceLocation | null;
  point: GeoPointRecord | null;
  expectedExactFingerprint?: string | null;
}): DirectoryGeoMigrationEligibility {
  const { source, point } = input;
  if (!point || !isHistoricalDirectoryGeoMigrationPoint(point)) {
    return { action: "OUT_OF_COHORT", reason: "NOT_HISTORICAL_APPROXIMATE_GEO" };
  }
  if (!source) return { action: "SKIP", reason: "PROFILE_NOT_FOUND" };
  if (source.targetType !== "DIRECTORY_PROFILE") return { action: "OUT_OF_COHORT", reason: "WRONG_TARGET_TYPE" };
  if (point.manualOverride) return { action: "SKIP", reason: "MANUAL_OVERRIDE" };
  if (source.published !== true) return { action: "SKIP", reason: "NOT_PUBLISHED" };

  const address = evaluateDirectoryServiceAddress(addressInput(source));
  if (address.reason === "LEGACY_UNCONFIRMED") return { action: "REVIEW", reason: "LEGACY_UNCONFIRMED" };
  if (address.reason === "ONLINE_ONLY") return { action: "SKIP", reason: "ONLINE_ONLY" };
  if (address.state === "MISSING") return { action: "REVIEW", reason: "MISSING" };
  if (address.state === "INCOMPLETE") return { action: "REVIEW", reason: address.reason };
  if (address.state === "NEEDS_REVIEW") return { action: "REVIEW", reason: address.reason };
  if (source.serviceAddressConfirmation !== "CONFIRMED_SERVICE_LOCATION") {
    return { action: "REVIEW", reason: "SERVICE_LOCATION_NOT_CONFIRMED" };
  }

  if (
    point.geocodeStatus === "RESOLVED"
    && point.publicVisibility === "EXACT_PUBLIC"
    && point.publicPrecision === "EXACT"
    && Boolean(input.expectedExactFingerprint)
    && point.sourceFingerprint === input.expectedExactFingerprint
    && point.resolvedSourceFingerprint === input.expectedExactFingerprint
  ) {
    return { action: "OUT_OF_COHORT", reason: "CURRENT_EXACT_RESOLVED" };
  }

  return { action: "PROCESS", reason: point.geocodeStatus === "NEEDS_REVIEW"
    ? "LEGACY_APPROXIMATE_REVIEW"
    : "HISTORICAL_APPROXIMATE_GEO" };
}

export function validateDirectoryGeoMigrationTargetIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error("A2 migration canary vyžaduje targetIds array s 1 až 5 ID.");
  }
  if (value.length > DIRECTORY_GEO_MIGRATION_CANARY_MAX) {
    throw new Error("A2 migration canary povoľuje najviac 5 target IDs.");
  }
  const ids = value.map((item) => {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item <= 0) {
      throw new Error("Každé A2 migration target ID musí byť kladné safe integer číslo.");
    }
    return item;
  });
  if (new Set(ids).size !== ids.length) throw new Error("A2 migration target IDs musia byť unique.");
  return ids;
}

type CountRow = { count: number };
type CandidateRow = { id: number };

async function migrationCohortCount(database: GeoD1Database) {
  const row = await database.prepare(`
    SELECT COUNT(*) AS count
    FROM geo_points
    WHERE target_type='DIRECTORY_PROFILE'
      AND (public_visibility='APPROXIMATE_PUBLIC' OR public_precision='MUNICIPALITY')
  `).first<CountRow>();
  return Number(row?.count ?? 0);
}

async function migrationCohortIds(database: GeoD1Database, limit: number) {
  const rows = await database.prepare(`
    SELECT directory_profile_id AS id
    FROM geo_points
    WHERE target_type='DIRECTORY_PROFILE'
      AND directory_profile_id IS NOT NULL
      AND (public_visibility='APPROXIMATE_PUBLIC' OR public_precision='MUNICIPALITY')
    ORDER BY directory_profile_id ASC
    LIMIT ?
  `).bind(limit).all<CandidateRow>();
  return rows.results.map((row) => Number(row.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

export async function previewDirectoryGeoMigration(input: {
  limit?: number;
  targetIds?: number[];
  database?: GeoD1Database;
} = {}) {
  const database = requireGeoD1(input.database);
  const totalMigrationCohortCount = await migrationCohortCount(database);
  const ids = input.targetIds
    ? validateDirectoryGeoMigrationTargetIds(input.targetIds)
    : await migrationCohortIds(database, Math.max(1, Math.min(
        DIRECTORY_GEO_MIGRATION_PREVIEW_MAX,
        Math.trunc(input.limit ?? DIRECTORY_GEO_MIGRATION_PREVIEW_MAX),
      )));

  const items = [];
  for (const targetId of ids) {
    const source = await getGeoSourceLocation("DIRECTORY_PROFILE", targetId, database);
    const point = await getGeoPointForTarget("DIRECTORY_PROFILE", targetId, database);
    const expectedExactFingerprint = source ? await directoryExactSourceFingerprint(source) : null;
    const eligibility = evaluateDirectoryGeoMigrationEligibility({
      source,
      point,
      expectedExactFingerprint,
    });
    items.push({
      targetId,
      label: source?.label ?? "",
      historicalStatus: point?.geocodeStatus ?? null,
      historicalVisibility: point?.publicVisibility ?? null,
      historicalPrecision: point?.publicPrecision ?? null,
      canonicalAddressEligibility: eligibility.action === "PROCESS" ? "ELIGIBLE" : "BLOCKED",
      action: eligibility.action,
      reason: eligibility.reason,
      intendedAction: eligibility.action === "PROCESS"
        ? "FRESH_VERIFY_EXACT_THEN_REPLACE_HISTORICAL_GEO"
        : eligibility.action === "REVIEW"
          ? "KEEP_UNRESOLVED_AND_REVIEW"
          : "NO_WRITE",
    });
  }

  return {
    totalMigrationCohortCount,
    eligibleCount: items.filter((item) => item.action === "PROCESS").length,
    blockedReviewCount: items.filter((item) => item.action === "REVIEW").length,
    skippedCount: items.filter((item) => item.action === "SKIP").length,
    outOfCohortCount: items.filter((item) => item.action === "OUT_OF_COHORT").length,
    selectedTargetIds: ids,
    items,
  };
}

function isSystemicFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /D1_ERROR|SQLITE|no such table|no such column|schema|constraint failed|database is not available/i.test(message);
}

export async function runDirectoryGeoMigrationCanary(input: {
  targetIds: number[];
  database?: GeoD1Database;
  provider?: GeoapifyGeocoder;
  actorRef?: string;
  now?: Date;
}) {
  const ids = validateDirectoryGeoMigrationTargetIds(input.targetIds);
  const database = requireGeoD1(input.database);
  const provider = input.provider ?? new GeoapifyGeocoder();
  const providerConfigured = input.provider ? true : provider.isConfigured();
  const actorRef = input.actorRef ?? "geo-a2-migrate";
  const now = input.now ?? new Date();

  const report = {
    event: "geo_a2_migration_canary",
    requested: ids.length,
    processed: 0,
    resolved: 0,
    review: 0,
    skipped: 0,
    failed: 0,
    rateLimited: 0,
    providerConfigured,
    targetIds: ids,
    items: [] as Array<{
      targetId: number;
      beforeStatus: string | null;
      beforeVisibility: string | null;
      beforePrecision: string | null;
      action: string;
      afterStatus: string | null;
      reason: string;
      providerResultId: string | null;
    }>,
  };

  if (!providerConfigured) {
    report.skipped = ids.length;
    report.items.push(...ids.map((targetId) => ({
      targetId,
      beforeStatus: null,
      beforeVisibility: null,
      beforePrecision: null,
      action: "SKIP",
      afterStatus: null,
      reason: "PROVIDER_DISABLED",
      providerResultId: null,
    })));
    return report;
  }

  for (const targetId of ids) {
    let point = await getGeoPointForTarget("DIRECTORY_PROFILE", targetId, database);
    const source = await getGeoSourceLocation("DIRECTORY_PROFILE", targetId, database);
    const beforeStatus = point?.geocodeStatus ?? null;
    const beforeVisibility = point?.publicVisibility ?? null;
    const beforePrecision = point?.publicPrecision ?? null;
    const expectedExactFingerprint = source ? await directoryExactSourceFingerprint(source) : null;
    const eligibility = evaluateDirectoryGeoMigrationEligibility({
      source,
      point,
      expectedExactFingerprint,
    });

    if (eligibility.action !== "PROCESS" || !source || !point) {
      if (eligibility.action === "REVIEW") report.review += 1;
      else report.skipped += 1;
      report.items.push({
        targetId,
        beforeStatus,
        beforeVisibility,
        beforePrecision,
        action: eligibility.action,
        afterStatus: point?.geocodeStatus ?? null,
        reason: eligibility.reason,
        providerResultId: null,
      });
      continue;
    }

    report.processed += 1;
    try {
      const verified = await verifyDirectoryCanonicalAddress({
        region: source.region ?? "",
        district: source.district ?? "",
        city: source.city ?? "",
        street: source.street ?? "",
        houseNumber: source.houseNumber ?? "",
        addressFormat: directoryExactAddressFormat(source),
        revalidateStreet: directoryExactAddressFormat(source) === "STREET",
        provider,
      });

      point = await setGeoVisibility({
        targetType: "DIRECTORY_PROFILE",
        targetId,
        visibility: "EXACT_PUBLIC",
        precision: "EXACT",
        actorRef,
        actorType: "SYSTEM",
        reason: "A2_MIGRATION_PROVIDER_VERIFIED_EXACT",
      }, database);

      if (point.manualOverride) {
        report.skipped += 1;
        report.items.push({
          targetId,
          beforeStatus,
          beforeVisibility,
          beforePrecision,
          action: "SKIP",
          afterStatus: point.geocodeStatus,
          reason: "MANUAL_OVERRIDE",
          providerResultId: null,
        });
        continue;
      }

      const resolved = await applyGeocoderResolution({
        targetType: "DIRECTORY_PROFILE",
        targetId,
        result: verified.providerResult,
        method: "GEOCODER",
      }, database);
      if (!resolved) throw new Error("A2 migration invariant: final geo point missing after resolution.");

      await writeGeoModerationEvent({
        geoPointId: resolved.id,
        action: "GEO_A2_MIGRATION_RESOLVED",
        actorType: "SYSTEM",
        actorRef,
        fromStatus: beforeStatus,
        toStatus: resolved.geocodeStatus,
        reasonCode: "PROVIDER_VERIFIED_HISTORICAL_MIGRATION",
        changedFields: [
          "public_visibility",
          "public_precision",
          "latitude",
          "longitude",
          "provider",
          "provider_result_id",
          "source_fingerprint",
          "resolved_source_fingerprint",
          "geocode_status",
        ],
      }, database);

      report.resolved += 1;
      report.items.push({
        targetId,
        beforeStatus,
        beforeVisibility,
        beforePrecision,
        action: "RESOLVED",
        afterStatus: resolved.geocodeStatus,
        reason: "PROVIDER_VERIFIED_HISTORICAL_MIGRATION",
        providerResultId: verified.providerResult.providerResultId,
      });
    } catch (error) {
      if (isSystemicFailure(error)) throw error;

      const errorCode = directoryExactVerificationErrorCode(error);
      const attempt = (point?.attemptCount ?? 0) + 1;
      const status = directoryExactFailureStatus(errorCode, attempt);
      const retryAfterAt = directoryExactRetryAfter(errorCode, attempt, now.getTime());
      const failedPoint = await recordGeocoderFailure({
        targetType: "DIRECTORY_PROFILE",
        targetId,
        errorCode,
        status,
        retryAfterAt,
      }, database);

      if (failedPoint) {
        await writeGeoModerationEvent({
          geoPointId: failedPoint.id,
          action: "GEO_A2_MIGRATION_FAILED",
          actorType: "SYSTEM",
          actorRef,
          fromStatus: beforeStatus,
          toStatus: failedPoint.geocodeStatus,
          reasonCode: errorCode,
          changedFields: ["geocode_status", "last_error_code", "retry_after_at", "attempt_count"],
        }, database);
      }

      if (errorCode === "RATE_LIMITED") report.rateLimited += 1;
      if (status === "NEEDS_REVIEW") report.review += 1;
      else report.failed += 1;
      report.items.push({
        targetId,
        beforeStatus,
        beforeVisibility,
        beforePrecision,
        action: status === "NEEDS_REVIEW" ? "REVIEW" : status === "PENDING" ? "RETRY" : "FAILED",
        afterStatus: failedPoint?.geocodeStatus ?? status,
        reason: errorCode,
        providerResultId: null,
      });

      if (errorCode === "RATE_LIMITED") break;
    }
  }

  return report;
}
