import { bratislavaDateKey } from "./events";
import {
  buildGeoQuery,
  classifyGeoSource,
  geoFingerprintInput,
  sourceGeoFingerprint,
  type GeoPublicPrecision,
  type GeoTargetType,
} from "./geo";
import { GeoapifyGeocoder } from "./geoapify-geocoder";
import { chooseGeocoderResult, resolveGeoTarget } from "./geo-service";
import {
  getGeoPointForTarget,
  initializeGeoPointForTarget,
  listGeoCandidateSources,
  type GeoD1Database,
} from "./geo-store";

export type GeoDryRunItem = {
  targetType: GeoTargetType;
  targetId: number;
  label: string;
  category: string | null;
  locationRole: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  proposedVisibility: string | null;
  proposedPrecision: string | null;
  requiresReview: boolean;
  reasonCode: string | null;
  normalizedQuery: string | null;
  sourceFingerprint: string;
  alreadyInitialized: boolean;
};

export function isSafeAutoGeoCandidate(item: GeoDryRunItem) {
  return !item.requiresReview
    && Boolean(item.proposedVisibility)
    && item.proposedVisibility !== "HIDDEN"
    && Boolean(item.proposedPrecision)
    && Boolean(item.normalizedQuery);
}

export function selectSafeUninitializedGeoCandidates(items: GeoDryRunItem[], requestedLimit: number) {
  const limit = Math.max(1, Math.min(100, Math.trunc(requestedLimit)));
  const safe = items.filter(isSafeAutoGeoCandidate);
  const eligible = safe.filter((item) => !item.alreadyInitialized);
  return {
    safe,
    eligible,
    selected: eligible.slice(0, limit),
    alreadyInitializedSkipped: safe.length - eligible.length,
    reviewBlocked: items.filter((item) => item.requiresReview).length,
    hidden: items.filter((item) => item.proposedVisibility === "HIDDEN").length,
    unclassified: items.filter((item) => !item.proposedVisibility).length,
  };
}

export async function previewGeoCandidates(options: {
  limit?: number;
  targetType?: GeoTargetType | null;
  directoryCategory?: string | null;
  database?: GeoD1Database;
} = {}) {
  const sources = await listGeoCandidateSources({
    limit: options.limit,
    targetType: options.targetType,
    directoryCategory: options.directoryCategory,
    activeEventsFrom: bratislavaDateKey(),
  }, options.database);

  const items: GeoDryRunItem[] = [];
  for (const source of sources) {
    const classification = classifyGeoSource(source);
    const query = classification.proposedVisibility && classification.proposedPrecision
      ? buildGeoQuery(source, classification.proposedVisibility, classification.proposedPrecision)
      : null;
    const fingerprint = await sourceGeoFingerprint(geoFingerprintInput(
      source,
      classification.proposedVisibility,
      classification.proposedPrecision,
    ));
    const existing = await getGeoPointForTarget(source.targetType, source.targetId, options.database);
    items.push({
      targetType: source.targetType,
      targetId: source.targetId,
      label: source.label,
      category: source.category ?? null,
      locationRole: source.locationRole ?? null,
      city: source.city ?? null,
      district: source.district ?? null,
      region: source.region ?? null,
      proposedVisibility: classification.proposedVisibility,
      proposedPrecision: classification.proposedPrecision,
      requiresReview: classification.requiresReview,
      reasonCode: classification.reasonCode,
      normalizedQuery: query,
      sourceFingerprint: fingerprint,
      alreadyInitialized: Boolean(existing),
    });
  }

  const counts = items.reduce<Record<string, number>>((acc, item) => {
    const key = item.proposedVisibility ?? "UNCLASSIFIED";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return { items, counts, total: items.length };
}

export async function previewSafeGeoInitialization(input: {
  limit: number;
  targetType: GeoTargetType;
  directoryCategory?: string | null;
  database?: GeoD1Database;
}) {
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit)));
  const preview = await previewGeoCandidates({
    limit: Math.min(500, Math.max(limit * 10, 50)),
    targetType: input.targetType,
    directoryCategory: input.directoryCategory,
    database: input.database,
  });
  const selection = selectSafeUninitializedGeoCandidates(preview.items, limit);
  return {
    requested: limit,
    scanned: preview.items.length,
    safe: selection.safe.length,
    availableUninitialized: selection.eligible.length,
    alreadyInitializedSkipped: selection.alreadyInitializedSkipped,
    reviewBlocked: selection.reviewBlocked,
    hidden: selection.hidden,
    unclassified: selection.unclassified,
    selected: selection.selected.map((item) => ({
      targetType: item.targetType,
      targetId: item.targetId,
      label: item.label,
      proposedVisibility: item.proposedVisibility,
      proposedPrecision: item.proposedPrecision,
      normalizedQuery: item.normalizedQuery,
      sourceFingerprint: item.sourceFingerprint,
    })),
  };
}

export async function initializeGeoCandidates(input: {
  limit: number;
  actorRef: string;
  targetType?: GeoTargetType | null;
  directoryCategory?: string | null;
  safeOnly?: boolean;
  database?: GeoD1Database;
}) {
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit)));
  const preview = await previewGeoCandidates({
    limit: input.safeOnly ? Math.min(500, Math.max(limit * 10, 50)) : limit,
    targetType: input.targetType,
    directoryCategory: input.directoryCategory,
    database: input.database,
  });
  const safeSelection = input.safeOnly
    ? selectSafeUninitializedGeoCandidates(preview.items, limit)
    : null;
  const eligible = input.safeOnly ? safeSelection!.selected : preview.items.slice(0, limit);
  const report = {
    requested: limit,
    scanned: preview.items.length,
    eligible: eligible.length,
    availableUninitialized: safeSelection?.eligible.length ?? null,
    alreadyInitializedSkipped: safeSelection?.alreadyInitializedSkipped ?? 0,
    safeOnly: Boolean(input.safeOnly),
    selectedIds: eligible.map((item) => item.targetId),
    created: 0,
    existing: 0,
    failed: 0,
    failures: [] as Array<{ targetType: string; targetId: number; error: string }>,
  };
  for (const item of eligible) {
    try {
      const result = await initializeGeoPointForTarget(item.targetType, item.targetId, input.actorRef, input.database);
      if (result.created) report.created += 1; else report.existing += 1;
    } catch (error) {
      report.failed += 1;
      report.failures.push({ targetType: item.targetType, targetId: item.targetId, error: error instanceof Error ? error.message : "unknown_error" });
    }
  }
  return report;
}

export function selectGeoCanaryCandidates(items: GeoDryRunItem[], requestedLimit: number) {
  const limit = Math.max(1, Math.min(10, Math.trunc(requestedLimit)));
  const eligible = items.filter(isSafeAutoGeoCandidate);

  const selected: GeoDryRunItem[] = [];
  const selectedKeys = new Set<string>();
  const coveredTargets = new Set<GeoTargetType>();

  // First pass: prefer target-type diversity so an unfiltered canary is not just
  // the first geocodable category in database sort order.
  for (const item of eligible) {
    if (selected.length >= limit) break;
    if (coveredTargets.has(item.targetType)) continue;
    selected.push(item);
    selectedKeys.add(`${item.targetType}:${item.targetId}`);
    coveredTargets.add(item.targetType);
  }

  // Second pass: fill the remaining bounded sample deterministically.
  for (const item of eligible) {
    if (selected.length >= limit) break;
    const key = `${item.targetType}:${item.targetId}`;
    if (selectedKeys.has(key)) continue;
    selected.push(item);
    selectedKeys.add(key);
  }

  return { eligible, selected };
}

export async function runGeoCanary(input: {
  limit: number;
  targetType?: GeoTargetType | null;
  directoryCategory?: string | null;
  database?: GeoD1Database;
}) {
  const limit = Math.max(1, Math.min(10, Math.trunc(input.limit)));
  const preview = await previewGeoCandidates({
    limit: Math.min(200, Math.max(limit * 20, 50)),
    targetType: input.targetType,
    directoryCategory: input.directoryCategory,
    database: input.database,
  });
  const provider = new GeoapifyGeocoder();
  if (!provider.isConfigured()) {
    return { configured: false, requested: limit, scanned: preview.items.length, eligible: 0, executed: 0, items: [], error: "GEOAPIFY_API_KEY is not configured." };
  }

  const selection = selectGeoCanaryCandidates(preview.items, limit);
  const items = [];
  for (const candidate of selection.selected) {
    try {
      const precision = candidate.proposedPrecision as GeoPublicPrecision;
      const request = { query: candidate.normalizedQuery!, precision, countryCode: "SK" };
      const results = candidate.proposedVisibility === "EXACT_PUBLIC"
        ? await provider.geocodeExact(request)
        : await provider.geocodeApproximate(request);
      const decision = chooseGeocoderResult({
        results,
        sourceCity: candidate.city ?? undefined,
        precision,
      });
      items.push({
        ...candidate,
        outcome: decision.result ? "candidate" : "review",
        providerResults: results.length,
        decision: decision.errorCode ?? "accepted_by_current_canary_thresholds",
        top: decision.result ? {
          latitude: decision.result.latitude,
          longitude: decision.result.longitude,
          resultType: decision.result.resultType,
          confidence: decision.result.confidence,
          cityConfidence: decision.result.cityConfidence,
          city: decision.result.city,
          district: decision.result.district,
        } : null,
      });
    } catch (error) {
      items.push({ ...candidate, outcome: "provider_error", providerResults: 0, decision: error instanceof Error ? error.message : "provider_error" });
    }
  }
  return {
    configured: true,
    requested: limit,
    scanned: preview.items.length,
    eligible: selection.eligible.length,
    reviewBlocked: preview.items.filter((item) => item.requiresReview).length,
    executed: items.length,
    items,
  };
}


export async function runGeoBackfillChunk(input: {
  limit: number;
  targetType?: GeoTargetType | null;
  directoryCategory?: string | null;
  database?: GeoD1Database;
}) {
  const limit = Math.max(1, Math.min(20, Math.trunc(input.limit)));
  const provider = new GeoapifyGeocoder();
  if (!provider.isConfigured()) {
    return {
      configured: false,
      requested: limit,
      attempted: 0,
      resolved: 0,
      needsReview: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
      items: [],
      error: "GEOAPIFY_API_KEY is not configured.",
    };
  }

  // Provider work remains bounded by `limit`, but candidate discovery must
  // not shrink with the write limit. The admin UI intentionally calls this
  // endpoint with limit=1 for visible progress; scanning only the first 50
  // canonical rows can otherwise strand later initialized PENDING candidates.
  const preview = await previewGeoCandidates({
    limit: 500,
    targetType: input.targetType,
    directoryCategory: input.directoryCategory,
    database: input.database,
  });

  const candidates = [];
  const now = Date.now();
  for (const item of preview.items) {
    if (candidates.length >= limit) break;
    const point = await getGeoPointForTarget(item.targetType, item.targetId, input.database);
    if (!point || point.geocodeStatus !== "PENDING" || point.manualOverride) continue;
    if (!point.publicVisibility || point.publicVisibility === "HIDDEN" || !point.publicPrecision) continue;
    if (point.retryAfterAt && Date.parse(point.retryAfterAt) > now) continue;
    candidates.push(item);
  }

  const report = {
    configured: true,
    requested: limit,
    scanned: preview.items.length,
    eligible: candidates.length,
    attempted: 0,
    resolved: 0,
    needsReview: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    items: [] as Array<{ targetType: string; targetId: number; status: string; errorCode: string | null }>,
  };

  for (const item of candidates) {
    report.attempted += 1;
    try {
      const point = await resolveGeoTarget({
        targetType: item.targetType,
        targetId: item.targetId,
        provider,
        database: input.database,
      });
      if (point.geocodeStatus === "RESOLVED") report.resolved += 1;
      else if (point.geocodeStatus === "NEEDS_REVIEW") report.needsReview += 1;
      else if (point.geocodeStatus === "FAILED") report.failed += 1;
      else if (point.geocodeStatus === "PENDING") report.pending += 1;
      else report.skipped += 1;
      report.items.push({
        targetType: item.targetType,
        targetId: item.targetId,
        status: point.geocodeStatus,
        errorCode: point.lastErrorCode,
      });
    } catch {
      report.failed += 1;
      report.items.push({
        targetType: item.targetType,
        targetId: item.targetId,
        status: "FAILED",
        errorCode: "PROVIDER_ERROR",
      });
    }
  }

  return report;
}
