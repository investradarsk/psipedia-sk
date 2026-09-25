import { bratislavaDateKey } from "./events";
import {
  buildGeoQuery,
  classifyGeoSource,
  geoFingerprintInput,
  sourceGeoFingerprint,
  type GeoPublicPrecision,
  type GeoPublicVisibility,
  type GeoSourceLocation,
  type GeoTargetType,
} from "./geo";
import { GeoapifyGeocoder } from "./geoapify-geocoder";
import type { GeocoderProvider } from "./geo-provider";
import { chooseGeocoderResult, resolveGeoTarget } from "./geo-service";
import {
  getGeoPointForTarget,
  getGeoSourceLocation,
  initializeGeoPointForTarget,
  listGeoCandidateSources,
  setGeoVisibility,
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


export type ExplicitGeoOutcome =
  | "ALREADY_RESOLVED"
  | "INITIALIZED"
  | "RESOLVED"
  | "NEEDS_REVIEW"
  | "FAILED"
  | "SKIP_MANUAL"
  | "SKIP_STALE_SOURCE"
  | "SKIP_NOT_FOUND"
  | "SKIP_NOT_PUBLISHED"
  | "BLOCK_PRIVACY"
  | "BLOCK_QUERY"
  | "ERROR";

export type ExplicitGeoPreviewItem = {
  targetType: GeoTargetType;
  targetId: number;
  canonicalExists: boolean;
  publishedEligible: boolean;
  name: string;
  category: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  canonicalAddressPresent: boolean;
  geoPointExists: boolean;
  currentGeocodeStatus: string | null;
  currentVisibility: string | null;
  currentPrecision: string | null;
  manualOverride: boolean;
  sourceFingerprint: string | null;
  resolvedSourceFingerprint: string | null;
  normalizedQuery: string | null;
  eligibleForInitialization: boolean;
  eligibleForClassification: boolean;
  eligibleForResolve: boolean;
  alreadyResolved: boolean;
  blockReason: string | null;
};

export function validateExplicitGeoTargetIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error("Explicitný batch vyžaduje targetIds array s 1 až 20 ID.");
  }
  if (value.length > 20) throw new Error("Explicitný batch povoľuje najviac 20 target IDs.");
  const ids = value.map((item) => {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item <= 0) {
      throw new Error("Každé explicitné target ID musí byť kladné safe integer číslo.");
    }
    return item;
  });
  if (new Set(ids).size !== ids.length) throw new Error("Explicitné target IDs musia byť unique.");
  return ids;
}

export function explicitGeoContractBlockReason(
  targetType: GeoTargetType,
  visibility: GeoPublicVisibility,
  precision: GeoPublicPrecision,
) {
  if (targetType !== "DIRECTORY_PROFILE") {
    return "Explicit onboarding je zatiaľ povolený iba pre DIRECTORY_PROFILE.";
  }
  if (visibility !== "APPROXIMATE_PUBLIC" || precision !== "MUNICIPALITY") {
    return "Explicit onboarding je zatiaľ povolený iba pre APPROXIMATE_PUBLIC + MUNICIPALITY.";
  }
  return null;
}

export function approximateGeoQueryUsesOnlyLocality(source: GeoSourceLocation, query: string | null) {
  if (!query) return false;
  const localityOnlySource: GeoSourceLocation = {
    ...source,
    address: "",
    venue: "",
    postalCode: "",
  };
  const localityOnly = buildGeoQuery(localityOnlySource, "APPROXIMATE_PUBLIC", "MUNICIPALITY");
  return Boolean(localityOnly && query === localityOnly);
}

async function previewExplicitGeoTarget(input: {
  targetType: GeoTargetType;
  targetId: number;
  visibility: GeoPublicVisibility;
  precision: GeoPublicPrecision;
  database?: GeoD1Database;
}): Promise<ExplicitGeoPreviewItem> {
  const contractBlock = explicitGeoContractBlockReason(input.targetType, input.visibility, input.precision);
  const source = await getGeoSourceLocation(input.targetType, input.targetId, input.database);
  if (!source) {
    return {
      targetType: input.targetType,
      targetId: input.targetId,
      canonicalExists: false,
      publishedEligible: false,
      name: "",
      category: null,
      city: null,
      district: null,
      region: null,
      canonicalAddressPresent: false,
      geoPointExists: false,
      currentGeocodeStatus: null,
      currentVisibility: null,
      currentPrecision: null,
      manualOverride: false,
      sourceFingerprint: null,
      resolvedSourceFingerprint: null,
      normalizedQuery: null,
      eligibleForInitialization: false,
      eligibleForClassification: false,
      eligibleForResolve: false,
      alreadyResolved: false,
      blockReason: "SKIP_NOT_FOUND",
    };
  }

  const query = contractBlock ? null : buildGeoQuery(source, input.visibility, input.precision);
  const requestedFingerprint = contractBlock ? null : await sourceGeoFingerprint(
    geoFingerprintInput(source, input.visibility, input.precision),
  );
  const point = await getGeoPointForTarget(input.targetType, input.targetId, input.database);
  const localityOnly = !contractBlock && approximateGeoQueryUsesOnlyLocality(source, query);

  let blockReason: string | null = contractBlock ? "BLOCK_PRIVACY" : null;
  if (!blockReason && source.published !== true) blockReason = "SKIP_NOT_PUBLISHED";
  if (!blockReason && (!query || !localityOnly)) blockReason = "BLOCK_QUERY";
  if (!blockReason && point?.manualOverride) blockReason = "SKIP_MANUAL";
  if (!blockReason && point && requestedFingerprint && point.sourceFingerprint !== requestedFingerprint) {
    blockReason = "SKIP_STALE_SOURCE";
  }
  if (!blockReason && point?.geocodeStatus === "STALE") blockReason = "SKIP_STALE_SOURCE";
  if (!blockReason && point?.geocodeStatus === "NEEDS_REVIEW") blockReason = "EXISTING_NEEDS_REVIEW";
  if (!blockReason && point?.geocodeStatus === "FAILED") blockReason = "EXISTING_FAILED";
  if (!blockReason && point?.geocodeStatus === "SKIPPED") blockReason = "EXISTING_SKIPPED";
  if (!blockReason && point?.geocodeStatus === "RESOLVED"
      && point.resolvedSourceFingerprint !== requestedFingerprint) {
    blockReason = "SKIP_STALE_SOURCE";
  }

  const alreadyResolved = Boolean(
    !blockReason
      && point
      && point.geocodeStatus === "RESOLVED"
      && point.publicVisibility === input.visibility
      && point.publicPrecision === input.precision
      && point.sourceFingerprint === requestedFingerprint
      && point.resolvedSourceFingerprint === requestedFingerprint,
  );
  const actionable = !blockReason && !alreadyResolved;

  return {
    targetType: input.targetType,
    targetId: input.targetId,
    canonicalExists: true,
    publishedEligible: source.published === true,
    name: source.label,
    category: source.category ?? null,
    city: source.city ?? null,
    district: source.district ?? null,
    region: source.region ?? null,
    canonicalAddressPresent: Boolean(source.address?.trim() || source.venue?.trim()),
    geoPointExists: Boolean(point),
    currentGeocodeStatus: point?.geocodeStatus ?? null,
    currentVisibility: point?.publicVisibility ?? null,
    currentPrecision: point?.publicPrecision ?? null,
    manualOverride: Boolean(point?.manualOverride),
    sourceFingerprint: requestedFingerprint,
    resolvedSourceFingerprint: point?.resolvedSourceFingerprint ?? null,
    normalizedQuery: query,
    eligibleForInitialization: actionable && !point,
    eligibleForClassification: actionable,
    eligibleForResolve: actionable,
    alreadyResolved,
    blockReason,
  };
}

export async function previewExplicitGeoOnboarding(input: {
  targetType: GeoTargetType;
  targetIds: number[];
  visibility: GeoPublicVisibility;
  precision: GeoPublicPrecision;
  database?: GeoD1Database;
}) {
  const targetIds = validateExplicitGeoTargetIds(input.targetIds);
  const items: ExplicitGeoPreviewItem[] = [];
  for (const targetId of targetIds) {
    items.push(await previewExplicitGeoTarget({ ...input, targetId }));
  }
  return {
    requested: targetIds.length,
    matched: items.filter((item) => item.canonicalExists).length,
    eligible: items.filter((item) => item.eligibleForResolve).length,
    alreadyResolved: items.filter((item) => item.alreadyResolved).length,
    blocked: items.filter((item) => Boolean(item.blockReason)).length,
    targetIds,
    items,
  };
}

function explicitBlockedOutcome(item: ExplicitGeoPreviewItem): ExplicitGeoOutcome {
  if (item.blockReason === "SKIP_MANUAL") return "SKIP_MANUAL";
  if (item.blockReason === "SKIP_STALE_SOURCE") return "SKIP_STALE_SOURCE";
  if (item.blockReason === "SKIP_NOT_FOUND") return "SKIP_NOT_FOUND";
  if (item.blockReason === "SKIP_NOT_PUBLISHED") return "SKIP_NOT_PUBLISHED";
  if (item.blockReason === "BLOCK_PRIVACY") return "BLOCK_PRIVACY";
  if (item.blockReason === "BLOCK_QUERY") return "BLOCK_QUERY";
  if (item.blockReason === "EXISTING_NEEDS_REVIEW") return "NEEDS_REVIEW";
  if (item.blockReason === "EXISTING_FAILED") return "FAILED";
  return "ERROR";
}

export async function runExplicitGeoOnboarding(input: {
  targetType: GeoTargetType;
  targetIds: number[];
  visibility: GeoPublicVisibility;
  precision: GeoPublicPrecision;
  actorRef: string;
  database?: GeoD1Database;
  provider?: GeocoderProvider;
}) {
  const targetIds = validateExplicitGeoTargetIds(input.targetIds);
  const preview = await previewExplicitGeoOnboarding({ ...input, targetIds });
  const provider = input.provider ?? new GeoapifyGeocoder();
  const providerConfigured = input.provider ? true : (provider as GeoapifyGeocoder).isConfigured();

  const report = {
    requested: targetIds.length,
    matched: preview.matched,
    eligible: preview.eligible,
    alreadyResolved: 0,
    initialized: 0,
    attempted: 0,
    resolved: 0,
    needsReview: 0,
    failed: 0,
    blocked: 0,
    providerConfigured,
    targetIds,
    items: [] as Array<{
      targetId: number;
      name: string;
      query: string | null;
      beforeStatus: string | null;
      afterStatus: string | null;
      visibility: string;
      precision: string;
      manualOverride: boolean;
      sourceFingerprint: string | null;
      resolvedSourceFingerprint: string | null;
      outcome: ExplicitGeoOutcome;
      errorCode: string | null;
    }>,
  };

  const push = (item: ExplicitGeoPreviewItem, outcome: ExplicitGeoOutcome, inputItem?: {
    afterStatus?: string | null;
    manualOverride?: boolean;
    sourceFingerprint?: string | null;
    resolvedSourceFingerprint?: string | null;
    errorCode?: string | null;
  }) => {
    if (outcome === "ALREADY_RESOLVED") report.alreadyResolved += 1;
    else if (outcome === "RESOLVED") report.resolved += 1;
    else if (outcome === "NEEDS_REVIEW") report.needsReview += 1;
    else if (outcome === "FAILED") report.failed += 1;
    if (["SKIP_MANUAL","SKIP_STALE_SOURCE","SKIP_NOT_FOUND","SKIP_NOT_PUBLISHED","BLOCK_PRIVACY","BLOCK_QUERY"].includes(outcome)) {
      report.blocked += 1;
    }
    report.items.push({
      targetId: item.targetId,
      name: item.name,
      query: item.normalizedQuery,
      beforeStatus: item.currentGeocodeStatus,
      afterStatus: inputItem?.afterStatus ?? item.currentGeocodeStatus,
      visibility: input.visibility,
      precision: input.precision,
      manualOverride: inputItem?.manualOverride ?? item.manualOverride,
      sourceFingerprint: inputItem?.sourceFingerprint ?? item.sourceFingerprint,
      resolvedSourceFingerprint: inputItem?.resolvedSourceFingerprint ?? item.resolvedSourceFingerprint,
      outcome,
      errorCode: inputItem?.errorCode ?? item.blockReason,
    });
  };

  if (!providerConfigured) {
    for (const item of preview.items) {
      if (item.alreadyResolved) push(item, "ALREADY_RESOLVED", { errorCode: null });
      else if (item.blockReason) push(item, explicitBlockedOutcome(item));
      else {
        report.blocked += 1;
        push(item, "ERROR", { errorCode: "PROVIDER_DISABLED" });
      }
    }
    return report;
  }

  for (const targetId of targetIds) {
    const freshPreview = await previewExplicitGeoOnboarding({
      targetType: input.targetType,
      targetIds: [targetId],
      visibility: input.visibility,
      precision: input.precision,
      database: input.database,
    });
    const item = freshPreview.items[0];

    if (item.alreadyResolved) {
      push(item, "ALREADY_RESOLVED", { errorCode: null });
      continue;
    }
    if (item.blockReason) {
      push(item, explicitBlockedOutcome(item));
      continue;
    }

    let initialized = false;
    try {
      const before = await getGeoPointForTarget(input.targetType, targetId, input.database);
      if (!before) {
        const init = await initializeGeoPointForTarget(input.targetType, targetId, input.actorRef, input.database);
        initialized = init.created;
        if (initialized) report.initialized += 1;
      }

      await setGeoVisibility({
        targetType: input.targetType,
        targetId,
        visibility: input.visibility,
        precision: input.precision,
        actorRef: input.actorRef,
        reason: "EXPLICIT_SAFE_ONBOARDING",
      }, input.database);

      const source = await getGeoSourceLocation(input.targetType, targetId, input.database);
      const classified = await getGeoPointForTarget(input.targetType, targetId, input.database);
      if (!source || !classified) {
        report.blocked += 1;
        push(item, initialized ? "INITIALIZED" : "ERROR", { errorCode: "POST_CLASSIFICATION_READ_FAILED" });
        continue;
      }

      const expectedFingerprint = await sourceGeoFingerprint(
        geoFingerprintInput(source, input.visibility, input.precision),
      );
      const query = buildGeoQuery(source, input.visibility, input.precision);
      if (!approximateGeoQueryUsesOnlyLocality(source, query)) {
        report.blocked += 1;
        push(item, "BLOCK_QUERY", {
          afterStatus: classified.geocodeStatus,
          manualOverride: classified.manualOverride,
          sourceFingerprint: classified.sourceFingerprint,
          resolvedSourceFingerprint: classified.resolvedSourceFingerprint,
          errorCode: "QUERY_CONTRACT_CHANGED",
        });
        continue;
      }
      if (classified.manualOverride) {
        report.blocked += 1;
        push(item, "SKIP_MANUAL", {
          afterStatus: classified.geocodeStatus,
          manualOverride: true,
          sourceFingerprint: classified.sourceFingerprint,
          resolvedSourceFingerprint: classified.resolvedSourceFingerprint,
          errorCode: "MANUAL_OVERRIDE",
        });
        continue;
      }
      if (classified.sourceFingerprint !== expectedFingerprint) {
        report.blocked += 1;
        push(item, "SKIP_STALE_SOURCE", {
          afterStatus: classified.geocodeStatus,
          sourceFingerprint: classified.sourceFingerprint,
          resolvedSourceFingerprint: classified.resolvedSourceFingerprint,
          errorCode: "SOURCE_FINGERPRINT_MISMATCH",
        });
        continue;
      }

      report.attempted += 1;
      await resolveGeoTarget({
        targetType: input.targetType,
        targetId,
        provider,
        database: input.database,
      });
      const finalPoint = await getGeoPointForTarget(input.targetType, targetId, input.database);
      if (!finalPoint) {
        push(item, "ERROR", { errorCode: "FINAL_READ_FAILED" });
        continue;
      }
      const outcome: ExplicitGeoOutcome = finalPoint.geocodeStatus === "RESOLVED"
        ? "RESOLVED"
        : finalPoint.geocodeStatus === "NEEDS_REVIEW"
          ? "NEEDS_REVIEW"
          : finalPoint.geocodeStatus === "FAILED"
            ? "FAILED"
            : "ERROR";
      push(item, outcome, {
        afterStatus: finalPoint.geocodeStatus,
        manualOverride: finalPoint.manualOverride,
        sourceFingerprint: finalPoint.sourceFingerprint,
        resolvedSourceFingerprint: finalPoint.resolvedSourceFingerprint,
        errorCode: finalPoint.lastErrorCode,
      });
    } catch (error) {
      push(item, initialized ? "INITIALIZED" : "ERROR", {
        errorCode: error instanceof Error ? error.message : "EXPLICIT_ONBOARD_ERROR",
      });
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
