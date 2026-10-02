import { env } from "cloudflare:workers";
import {
  applyGooglePlaceResolution,
  getGeoPointForTarget,
  getGeoSourceLocation,
  getGoogleMapsWorkflowDecision,
  hasExplicitPrivateGeoDecision,
} from "@/lib/geo-store";
import { isGeoTargetType, type GeoTargetType } from "@/lib/geo";
import {
  selectGeoAdminBulkTargets,
  type GeoAdminBulkTarget,
  type GeoAdminOperatorGroupFilter,
} from "@/lib/geo-admin-operator";
import {
  discoverGoogleDirectoryPlaces,
  evaluateGoogleDirectoryAutoMatch,
} from "@/lib/google-place-directory-discovery";
import { discoverGoogleTargetPlaces } from "@/lib/google-place-target-discovery";
import { updateManagedDirectoryProfileFromGooglePlace } from "@/lib/directory-store";

type Bindings = { DB?: D1Database };
type Row = Record<string, unknown>;

export const GOOGLE_PLACE_BULK_MAX = 100;
export type GooglePlaceBulkResultStatus =
  | "UPDATED"
  | "REVIEW"
  | "NO_MATCH"
  | "NOT_REQUIRED"
  | "SKIPPED"
  | "ERROR";

export type GooglePlaceBulkSelectionFilters = {
  group?: string;
  category?: string;
  operator?: string;
  google?: string;
  query?: string;
};

type NormalizedFilters = Required<GooglePlaceBulkSelectionFilters>;

type GooglePlaceBulkCursor = {
  filterFingerprint: string;
  lastName: string;
  lastTargetType: GeoTargetType;
  lastTargetId: number;
};

export type GooglePlaceBulkTarget = GeoAdminBulkTarget & {
  cursorAfter: string;
};

export type GooglePlaceBulkSelection = {
  targets: GooglePlaceBulkTarget[];
  nextCursor: string | null;
  hasMore: boolean;
  filterFingerprint: string;
};

export type GooglePlaceBulkResult = {
  targetType: GeoTargetType;
  targetId: number;
  key: string;
  name: string;
  group: "SERVICES" | "HELP" | "EVENTS";
  groupLabel: string;
  categoryLabel: string;
  result: GooglePlaceBulkResultStatus;
  reason: string;
  editorHref: string;
  publicHref: string | null;
  candidate: {
    id: string;
    displayName: string;
    formattedAddress: string;
  } | null;
};

const BULK_GROUPS = new Set(["ALL", "SERVICES", "HELP", "EVENTS"]);
const BULK_OPERATORS = new Set([
  "ALL", "ERRORS", "ON_MAP", "PENDING", "NEEDS_REVIEW", "MISSING_ADDRESS",
  "INCOMPLETE_ADDRESS", "INVALID_ADDRESS", "FAILED", "NOT_PUBLIC",
]);
const BULK_GOOGLE = new Set(["ALL", "PLACE", "COORDINATES", "NOT_REQUIRED", "UNRESOLVED"]);

function requireDb() {
  const database = (env as unknown as Bindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Google bulk databáza nie je pripojená.");
  }
  return database;
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeGooglePlaceBulkFilters(value: unknown): NormalizedFilters {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const group = clean(record.group, 20).toUpperCase();
  const operator = clean(record.operator, 30).toUpperCase();
  const google = clean(record.google, 30).toUpperCase();
  return {
    group: BULK_GROUPS.has(group) ? group : "ALL",
    category: clean(record.category, 100),
    operator: BULK_OPERATORS.has(operator) ? operator : "ALL",
    google: BULK_GOOGLE.has(google) ? google : "ALL",
    query: clean(record.query, 160),
  };
}

export function googlePlaceBulkFilterFingerprint(filters: NormalizedFilters) {
  return JSON.stringify(filters);
}

function count(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > GOOGLE_PLACE_BULK_MAX) {
    throw new Error(`Google bulk povoľuje 1 až ${GOOGLE_PLACE_BULK_MAX} položiek.`);
  }
  return parsed;
}

function encodeCursor(cursor: GooglePlaceBulkCursor) {
  return JSON.stringify(cursor);
}

function parseCursor(value: unknown, fingerprint: string): GooglePlaceBulkCursor | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 1200) throw new Error("Neplatný Google bulk cursor.");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("Neplatný Google bulk cursor."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Neplatný Google bulk cursor.");
  const row = parsed as Record<string, unknown>;
  const targetType = String(row.lastTargetType ?? "");
  const targetId = Number(row.lastTargetId);
  if (
    row.filterFingerprint !== fingerprint
    || typeof row.lastName !== "string"
    || !isGeoTargetType(targetType)
    || !Number.isSafeInteger(targetId)
    || targetId <= 0
  ) {
    throw new Error("Google bulk cursor nepatrí k aktuálnemu filtru. Začni dávku od začiatku.");
  }
  return {
    filterFingerprint: fingerprint,
    lastName: row.lastName,
    lastTargetType: targetType,
    lastTargetId: targetId,
  };
}

export async function selectGooglePlaceBulkTargets(input: {
  count: unknown;
  filters?: unknown;
  cursor?: unknown;
}): Promise<GooglePlaceBulkSelection> {
  const wanted = count(input.count);
  const filters = normalizeGooglePlaceBulkFilters(input.filters);
  const filterFingerprint = googlePlaceBulkFilterFingerprint(filters);
  const cursor = parseCursor(input.cursor, filterFingerprint);

  if (filters.google === "PLACE" || filters.google === "NOT_REQUIRED") {
    return { targets: [], nextCursor: cursor ? encodeCursor(cursor) : null, hasMore: false, filterFingerprint };
  }

  const rows = await selectGeoAdminBulkTargets({
    filters: {
      group: filters.group as GeoAdminOperatorGroupFilter,
      category: filters.category,
      operator: filters.operator,
      google: filters.google,
      query: filters.query,
    },
    after: cursor ? {
      lastName: cursor.lastName,
      lastTargetType: cursor.lastTargetType,
      lastTargetId: cursor.lastTargetId,
    } : null,
    limit: wanted + 1,
  });

  const selected = rows.slice(0, wanted);
  const targets = selected.map((target) => ({
    ...target,
    cursorAfter: encodeCursor({
      filterFingerprint,
      lastName: target.name,
      lastTargetType: target.targetType,
      lastTargetId: target.targetId,
    }),
  }));
  return {
    targets,
    nextCursor: targets.at(-1)?.cursorAfter ?? (cursor ? encodeCursor(cursor) : null),
    hasMore: rows.length > wanted,
    filterFingerprint,
  };
}

function candidate(candidate: Awaited<ReturnType<typeof discoverGoogleTargetPlaces>>[number] | null | undefined) {
  return candidate ? {
    id: candidate.id,
    displayName: candidate.displayName,
    formattedAddress: candidate.formattedAddress,
  } : null;
}

async function resultMeta(targetType: GeoTargetType, targetId: number) {
  const rows = await selectGeoAdminBulkTargets({
    filters: {},
    limit: GOOGLE_PLACE_BULK_MAX + 1,
  });
  const found = rows.find((row) => row.targetType === targetType && row.targetId === targetId);
  if (found) return found;

  const database = requireDb();
  if (targetType === "DIRECTORY_PROFILE") {
    const row = await database.prepare("SELECT name, category, slug FROM directory_profiles WHERE id=? LIMIT 1")
      .bind(targetId).first<Row>();
    return {
      targetType, targetId, key: `${targetType}:${targetId}`, name: String(row?.name ?? ""),
      group: "SERVICES" as const, groupLabel: "Služby", categoryLabel: String(row?.category ?? ""),
      editorHref: `/admin/adresar/${targetId}#service-address`,
      publicHref: row?.slug && row?.category ? `/adresar/${encodeURIComponent(String(row.category))}/${encodeURIComponent(String(row.slug))}` : null,
    };
  }
  if (targetType === "ORGANIZATION_LOCATION") {
    const row = await database.prepare(`
      SELECT l.label, l.organization_id, o.name, o.type, o.slug
      FROM organization_locations l JOIN help_organizations o ON o.id=l.organization_id
      WHERE l.id=? LIMIT 1
    `).bind(targetId).first<Row>();
    return {
      targetType, targetId, key: `${targetType}:${targetId}`,
      name: String(row?.label || row?.name || ""), group: "HELP" as const, groupLabel: "Pomoc psom",
      categoryLabel: String(row?.type ?? ""), editorHref: `/admin/organizacie/${Number(row?.organization_id ?? 0)}#locations`,
      publicHref: row?.slug ? `/organizacie/${encodeURIComponent(String(row.slug))}` : null,
    };
  }
  const row = await database.prepare("SELECT title, event_type FROM managed_events WHERE id=? LIMIT 1")
    .bind(targetId).first<Row>();
  return {
    targetType, targetId, key: `${targetType}:${targetId}`, name: String(row?.title ?? ""),
    group: "EVENTS" as const, groupLabel: "Podujatia", categoryLabel: String(row?.event_type ?? "Iné"),
    editorHref: `/admin/podujatia/${targetId}`, publicHref: null,
  };
}

async function currentGooglePlaceState(targetType: GeoTargetType, targetId: number) {
  const database = requireDb();
  const column = targetType === "DIRECTORY_PROFILE"
    ? "directory_profile_id"
    : targetType === "ORGANIZATION_LOCATION"
      ? "organization_location_id"
      : "managed_event_id";
  return database.prepare(`
    SELECT google_place_id, google_place_source_fingerprint, source_fingerprint
    FROM geo_points
    WHERE target_type = ? AND ${column} = ?
    LIMIT 1
  `).bind(targetType, targetId).first<Row>();
}

function withMeta(
  meta: Awaited<ReturnType<typeof resultMeta>>,
  status: GooglePlaceBulkResultStatus,
  reason: string,
  best: GooglePlaceBulkResult["candidate"] = null,
): GooglePlaceBulkResult {
  return { ...meta, result: status, reason, candidate: best };
}

export async function processGooglePlaceBulkTarget(input: {
  targetType: GeoTargetType;
  targetId: number;
  actorRef: string;
}): Promise<GooglePlaceBulkResult> {
  const targetId = Number(input.targetId);
  const targetType = input.targetType;
  const meta = await resultMeta(targetType, targetId);
  if (!Number.isSafeInteger(targetId) || targetId <= 0 || !isGeoTargetType(targetType)) {
    return withMeta(meta, "ERROR", "Neplatný canonical Google bulk target.");
  }

  try {
    const database = requireDb();
    const source = await getGeoSourceLocation(targetType, targetId, database);
    if (!source) return withMeta(meta, "SKIPPED", "Canonical target sa nenašiel.");
    if (source.published === false) return withMeta(meta, "SKIPPED", "Target už nie je publikovaný.");

    const point = await getGeoPointForTarget(targetType, targetId, database);
    if (point?.manualOverride) {
      return withMeta(meta, "SKIPPED", "Poloha má manuálny GEO override; bulk ju nesmie prepísať.");
    }
    if (
      point?.publicVisibility === "HIDDEN"
      && await hasExplicitPrivateGeoDecision(targetType, targetId, database)
    ) {
      return withMeta(meta, "SKIPPED", "Poloha je explicitne neverejná; bulk súkromie nemení.");
    }
    if (await getGoogleMapsWorkflowDecision(targetType, targetId, database) === "NOT_REQUIRED") {
      return withMeta(meta, "NOT_REQUIRED", "Google Maps bolo pre target explicitne označené ako nepotrebné.");
    }
    const googleState = await currentGooglePlaceState(targetType, targetId);
    const googlePlaceId = String(googleState?.google_place_id ?? "").trim();
    const googlePlaceFingerprint = String(googleState?.google_place_source_fingerprint ?? "").trim();
    const sourceFingerprint = String(googleState?.source_fingerprint ?? "").trim();
    if (googlePlaceId && googlePlaceFingerprint && sourceFingerprint && googlePlaceFingerprint === sourceFingerprint) {
      return withMeta(meta, "SKIPPED", "Target už má aktuálny Google Place.");
    }

    if (targetType === "MANAGED_EVENT" && source.online) {
      return withMeta(meta, "NOT_REQUIRED", "Online podujatie fyzický Google Maps bod nepotrebuje.");
    }

    if (targetType !== "DIRECTORY_PROFILE") {
      const candidates = await discoverGoogleTargetPlaces(source);
      if (!candidates.length) return withMeta(meta, "NO_MATCH", "Google Maps nenašiel použiteľného kandidáta.");
      const reason = targetType === "ORGANIZATION_LOCATION" && source.locationRole !== "SITE"
        ? "Google kandidát sa našiel, ale bulk nesmie LEGAL_SEAT, SERVICE_AREA ani UNSPECIFIED potichu zmeniť na SITE."
        : "Google kandidát sa našiel, ale pre tento typ zatiaľ neexistuje bezpečný generický auto-confirm kontrakt.";
      return withMeta(meta, "REVIEW", reason, candidate(candidates[0]));
    }

    const candidates = await discoverGoogleDirectoryPlaces(source);
    const match = evaluateGoogleDirectoryAutoMatch(source, candidates);
    const best = candidate(match.candidate);
    if (match.decision !== "MATCH" || !match.candidate) {
      return withMeta(meta, match.decision, match.reason, best);
    }

    const freshPoint = await getGeoPointForTarget(targetType, targetId, database);
    if (freshPoint?.manualOverride) return withMeta(meta, "SKIPPED", "GEO sa počas spracovania zmenilo na manual override.", best);
    if (
      freshPoint?.publicVisibility === "HIDDEN"
      && await hasExplicitPrivateGeoDecision(targetType, targetId, database)
    ) {
      return withMeta(meta, "SKIPPED", "Poloha bola počas spracovania explicitne nastavená ako neverejná.", best);
    }

    const profile = await updateManagedDirectoryProfileFromGooglePlace(targetId, match.candidate, input.actorRef, database);
    if (!profile) return withMeta(meta, "ERROR", "Profil sa pri zápise nenašiel.", best);

    const resolvedPoint = await getGeoPointForTarget(targetType, targetId, database);
    if (!resolvedPoint || resolvedPoint.manualOverride) {
      return withMeta(meta, "REVIEW", "Google adresu sa podarilo uložiť, ale GEO bod nie je bezpečne automatizovateľný.", best);
    }
    if (resolvedPoint.publicVisibility !== "EXACT_PUBLIC" || resolvedPoint.publicPrecision !== "EXACT") {
      return withMeta(meta, "REVIEW", "Google adresu sa podarilo uložiť, ale exact verejná klasifikácia vyžaduje kontrolu.", best);
    }

    await applyGooglePlaceResolution({
      targetType,
      targetId,
      place: {
        id: match.candidate.id,
        latitude: match.candidate.latitude,
        longitude: match.candidate.longitude,
      },
    }, database);
    return withMeta(meta, "UPDATED", match.reason, best);
  } catch (error) {
    return withMeta(meta, "ERROR", error instanceof Error ? error.message : String(error));
  }
}
