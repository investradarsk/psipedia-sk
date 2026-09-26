import { verifyDirectoryCanonicalAddress } from "./directory-address-provider";
import { evaluateDirectoryServiceAddress } from "./directory-service-address";
import {
  geoFingerprintInput,
  isRetryableGeoError,
  safeGeoErrorStatus,
  sourceGeoFingerprint,
  type GeoErrorCode,
  type GeoSourceLocation,
  type GeoStatus,
} from "./geo";
import { GeoapifyGeocoder } from "./geoapify-geocoder";
import { GeocoderProviderError } from "./geo-provider";
import {
  applyGeocoderResolution,
  getGeoPointForTarget,
  getGeoSourceLocation,
  initializeGeoPointForTarget,
  recordGeocoderFailure,
  requireGeoD1,
  setGeoVisibility,
  syncGeoPointAfterSourceChange,
  writeGeoModerationEvent,
  type GeoD1Database,
  type GeoPointRecord,
} from "./geo-store";

export const DIRECTORY_EXACT_GEO_BATCH_MAX = 10;
const DIRECTORY_EXACT_GEO_SCAN_MAX = 200;
const RETRY_SAFE_REVIEW_REASONS = new Set<GeoErrorCode>(["RATE_LIMITED", "PROVIDER_ERROR"]);
const SEMANTIC_REVIEW_REASONS = new Set<GeoErrorCode>([
  "NO_MATCH",
  "AMBIGUOUS",
  "LOW_CONFIDENCE",
  "INVALID_INPUT",
  "CONFLICTING_GEO",
  "SOURCE_INCOMPLETE",
]);

export type DirectoryGeoEligibilityAction =
  | "PROCESS"
  | "SKIP"
  | "REVIEW"
  | "BLOCK"
  | "MIGRATION_SCOPE";

export type DirectoryGeoEligibility = {
  action: DirectoryGeoEligibilityAction;
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
    online: source.online,
  };
}

function retryWindowReached(point: GeoPointRecord, nowMs: number) {
  if (!point.retryAfterAt) return true;
  const parsed = Date.parse(point.retryAfterAt);
  return Number.isFinite(parsed) && parsed <= nowMs;
}

export async function directoryExactSourceFingerprint(source: GeoSourceLocation) {
  return sourceGeoFingerprint(geoFingerprintInput(source, "EXACT_PUBLIC", "EXACT"));
}

export function evaluateDirectoryGeoEligibility(input: {
  source: GeoSourceLocation | null;
  point: GeoPointRecord | null;
  expectedFingerprint?: string | null;
  nowMs?: number;
}): DirectoryGeoEligibility {
  const source = input.source;
  const point = input.point;
  const nowMs = input.nowMs ?? Date.now();

  if (!source) return { action: "SKIP", reason: "PROFILE_NOT_FOUND" };
  if (source.targetType !== "DIRECTORY_PROFILE") return { action: "BLOCK", reason: "WRONG_TARGET_TYPE" };
  if (source.published !== true) return { action: "SKIP", reason: "NOT_PUBLISHED" };

  const address = evaluateDirectoryServiceAddress(addressInput(source));
  if (address.reason === "ONLINE_ONLY") return { action: "SKIP", reason: "ONLINE_ONLY" };
  if (address.reason === "LEGACY_UNCONFIRMED") return { action: "REVIEW", reason: "LEGACY_UNCONFIRMED" };
  if (address.state === "MISSING") return { action: "BLOCK", reason: "MISSING" };
  if (address.state === "INCOMPLETE") return { action: "BLOCK", reason: "INCOMPLETE" };
  if (address.state === "NEEDS_REVIEW") return { action: "REVIEW", reason: address.reason };
  if (source.serviceAddressConfirmation !== "CONFIRMED_SERVICE_LOCATION") {
    return { action: "REVIEW", reason: "SERVICE_LOCATION_NOT_CONFIRMED" };
  }

  if (!point) return { action: "PROCESS", reason: "MISSING_GEO_POINT" };
  if (point.manualOverride) return { action: "SKIP", reason: "MANUAL_OVERRIDE" };

  if (point.publicVisibility === "APPROXIMATE_PUBLIC" || point.publicPrecision === "MUNICIPALITY") {
    return { action: "MIGRATION_SCOPE", reason: "LEGACY_APPROXIMATE_COHORT" };
  }

  if (
    point.geocodeStatus === "RESOLVED"
    && point.publicVisibility === "EXACT_PUBLIC"
    && point.publicPrecision === "EXACT"
    && Boolean(input.expectedFingerprint)
    && point.sourceFingerprint === point.resolvedSourceFingerprint
    && point.resolvedSourceFingerprint === input.expectedFingerprint
  ) {
    return { action: "SKIP", reason: "CURRENT_EXACT_RESOLVED" };
  }

  if (point.geocodeStatus === "RESOLVED") {
    return { action: "PROCESS", reason: "SOURCE_FINGERPRINT_CHANGED" };
  }
  if (point.geocodeStatus === "PENDING") return { action: "PROCESS", reason: "PENDING" };
  if (point.geocodeStatus === "STALE") return { action: "PROCESS", reason: "STALE" };

  if (point.geocodeStatus === "FAILED") {
    if (isRetryableGeoError(point.lastErrorCode) && retryWindowReached(point, nowMs)) {
      return { action: "PROCESS", reason: "RETRYABLE_FAILED" };
    }
    return { action: "REVIEW", reason: point.lastErrorCode ?? "FAILED" };
  }

  if (point.geocodeStatus === "NEEDS_REVIEW") {
    if (
      point.lastErrorCode
      && RETRY_SAFE_REVIEW_REASONS.has(point.lastErrorCode)
      && retryWindowReached(point, nowMs)
    ) {
      return { action: "PROCESS", reason: "RETRY_SAFE_REVIEW" };
    }
    return { action: "REVIEW", reason: point.lastErrorCode ?? "NEEDS_REVIEW" };
  }

  return { action: "SKIP", reason: point.geocodeStatus };
}

export function validateDirectoryExactGeoTargetIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error("A2 exact canary vyžaduje targetIds array s 1 až 10 ID.");
  }
  if (value.length > DIRECTORY_EXACT_GEO_BATCH_MAX) {
    throw new Error("A2 exact canary povoľuje najviac 10 target IDs.");
  }
  const ids = value.map((item) => {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item <= 0) {
      throw new Error("Každé A2 exact target ID musí byť kladné safe integer číslo.");
    }
    return item;
  });
  if (new Set(ids).size !== ids.length) throw new Error("A2 exact target IDs musia byť unique.");
  return ids;
}

type CandidateRow = { id: number };

async function candidateWindow(database: GeoD1Database, nowIso: string) {
  const rows = await database.prepare(`
    SELECT dp.id
    FROM directory_profiles dp
    LEFT JOIN geo_points gp ON gp.directory_profile_id = dp.id
    WHERE dp.status='published'
      AND dp.online=0
      AND dp.service_address_confirmation='CONFIRMED_SERVICE_LOCATION'
      AND TRIM(dp.region)<>''
      AND TRIM(dp.district)<>''
      AND TRIM(dp.city)<>''
      AND TRIM(dp.postal_code)<>''
      AND TRIM(dp.house_number)<>''
      AND dp.address_format IN ('STREET','MUNICIPALITY_NUMBER')
      AND (dp.address_format <> 'STREET' OR TRIM(dp.street)<>'')
      AND COALESCE(gp.manual_override, 0)=0
      AND NOT (
        gp.public_visibility='APPROXIMATE_PUBLIC'
        OR gp.public_precision='MUNICIPALITY'
      )
      AND (
        gp.id IS NULL
        OR gp.geocode_status IN ('PENDING','STALE')
        OR (
          gp.geocode_status IN ('FAILED','NEEDS_REVIEW')
          AND gp.last_error_code IN ('RATE_LIMITED','PROVIDER_ERROR')
          AND (gp.retry_after_at IS NULL OR gp.retry_after_at <= ?)
        )
        OR (
          gp.geocode_status='RESOLVED'
          AND (
            gp.resolved_source_fingerprint IS NULL
            OR gp.source_fingerprint <> gp.resolved_source_fingerprint
            OR dp.updated_at > gp.updated_at
          )
        )
      )
    ORDER BY dp.id ASC
    LIMIT ?
  `).bind(nowIso, DIRECTORY_EXACT_GEO_SCAN_MAX).all<CandidateRow>();
  return rows.results
    .map((row) => Number(row.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

export async function selectDirectoryExactGeoBacklog(input: {
  limit?: number;
  database?: GeoD1Database;
  now?: Date;
} = {}) {
  const database = requireGeoD1(input.database);
  const limit = Math.max(1, Math.min(
    DIRECTORY_EXACT_GEO_BATCH_MAX,
    Math.trunc(input.limit ?? DIRECTORY_EXACT_GEO_BATCH_MAX),
  ));
  const now = input.now ?? new Date();
  const ids = await candidateWindow(database, now.toISOString());
  const selected: number[] = [];

  for (const targetId of ids) {
    if (selected.length >= limit) break;
    const source = await getGeoSourceLocation("DIRECTORY_PROFILE", targetId, database);
    const point = await getGeoPointForTarget("DIRECTORY_PROFILE", targetId, database);
    const expectedFingerprint = source ? await directoryExactSourceFingerprint(source) : null;
    const eligibility = evaluateDirectoryGeoEligibility({
      source,
      point,
      expectedFingerprint,
      nowMs: now.getTime(),
    });
    if (eligibility.action === "PROCESS") selected.push(targetId);
  }
  return selected;
}

async function selectedIds(input: {
  limit?: number;
  targetIds?: number[];
  database?: GeoD1Database;
  now?: Date;
}) {
  if (input.targetIds) return validateDirectoryExactGeoTargetIds(input.targetIds);
  return selectDirectoryExactGeoBacklog(input);
}

export async function previewDirectoryExactGeoBacklog(input: {
  limit?: number;
  targetIds?: number[];
  database?: GeoD1Database;
  now?: Date;
} = {}) {
  const ids = await selectedIds(input);
  const nowMs = (input.now ?? new Date()).getTime();
  const items = [];

  for (const targetId of ids) {
    const source = await getGeoSourceLocation("DIRECTORY_PROFILE", targetId, input.database);
    const point = await getGeoPointForTarget("DIRECTORY_PROFILE", targetId, input.database);
    const expectedFingerprint = source ? await directoryExactSourceFingerprint(source) : null;
    const eligibility = evaluateDirectoryGeoEligibility({ source, point, expectedFingerprint, nowMs });
    items.push({
      targetId,
      label: source?.label ?? "",
      action: eligibility.action,
      reason: eligibility.reason,
      currentStatus: point?.geocodeStatus ?? null,
      currentVisibility: point?.publicVisibility ?? null,
      currentPrecision: point?.publicPrecision ?? null,
      intendedAction: eligibility.action === "PROCESS" ? "VERIFY_EXACT_AND_APPLY" : eligibility.action,
    });
  }

  return {
    eligibleCount: items.filter((item) => item.action === "PROCESS").length,
    selectedCandidateIds: ids,
    items,
  };
}

function verificationErrorCode(error: unknown): GeoErrorCode {
  if (error instanceof GeocoderProviderError) return error.code;
  const message = error instanceof Error ? error.message.toLocaleLowerCase("sk") : "";
  if (message.includes("nejednoznačná")) return "AMBIGUOUS";
  if (message.includes("nepodarilo znovu overiť")) return "NO_MATCH";
  if (message.includes("nepodarilo jednoznačne overiť")) return "LOW_CONFIDENCE";
  if (message.includes("nepatrí") || message.includes("inú ulicu") || message.includes("lokalit")) return "CONFLICTING_GEO";
  if (message.includes("neplat") || message.includes("doplň")) return "INVALID_INPUT";
  return "PROVIDER_ERROR";
}

function failureStatus(code: GeoErrorCode, attempt: number): GeoStatus {
  if (SEMANTIC_REVIEW_REASONS.has(code)) return "NEEDS_REVIEW";
  return safeGeoErrorStatus(code, attempt);
}

function retryAfter(code: GeoErrorCode, attempt: number, nowMs: number) {
  if (code === "RATE_LIMITED") {
    return new Date(nowMs + Math.min(60, 5 * attempt) * 60_000).toISOString();
  }
  if (code === "PROVIDER_ERROR") {
    return new Date(nowMs + Math.min(30, 2 ** attempt) * 60_000).toISOString();
  }
  return null;
}

function isSystemicFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /D1_ERROR|SQLITE|no such table|no such column|schema|constraint failed|database is not available/i.test(message);
}

function addressFormat(source: GeoSourceLocation) {
  return source.addressFormat === "MUNICIPALITY_NUMBER" ? "MUNICIPALITY_NUMBER" as const : "STREET" as const;
}

export async function runDirectoryExactGeoBacklog(input: {
  limit?: number;
  targetIds?: number[];
  database?: GeoD1Database;
  provider?: GeoapifyGeocoder;
  actorRef?: string;
  now?: Date;
} = {}) {
  const startedMs = Date.now();
  const runId = globalThis.crypto.randomUUID();
  const now = input.now ?? new Date();
  const ids = await selectedIds(input);
  const provider = input.provider ?? new GeoapifyGeocoder();
  const providerConfigured = input.provider ? true : provider.isConfigured();
  const actorRef = input.actorRef ?? "geo-a2-auto";
  const report = {
    event: "geo_a2_auto_run",
    runId,
    startedAt: new Date(startedMs).toISOString(),
    finishedAt: "",
    selected: ids.length,
    processed: 0,
    resolved: 0,
    skipped: 0,
    review: 0,
    failed: 0,
    rateLimited: 0,
    durationMs: 0,
    providerConfigured,
    items: [] as Array<{
      targetId: number;
      beforeStatus: string | null;
      action: string;
      afterStatus: string | null;
      reason: string;
      provider: string | null;
      providerResultId: string | null;
      durationMs: number;
    }>,
  };

  const finish = () => {
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.now() - startedMs;
    console.info(JSON.stringify(report));
    return report;
  };

  const push = (item: (typeof report.items)[number]) => {
    report.items.push(item);
    console.info(JSON.stringify({ event: "geo_a2_auto_item", runId, ...item }));
  };

  if (!providerConfigured) {
    report.skipped = ids.length;
    for (const targetId of ids) {
      push({
        targetId,
        beforeStatus: null,
        action: "SKIP",
        afterStatus: null,
        reason: "PROVIDER_DISABLED",
        provider: null,
        providerResultId: null,
        durationMs: 0,
      });
    }
    return finish();
  }

  for (const targetId of ids) {
    const itemStarted = Date.now();
    let beforeStatus: string | null = null;
    try {
      let source = await getGeoSourceLocation("DIRECTORY_PROFILE", targetId, input.database);
      let point = await getGeoPointForTarget("DIRECTORY_PROFILE", targetId, input.database);
      beforeStatus = point?.geocodeStatus ?? null;
      let expectedFingerprint = source ? await directoryExactSourceFingerprint(source) : null;
      let eligibility = evaluateDirectoryGeoEligibility({
        source,
        point,
        expectedFingerprint,
        nowMs: now.getTime(),
      });

      if (eligibility.action !== "PROCESS") {
        if (eligibility.action === "SKIP") report.skipped += 1;
        else report.review += 1;
        push({
          targetId,
          beforeStatus,
          action: eligibility.action,
          afterStatus: point?.geocodeStatus ?? null,
          reason: eligibility.reason,
          provider: point?.provider ?? null,
          providerResultId: null,
          durationMs: Date.now() - itemStarted,
        });
        continue;
      }

      if (!source) {
        report.skipped += 1;
        push({
          targetId,
          beforeStatus,
          action: "SKIP",
          afterStatus: null,
          reason: "PROFILE_NOT_FOUND",
          provider: null,
          providerResultId: null,
          durationMs: Date.now() - itemStarted,
        });
        continue;
      }

      if (!point) {
        point = (await initializeGeoPointForTarget(
          "DIRECTORY_PROFILE",
          targetId,
          actorRef,
          input.database,
          "SYSTEM",
        )).point;
      } else {
        point = await syncGeoPointAfterSourceChange(
          "DIRECTORY_PROFILE",
          targetId,
          input.database,
        ) ?? point;
      }

      source = await getGeoSourceLocation("DIRECTORY_PROFILE", targetId, input.database);
      point = await getGeoPointForTarget("DIRECTORY_PROFILE", targetId, input.database);
      expectedFingerprint = source ? await directoryExactSourceFingerprint(source) : null;
      eligibility = evaluateDirectoryGeoEligibility({
        source,
        point,
        expectedFingerprint,
        nowMs: now.getTime(),
      });

      if (eligibility.action !== "PROCESS" || !source || !point) {
        if (eligibility.action === "SKIP") report.skipped += 1;
        else report.review += 1;
        push({
          targetId,
          beforeStatus,
          action: eligibility.action,
          afterStatus: point?.geocodeStatus ?? null,
          reason: eligibility.reason,
          provider: point?.provider ?? null,
          providerResultId: null,
          durationMs: Date.now() - itemStarted,
        });
        continue;
      }

      if (point.manualOverride) {
        report.skipped += 1;
        push({
          targetId,
          beforeStatus,
          action: "SKIP",
          afterStatus: point.geocodeStatus,
          reason: "MANUAL_OVERRIDE",
          provider: point.provider,
          providerResultId: null,
          durationMs: Date.now() - itemStarted,
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
          addressFormat: addressFormat(source),
          revalidateStreet: addressFormat(source) === "STREET",
          provider,
        });

        if (point.publicVisibility !== "EXACT_PUBLIC" || point.publicPrecision !== "EXACT") {
          point = await setGeoVisibility({
            targetType: "DIRECTORY_PROFILE",
            targetId,
            visibility: "EXACT_PUBLIC",
            precision: "EXACT",
            actorRef,
            actorType: "SYSTEM",
            reason: "A2_AUTO_PROVIDER_VERIFIED_EXACT",
          }, input.database);
        }
        if (point.manualOverride) {
          report.skipped += 1;
          push({
            targetId,
            beforeStatus,
            action: "SKIP",
            afterStatus: point.geocodeStatus,
            reason: "MANUAL_OVERRIDE",
            provider: point.provider,
            providerResultId: null,
            durationMs: Date.now() - itemStarted,
          });
          continue;
        }

        const resolved = await applyGeocoderResolution({
          targetType: "DIRECTORY_PROFILE",
          targetId,
          result: verified.providerResult,
          method: "GEOCODER",
        }, input.database);
        if (!resolved) throw new Error("A2 invariant: final geo point missing after resolution.");

        await writeGeoModerationEvent({
          geoPointId: resolved.id,
          action: "GEO_A2_AUTO_RESOLVED",
          actorType: "SYSTEM",
          actorRef,
          fromStatus: point.geocodeStatus,
          toStatus: resolved.geocodeStatus,
          reasonCode: "PROVIDER_VERIFIED_ADDRESS",
          changedFields: [
            "latitude",
            "longitude",
            "provider",
            "provider_result_id",
            "resolved_source_fingerprint",
            "geocode_status",
          ],
        }, input.database);

        report.resolved += 1;
        push({
          targetId,
          beforeStatus,
          action: "RESOLVED",
          afterStatus: resolved.geocodeStatus,
          reason: "PROVIDER_VERIFIED_ADDRESS",
          provider: verified.providerResult.provider,
          providerResultId: verified.providerResult.providerResultId,
          durationMs: Date.now() - itemStarted,
        });
      } catch (error) {
        if (isSystemicFailure(error)) throw error;

        const errorCode = verificationErrorCode(error);
        const attempt = point.attemptCount + 1;
        const status = failureStatus(errorCode, attempt);
        const retryAfterAt = retryAfter(errorCode, attempt, now.getTime());
        const failedPoint = await recordGeocoderFailure({
          targetType: "DIRECTORY_PROFILE",
          targetId,
          errorCode,
          status,
          retryAfterAt,
        }, input.database);

        if (failedPoint) {
          await writeGeoModerationEvent({
            geoPointId: failedPoint.id,
            action: "GEO_A2_AUTO_FAILED",
            actorType: "SYSTEM",
            actorRef,
            fromStatus: point.geocodeStatus,
            toStatus: failedPoint.geocodeStatus,
            reasonCode: errorCode,
            changedFields: ["geocode_status", "last_error_code", "retry_after_at", "attempt_count"],
          }, input.database);
        }

        if (errorCode === "RATE_LIMITED") report.rateLimited += 1;
        if (status === "NEEDS_REVIEW") report.review += 1;
        else report.failed += 1;

        push({
          targetId,
          beforeStatus,
          action: status === "NEEDS_REVIEW" ? "REVIEW" : status === "PENDING" ? "RETRY" : "FAILED",
          afterStatus: failedPoint?.geocodeStatus ?? status,
          reason: errorCode,
          provider: "geoapify",
          providerResultId: null,
          durationMs: Date.now() - itemStarted,
        });

        if (errorCode === "RATE_LIMITED") break;
      }
    } catch (error) {
      report.failed += 1;
      push({
        targetId,
        beforeStatus,
        action: "FAILED",
        afterStatus: null,
        reason: error instanceof Error ? error.message : "A2_ITEM_ERROR",
        provider: null,
        providerResultId: null,
        durationMs: Date.now() - itemStarted,
      });
      if (isSystemicFailure(error)) {
        finish();
        throw error;
      }
    }
  }

  return finish();
}
